# LPSBOX System — Simulador VR / MR de Emergencia Sísmica

En este repositorio se encuentra el **simulador y juego interactivo 3D / WebXR (Realidad Virtual y Realidad Mixta)** donde se recrea un escenario de emergencia sísmica en el que operan en conjunto el **Nodo Sniffer (ESP32 + MPU6050)** y el **LPSBOX Gateway (Raspberry Pi 5 + ESP32)**, junto con los artefactos de diseño industrial de las Partes 2, 3 y 4 (`modelo3d.stl`, bocetos hechos a mano y renders asistidos por IA).

🔗 **Ejecución directa en GitHub Pages:**  
Una vez desplegado desde la rama `main`, el simulador corre directamente en el navegador (escritorio, móvil y cascos WebXR como Meta Quest) sin requerir pasos adicionales de compilación:  
`https://juanf14-ui.github.io/Game-for-LPSBOX-System/`

---

## 1. Concepto del Juego (Game Pitch): *«LPSBOX: Caja Negra Sísmica»*

Cuando ocurre un terremoto severo, el suministro eléctrico, los puntos de acceso WiFi y las antenas celulares suelen fallar en cuestión de segundos. Los equipos de búsqueda y rescate urbano (USAR) llegan sin saber **cuántas personas había dentro del edificio ni en qué salas se encontraban justo antes del sismo**.

**LPSBOX** resuelve este problema actuando como una **caja negra sísmica distribuida**:
1. **Nodo Sniffer Pasivo (ESP32 + MPU6050):** Instalado dentro de la edificación (`modelo3d.stl`), escucha de forma pasiva tramas *WiFi 802.11 / BLE Probe Request* de los teléfonos cercanos filtrando la aleatorización de direcciones MAC en ventanas deslizantes de **10 segundos**, al tiempo que monitorea vibraciones sísmicas mediante el algoritmo **STA/LTA** sobre el acelerómetro **MPU6050**.
2. **LPSBOX Gateway (Raspberry Pi 5 + ESP32):** Ubicado en el puesto seguro del operario en una carcasa minimalista **sin pantalla**, provista únicamente de **3 indicadores LED físicos** y puertos `microSD` / `USB-C`. Al dispararse el umbral `STA/LTA ≥ 3.0` (`t₀`), el Sniffer transmite de emergencia la fotografía radioeléctrica previa al sismo hacia el Gateway.

En el juego, **el jugador es el Operario de Emergencia**:
- Puede **controlar los escenarios en tiempo real**: desde **Monitoreo Normal**, un **«Sismo Tranqui» (4.2 Mw)** con reacciones preventivas calmadas, un **Terremoto Severo (6.9 Mw)** con corte eléctrico, caída de escombros y personas atrapadas, o un **Golpe Físico en la Mesa** sobre el sensor MPU6050.
- Vigila los **3 LEDs sincronizados del Gateway** (Azul = sin datos; Mini LED titilante = recibiendo paquetes; Amarillo = snapshot `t₀` almacenado).
- Conecta la consola de extracción USB-C / RPi5 al Gateway, activa el **filtro anti-MAC-randomization de 10 s**, analiza el **mapa RSSI por zonas** y emite el **Informe Oficial de Rescate** indicando cuántas personas había y dónde se ubicaban con su celular antes del sismo, verificando su exactitud mediante **Hologramas 3D `t₀`** dentro del edificio.

---

## 2. Core Gameplay Loop y las 3 Mecánicas Físico-Virtuales

| Mecánica | Fuente Física IoT | Traducción en el Entorno MR / VR |
| :--- | :--- | :--- |
| **Mecánica 1: Crowd Data (Spawns & Huella `t₀`)** | Conteo pasivo de smartphones vía *WiFi/BLE Probe Requests* con filtro de MAC aleatoria cada 10 s. | Controla la densidad de personas/entidades digitales en las 4 zonas del edificio (Laboratorio, Servidores, Auditorio, Cafetería) y genera la tabla y triangulación RSSI previa al sismo (`t₀`). |
| **Mecánica 2: Seismic Data (Triggers STA/LTA)** | Acelerómetro triaxial **MPU6050** ejecutando `STA/LTA` continuo. | Golpear físicamente la mesa genera una **onda de choque electromagnética MR**; un sismo leve provoca reacciones calmadas; un terremoto dispara la alarma/voz del Sniffer, congela `t₀` y produce colapso parcial. |
| **Mecánica 3: Hardware Sync (3 LEDs)** | Los 3 LEDs reales de la caja sin pantalla del Gateway (GPIO Raspberry Pi 5). | Sincronización 1:1 entre los LEDs del modelo 3D, el HUD del operario y el hardware físico: **LED Azul** (*No hay info*), **Mini LED Titilante** (*Recibiendo/Procesando*), **LED Amarillo** (*Hay información lista para extracción*). |

---

## 3. Arquitectura Técnica: Raspberry Pi 5 (Python / MQTT) → Unity, Godot y WebXR

```text
[NODO SNIFFER ESP32 + MPU6050]                     [GATEWAY FÍSICO: RASPBERRY PI 5 + ESP32 RX]
 ├─ Captura WiFi/BLE Probe Requests (10s)           ├─ Recepción ESP-NOW / UART Serial (115200 bps)
 ├─ De-duplicación MAC Randomization (bit LAA) ───► ├─ Algoritmo STA/LTA + Base local SQLite / microSD
 └─ Muestreo I2C MPU6050 (200 Hz)                   ├─ Sincronización GPIO (LED Azul, Blink, Amarillo)
                                                    └─ Broker Mosquitto / Puente Python:
                                                         ├── MQTT TCP :1883  ──► Unity (Meta XR) / Godot 4 XR
                                                         └── WebSocket :8765 ──► WebXR GitHub Pages (Three.js)
```

### Cómo conectar una Raspberry Pi 5 real a este simulador
1. En la Raspberry Pi 5, instala dependencias y ejecuta el puente incluido:
   ```bash
   pip install smbus2 gpiozero paho-mqtt websockets pyserial
   python3 python_rpi5_bridge/rpi5_lpsbox_bridge.py --demo
   ```
   *(Quita `--demo` al leer datos reales de I2C/UART y los pines GPIO 17, 27 y 22).*
2. Abre la pestaña **«📘 Pitch MR & Arquitectura RPi5»** en la aplicación web e ingresa `ws://<IP-DE-TU-RPI5>:8765` para enlazar el hardware en vivo.

---

## 4. Estructura del Repositorio

- `index.html`, `css/styles.css`, `js/` — Aplicación interactiva 3D / WebXR (Three.js, `STLLoader`, `OrbitControls`, Web Audio API, consola Gateway RPi5 y evaluador de operario).
- `vendor/three/` — Módulos ESM de Three.js incluidos localmente para garantizar carga instantánea en GitHub Pages y redes universitarias sin depender de CDNs externos.
- `modelo3d.stl` — Malla 3D de 50,000 triángulos cargada tanto en el Nodo Sniffer dentro del edificio 3D como en el inspector CAD dedicado.
- `bozeto del gateway.jpg`, `bozeto del sniffer.jpg` — Bocetos originales a mano (Parte 2).
- `lpsbox_gateway_v.png`, `bozeto del sniffer rediseño IA.jpg`, `usodeLMArena.jpg` — Rediseños industriales asistidos por IA (Parte 3).
- `python_rpi5_bridge/rpi5_lpsbox_bridge.py` — Script Python 3 para Raspberry Pi 5 (filtro MAC 10s + STA/LTA + GPIO 3 LEDs + MQTT/WebSocket).
- `.nojekyll` — Configuración para despliegue directo de archivos estáticos en GitHub Pages.
