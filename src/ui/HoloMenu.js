/**
 * HoloMenu - Menú galáctico holográfico
 */
import { PLANETS_CONFIG } from '../config/PlanetsConfig.js';

export class HoloMenu {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('holo-menu');
    this.planetGrid = document.getElementById('planet-grid');
    this.materialsList = document.getElementById('materials-list');
    this.settings = {
      quality: document.getElementById('setting-quality'),
      camera: document.getElementById('setting-camera'),
      sound: document.getElementById('setting-sound')
    };
    this.init();
  }

  init() {
    // Planetas grid
    if (this.planetGrid) {
      this.planetGrid.innerHTML = PLANETS_CONFIG.map(p=>`
        <div class="planet-chip" data-planet="${p.id}">
          <span>${p.emoji}</span>
          ${p.name}
        </div>
      `).join('');
      this.planetGrid.querySelectorAll('.planet-chip').forEach(el=>{
        el.addEventListener('click', ()=>{
          const id = el.dataset.planet;
          const planet = PLANETS_CONFIG.find(pp=>pp.id===id);
          this.showPlanetInfo(planet);
        });
      });
    }

    // Botones menú
    document.getElementById('btn-play')?.addEventListener('click', ()=> this.game.startGame());
    document.getElementById('btn-continue')?.addEventListener('click', ()=> this.game.resumeGame());
    document.getElementById('btn-planets')?.addEventListener('click', ()=> this.showSection('planets'));
    document.getElementById('btn-civilization')?.addEventListener('click', ()=> this.showSection('civilization'));
    document.getElementById('btn-settings')?.addEventListener('click', ()=> this.showSection('settings'));
    document.getElementById('btn-exit')?.addEventListener('click', ()=> {
      if (this.game.isPlaying) this.game.pauseGame();
      else window.close();
    });

    // Botón construir civilización
    document.getElementById('btn-build')?.addEventListener('click', ()=>{
      const sel = document.getElementById('build-planet-select');
      if (sel) {
        const id = sel.value;
        const result = this.game.civilization.build(id, this.game.scene);
        if (result.can) {
          this.game.hud.notify(`¡Civilización construida en ${id}! Bonus: ${result.bonus}`, 'success');
          this.updateMaterials();
        } else {
          this.game.hud.notify(`Faltan materiales: ${result.missing} (${result.have}/${result.need})`, 'danger');
        }
      }
    });

    // Build select
    const buildSelect = document.getElementById('build-planet-select');
    if (buildSelect) {
      buildSelect.innerHTML = PLANETS_CONFIG.map(p=> `<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');
    }
  }

  show() {
    this.container?.classList.remove('hidden');
  }

  hide() {
    this.container?.classList.add('hidden');
  }

  showSection(section) {
    // Simple: scroll o highlight
    const el = document.getElementById(`section-${section}`);
    if (el) el.scrollIntoView({ behavior:'smooth' });
    this.game.hud.notify(`Sección ${section} - Usa el mapa estelar para navegar`, 'info');
  }

  showPlanetInfo(planet) {
    if (!planet) return;
    const info = `
${planet.emoji} ${planet.name}
Tipo basura: ${planet.trashType}
Civilización: ${planet.civilization.name}
${planet.civilization.description}
Requiere: ${Object.entries(planet.civilization.requiredMaterials).map(([k,v])=> `${k}:${v}`).join(', ')}
Bonus: ${planet.civilization.bonus}
Temp: ${planet.environment.temp}°C | Gravedad: ${planet.environment.gravity}g
Peligro: ${planet.environment.hazard}
    `.trim();
    alert(info); // Reemplazar por modal holográfico si se desea
  }

  updateMaterials() {
    if (!this.materialsList || !this.game.civilization) return;
    const list = this.game.civilization.getInventoryList();
    this.materialsList.innerHTML = list.map(m=>`
      <div class="material-row">
        <span>${m.icon} ${m.name}</span>
        <span style="color:${m.color}">${m.amount}</span>
      </div>
    `).join('') || '<div style="opacity:0.5">Recolecta basura y refina</div>';

    // Actualizar progreso
    const prog = this.game.civilization.getProgress();
    const progEl = document.getElementById('civilization-progress');
    if (progEl) progEl.textContent = `${prog.colonized}/${prog.totalPlanets} planetas (${prog.percent}%) - ${prog.totalBuilt} estructuras`;
  }

  setContinueVisible(visible) {
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = visible ? 'block' : 'none';
  }
}
