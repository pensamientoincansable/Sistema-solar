/**
 * Resolución de rutas de assets estáticos (carpeta public/).
 *
 * Vite expone `import.meta.env.BASE_URL`:
 *   - en desarrollo: '/'
 *   - en build con base './': './'  (GitHub Pages sirve bajo /Sistema-solar/)
 *
 * Antes se usaba `textureLoader.setPath('/')` + rutas '/textures/x.jpeg', lo
 * que generaba URLs '//textures/x.jpeg' (protocolo-relativas => host
 * "textures") y ninguna textura cargaba. Con este helper todas las rutas se
 * resuelven relativas a la base real del despliegue.
 */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

export function assetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const base = BASE.endsWith('/') ? BASE : BASE + '/';
  return base + clean;
}
