# LPSBOX System — Simulador VR / MR de Emergencia Sísmica (Edificio 4 Pisos)

En este repositorio se encuentra el **simulador y juego interactivo 3D / WebXR (Realidad Virtual y Realidad Mixta)** donde se recrea un escenario urbano y estructural de **4 pisos** para probar en conjunto el **Nodo Sniffer sobre Raspberry Pi 5 + MPU6050 (interior)** y el **LPSBOX Gateway montado en un Poste de Luz (exterior)**, junto con los artefactos de diseño industrial (`modelo3d.stl`, bocetos originales y rediseños asistidos por IA).

🔗 **Ejecución directa en GitHub Pages:**  
`https://juanf14-ui.github.io/Game-for-LPSBOX-System/`

---

## 1. Arquitectura Física del Sistema LPSBOX y Rol del Operario

Cuando ocurre un terremoto en una edificación de varios pisos, el colapso de plafones, estanterías y el corte eléctrico dejan incomunicadas a las personas atrapadas en segundos. **LPSBOX** separa físicamente la detección interior del resguardo exterior de los datos:

1. **Nodo Sniffer Interior (`modelo3d.stl` — Raspberry Pi 5 + Detector Sísmico MPU6050):**
   - Instalado dentro del edificio (**Piso 2 — Laboratorio de Electrónica**).
   - La **Raspberry Pi 5** ejecuta tanto el escaneo pasivo de *WiFi 802.11 / BLE Probe Requests* (con filtro de aleatorización de direcciones MAC en ventanas deslizantes de **10 segundos** y estimación multinivel por atenuación de losa) como el algoritmo sísmico **`STA/LTA`** sobre el acelerómetro **`MPU6050`**, activando su pantalla frontal completa (`ALERTA / Enviando datos`) y alarma de voz.
2. **LPSBOX Gateway Exterior (En Poste de Alumbrado Público a 4.65 m):**
   - Caja resistente minimalista **sin pantalla**, provista de **3 LEDs físicos de estado** (**Azul** = sin alerta, **Mini LED titilante** = recibiendo paquetes, **Amarillo** = captura pre-sismo `t₀` almacenada) y puertos `microSD` / `USB-C`.
   - Ubicada afuera en un **poste de luz** fuera del radio de caída estructural. Para extraer los registros, **el operario debe primero accionar la polea del poste (`[B]` o clic en el poste 3D) para bajar el Gateway de `4.65 m` a `1.18 m`** y luego conectar el cable `USB-C` (`[E]`).

---

## 2. Características Principales del Simulador 3D / WebXR

- **Edificio de Prueba de 4 Pisos + Entorno Urbano:**
  - **Piso 1:** Cafetería & Lobby Principal · **Piso 2:** Laboratorio de Electrónica & Nodo Sniffer RPi 5 · **Piso 3:** Sala de Servidores & Telecom · **Piso 4:** Auditorio & Sala de Proyectos, conectados por una **escalera de emergencia acristalada** hacia el punto de encuentro exterior.
  - Deriva sísmica modal por altura (los pisos superiores oscilan con mayor amplitud que la planta baja).
- **Físicas Sólidas del Operario y Modo Vista Libre 360°:**
  - En modo **`🚶 Operario Físico [P]`**, el jugador camina con **gravedad, salto (`Espacio`), carrera (`Shift`), agacharse (`C`), linterna táctica (`L`) y colisiones reales** contra muros, fachadas, barandas de vidrio, columnas, muebles, poste exterior y escombros. Puede subir y bajar caminando por la **escalera en U de los 4 pisos hasta la azotea** y **empujar físicamente objetos dinámicos (`[F]` o al caminar sobre ellos)**.
  - En modo **`🛸 Vista Libre 360° [V]`**, dispone de vuelo libre 6-DOF sin restricciones para inspeccionar todo el edificio, interiores, escombros y azotea desde cualquier ángulo.
- **Escenario de Colapso Estructural Grave (`7.8 Mw`) y Sniffer Bajo Escombros:**
  - En **`💥 Colapso Estructural Grave (7.8 Mw, 27.5 s)`**, secciones de losas y vigas de los pisos superiores colapsan progresivamente dejando personas atrapadas pidiendo rescate, y en la Etapa 2 una viga reforzada del Piso 3 cae sobre el **Sniffer RPi 5 del Piso 2**, fracturando su pantalla OLED, cortando su telemetría en vivo y dejándolo **sepultado bajo escombros** — demostrando por qué resguardar el snapshot pre-sismo `t₀` en el **Gateway del poste exterior** es vital.
- **NPCs Articulados con Voz Hablada + Globos de Texto:**
  - Las personas dentro del edificio cuentan con **síntesis de voz en español sincronizada con sus globos de diálogo** (con variaciones de tono por personaje y urgencia, activable/silenciable con `🗣️ Voces NPC`), reaccionando de forma realista ante monitoreo normal, sismo leve (`4.2 Mw`), terremoto fuerte (`6.9 Mw`) y atrapamiento por colapso (`7.8 Mw`).
- **Física de Objetos que Caen y Oscilan:**
  - Lámparas colgantes con péndulo y chispazos eléctricos, monitores, tazas, libros, macetas, cuadros de pared, proyectores, placas de plafón acústico y vuelco de libreros/racks de servidores según la aceleración del piso.
- **Registro Visual Completo y Persistente de Ondas Sísmicas:**
  - Tanto en el HUD 3D como en la Consola del Gateway puedes alternar entre **`📈 Evento Completo`** y **`🔴 En Vivo`**. El sismograma conserva toda la traza del evento e incluye el marcador exacto de corte cuando el Sniffer queda sepultado bajo escombros junto con la curva punteada del movimiento real del suelo.
- **Pantalla del Sniffer `modelo3d.stl` Calibrada al 100%:**
  - La pantalla OLED dinámica cubre exactamente el marco frontal completo del modelo 3D (`modelo3d.stl`, 50,000 triángulos), mostrando además grietas y fallo crítico cuando sufre daño bajo escombros.

---

## 3. Controles Rápidos

- **`▶ INICIAR EXPERIENCIA COMO OPERARIO`**: Botón principal de arranque inmediato (o inicio directo con Sismo Pequeño, Terremoto Fuerte o Colapso Grave `7.8 Mw`).
- **Tecla `P` (`🚶 Operario Físico`)**: Caminar con físicas y colisiones reales (`WASD` moverse · `Shift` correr · `Espacio` saltar · `C` agacharse · `F` empujar objetos · `L` linterna táctica).
- **Tecla `V` (`🛸 Vista Libre 360°`)**: Vuelo libre 3D por todo el escenario (`WASD` volar · `Espacio` subir · `C`/`Q` bajar · `Shift` turbo).
- **Tecla `B` o clic en el Poste de Luz**: Bajar / subir mecánicamente el **LPSBOX Gateway** del poste exterior (`4.65 m ↔ 1.18 m`).
- **Tecla `E` o botón `Extraer Datos`**: Conectar por USB-C al Gateway (requiere haber bajado antes el Gateway del poste).
- **Tecla `G`**: Simular un golpe físico directo sobre el acelerómetro `MPU6050` de la Raspberry Pi 5 (onda de choque MR).

---

## 4. Puente en Vivo con Raspberry Pi 5 (`python_rpi5_bridge/`)

```text
[INTERIOR PISO 2: SNIFFER RASPBERRY PI 5 + MPU6050]        [EXTERIOR EN POSTE DE LUZ (4.65 m): LPSBOX GATEWAY]
 ├─ WiFi/BLE Probe Requests + Filtro MAC Aleatoria (10s)    ├─ Receptor inalámbrico fuera de zona de colapso
 ├─ Muestreo I2C MPU6050 + Disparo STA/LTA + Onda Completa  ├─ 3 LEDs Físicos (Azul / Mini Blink / Amarillo)
 └─ MQTT (:1883) / WebSocket (:8765) ─────────────────────► └─ Descenso por polea (1.18 m) + Extracción USB-C
```

Para enlazar una **Raspberry Pi 5** real o probar telemetría sintética en vivo:
```bash
pip install smbus2 gpiozero paho-mqtt websockets
python3 python_rpi5_bridge/rpi5_lpsbox_bridge.py --demo
```
Luego abre la pestaña **«📘 Pitch MR & Arquitectura RPi5»** e ingresa `ws://<IP-DE-TU-RPI5>:8765`.
