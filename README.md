# WALL·E • Sistema Solar - Recolector Galáctico 🛰️🌌

> **Proyecto recogida de basura espacial** - Videojuego web 3D optimizado para Móvil, PC y TV con menú holográfico, WALL·E como protagonista, sistema solar completo y construcción de civilizaciones.

![WALL·E](https://img.shields.io/badge/WALL·E-CC--BY--4.0-yellow) ![Three.js](https://img.shields.io/badge/Three.js-0.160-black) ![Vite](https://img.shields.io/badge/Vite-5.4-646cff) ![License](https://img.shields.io/badge/License-MIT-green)

## 🎮 Demo en Vivo

```bash
npm install
npm run dev
# Abre http://localhost:5173
```

**Preview Arena**: El servidor dev ya está configurado con `host: 0.0.0.0` y `allowedHosts: true` para funcionar en el preview https://{port}-{sandbox}.e2b.app

## 🌟 Características Implementadas

### Sistema Solar Real
- **8 planetas** con texturas originales del repo (`textures/*_baseColor.jpeg`)
- Órbitas escaladas, rotación, atmósfera sutil, anillos de Saturno, Luna terrestre
- Sol con glow y luz puntual, estrellas con 3000 puntos + parallax
- Cinturón de asteroides entre Marte y Júpiter

### WALL·E Protagonista
- Modelo GLTF original del repo (`scene.gltf` + `scene.bin`) - 24k vértices, CC-BY-4.0 Omshivam
- Fallback cúbico si falla carga, para no bloquear gameplay
- Física: velocidad max 35u/s, boost 2.2x, drag 0.92, aceleración 45
- Thruster con luz puntual + partículas Points (80) + efecto boost
- **Dos cámaras fluidas**:
  - Tercera persona: offset (0,6,-14), lerp 0.08, mira 20u adelante
  - Primera persona: offset (0,1.2,0.6), inmersiva dentro de WALL·E
  - Toggle con `C` o botón móvil

### Recolección y Refinado
- **Basura espacial** procedural: 6 tipos (satélite, panel, cohete, orgánico, cristal, hielo) con valor y material
- Distribución alrededor de planetas según `trashType` (ej. Marte genera óxido metálico)
- Recolección por proximidad (radio 4.5u), capacidad 50, auto-respawn para mantener densidad
- **Refinerías orbitales**: toroide + núcleo icosaedro + 2 anillos giratorios + luz. Una central + una por planeta que sigue su órbita
- Depósito con `[ESPACIO]`, refinado con bonus aleatorio, efecto explosión cian

### Civilizaciones Adaptadas
Cada planeta tiene una civilización única con requisitos y bonus:
- **Mercurio - Forja Solar**: espejos resistentes calor, +200% energía
- **Venus - Aerópolis**: ciudades flotantes, extracción atmosférica
- **Tierra - Neo-Terra**: arcologías verdes, +50% terraformación
- **Marte - Ares Dome**: cúpulas regolito, minería autónoma
- **Júpiter - Estación Jovian**: plataformas magnéticas, fusión ilimitada
- **Saturno - Anillo Habitat**: ciudades anulares, gravedad artificial
- **Urano - Cryo Vault**: bóvedas cuánticas, computación cuántica
- **Neptuno - Abismo Azul**: estaciones profundas, detección materia oscura

Construcción: consume materiales, añade estructura (domo/cubo) sobre planeta, sube nivel civilización.

### Enemigos y Combate
- **3 tipos**: Drone (rápido, 40hp), Pirata (80hp), Mothership (200hp, 3x escala)
- IA: patrulla, caza basura (roba y destruye), caza jugador si <70u, huida
- Disparo enemigo: proyectil rojo 35u/s con imprecisión
- **Armamento jugador**:
  - Láser: cápsula cian, 90u/s, 25 daño, infinito, cadencia 150ms
  - Plasma: esfera magenta, 45u/s, 60 daño, 50 munición, cadencia 400ms, rompe basura en más piezas
- Explosiones: partículas + anillo expansivo, luz

### Menú Galáctico Holográfico
- Diseño: glassmorphism, neón cian/magenta/amarillo, scanline animada, blur 12px
- Secciones: Jugar, Continuar, Sistema Solar (grid 4 planetas clicables), Materiales & Civilización (progreso + selector + construir), Configuración, Objetivo
- Fuentes: Orbitron (títulos) + Exo 2 (cuerpo)
- Transición suave, responsive: 1 columna en móvil, escala 1.2x en TV 4K

### HUD Inmersivo
- Top: salud barra + planeta cercano + basura contador + arma/munición
- Centro: crosshair con efecto shoot scale 1.5
- Bottom: inventario materiales + minimapa circular (140px) con planetas, basura, jugador + controles
- Notificaciones deslizantes con colores por tipo
- Hint refinería cuando <8u

### Optimización y Resolución Adaptativa
**Archivo `src/utils/AdaptiveResolution.js`:**
- Detecta dispositivo: móvil (touch ≤1024), tablet, PC, TV (≥1920 sin touch o UA tv)
- Calidad inicial: móvil 0 (DPR 1.5, 30fps, sin sombras, 40 basura, 4 enemigos, render 400), PC 2 (DPR 2.0, 60fps, sombras PCFSoft, 150 basura, 12 enemigos, 1500), TV 3 (DPR 1.0, 200 basura, 16 enemigos, 2500)
- Ajuste dinámico: mide FPS cada segundo, si avg < target-10 baja DPR 0.15 (min 0.6), si > target+5 sube 0.05
- Sombras: off en low, Basic en medium, PCFSoft en high/ultra
- LOD: basura invisible si > renderDistance, halo solo <60u
- GC: dispose geometrías al destruir

**Estructura Modular:**
```
src/
  config/PlanetsConfig.js (datos planetas, materiales, trash, enemigos)
  core/Game.js (loop, orquestación)
  core/Input.js (teclado, ratón, gamepad, pointer lock)
  utils/AdaptiveResolution.js
  utils/MobileControls.js (joystick dual + botones)
  entities/Planet.js, SolarSystem.js, WallE.js, Trash.js, Enemy.js, Refinery.js, Civilization.js
  systems/Combat.js
  ui/HUD.js, HoloMenu.js
```

### Controles Adaptativos
- **PC**: WASD mover, Q/E subir/bajar, Ratón mirar (pointer lock al click si HUD visible), Click izq disparar, F alternativo, 1/2 arma, Shift boost, Espacio recolectar/depositar, C cámara, ESC/P pausa
- **Móvil**: Joystick izq movimiento, der cámara, botones 🔫🚀📦📷, táctil full, vibración futura
- **TV/Gamepad**: Stick izq mover, der mirar, A recolectar, RT disparar, Y cámara, B boost, D-pad UI

## 📦 Recursos del Repositorio Usados

- `scene.gltf` + `scene.bin` + `textures/material_0_*` → WALL·E modelo principal
- `textures/earth_baseColor.jpeg`, `mars_`, `jupiter_`, `mercury_`, `venus_`, `saturn_`, `uranus_`, `neptune_`, `moon_`, `saturn_ring_`, `material_baseColor.jpeg` (sol) → Texturas planetas

Todas cargadas con `TextureLoader`, `colorSpace = SRGB`, fallback a color sólido si falla.

## 🛠️ Instalación y Build

```bash
npm install
npm run dev      # dev 5173
npm run build    # dist/
npm run preview  # preview build
```

Build genera `dist/` con assets hasheados, 625kB (163kB gzip) incluyendo Three.js.

## ✅ Errores Comprobados y Solucionados

Ver `IDEAS_MEJORA.md` sección checklist. Resumen:
- Texturas 404 → path absoluto `/textures/...` y `setPath('/')`
- Modelo WALL·E → fallback + onError
- Pointer lock bloqueando menú → solo si HUD visible
- Joystick vs teclado → umbral
- Memory leaks → dispose
- FPS móvil → adaptive DPR + sin sombras
- Host preview bloqueado → `allowedHosts: true`

## 💡 Ideas Futuro

Ver archivo `IDEAS_MEJORA.md` con roadmap detallado: narrativa episódica, tractor beam, clima espacial, facciones, jefes, hacking, Web Workers, WebGPU, PWA offline, multijugador WebRTC, audio 3D, modo museo NASA, etc.

## 📄 Licencia

- Código: MIT
- Modelo WALL·E: CC-BY-4.0 por Omshivam (https://sketchfab.com/Omshivam) - Crédito obligatorio: "This work is based on 'WALL-E' (https://sketchfab.com/3d-models/wall-e-b39d369914134d8ebd3f5d953e612498) by Omshivam licensed under CC-BY-4.0"
- Texturas planetarias: verificar licencia original, uso educativo

## 🙏 Créditos

Desarrollado como proyecto de recogida de basura espacial. Inspirado en WALL·E (Pixar) y datos del sistema solar.

---

**¡Limpia el sistema solar y construye el futuro!** 🌍🚀♻️
