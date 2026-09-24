# WALL·E • Sistema Solar - Recolector Galáctico 🛰️🌌

> **Proyecto recogida de basura espacial** - Videojuego web 3D optimizado para Móvil, PC y TV con menú holográfico, WALL·E como protagonista, sistema solar completo y construcción de civilizaciones.

![WALL·E](https://img.shields.io/badge/WALL·E-CC--BY--4.0-yellow) ![Three.js](https://img.shields.io/badge/Three.js-0.160-black) ![Vite](https://img.shields.io/badge/Vite-5.4-646cff) ![License](https://img.shields.io/badge/License-MIT-green)

## 🎮 Jugar

**🌐 Online (GitHub Pages):** https://pensamientoincansable.github.io/Sistema-solar/

**💻 En local:**

```bash
npm install
npm test          # colonias, guardado, cámara, HUD
npm run dev
# Abre http://localhost:5173
```

**Preview Arena**: El servidor dev ya está configurado con `host: 0.0.0.0` y `allowedHosts: true` para funcionar en el preview https://{port}-{sandbox}.e2b.app

## 🕹️ Controles

### 📱 Móvil / tablet (Android e iOS)
Al empezar la primera partida aparece un **tutorial interactivo** que señala cada control
real con un foco y una flecha (se puede repetir desde *Menú → Tutorial* o *Ajustes → Ver tutorial*).

| Control | Acción |
|---|---|
| **Joystick de movimiento** (dinámico) | Aparece donde apoyas el pulgar en la **mitad izquierda**. Arriba = avanzar. |
| **Joystick de cámara** (dinámico) | Aparece donde apoyas el pulgar en la **mitad derecha**. Sin inversión de ejes: derecha gira a la derecha, arriba mira arriba. |
| 🎯 Disparar (88 px) | Mantener para disparar (con ayuda al apuntar). |
| ⇄ Arma | Cambia entre las armas que tengas. |
| ⏫ Turbo | Mantener para volar más rápido. |
| ✋ Acción contextual | **Depositar** en refinería · **Reparar** refinería (mantener) · abrir la **Tienda** del taxi. |
| ▲ ▼ | Subir / bajar. |
| 👁 Ojo | Recorre 4 distancias de cámara: tercera persona → media → cercana → primera persona. |
| ⏸ Pausa | Menú, ajustes y civilizaciones. |

Los botones y joysticks están dimensionados para un dedo adulto (joystick de 132 px, disparo de 88 px,
resto ≥ 58 px) y en **Ajustes** se puede cambiar su tamaño (85–140 %), la **sensibilidad de la cámara**
(0,3×–2,5×), la vibración y la pantalla completa.

### 💻 PC
WASD mover · Ratón mirar (clic para capturar el puntero) · Q/E subir/bajar · Shift turbo ·
Clic/F disparar · 1-4 armas · **Rueda del ratón: distancia de cámara continua desde la tercera persona
hasta la primera** · V recorre las 4 distancias · C alterna 1ª/3ª persona · Espacio acción
(mantener = reparar) · R reparar · T tienda · **G mantén cerca de un planeta = civilizar** ·
**B visión cinemática 360º** (el mismo botón restaura el ángulo) · **H / ⛶ pantalla completa** · Esc/P pausa.

### 🎮 Mando / TV
Stick izq. mover · stick der. mirar · RT/RB disparar · B/LT turbo · A/X acción · LB siguiente arma ·
Y distancias de cámara · Back tienda · D-pad ▲▼ subir/bajar · L3 cinemática · R3 civilizar · Start pausa.

## 🌟 Características

### Sistema Solar
- **8 planetas** con texturas del repo, órbitas, atmósferas, anillos de Saturno y Luna.
- Sol con glow, estrellas y cinturón de asteroides entre Marte y Júpiter.

### WALL·E
- Modelo GLTF del repo (`public/scene.gltf`), **orientado de espaldas a la cámara** (antes miraba al jugador).
- Cámara con **zoom continuo** entre la tercera persona original y los ojos de WALL·E (primera persona,
  el modelo se oculta). Rueda en PC, botón 👁 con 4 niveles en móvil.
- Mejorable en la tienda: motor, blindaje, bodega, imán de recolección y soldador.

### Recolección, agua y refinado
- 10 tipos de basura. Cada planeta genera los materiales que necesita su civilización.
- **💧 Agua** (modelo `assets/drop_of_water`): gotas que abundan alrededor de la **Tierra** (y algunas en
  Neptuno). Es el único origen de agua, necesaria para Neo-Terra y Abismo Azul.
- Imán de recolección: la basura y las gotas cercanas vuelan hacia WALL·E.
- Refinerías orbitales: depositar da materiales + **créditos (CR)**.

### ☄️ Lluvias de asteroides (modelo `assets/asteroides`)
- Cada 70–110 s (la primera a los ~55 s) una oleada se dirige contra una refinería, avisada con banner,
  marcador en pantalla y minimapa.
- Los impactos dañan la refinería; a 0 % queda **FUERA DE SERVICIO** (no admite depósitos) hasta que
  WALL·E la **repara** manteniendo el botón de acción a su lado.
- Destruirlos da créditos y fragmentos de roca; los grandes se parten en dos. Defender sin impactos: +40 CR.

### 🛸 OVNIs (modelo `assets/nave_espacial_ufo`)
- Sustituyen a los antiguos enemigos: **Dron OVNI**, **OVNI pirata** y **Nave nodriza** (distinto tamaño,
  vida y halo de color).
- Patrullan su planeta, **roban basura con un rayo tractor** (la sueltan al ser derribados), rodean al
  jugador disparando y los drones dañados huyen.

### 🚕 Taxi-Mercader (modelo `assets/b90_taxi_the_fifth_element`)
- Vendedor ambulante que recorre una ruta de planetas, se detiene un rato en cada uno y espera si estás cerca.
- Tienda con **armas** (munición de plasma, Dispersor de chatarra, Lanzamisiles buscadores, packs de
  misiles, láser potenciado) y **mejoras** (motor, blindaje, bodega, imán, soldador, reparación).

### Armas
| Arma | Detalle |
|---|---|
| Láser | Infinito, rápido; mejorable (+35 % daño por nivel) |
| Plasma | Munición, daño alto, rompe la basura en trozos |
| Dispersor | 6 perdigones, munición infinita (tienda) |
| Misiles | Buscan OVNIs y asteroides, daño en área (tienda) |

### Interfaz
- **Menú** con pestañas (Objetivo, Planetas, Civilizaciones, Ajustes, Créditos) que cabe entero en un
  móvil en horizontal, sin desplazarse.
- **HUD** compacto sin solapamientos: estado (integridad, bodega, créditos, arma), objetivo dinámico,
  alertas, minimapa orientado según el rumbo (refinerías, taxi, OVNIs, asteroides, agua, basura),
  **indicador de acción contextual** y **marcadores** en pantalla o pegados al borde (taxi, refinería
  atacada, refinerías caídas, refinería más cercana con la bodega llena).
- Efectos de sonido sintetizados con WebAudio (0 KB de descarga) controlados por el volumen de Ajustes.

## ⚡ Optimización
- **Modelos optimizados**: `scripts/optimize-assets.mjs` genera versiones ligeras de `/assets` en
  `public/models/` (≈3,8 MB en lugar de ≈74 MB; texturas de 4096² reducidas a 512–1024 px; la gota de
  agua pasa de 118 800 a 354 triángulos). Los originales de `/assets` no se modifican.
- Texturas planetarias de 1024×512 en móvil (`public/textures/lowres/`), menos teselación y sin MSAA.
- **Partículas en GPU**: un único `THREE.Points` para explosiones, chispas y estelas (1 draw call).
- **Pools** de proyectiles: sin crear geometrías, materiales ni `PointLight` por disparo. Antes cada luz
  nueva obligaba a recompilar los shaders de toda la escena (tirones).
- Sin luces dinámicas en refinerías/enemigos (halos con sprites) ni `shadowMap` sin uso.
- Geometrías/materiales compartidos (basura por tipo, OVNIs, asteroides) e `InstancedMesh` para el agua.
- Posiciones de planetas cacheadas por frame, sin reservas de memoria en los bucles calientes,
  minimapa a 12 Hz, textos del HUD a 10 Hz y marcadores a 30 Hz.
- En pausa o con la tienda abierta la escena no se vuelve a dibujar (ahorro de batería).
- Resolución adaptativa según FPS (`AdaptiveResolution`).

### Regenerar los modelos optimizados
```bash
npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp meshoptimizer
node scripts/optimize-assets.mjs            # todo
node scripts/optimize-assets.mjs water ufo  # solo algunos (asteroids|water|ufo|taxi|planets)
```

## 🗂️ Estructura
```
assets/                  modelos originales (masters CC-BY-4.0 con license.txt)
public/                  estáticos copiados a dist/
  scene.gltf, scene.bin  WALL·E
  models/                asteroides, gota, OVNI y taxi optimizados (GLB)
  textures/ (+ lowres/)  planetas, sol, luna, anillos
scripts/optimize-assets.mjs
tests/                   pruebas de colonia, guardado, cámara, HUD (npm test)
src/
  civ/                   simulación RTS (Colony) y modo superficie 3D (CivMode)
  systems/SaveSystem.js  autoguardado + archivo .json
src/
  config/PlanetsConfig.js, ShopConfig.js
  core/Game.js (orquestación), Input.js (teclado, ratón, rueda, mando, táctil)
  entities/SolarSystem.js, Planet.js, WallE.js, Trash.js, WaterSystem.js, Enemy.js (OVNIs),
           AsteroidSystem.js, Refinery.js, TaxiVendor.js, Civilization.js
  systems/Combat.js, Particles.js, Settings.js, AudioFX.js
  ui/HUD.js, HoloMenu.js, ShopUI.js, Tutorial.js
  utils/MobileControls.js (joysticks dinámicos), device.js, ModelLibrary.js, HealthBar.js,
        textures.js, AdaptiveResolution.js, assets.js
```

## 🚀 Despliegue en GitHub Pages

El workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) compila
(`npm ci && npm run build`) y publica `dist/` en cada push a `main`. Requisito (una vez): *Settings → Pages →
Source: GitHub Actions*. `vite.config.js` usa `base: './'`.

## ✅ Errores corregidos
- **Agua, gas, polímero y vidrio eran imposibles de conseguir** → Venus, Tierra, Júpiter, Saturno y Neptuno
  no se podían civilizar. Nuevos tipos de basura por planeta y gotas de agua.
- WALL·E miraba hacia la cámara (giro de 180° sobrante).
- La zona táctil tapaba los botones del HUD; controles fijos pequeños y superpuestos en móvil.
- "Nueva misión" conservaba civilizaciones y enemigos; al morir se reaparecía en una posición antigua.
- El volumen no hacía nada; el estado "huida" de los enemigos no existía.
- Detección táctil inconsistente entre módulos; `shadowMap` alternado sin luces con sombra (recompilaba shaders).
- Además de los ya resueltos anteriormente (GitHub Pages, texturas, input pegado, pointer lock, etc.).

## 📄 Licencia

- Código: MIT
- Modelos 3D (CC-BY-4.0, crédito obligatorio):
  - This work is based on "WALL-E" (https://sketchfab.com/3d-models/wall-e-b39d369914134d8ebd3f5d953e612498) by Omshivam licensed under CC-BY-4.0
  - This work is based on "Asteroids Pack (rocky version)" (https://sketchfab.com/3d-models/asteroids-pack-rocky-version-adde1ecf129e4509be8af61b84bafa85) by SebastianSosnowski (https://sketchfab.com/SebastianSosnowski) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
  - This work is based on "drop of water" (https://sketchfab.com/3d-models/drop-of-water-dcbdc5e8905449ad95a47720e4d3c57c) by furret (https://sketchfab.com/ff.ferretti02) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
  - This work is based on "Nave Espacial UFO" (https://sketchfab.com/3d-models/nave-espacial-ufo-f7a5527258ce49dbad645bd4d1530a09) by olamultimedia (https://sketchfab.com/olamultimedia) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
  - This work is based on "B90 Taxi (The fifth element)" (https://sketchfab.com/3d-models/b90-taxi-the-fifth-element-b4253a3ffdaa4d229205b9d29b8bdfda) by payotdirlyesne (https://sketchfab.com/payotdirlyesne) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
- Texturas planetarias: verificar licencia original, uso educativo

## 🙏 Créditos

Desarrollado como proyecto de recogida de basura espacial. Inspirado en WALL·E (Pixar) y datos del sistema solar.

---

**¡Limpia el sistema solar y construye el futuro!** 🌍🚀♻️
