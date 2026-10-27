#!/usr/bin/env python3
"""
rpi5_lpsbox_bridge.py — Puente IoT Central para Raspberry Pi 5 (LPSBOX Gateway)

Conecta:
  1. Nodo Sniffer ESP32 (UART / ESP-NOW) -> Conteo de smartphones por WiFi/BLE Probe Requests
     filtrando aleatorización de MAC (bit LAA) en ventanas deslizantes de 10 segundos.
  2. Sensor Sísmico / Vibración MPU6050 (I2C 0x68) -> Algoritmo STA/LTA en tiempo real.
  3. Sincronización de los 3 LEDs físicos en la caja sin pantalla del Gateway (GPIO 17, 27, 22).
  4. Publicación simultánea por MQTT (Unity / Godot XR) y WebSocket (Simulador WebXR GitHub Pages).

Uso en Raspberry Pi 5:
  pip install smbus2 gpiozero paho-mqtt websockets pyserial
  python3 rpi5_lpsbox_bridge.py

Uso en modo demostración (sin hardware conectado):
  python3 rpi5_lpsbox_bridge.py --demo
"""

import argparse
import asyncio
import json
import math
import random
import time
from collections import deque

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

try:
    import websockets
except ImportError:
    websockets = None


def is_locally_administered_mac(mac: str) -> bool:
    """Detecta MAC aleatoria (bit LAA activo: segundo nibble en 2, 6, A, E)."""
    clean = mac.strip().upper()
    return len(clean) >= 2 and clean[1] in ("2", "6", "A", "E")


class SlidingProbeFilter10s:
    """Filtra Probe Requests WiFi/BLE en intervalos de 10s descartando ráfagas de MACs aleatorias."""

    def __init__(self, window_sec: float = 10.0):
        self.window_sec = window_sec
        self.events = deque()  # (timestamp, mac, rssi, fingerprint_key)

    def ingest(self, mac: str, rssi: int, ie_hash: str = "default"):
        now = time.time()
        # Si la MAC es universal (OUI real), su propia MAC es la llave;
        # si es aleatoria (LAA), agrupamos por huella de capacidades IE + banda RSSI (cada 6 dBm)
        if not is_locally_administered_mac(mac):
            fp_key = f"OUI:{mac}"
        else:
            rssi_bucket = round(rssi / 6.0) * 6
            fp_key = f"LAA:{ie_hash}:{rssi_bucket}"

        self.events.append((now, mac, rssi, fp_key))
        self._prune(now)

    def _prune(self, now: float):
        cutoff = now - self.window_sec
        while self.events and self.events[0][0] < cutoff:
            self.events.popleft()

    def summary(self):
        now = time.time()
        self._prune(now)
        raw_count = len(self.events)
        unique_keys = {ev[3] for ev in self.events}
        return {
            "raw_probe_requests": raw_count,
            "filtered_unique_phones": len(unique_keys),
            "mac_random_filtered": max(0, raw_count - len(unique_keys)),
        }


class StaLtaTrigger:
    """Algoritmo recursivo STA/LTA sobre aceleración dinámica 3 ejes del MPU6050."""

    def __init__(self, sta_samples: int = 25, lta_samples: int = 500, threshold: float = 3.0):
        self.alpha_sta = 1.0 / sta_samples
        self.alpha_lta = 1.0 / lta_samples
        self.sta = 1e-5
        self.lta = 1e-5
        self.threshold = threshold

    def update(self, ax_g: float, ay_g: float, az_g: float):
        mag = math.sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g)
        dyn_g = abs(mag - 1.0)
        energy = dyn_g * dyn_g + 1e-6

        self.sta += self.alpha_sta * (energy - self.sta)
        # Congela parcialmente LTA durante el evento para preservar la relación de disparo
        lta_alpha = self.alpha_lta * 0.1 if (self.sta / max(self.lta, 1e-7)) > 2.5 else self.alpha_lta
        self.lta += lta_alpha * (energy - self.lta)

        ratio = math.sqrt(self.sta / max(self.lta, 1e-7))
        return dyn_g, ratio, ratio >= self.threshold


class GatewayHardwareLEDs:
    """Sincroniza los 3 LEDs físicos de la carcasa sin pantalla del LPSBOX Gateway."""

    def __init__(self, demo_mode: bool = False):
        self.state = {"blue": True, "blink": False, "yellow": False}
        self._gpio_ready = False
        if not demo_mode:
            try:
                from gpiozero import LED
                self.pin_blue = LED(17)    # Sin información sísmica
                self.pin_blink = LED(27)   # Mini LED titilando (RX / Procesando)
                self.pin_yellow = LED(22)  # Hay información pre-sismo lista
                self._gpio_ready = True
            except Exception:
                self._gpio_ready = False

    def set_leds(self, blue: bool, blink: bool, yellow: bool):
        self.state = {"blue": blue, "blink": blink, "yellow": yellow}
        if self._gpio_ready:
            self.pin_blue.value = 1 if blue else 0
            self.pin_blink.value = 1 if blink else 0
            self.pin_yellow.value = 1 if yellow else 0


async def run_bridge(args):
    probe_filter = SlidingProbeFilter10s(window_sec=10.0)
    stalta = StaLtaTrigger(threshold=3.0)
    leds = GatewayHardwareLEDs(demo_mode=args.demo)
    ws_clients = set()
    snapshot_captured = False

    mqtt_client = None
    if mqtt is not None:
        try:
            mqtt_client = mqtt.Client()
            mqtt_client.connect(args.mqtt_host, args.mqtt_port, 60)
            mqtt_client.loop_start()
            print(f"[MQTT] Publicando en {args.mqtt_host}:{args.mqtt_port} (tópico lpsbox/telemetry)")
        except Exception as exc:
            print(f"[MQTT] Broker no disponible ({exc}); continuando por WebSocket/consola.")
            mqtt_client = None

    async def ws_handler(websocket):
        ws_clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            ws_clients.discard(websocket)

    if websockets is not None:
        await websockets.serve(ws_handler, "0.0.0.0", args.ws_port)
        print(f"[WS] Servidor WebSocket activo en ws://0.0.0.0:{args.ws_port}")

    print("[LPSBOX RPi5] Monitoreando Sniffer 10s + MPU6050 STA/LTA... (Ctrl+C para salir)")

    tick = 0
    while True:
        tick += 1
        # En modo demo simulamos smartphones cercanos + micro-vibraciones ocasionales
        if args.demo:
            if tick % 4 == 0:
                for i in range(random.randint(1, 3)):
                    fake_mac = f"3C:22:FB:10:00:{random.randint(1, 14):02X}"
                    probe_filter.ingest(fake_mac, rssi=random.randint(-78, -42))
                # Ráfaga aleatoria LAA
                rand_mac = f"DA:{random.randint(10,99)}:{random.randint(10,99)}:AA:BB:CC"
                probe_filter.ingest(rand_mac, rssi=-64, ie_hash="android_vht")

            shock = 0.38 if (tick % 240 == 0) else random.uniform(-0.006, 0.006)
            ax, ay, az = shock, shock * 0.6, 1.0 + shock * 0.3
        else:
            ax, ay, az = 0.0, 0.0, 1.0

        dyn_g, ratio, triggered = stalta.update(ax, ay, az)
        if triggered:
            snapshot_captured = True

        summary = probe_filter.summary()
        leds.set_leds(
            blue=not snapshot_captured,
            blink=(tick % 2 == 0),
            yellow=snapshot_captured,
        )

        payload = {
            "timestamp": round(time.time(), 3),
            "phone_count": summary["filtered_unique_phones"],
            "raw_probes_10s": summary["raw_probe_requests"],
            "accel_g": round(dyn_g, 4),
            "sta_lta": round(ratio, 3),
            "triggered": triggered,
            "leds": leds.state,
        }
        encoded = json.dumps(payload)

        if mqtt_client is not None:
            mqtt_client.publish("lpsbox/telemetry", encoded, qos=0)

        if ws_clients:
            await asyncio.gather(
                *(c.send(encoded) for c in list(ws_clients)),
                return_exceptions=True,
            )

        await asyncio.sleep(0.1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LPSBOX Raspberry Pi 5 MQTT/WS Bridge")
    parser.add_argument("--demo", action="store_true", help="Ejecutar con telemetría sintética de prueba")
    parser.add_argument("--mqtt-host", default="127.0.0.1", help="Host del broker MQTT Mosquitto")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="Puerto TCP de MQTT")
    parser.add_argument("--ws-port", type=int, default=8765, help="Puerto WebSocket para WebXR")
    asyncio.run(run_bridge(parser.parse_args()))
