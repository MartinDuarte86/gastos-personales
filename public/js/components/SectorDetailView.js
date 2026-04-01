window.SectorDetailView = class {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.state = {
      posiciones: [],
      sectorFilter: 'Todos',
      moneda: 'ARS',
      dolarMep: 0,
      globalActual: 0
    };
    this.onActionClick = options.onActionClick || (() => {});
  }

  update(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  formatCurrency(val) {
    return (this.state.moneda === 'USD' ? 'u$s ' : '$ ') + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  icon(key, fallback = '') {
    return typeof window.resolveAppIcon === 'function'
      ? window.resolveAppIcon(key, fallback)
      : fallback;
  }

  getConverted(amount, monedaOrigen) {
    if (this.state.moneda === monedaOrigen) return amount;
    if (!this.state.dolarMep) return amount;
    if (this.state.moneda === 'USD' && monedaOrigen === 'ARS') return amount / this.state.dolarMep;
    if (this.state.moneda === 'ARS' && monedaOrigen === 'USD') return amount * this.state.dolarMep;
    return amount;
  }

  render() {
    if (!this.container) return;

    let filtered = this.state.posiciones;
    const isSectorView = this.state.sectorFilter !== 'Todos';

    if (isSectorView) {
      filtered = filtered.filter((p) => p.sector === this.state.sectorFilter);
    }

    let sectorInvertido = 0;
    let sectorActual = 0;
    let itemsHtml = '';

    if (filtered.length === 0) {
      itemsHtml = '<p class="task-meta inv-empty-state">No hay posiciones agregadas en este filtro.</p>';
    }

    filtered.forEach((p) => {
      const invOrig = p.costo_historico;
      const actOrig = p.cantidad_total * p.precio_mercado;
      const invConv = this.getConverted(invOrig, p.moneda_operacion);
      const actConv = this.getConverted(actOrig, p.moneda_operacion);

      sectorInvertido += invConv;
      sectorActual += actConv;

      const pnl = actConv - invConv;
      const pnlPct = invConv > 0 ? (pnl / invConv) * 100 : 0;
      const pnlClass = pnl > 0 ? 'pnl-positive' : (pnl < 0 ? 'pnl-negative' : 'pnl-neutral');
      const provider = p.api_provider || 'manual';
      const isAuto = provider !== 'manual';
      const badgeHtml = isAuto
        ? `<span class="badge badge-auto" title="Actualizado via API (Yahoo/CoinGecko)">${this.icon('greenCircle', '&#x1F7E2;')} Auto</span>`
        : `<span class="badge badge-manual" title="Actualizacion manual">${this.icon('redCircle', '&#x1F534;')} Manual</span>`;

      itemsHtml += `
        <div class="inv-item">
          <div class="inv-info">
            <h4 class="inv-ticker">
              ${this.escapeHtml(p.ticker)}
              ${p.alerta_frescura ? `<span class="inv-warning-icon" title="Precio desactualizado (>7 dias)">${this.icon('warning', '&#x26A0;&#xFE0F;')}</span>` : ''}
              ${badgeHtml}
            </h4>
            <p class="inv-meta">${this.escapeHtml(p.sector || 'Sin sector')} | ${this.escapeHtml(p.clase)}</p>
            <p class="inv-meta">Cant: ${p.cantidad_total.toLocaleString('en-US', { maximumFractionDigits: 6 })} | P.Mercado: ${p.precio_mercado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <div class="inv-action-row">
              <button class="view-btn ledger-btn ledger-btn-compact" data-id="${p.id_activo}">${this.icon('gear', '&#x2699;&#xFE0F;')} Ver historial</button>
            </div>
          </div>
          <div class="inv-amounts">
            <p class="inv-amount-main" title="Tenencia real (cantidad x precio mercado)">${this.formatCurrency(actConv)}</p>
            <p class="inv-amount-sub ${pnlClass}">${pnl > 0 ? '+' : ''}${this.formatCurrency(pnl)} (${pnlPct.toFixed(2)}%)</p>
          </div>
        </div>
      `;
    });

    let statsHtml = '';
    if (isSectorView) {
      const pctPortfolio = this.state.globalActual > 0 ? (sectorActual / this.state.globalActual) * 100 : 0;
      statsHtml = `
        <div class="sector-stats-panel">
          <div class="sector-stat">
            <span class="label">Invertido sector</span>
            <span class="value">${this.formatCurrency(sectorInvertido)}</span>
          </div>
          <div class="sector-stat">
            <span class="label">Actual sector</span>
            <span class="value">${this.formatCurrency(sectorActual)}</span>
          </div>
          <div class="sector-stat">
            <span class="label">Peso en cartera</span>
            <span class="value">${pctPortfolio.toFixed(2)}%</span>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = statsHtml + itemsHtml;

    const buttons = this.container.querySelectorAll('.ledger-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        this.onActionClick(id);
      });
    });
  }
};
