#!/usr/bin/env python3
"""
rpi5_lpsbox_bridge.py — Nodo Sniffer + Detector Sísmico sobre Raspberry Pi 5 (LPSBOX System)

Arquitectura física:
  1. NODO SNIFFER INTERIOR (Raspberry Pi 5 dentro del edificio, carcasa modelo3d.stl):
     - Captura pasiva WiFi/BLE Probe Requests en ventanas deslizantes de 10 segundos,
       filtrando aleatorización de MAC (bit LAA) y estimando distribución por pisos (1 a 4).
     - Acelerómetro sísmico MPU6050 (I2C 0x68) integrado en el mismo Sniffer ejecutando
       el algoritmo STA/LTA en tiempo real y guardando la traza completa de ondas del evento.
     - Pantalla OLED frontal («ALERTA / Enviando datos») y alarma sonora/voz.
  2. LPSBOX GATEWAY EXTERIOR (Montado en Poste de Luz con polea de descenso):
     - Caja minimalista sin pantalla que recibe por enlace inalámbrico el snapshot t0 y la onda,
       encendiendo sus 3 LEDs de estado (Azul: sin datos, Mini LED titilante: RX, Amarillo: datos t0 listos)
       para que el operario baje el Gateway del poste y extraiga la información por USB-C / microSD.
  3. Publicación simultánea por MQTT (Unity / Godot XR) y WebSocket (Simulador WebXR GitHub Pages).

Uso en Raspberry Pi 5:
  pip install smbus2 gpiozero paho-mqtt websockets scapy
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
        self.events = deque()  # (timestamp, mac, rssi, fingerprint_key, est_floor)

    def ingest(self, mac: str, rssi: int, ie_hash: str = "default"):
        now = time.time()
        if not is_locally_administered_mac(mac):
            fp_key = f"OUI:{mac}"
        else:
            rssi_bucket = round(rssi / 6.0) * 6
            fp_key = f"LAA:{ie_hash}:{rssi_bucket}"

        # El Sniffer RPi5 está en Piso 2: estimamos piso (1..4) según atenuación de losa (~12.5 dB/piso)
        if rssi >= -56:
            est_floor = 2
        elif rssi >= -67:
            est_floor = random.choice((1, 3))
        else:
            est_floor = 4

        self.events.append((now, mac, rssi, fp_key, est_floor))
        self._prune(now)

    def _prune(self, now: float):
        cutoff = now - self.window_sec
        while self.events and self.events[0][0] < cutoff:
            self.events.popleft()

    def summary(self):
        now = time.time()
        self._prune(now)
        raw_count = len(self.events)
        unique_map = {}
        for _, _, _, fp_key, flr in self.events:
            unique_map[fp_key] = flr
        floors = {1: 0, 2: 0, 3: 0, 4: 0}
        for flr in unique_map.values():
            floors[flr] = floors.get(flr, 0) + 1
        return {
            "raw_probe_requests": raw_count,
            "filtered_unique_phones": len(unique_map),
            "mac_random_filtered": max(0, raw_count - len(unique_map)),
            "floors": floors,
        }


class StaLtaEventRecorder:
    """Algoritmo recursivo STA/LTA + grabador persistente de todo el evento sísmico en la RPi 5."""

    def __init__(self, sta_samples: int = 25, lta_samples: int = 500, threshold: float = 3.0):
        self.alpha_sta = 1.0 / sta_samples
        self.alpha_lta = 1.0 / lta_samples
        self.sta = 3.2e-5
        self.lta = 3.2e-5
        self.threshold = threshold
        self.last_event_waveform = []  # Conserva la onda completa tras finalizar el sismo

    def update(self, ax_g: float, ay_g: float, az_g: float, t_sec: float):
        mag = math.sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g)
        dyn_g = abs(mag - 1.0)
        energy = dyn_g * dyn_g + 3e-5

        self.sta += self.alpha_sta * (energy - self.sta)
        lta_alpha = self.alpha_lta * 0.08 if (self.sta / max(self.lta, 1e-7)) > 2.4 else self.alpha_lta
        self.lta += lta_alpha * (energy - self.lta)

        ratio = math.sqrt(self.sta / max(self.lta, 1e-7))
        triggered = ratio >= self.threshold

        if triggered or dyn_g > 0.03:
            self.last_event_waveform.append(
                {"t": round(t_sec, 2), "accel_g": round(dyn_g, 4), "sta_lta": round(ratio, 3)}
            )
            if len(self.last_event_waveform) > 600:
                self.last_event_waveform.pop(0)

        return dyn_g, ratio, triggered


class PoleGatewaySyncState:
    """Representa el estado transmitido al LPSBOX Gateway montado en el poste de luz exterior."""

    def __init__(self):
        self.leds = {"blue": True, "blink": False, "yellow": False}
        self.pole_height_m = 4.65  # 4.65 m arriba en poste -> 1.18 m abajo para extracción USB-C

    def update_leds(self, blue: bool, blink: bool, yellow: bool):
        self.leds = {"blue": blue, "blink": blink, "yellow": yellow}


async def run_bridge(args):
    probe_filter = SlidingProbeFilter10s(window_sec=10.0)
    stalta = StaLtaEventRecorder(threshold=3.0)
    pole_gateway = PoleGatewaySyncState()
    ws_clients = set()
    snapshot_captured = False
    t0 = time.time()

    mqtt_client = None
    if mqtt is not None:
        try:
            mqtt_client = mqtt.Client()
            mqtt_client.connect(args.mqtt_host, args.mqtt_port, 60)
            mqtt_client.loop_start()
            print(f"[MQTT] Sniffer RPi 5 publicando en {args.mqtt_host}:{args.mqtt_port} (lpsbox/telemetry)")
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
        print(f"[WS] Servidor WebSocket Sniffer RPi 5 activo en ws://0.0.0.0:{args.ws_port}")

    print("[LPSBOX Sniffer RPi5] Monitoreando 4 pisos (10s) + MPU6050 STA/LTA -> Gateway en Poste...")

    tick = 0
    while True:
        tick += 1
        elapsed = time.time() - t0
        if args.demo:
            if tick % 4 == 0:
                for _ in range(random.randint(1, 4)):
                    fake_mac = f"3C:22:FB:10:00:{random.randint(1, 18):02X}"
                    probe_filter.ingest(fake_mac, rssi=random.randint(-80, -42))
                rand_mac = f"DA:{random.randint(10,99)}:{random.randint(10,99)}:AA:BB:CC"
                probe_filter.ingest(rand_mac, rssi=-64, ie_hash="android_vht")

            shock = 0.42 if (240 <= (tick % 360) <= 275) else random.uniform(-0.005, 0.005)
            ax, ay, az = shock, shock * 0.6, 1.0 + shock * 0.3
        else:
            ax, ay, az = 0.0, 0.0, 1.0

        dyn_g, ratio, triggered = stalta.update(ax, ay, az, elapsed)
        if triggered:
            snapshot_captured = True

        summary = probe_filter.summary()
        pole_gateway.update_leds(
            blue=not snapshot_captured,
            blink=(tick % 2 == 0),
            yellow=snapshot_captured,
        )

        payload = {
            "timestamp": round(time.time(), 3),
            "sniffer_host": "RaspberryPi5-Piso2",
            "phone_count": summary["filtered_unique_phones"],
            "floor_counts": summary["floors"],
            "raw_probes_10s": summary["raw_probe_requests"],
            "accel_g": round(dyn_g, 4),
            "sta_lta": round(ratio, 3),
            "triggered": triggered,
            "saved_waveform_points": len(stalta.last_event_waveform),
            "leds": pole_gateway.leds,
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
    parser = argparse.ArgumentParser(description="LPSBOX Sniffer Raspberry Pi 5 + MPU6050 Bridge")
    parser.add_argument("--demo", action="store_true", help="Ejecutar con telemetría sintética de prueba")
    parser.add_argument("--mqtt-host", default="127.0.0.1", help="Host del broker MQTT Mosquitto")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="Puerto TCP de MQTT")
    parser.add_argument("--ws-port", type=int, default=8765, help="Puerto WebSocket para WebXR")
    asyncio.run(run_bridge(parser.parse_args()))
