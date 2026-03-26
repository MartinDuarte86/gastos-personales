window.AssetTransactionLedger = class {
  static async open(activoId, state) {
    try {
      // Usamos el API global definido en app.js
      const transacciones = await window.api('/api/inv/transacciones');
      const filteredTx = transacciones.filter(t => String(t.id_activo) === String(activoId));
      
      const activoInfo = state.posiciones.find(p => String(p.id_activo) === String(activoId)) || 
                         state.activos.find(a => String(a.id_activo) === String(activoId));
                         
      const modal = document.getElementById('invLedgerModal');
      const titleEl = document.getElementById('ledgerTitle');
      const tbody = document.getElementById('ledgerTableBody');
      const qtyEl = document.getElementById('ledgerTotalQty');
      const invEl = document.getElementById('ledgerTotalInv');
      const valEl = document.getElementById('ledgerTotalVal');
      
      if (!modal) return;

      if (titleEl && activoInfo) {
        titleEl.textContent = `Libro Mayor: ${activoInfo.ticker}`;
      }
      
      if (tbody) tbody.innerHTML = '';
      
      const getConverted = (amount, monedaOrigen) => {
        if (state.moneda === monedaOrigen) return amount;
        if (!state.dolarMep) return amount;
        if (state.moneda === 'USD' && monedaOrigen === 'ARS') return amount / state.dolarMep;
        if (state.moneda === 'ARS' && monedaOrigen === 'USD') return amount * state.dolarMep;
        return amount;
      };

      const formatCurrency = (val) => {
        return (state.moneda === 'USD' ? 'u$s ' : '$ ') + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // Invertimos las transacciones para iterar cronológicamente (vienen DESC desde el backend)
      const chronological = [...filteredTx].reverse();
      
      let runningQty = 0;
      let totalInv = 0;

      chronological.forEach(tx => {
        const tr = document.createElement('tr');
        const isIngreso = tx.tipo_movimiento === 'INGRESO';
        const subtotal = tx.cantidad * tx.precio_operacion;
        
        if (isIngreso) {
          runningQty += tx.cantidad;
          totalInv += getConverted(subtotal, tx.moneda);
        } else {
          runningQty -= tx.cantidad;
          totalInv -= getConverted(subtotal, tx.moneda);
        }
        
        // Fecha asumiendo YYYY-MM-DD
        const fechaStr = tx.fecha_operacion ? tx.fecha_operacion.slice(0, 10) : '';
        
        tr.innerHTML = `
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${fechaStr}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);" class="${isIngreso ? 'pnl-positive' : 'pnl-negative'}">${isIngreso ? 'Compra' : 'Venta'}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${tx.cantidad.toLocaleString('en-US', {maximumFractionDigits:6})}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${tx.moneda} ${tx.precio_operacion.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${tx.moneda} ${subtotal.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        `;
        // Hacemos prepend para que al final se muestren de más nueva a más vieja visualmente
        if (tbody) tbody.prepend(tr);
      });
      
      if (qtyEl) qtyEl.textContent = runningQty.toLocaleString('en-US', {maximumFractionDigits:6});
      if (invEl) invEl.textContent = formatCurrency(totalInv);
      
      if (activoInfo && activoInfo.precio_mercado) {
        const currentVal = runningQty * activoInfo.precio_mercado;
        if (valEl) valEl.textContent = formatCurrency(getConverted(currentVal, activoInfo.moneda_operacion || 'ARS'));
      } else {
        if (valEl) valEl.textContent = formatCurrency(0);
      }
      
      modal.showModal();
      
      const closeBtn = document.getElementById('closeLedgerBtn');
      if (closeBtn) {
        closeBtn.onclick = () => modal.close();
      }
    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') showToast('Error cargando historial', true);
    }
  }
}
