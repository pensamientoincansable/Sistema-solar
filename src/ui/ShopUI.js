import { SHOP_ITEMS, getItemState, buyItem, WEAPONS } from '../config/ShopConfig.js';
import { vibrate } from '../utils/device.js';
import { settings } from '../systems/Settings.js';

/**
 * ShopUI - Panel de la tienda del Taxi-Mercader (pausa el juego mientras está abierta).
 */
export class ShopUI {
  constructor() {
    this.panel = document.getElementById('shop-panel');
    this.list = document.getElementById('shop-list');
    this.creditsEl = document.getElementById('shop-credits');
    this.statusEl = document.getElementById('shop-status');
    this.tabs = Array.from(document.querySelectorAll('.shop-tab'));
    this.tab = 'weapons';
    this.walle = null;
    this.isOpen = false;
    this.onClose = null;
    this.onPurchase = null;
    this._statusTimer = null;

    if (!this.panel) return;
    const closeBtn = document.getElementById('shop-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    this.tabs.forEach((t) => t.addEventListener('click', () => {
      this.tab = t.dataset.tab;
      this.render();
    }));
    this.list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-buy]');
      if (!btn) return;
      this._buy(btn.dataset.buy);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyT') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      }
    }, true);
  }

  open(walle) {
    if (!this.panel) return;
    this.walle = walle;
    this.isOpen = true;
    this.panel.classList.add('visible');
    this.panel.setAttribute('aria-hidden', 'false');
    this._setStatus('¡Bienvenido a bordo! Armas y mejoras para WALL·E.', 'info');
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.remove('visible');
    this.panel.setAttribute('aria-hidden', 'true');
    if (this.onClose) this.onClose();
  }

  _buy(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item || !this.walle) return;
    const res = buyItem(item, this.walle);
    if (res.ok) {
      if (settings.get('vibration')) vibrate([15, 40, 15]);
      this._setStatus('✔ ' + res.message, 'ok');
      if (this.onPurchase) this.onPurchase(item, res);
    } else {
      this._setStatus('✖ ' + res.message, 'error');
    }
    this.render();
  }

  _setStatus(text, kind) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = 'shop-status ' + (kind || '');
  }

  render() {
    if (!this.panel || !this.walle) return;
    const w = this.walle;
    this.creditsEl.textContent = `${w.credits} CR`;
    this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === this.tab));
    const items = SHOP_ITEMS.filter(i => i.category === this.tab);
    const html = items.map((item) => {
      const st = getItemState(item, w);
      let pips = '';
      if (item.upgrade) {
        pips = '<span class="shop-pips">' + Array.from({ length: st.maxLevel }, (_, k) => `<i class="${k < st.level ? 'on' : ''}"></i>`).join('') + '</span>';
      }
      let extra = '';
      if (item.id === 'plasma_ammo') extra = ` · tienes ${w.ammo.plasma}`;
      if (item.id === 'missile_ammo' && w.weapons.includes('missile')) extra = ` · tienes ${w.ammo.missile}`;
      if (item.unlock && WEAPONS[item.unlock]) extra = ` · tecla ${WEAPONS[item.unlock].key}`;
      const label = st.maxed ? (item.unlock ? 'EQUIPADO' : 'MÁXIMO') : `${st.price} CR`;
      const disabled = !st.canPurchase;
      return `
        <div class="shop-item ${st.maxed ? 'maxed' : ''} ${disabled && !st.maxed ? 'unaffordable' : ''}">
          <div class="shop-icon">${item.icon}</div>
          <div class="shop-info">
            <div class="shop-name">${item.name} ${pips}</div>
            <div class="shop-desc">${item.desc}<span class="shop-extra">${extra}</span></div>
            ${st.reason && !st.maxed ? `<div class="shop-reason">${st.reason}</div>` : ''}
          </div>
          <button class="shop-buy" data-buy="${item.id}" ${disabled ? 'disabled' : ''} aria-label="Comprar ${item.name}">${label}</button>
        </div>`;
    }).join('');
    this.list.innerHTML = html;
  }
}
