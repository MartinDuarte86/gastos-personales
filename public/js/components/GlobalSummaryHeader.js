window.GlobalSummaryHeader = class {
  constructor(state, onCurrencyChange) {
    this.state = state; // Expects { moneda, dolarMep, posiciones }
    this.onCurrencyChange = onCurrencyChange;
    this.init();
  }

  init() {
    this.mepLabel = document.getElementById('mepValueLabel');
    this.totalInvertidoEl = document.getElementById('invTotalInvertido');
    this.totalRevalorizadoEl = document.getElementById('invTotalRevalorizado');
    this.totalPnlEl = document.getElementById('invTotalPnl');
    this.currencyToggleBtn = document.getElementById('currencyToggleBtn');

    if (this.currencyToggleBtn) {
      // Sync initial state
      this.currencyToggleBtn.checked = (this.state.moneda === 'USD');
      
      this.currencyToggleBtn.addEventListener('change', (e) => {
        this.state.moneda = e.target.checked ? 'USD' : 'ARS';
        this.render();
        if (this.onCurrencyChange) this.onCurrencyChange(this.state.moneda);
      });
    }
  }

  icon(key, fallback = '') {
    return typeof window.resolveAppIcon === 'function'
      ? window.resolveAppIcon(key, fallback)
      : fallback;
  }

  update(newState) {
    this.state = { ...this.state, ...newState };
    if (this.currencyToggleBtn) {
      this.currencyToggleBtn.checked = (this.state.moneda === 'USD');
    }
    this.render();
  }

  render() {
    if (this.mepLabel) this.mepLabel.textContent = (this.state.dolarMep || 0).toFixed(2);
    
    // Check for freshness alert
    const hasStalePrices = this.state.posiciones && this.state.posiciones.some(p => p.alerta_frescura);
    this.renderAlert(hasStalePrices);

    // Calculate global totals, UNFILTERED by sector
    const { totalInvertido, totalActual } = this.calculateTotals();

    const formatCurrency = (val) => {
      // Use standard locale formatting
      return (this.state.moneda === 'USD' ? 'u$s ' : '$ ') + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if (this.totalInvertidoEl) this.totalInvertidoEl.textContent = formatCurrency(totalInvertido);
    if (this.totalRevalorizadoEl) this.totalRevalorizadoEl.textContent = formatCurrency(totalActual);
    
    if (this.totalPnlEl) {
      const totalPnl = totalActual - totalInvertido;
      const totalPct = totalInvertido > 0 ? (totalPnl / totalInvertido) * 100 : 0;
      this.totalPnlEl.textContent = `${totalPnl > 0 ? '+' : ''}${formatCurrency(totalPnl)} (${totalPct.toFixed(2)}%)`;
      this.totalPnlEl.className = totalPnl > 0 ? 'pnl-positive' : (totalPnl < 0 ? 'pnl-negative' : 'pnl-neutral');
    }
  }

  calculateTotals() {
    let totalInvertido = 0;
    let totalActual = 0;
    
    const getConverted = (amount, monedaOrigen) => {
      if (this.state.moneda === monedaOrigen) return amount;
      if (!this.state.dolarMep) return amount;
      if (this.state.moneda === 'USD' && monedaOrigen === 'ARS') return amount / this.state.dolarMep;
      if (this.state.moneda === 'ARS' && monedaOrigen === 'USD') return amount * this.state.dolarMep;
      return amount;
    };

    if (this.state.posiciones) {
      this.state.posiciones.forEach(p => {
        const invOrig = p.costo_historico;
        const actOrig = p.cantidad_total * p.precio_mercado;
        totalInvertido += getConverted(invOrig, p.moneda_operacion);
        totalActual += getConverted(actOrig, p.moneda_operacion);
      });
    }

    return { totalInvertido, totalActual };
  }

  renderAlert(hasStalePrices) {
    let alertBanner = document.getElementById('invStaleAlert');
    if (hasStalePrices) {
      if (!alertBanner) {
        alertBanner = document.createElement('div');
        alertBanner.id = 'invStaleAlert';
        alertBanner.className = 'alert-banner';
        alertBanner.innerHTML = `${this.icon('warning', '&#x26A0;&#xFE0F;')} <strong>Actualizar precios pendientes:</strong> Algunos activos tienen precios desactualizados por más de 7 días.`;
        const header = document.querySelector('.inversiones-header');
        if(header) {
           header.insertAdjacentElement('afterend', alertBanner);
        }
      }
    } else {
      if (alertBanner) alertBanner.remove();
    }
  }
}
