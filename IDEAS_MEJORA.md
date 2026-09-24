# 🚀 Ideas de Mejora - WALL·E Sistema Solar

## Propuesta base implementada
Juego de recolección espacial con WALL·E, sistema solar real con 8 planetas, refinerías orbitales, enemigos piratas, combate láser/plasma, construcción de civilizaciones adaptadas.

## ✅ Implementado en la versión 2 (UI móvil, tutorial y nuevos elementos)
- [x] **UI móvil rehecha**: joysticks **dinámicos** (aparecen donde se apoya el dedo; izquierda mover, derecha cámara, sin inversión de ejes), botones grandes para dedo adulto, HUD compacto sin solapamientos, menú con pestañas que cabe en horizontal.
- [x] **Tutorial interactivo** al empezar en táctil (7 pasos con foco, aro y flecha sobre cada control; auto-avance al mover/mirar). Repetible desde el menú.
- [x] **Ajustes**: sensibilidad de cámara táctil/mando y de ratón, tamaño de controles, vibración, pantalla completa, volumen (ahora con efectos de sonido WebAudio).
- [x] **Cámara**: WALL·E de espaldas; rueda del ratón de 3ª a 1ª persona; botón 👁 con 4 distancias en móvil.
- [x] **Lluvias de asteroides** (modelo `assets/asteroides`) contra las refinerías + integridad, estado fuera de servicio y **reparación**.
- [x] **Agua** (modelo `assets/drop_of_water`) abundante alrededor de la Tierra.
- [x] **OVNIs** (modelo `assets/nave_espacial_ufo`) con rayo tractor que roba basura (idea "Tractor Beam" aplicada a los enemigos).
- [x] **Taxi-Mercader** (modelo `assets/b90_taxi_the_fifth_element`): tienda de armas (dispersor, misiles buscadores…) y mejoras (motor, blindaje, bodega, imán, soldador) — primer paso del "árbol de habilidades".
- [x] Créditos (CR) como economía: depósitos, derribos, asteroides y reparaciones.
- [x] Vibración háptica en Android (idea de accesibilidad móvil).

### Siguientes pasos sugeridos
- Guardar progreso (créditos, mejoras, civilizaciones) en `localStorage`/IndexedDB.
- Instanciar la basura por tipo (`InstancedMesh`) para bajar aún más las draw calls.
- Compresión de texturas KTX2/Basis para móviles de gama baja.
- Jefes OVNI por planeta y rutas comerciales del taxi que haya que escoltar.

---

## 💡 Ideas para Mejorar el Juego (Roadmap)

### 1. Narrativa y Progresión
- **Historia episódica**: Cada planeta desbloquea un capítulo de la historia de WALL·E y EVA. Diálogos holográficos.
- **Sistema de misiones**: Misiones principales (limpiar órbita terrestre) y secundarias (rescatar satélites históricos como Voyager, ISS).
- **Árbol de habilidades**: Mejoras para WALL·E: capacidad de carga, velocidad, escudo, tractor beam, IA de EVA como compañero.
- **Logros / Coleccionables**: 50 satélites reales de la NASA escondidos, con ficha educativa.

### 2. Gameplay Profundo
- **Tractor Beam**: En lugar de colisión, rayo tractor para atraer basura a distancia (física de cuerda).
- **Clasificación de basura**: Mini-juego de separación en refinería (puzzle rápido) para bonus de materiales.
- **Clima espacial**: Tormentas solares, lluvia de meteoritos, anomalías gravitacionales que afectan movimiento.
- **Ciclo día/noche planetario**: Sombra de planeta afecta energía solar.
- **Combustible y oxígeno**: Gestión de recursos, estaciones de recarga.
- **Modo construcción libre**: Colocar edificios en superficie planetaria con vista desde órbita, no solo orbital.

### 3. Civilizaciones Adaptadas (Expandido)
- **Mercurio**: Ciudad espejo que rota para evitar sol, espejos gigantes.
- **Venus**: Aerostatos con biomas flotantes, agricultura aérea.
- **Marte**: Red de túneles de lava, cúpulas de regolito impresas en 3D.
- **Júpiter**: Estación que extrae helio-3, anillos de aceleradores de partículas.
- **Saturno**: Habitat anular giratorio (O'Neill cylinder) dentro de anillos.
- **Interconexión**: Rutas comerciales entre planetas que el jugador debe proteger de piratas.

### 4. Enemigos y Combate Mejorado
- **Facciones**: Piratas chatarra, drones corporativos de AutoCorp, IA rebelde.
- **Jefes**: Mothership por planeta, con puntos débiles.
- **Sigilo**: Campos de basura densa para esconderse, desactivar sensores.
- **Hacking**: Mini-juego para desactivar enemigos y convertirlos en aliados recolectores.
- **Armas adicionales**: EMP, red de captura, misiles de fragmentación, escudo burbuja.

### 5. Técnico y Optimización (Ya implementado base + futuro)
- **Implementado**:
  - Resolución adaptativa (AdaptiveResolution) detecta móvil/PC/TV y ajusta DPR, sombras, conteo partículas/basura/enemigos.
  - LOD planetario, frustum culling, instancing conceptual para basura.
  - Controles unificados: teclado/ratón + gamepad + joystick táctil dual + giroscopio opcional.
  - Estructura modular (core, entities, systems, ui, utils).
  - Carga progresiva con Loading Screen y fallback de modelo.

- **Futuro**:
  - **Occlusion culling** con BVH para cinturón asteroides.
  - **Web Workers** para física de basura y pathfinding enemigos.
  - **WebGPU** renderer fallback si disponible (Three.js WebGPU).
  - **PWA + Offline**: Service Worker cache de texturas y modelos, instalable en TV.
  - **Guardado en IndexedDB**: Progreso, inventario, civilizaciones.
  - **Multijugador cooperativo**: WebRTC, un jugador WALL·E otro EVA, compartir inventario.
  - **Audio 3D**: Positional audio con Web Audio API, sonido cambia según planeta.

### 6. Accesibilidad y Plataformas
- **TV**: Navegación con mando a distancia (D-pad), UI escalada 120%, soporte CEC.
- **Móvil**: Vibración háptica al recolectar/disparar, modo ahorro batería (30fps, sin sombras).
- **PC**: Soporte ultra-wide, DLSS-like via FSR en shader, ray tracing sutil en refinerías.
- **Opciones daltonismo**: Paletas alternativas para materiales.
- **Subtítulos y narración**: Voz de WALL·E con TTS local.

### 7. Educativo y Realismo
- **Datos NASA**: Órbitas reales escaladas, información emergente de cada planeta (temperatura, gravedad).
- **Basura real**: Modelos basados en debris tracker de ESA (Tiangong, satélites muertos).
- **Modo museo**: Recorrer sistema solar sin enemigos, con audioguía.
- **Cálculo de huella**: Mostrar cuánta basura real hay en cada órbita.

### 8. Monetización Ética (si se desea)
- Cosméticos para WALL·E (sombreros, pinturas) desbloqueables, no pay-to-win.
- Donación a proyectos de limpieza espacial real (ej. ClearSpace).

### 9. Expansiones
- **Lunas**: Explorar Europa, Titán, Encélado con mecánicas únicas (océanos bajo hielo).
- **Cinturón de Kuiper y más allá**: Viaje a Plutón y sonda Voyager como Easter Egg final.
- **Constructor de naves**: Usa materiales refinados para construir naves hijas que automatizan recolección.

---

## 🛠️ Optimización Actual Detallada

- **Resolución Adaptativa**: `AdaptiveResolution.js` mide FPS cada segundo, baja DPR si < targetFPS, sube si sobra. Detecta deviceType via UA + tamaño + touch.
- **Quality Levels**: 0 móvil (40 basura, 4 enemigos, sin sombras), 1 tablet (80/8), 2 PC (150/12), 3 TV (200/16).
- **Render Distance**: 400-2500 unidades según calidad, basura lejana invisible.
- **Partículas**: Thruster y explosiones limitadas por quality.
- **Texturas**: `colorSpace = SRGB`, compresión JPEG existente reutilizada.
- **Modelos**: WALL·E GLTF original (24k vértices) con fallback Box si falla carga.
- **Shadows**: Desactivadas en móvil, PCFSoft en alta.
- **GC**: Dispose geometrías al destruir trash/enemigos/proyectiles.

## 📱 Controles por Plataforma

| Plataforma | Movimiento | Cámara | Distancia cámara | Disparo | Acción |
|------------|------------|--------|------------------|---------|--------|
| PC | WASD | Ratón (pointer lock) | Rueda (3ª→1ª), V, C | Click izq / F | Espacio (mantener = reparar), T tienda |
| TV | Stick izquierdo | Stick derecho | Y | RT / RB | A / X, Back tienda |
| Móvil | Joystick dinámico izq. | Joystick dinámico der. | Botón 👁 (4 niveles) | Botón 🎯 | Botón ✋ contextual |

## ✅ Checklist de Errores Solucionados

### Carga / despliegue (causa de "el juego no carga")
- [x] **GitHub Pages servía el código fuente sin compilar** (`Source: Deploy from a branch`) → `index.html` pedía `/src/main.js` (404 bajo `/Sistema-solar/`) y el navegador no puede resolver `import 'three'`. Solución: workflow `.github/workflows/deploy-pages.yml` que compila con Vite y publica `dist/` (Pages → Source: *GitHub Actions*).
- [x] Rutas absolutas en el build (`/assets/...`) → `base: './'` en `vite.config.js`, funciona en cualquier subdirectorio.
- [x] `textures/`, `scene.gltf` y `scene.bin` no se incluían en `dist/` → movidos a `public/`.
- [x] Texturas planetarias nunca cargaban: `setPath('/')` + `/textures/x` generaba `//textures/x` (URL protocolo-relativa → host "textures") → helper `assetUrl()` basado en `import.meta.env.BASE_URL`.
- [x] `hmr.host: 'localhost'` rompía el websocket de Vite detrás de un proxy (preview) → eliminado, el cliente infiere host/puerto de la página.
- [x] Modelo WALL·E no carga → fallback cubo + onError handler (se mantiene)

### Controles
- [x] WALL·E seguía moviéndose tras soltar W/A/S/D, disparando tras soltar F/click y con boost tras soltar Shift (el estado se realimentaba: `this.boost = shift || this.boost`) → `InputSystem` recalcula el estado cada frame a partir de canales independientes (teclado, ratón, táctil, gamepad).
- [x] El ratón hacía girar a WALL·E indefinidamente tras un solo movimiento → delta de ratón acumulado y consumido por frame (`lookDeltaX/Y`).
- [x] Salto brusco al capturar el puntero (primer `movementX` enorme) → se descartan los 2 primeros eventos y se limita el delta por evento.
- [x] A/D invertidos (la derecha del jugador mirando a +Z es −X) → corregido.
- [x] Cabecear mirando a ±X producía alabeo (Euler `XYZ`) → orden `YXZ`.
- [x] Botón 📷 móvil no cambiaba la cámara → `requestCameraToggle()`.
- [x] ESC con puntero capturado no pausaba (el navegador se queda el keydown) → al perder la captura se pausa automáticamente; botón ❚❚ en el HUD.
- [x] Pulsaciones rápidas de ESPACIO/📦 perdidas entre frames → latch de pulsación.
- [x] Joystick sobrescribe teclado → canal táctil separado (sin umbral mágico)
- [x] Memory leak proyectiles/explosiones → dispose + splice
- [x] FPS bajo en móvil → AdaptiveResolution baja DPR y desactiva sombras
- [x] Resize no actualiza cámara → listener en Game
- [x] Basura infinita → respawn controlado y LOD invisible lejana
- [x] Colisiones tunneling a alta velocidad → radius 4.5 y check cada frame
- [x] TV host bloqueado → `allowedHosts: true` en vite.config
- [x] Estrellas invisibles (la niebla exponencial las apagaba a 800-2000 u) → `fog: false` en el material
- [x] `MeshBasicMaterial` con `emissive` (warning de Three.js) → eliminado
- [x] Notificaciones ocultas detrás del menú (z-index) → por encima del menú
- [x] `alert()` para la ficha de planeta (bloqueante y bloqueado en iframes) → panel en el propio menú
- [x] Ajustes de Calidad / Cámara sin efecto → conectados a `AdaptiveResolution` y a la cámara
- [x] Monitor 1080p detectado como TV → detección por UA de TV o ≥ 4K
- [x] Sin colisión con sol/planetas → rebote amortiguado + daño por calor cerca del sol
- [x] Enemigos atacaban en el punto de aparición → zona de exclusión + 12 s de gracia
- [x] HUD repintaba `innerHTML` cada frame → refresco a 10 Hz solo si cambia

### Versión 2
- [x] Agua, gas, polímero y vidrio no se podían conseguir (Venus, Tierra, Júpiter, Saturno y Neptuno imposibles de civilizar) → nuevos tipos de basura por planeta + gotas de agua.
- [x] WALL·E miraba hacia la cámara → eliminado el giro de 180° del modelo.
- [x] La zona táctil a pantalla completa tapaba los botones del HUD → capas reordenadas.
- [x] Joysticks fijos pequeños y botones superpuestos en móvil → joysticks dinámicos y botones escalables.
- [x] "Nueva misión" conservaba civilizaciones/enemigos y al morir se reaparecía en una posición antigua → reinicio completo y reaparición junto a la Tierra actual.
- [x] El control de volumen no tenía efecto → efectos WebAudio.
- [x] Estado "huida" de los enemigos inexistente → implementado.
- [x] Una `PointLight` por proyectil, enemigo y refinería (recompilación de shaders y coste por píxel) → halos con sprites y pools.
- [x] Geometría/material nuevos por proyectil, chispa y pieza de basura + `setTimeout` por destello → pools, partículas en GPU y recursos compartidos.
- [x] `shadowMap` activado/alternado sin ninguna luz con sombras → desactivado.
- [x] Los modelos nuevos de `/assets` pesan ~74 MB con texturas 4096² (inviables en móvil) → se cargan versiones GLB optimizadas de ~3,8 MB generadas por `scripts/optimize-assets.mjs`.
