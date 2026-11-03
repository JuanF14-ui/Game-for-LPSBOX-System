# LPSBOX · Simulador sísmico inspirado en CyT UNAL

Simulador educativo 3D y WebXR para explorar un escenario de emergencia, el **Sniffer RPi 5 + MPU6050 interior** y un **Gateway exterior en un poste**. Es un sitio estático compatible con [GitHub Pages](https://juanf14-ui.github.io/Game-for-LPSBOX-System/).

## Escenario

La construcción es una **interpretación aproximada**, no un levantamiento ni plano oficial del edificio 454 de la Universidad Nacional de Colombia en Bogotá. Se usaron referencias públicas: [bibliotecas UNAL](https://bibliotecas.unal.edu.co/sede-bogota/acerca-de/bibliotecas-en-la-sede), [descripción institucional](http://historico.cartauniversitaria.unal.edu.co/ediciones/38/03carta.html) y fotografías públicas del edificio. La distribución concreta de habitaciones, medidas, accesos y derrumbes es una propuesta de juego y no representa necesariamente el edificio real.

A partir también de las fotografías compartidas se ajustaron la fachada posterior, barandas, rampas, acristalamientos y el auditorio. Se recrean la plazoleta, dos alas en L, fachada clara y cortasoles, rampas exteriores, biblioteca con vacío central, aulas, cuartos TI, baños, cafetería parcialmente cubierta y terraza descubierta. Hay una interpretación de auditorio subterráneo cerca del acceso. Las ubicaciones de hardware son ficticias. El modelo y la simulación **no son un plan de evacuación ni deben utilizarse para decisiones de rescate reales**.

## Cómo jugar

1. Pulsa **Iniciar experiencia** y elige monitoreo o un sismo. En escritorio, el modo operario usa WASD, ratón, Espacio, Shift, C y F; también está disponible la vista libre y el modo táctil.
2. Tras el sismo, baja el Gateway con **B** o con su botón de polea. Cuando llegue a 1,18 m, pulsa **E** o **Extraer datos** para consultar el registro en la consola.
3. Revisa los dispositivos estimados en el momento `t₀`, incluido el auditorio y la cafetería. Completa el total, cada nivel y la prioridad de búsqueda para enviar el informe. La comparación posterior es parte del juego: señales y ubicaciones son sintéticas, no mediciones reales.
4. Al terminar cada sismo llega una ambulancia y un camión de bomberos con personal de respuesta. En PC aparece una cinemática de 12 segundos que se puede saltar; los vehículos y el personal permanecen en el escenario. En VR llegan sin mover la cámara del visor.
5. En el escenario catastrófico se muestran personas atrapadas bajo escombros y el Sniffer dañado; el registro previo queda en el Gateway. Los NPC usan gestos, globos de diálogo y efectos no verbales, sin voz hablada.

### Realidad virtual

En un navegador y visor compatibles con WebXR, abre **Entrar VR** en HTTPS. El stick izquierdo desplaza al jugador sin salir del área física; el derecho gira por pasos. El gatillo permite apuntar a superficies o botones y Grip centra el panel. El panel ofrece visitas al auditorio, niveles, Sniffer y Gateway, así como los escenarios. Baja el Gateway mediante **Polea Poste** y abre **Datos Gateway**. En la consola 3D, usa `−` / `+` para editar cada nivel, **Prioridad** para elegir la zona y **Enviar** para evaluar el informe sin quitarte el visor. El conteo total se calcula como suma de niveles.

La disponibilidad y el comportamiento de WebXR dependen del navegador y del visor. El modo inmersivo debe probarse en el dispositivo de destino.

## Desarrollo y rendimiento

```sh
python3 -m http.server 8080
# Abrir http://localhost:8080/ desde la raíz de este repositorio
node --test tests/*.test.mjs
```

El sitio usa Three.js incluido localmente y texturas procedurales; no requiere una compilación para Pages. `js/cytBuilding.js` agrupa objetos repetidos con `InstancedMesh`, y se limita la resolución de píxel y de sombras para reducir la carga. La fluidez depende de la GPU, resolución y visor; **60 FPS no están garantizados**. Las pruebas de simulación no sustituyen una prueba visual en navegador ni una prueba de WebXR con un visor físico.

El puente opcional `python_rpi5_bridge/rpi5_lpsbox_bridge.py` conserva el modo de demostración de telemetría. Las estimaciones de presencia, RSSI y la deduplicación en el juego son modelos simplificados y no establecen un conteo fiable de personas en situaciones reales.
