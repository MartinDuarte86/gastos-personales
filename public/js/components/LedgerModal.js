window.LedgerModal = class {
  constructor(modalId) {
    this.modal = document.getElementById(modalId);
    this.titleEl = document.getElementById('ledgerTitle');
    this.tbody = document.getElementById('ledgerTableBody');
    this.qtyEl = document.getElementById('ledgerTotalQty');
    this.invEl = document.getElementById('ledgerTotalInv');
    this.valEl = document.getElementById('ledgerTotalVal');
    
    const closeBtn = document.getElementById('closeLedgerBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  open(activoId, transacciones, invState) {
    if (!this.modal) return;
    
    const filteredTx = transacciones.filter(t => String(t.id_activo) === String(activoId));
    const activoInfo = invState.posiciones.find(p => String(p.id_activo) === String(activoId)) || 
                       invState.activos.find(a => String(a.id_activo) === String(activoId));
                       
    if (this.titleEl && activoInfo) {
      this.titleEl.textContent = `Historial de Operaciones: ${activoInfo.ticker}`;
    }
    
    this.tbody.innerHTML = '';
    let totalQty = 0;
    let totalInv = 0;
    
    const getConverted = (amount, monedaOrigen) => {
      if (invState.moneda === monedaOrigen) return amount;
      if (!invState.dolarMep) return amount;
      if (invState.moneda === 'USD' && monedaOrigen === 'ARS') return amount / invState.dolarMep;
      if (invState.moneda === 'ARS' && monedaOrigen === 'USD') return amount * invState.dolarMep;
      return amount;
    };

    const formatCurrency = (val) => {
      return (invState.moneda === 'USD' ? 'u$s ' : '$ ') + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatFecha = (value) => {
      const raw = String(value || '').trim();
      const normalized = raw ? raw.slice(0, 16) : '';
      if (!normalized) return 'Sin fecha';
      const datePart = normalized.slice(0, 10);
      const timePart = normalized.slice(11, 16);
      const [year, month, day] = datePart.split('-');
      if (!year || !month || !day) return normalized;
      return timePart ? `${day}/${month}/${year} ${timePart}` : `${day}/${month}/${year}`;
    };
    
    filteredTx.forEach(tx => {
      const tr = document.createElement('tr');
      const isIngreso = tx.tipo_movimiento === 'INGRESO';
      const subtotal = tx.cantidad * tx.precio_operacion;
      
      if (isIngreso) {
        totalQty += tx.cantidad;
        totalInv += getConverted(subtotal, tx.moneda);
      } else {
        totalQty -= tx.cantidad;
        totalInv -= getConverted(subtotal, tx.moneda);
      }
      
      tr.innerHTML = `
        <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${formatFecha(tx.fecha_operacion)}</td>
        <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);" class="${isIngreso ? 'pnl-positive' : 'pnl-negative'}">${isIngreso ? 'Compra' : 'Venta'}</td>
        <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${tx.cantidad.toLocaleString('en-US', {maximumFractionDigits:6})}</td>
        <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${tx.moneda} ${tx.precio_operacion.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${tx.moneda} ${subtotal.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
      `;
      this.tbody.appendChild(tr);
    });
    
    this.qtyEl.textContent = totalQty.toLocaleString('en-US', {maximumFractionDigits:6});
    this.invEl.textContent = formatCurrency(totalInv);
    
    if (activoInfo && activoInfo.precio_mercado) {
      const currentVal = totalQty * activoInfo.precio_mercado;
      this.valEl.textContent = formatCurrency(getConverted(currentVal, activoInfo.moneda_operacion || 'ARS'));
    } else {
      this.valEl.textContent = formatCurrency(0);
    }
    
    this.modal.showModal();
  }

  close() {
    if (this.modal) this.modal.close();
  }
};
