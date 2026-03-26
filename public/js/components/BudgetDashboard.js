/**
 * BudgetDashboard.js
 * Motor de Lógica Financiera — Módulo MOVIMIENTOS
 * Tipos: EGRESO (resta del presupuesto) | INGRESO (amplía disponible) | INVERSIÓN (flujo separado)
 */
window.BudgetDashboard = class {
  constructor(apiToken) {
    this.token = apiToken;
    this.currentMes = new Date().getMonth() + 1;
    this.currentAnio = new Date().getFullYear();
    this.cuentas = [];
    this.categorias = {};
    this.dashboardData = null;
    this.anualMovCache = new Map();
    this.vistaAnual = false;
    this.containerId = 'budgetDashboardContainer';
    this.MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  }

  // Helpers

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async api(method, url, body) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  formatMoney(n) {
    return '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  icon(key, fallback = '') {
    return typeof window.resolveAppIcon === 'function'
      ? window.resolveAppIcon(key, fallback)
      : fallback;
  }

  isEditableDate(fechaStr) {
    const fecha = new Date(fechaStr + 'T00:00:00');
    const now = new Date();
    const min = new Date(now); min.setFullYear(min.getFullYear() - 1);
    const max = new Date(now); max.setFullYear(max.getFullYear() + 1);
    return fecha >= min && fecha <= max;
  }

  showToast(msg, type = 'success') {
    // type: 'success' | 'error' | 'warning'
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
  }

  tipoBadge(tipo) {
    const map = {
      EGRESO:    { label: 'EGRESO',    cls: 'tipo-egreso' },
      INGRESO:   { label: 'INGRESO',   cls: 'tipo-ingreso' },
      'INVERSIÓN': { label: 'INVERSIÓN', cls: 'tipo-inversion' },
    };
    const t = map[tipo] || map.EGRESO;
    return `<span class="tipo-badge ${t.cls}">${t.label}</span>`;
  }

  // Data Fetching

  async loadCuentas() {
    try {
      const data = await this.api('GET', '/api/presupuesto/cuentas');
      this.cuentas = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('[BudgetDashboard.loadCuentas]', e);
      this.cuentas = [];
      throw e;
    }
  }

  async loadCategoriasForCuenta(cuentaId) {
    const data = await this.api('GET', `/api/presupuesto/cuentas/${cuentaId}/categorias`);
    this.categorias[String(cuentaId)] = Array.isArray(data) ? data : [];
  }

  async loadDashboard() {
    this.dashboardData = await this.api('GET', `/api/presupuesto/dashboard?mes=${this.currentMes}&anio=${this.currentAnio}`);
    let needsReFetch = false;
    if (this.dashboardData && this.dashboardData.cuentas) {
      for (const item of this.dashboardData.cuentas) {
        if (!item.presupuesto) {
          const created = await this.promptClonar(item.cuenta);
          if (created) needsReFetch = true;
        }
      }
      if (needsReFetch) {
        this.dashboardData = await this.api('GET', `/api/presupuesto/dashboard?mes=${this.currentMes}&anio=${this.currentAnio}`);
      }
    }
  }

  // Budget Cloning

  async promptClonar(cuenta) {
    if (cuenta.presupuesto_mensual_base && cuenta.presupuesto_mensual_base > 0) {
      try {
        await this.api('POST', '/api/presupuesto/mensual/clonar', {
          cuenta_id: cuenta.id, mes_destino: this.currentMes, anio_destino: this.currentAnio
        });
      } catch (e) {
        // Fallback to creating a new empty budget
        try {
          await this.api('POST', '/api/presupuesto/mensual', {
            cuenta_id: cuenta.id, mes: this.currentMes,
            anio: this.currentAnio, monto_total: cuenta.presupuesto_mensual_base, estado: 'vacio'
          });
        } catch (e2) {
          console.error('Failed to create fallback budget', e2);
        }
      }
      return true;
    }

    const ignoreKey = `ignore_budget_${cuenta.id}_${this.currentMes}_${this.currentAnio}`;
    if (localStorage.getItem(ignoreKey)) return false;

    return new Promise((resolve) => {
      const mesNombre = this.MESES[this.currentMes - 1];
      const html = `
        <div id="prompt-clonar-overlay" class="modal-overlay" style="z-index: 100000; display:flex; align-items:center; justify-content:center;">
          <div class="modal-box" style="padding: 24px; border-radius: 8px; background: var(--bg-card); max-width: 400px; width: 90%; text-align: center;">
            <h3 style="margin-bottom:12px;">[${cuenta.nombre}]</h3>
            <p style="margin: 16px 0; line-height:1.4;">No hay presupuesto configurado para ${mesNombre} ${this.currentAnio}.<br>¿Deseas configurar uno ahora?</p>
            <label style="display:inline-flex; align-items:center; gap:8px; margin-top:16px; cursor:pointer;">
              <input type="checkbox" id="chk-no-recordar">
              <span style="font-size:14px; color:var(--text-color);">No volver a recordar este mes</span>
            </label>
            <div class="modal-actions" style="margin-top:24px; justify-content:center;">
              <button id="btn-cancel-prompt" class="btn-secondary">Cancelar</button>
              <button id="btn-ok-prompt" class="btn-primary">Configurar</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      
      const overlay = document.getElementById('prompt-clonar-overlay');
      const chk = document.getElementById('chk-no-recordar');

      const handleClose = () => {
        if (chk.checked) localStorage.setItem(ignoreKey, 'true');
        overlay.remove();
        resolve(false);
      };

      document.getElementById('btn-cancel-prompt').onclick = handleClose;
      document.getElementById('btn-ok-prompt').onclick = () => {
        if (chk.checked) localStorage.setItem(ignoreKey, 'true');
        overlay.remove();
        this.showPresupuestoMesModal(cuenta.id);
        resolve(false);
      };
    });
  }

  // Render: Empty State

  renderEmptyState() {
    const el = document.getElementById('budget-cuentas-list');
    const summary = document.getElementById('budget-global-summary');
    if (summary) summary.innerHTML = '';
    if (!el) return;
    el.innerHTML = `
      <div class="budget-empty-state">
        <div class="budget-empty-icon">${this.icon('moneyBag', '&#x1F4B0;')}</div>
        <h3>¡Bienvenido al módulo de MOVIMIENTOS!</h3>
        <p>Todavía no tenés ninguna cuenta configurada. Creá tu primera cuenta para comenzar a gestionar tu presupuesto.</p>
        <button class="btn-primary" id="btn-crear-primera-cuenta" style="margin-top:12px; max-width:220px;">
          + Crear primera cuenta
        </button>
      </div>`;
    document.getElementById('btn-crear-primera-cuenta')?.addEventListener('click', () => this.showCuentaModal());
  }

  // Render: Global Summary

  renderGlobalSummary() {
    const el = document.getElementById('budget-global-summary');
    if (!el || !this.dashboardData) return;

    const { total_global_disponible, total_global_gastado, cuentas } = this.dashboardData;
    const totalPresupuesto = cuentas.reduce((s, c) => s + (c.presupuesto_dinamico || c.monto_total || 0), 0);
    const totalCuentas = this.cuentas.length;

    el.innerHTML = `
      <div class="budget-global-card">
        <div class="budget-global-header">
          <h2>${this.icon('chart', '&#x1F4CA;')} Resumen Global — ${this.MESES[this.currentMes - 1]} ${this.currentAnio}</h2>
          <div class="budget-header-actions">
            <div class="budget-month-nav">
              <button id="btn-prev-mes" class="btn-month">${this.icon('arrowLeft', '&#x25C0;')}</button>
              <span>${this.MESES[this.currentMes - 1]} ${this.currentAnio}</span>
              <button id="btn-next-mes" class="btn-month">${this.icon('arrowRight', '&#x25B6;')}</button>
            </div>
            <button id="btn-vista-anual" class="btn-manage ${this.vistaAnual ? 'active' : ''}">
              ${this.vistaAnual ? this.icon('arrowLeft', '&#x25C0;') + ' Vista Mensual' : this.icon('calendar', '&#x1F4C5;') + ' Vista Anual'}
            </button>
            <button id="btn-gestionar-cuentas" class="btn-manage">${this.icon('gear', '&#x2699;&#xFE0F;')} Gestionar Cuentas</button>
          </div>
        </div>
        <div class="budget-global-stats">
          <div class="stat-card">
            <span class="stat-label">Cuentas activas</span>
            <span class="stat-value">${totalCuentas}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Presupuesto Dinámico</span>
            <span class="stat-value">${this.formatMoney(totalPresupuesto)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Total Egresos</span>
            <span class="stat-value gastado">${this.formatMoney(total_global_gastado)}</span>
          </div>
          <div class="stat-card ${total_global_disponible < 0 ? 'negative' : 'positive'}">
            <span class="stat-label">Disponible Operativo</span>
            <span class="stat-value">${this.formatMoney(total_global_disponible)}</span>
            ${total_global_disponible < 0 ? `<span class="comprometido-badge">${this.icon('warning', '&#x26A0;&#xFE0F;')} Presupuesto comprometido por cuotas previas</span>` : ''}
          </div>
        </div>
      </div>`;

    document.getElementById('btn-prev-mes')?.addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('btn-next-mes')?.addEventListener('click', () => this.changeMonth(1));
    document.getElementById('btn-gestionar-cuentas')?.addEventListener('click', () => this.showGestionCuentasModal());
    document.getElementById('btn-vista-anual')?.addEventListener('click', () => this.toggleVistaAnual());
  }

  // Vista Anual

  async toggleVistaAnual() {
    this.vistaAnual = !this.vistaAnual;
    if (this.vistaAnual) {
      await this.renderVistaAnual();
    } else {
      this.renderGlobalSummary();
      this.renderCuentas();
    }
    // Update the button label
    const btn = document.getElementById('btn-vista-anual');
    if (btn) btn.innerHTML = this.vistaAnual
      ? this.icon('arrowLeft', '&#x25C0;') + ' Vista Mensual'
      : this.icon('calendar', '&#x1F4C5;') + ' Vista Anual';
  }

  async renderVistaAnual() {
    const el = document.getElementById('budget-cuentas-list');
    if (!el) return;

    // Re-render summary header updating button state
    this.renderGlobalSummary();

    el.innerHTML = `<div class="anual-loading">${this.icon('hourglass', '&#x23F3;')} Cargando proyección anual...</div>`;

    try {
      const data = await this.api('GET', `/api/presupuesto/recurrentes-anuales?anio=${this.currentAnio}`);
      const hoyMes = new Date().getMonth() + 1;
      this.anualMovCache = new Map();
      (data.meses || []).forEach(m => {
        (m.movimientos || []).forEach(mov => this.anualMovCache.set(String(mov.id), mov));
      });

      el.innerHTML = `
        <div class="anual-card">
          <div class="anual-header">
            <h3 class="anual-title">Proyeccion Anual ${data.anio} - Movimientos Recurrentes</h3>
            <p class="anual-subtitle">Tabla de meses con total recurrente y acciones por transaccion.</p>
          </div>
          <div class="anual-table-wrap">
            <table class="anual-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Total</th>
                  <th>Recurrentes</th>
                </tr>
              </thead>
              <tbody>
                ${(data.meses || []).map(m => `
                  <tr class="${m.mes === hoyMes ? 'anual-row-current' : ''}">
                    <td>
                      <div class="anual-mes-cell">
                        <span class="anual-mes-nombre">${m.nombre}</span>
                        ${m.mes === hoyMes ? '<span class="anual-mes-badge">Hoy</span>' : ''}
                      </div>
                    </td>
                    <td>
                      <span class="anual-mes-total ${m.total_recurrente === 0 ? 'muted' : ''}">${this.formatMoney(m.total_recurrente)}</span>
                    </td>
                    <td>
                      ${m.movimientos.length === 0
                        ? '<span class="anual-no-movs">Sin recurrentes</span>'
                        : `<details class="anual-detail">
                            <summary class="anual-detail-summary">Ver transacciones recurrentes (${m.movimientos.length})</summary>
                            <div class="anual-detail-content">
                              <table class="gastos-table anual-movs-table">
                                <thead>
                                  <tr>
                                    <th>Fecha</th>
                                    <th>Descripcion</th>
                                    <th>Categoria</th>
                                    <th>Tipo</th>
                                    <th>Monto</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${m.movimientos.map(mov => `
                                    <tr class="mov-row-${(mov.tipo_categoria || 'EGRESO').toLowerCase().replace('ó', 'o')}">
                                      <td>${this.escapeHtml(mov.fecha || '-')}</td>
                                      <td>${this.escapeHtml(mov.descripcion || '-')}</td>
                                      <td>${this.escapeHtml(mov.categoria_nombre || '-')}</td>
                                      <td>${this.escapeHtml(mov.tipo_categoria || 'EGRESO')}</td>
                                      <td class="anual-mov-monto">${this.formatMoney(mov.monto)}</td>
                                      <td class="anual-mov-actions">
                                        <button class="btn-edit-gasto btn-edit-anual" data-id="${mov.id}" data-fecha="${this.escapeHtml(mov.fecha || '')}" title="Editar">Editar</button>
                                        <button class="btn-del-gasto btn-del-anual" data-id="${mov.id}" data-fecha="${this.escapeHtml(mov.fecha || '')}" title="Eliminar">Eliminar</button>
                                      </td>
                                    </tr>
                                  `).join('')}
                                </tbody>
                              </table>
                            </div>
                          </details>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      el.querySelectorAll('.btn-edit-anual').forEach(btn =>
        btn.addEventListener('click', async e => {
          const id = e.currentTarget?.dataset?.id;
          if (!id) return;
          await this.editGasto(id);
        })
      );

      el.querySelectorAll('.btn-del-anual').forEach(btn =>
        btn.addEventListener('click', async e => {
          const id = e.currentTarget?.dataset?.id;
          const fecha = e.currentTarget?.dataset?.fecha || '';
          if (!id) return;
          const detalle = await this.getGastoByIdAndFecha(id, fecha);
          await this.deleteGasto(id, !!detalle?.proyeccion_id);
        })
      );
    } catch (e) {
      el.innerHTML = `<div class="anual-error">${this.icon('error', '&#x274C;')} Error cargando vista anual: ${e.message}</div>`;
    }
  }

  async getGastoByIdAndFecha(gastoId, fechaHint = '') {
    const idStr = String(gastoId);
    const cached = this.anualMovCache.get(idStr);
    if (cached?.cuenta_id && cached?.categoria_id) return cached;

    let query = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(fechaHint))) {
      const [anio, mes] = String(fechaHint).split('-');
      query = `?mes=${Number(mes)}&anio=${Number(anio)}`;
    }
    const rows = await this.api('GET', `/api/presupuesto/gastos${query}`);
    return (Array.isArray(rows) ? rows : []).find(g => String(g.id) === idStr) || null;
  }

  // Render: Account List

  renderCuentas() {
    if (this.vistaAnual) return; // Don't overwrite annual view
    const el = document.getElementById('budget-cuentas-list');
    if (!el || !this.dashboardData) return;

    const { cuentas } = this.dashboardData;

    if (cuentas.length === 0) {
      this.renderEmptyState();
      return;
    }

    el.innerHTML = cuentas.map(item => {
      const presupuestoDinamico = item.presupuesto_dinamico || item.monto_total || 0;
      const totalIngresado = item.total_ingresado || 0;
      const totalInvertido = item.total_invertido || 0;

      return `
      <div class="cuenta-card" data-cuenta="${item.cuenta.id}">
        <div class="cuenta-header">
          <div class="cuenta-title-group">
            <h3>${this.escapeHtml(item.cuenta.nombre)}</h3>
            <div class="cuenta-budget-info">
              <span class="cuenta-base-badge">Base: ${this.formatMoney(item.monto_total)}/mes</span>
              ${totalIngresado > 0 ? `<span class="cuenta-ingreso-badge">+${this.formatMoney(totalIngresado)} ingresos</span>` : ''}
              ${totalInvertido > 0 ? `<span class="cuenta-inversion-badge">${this.icon('investment', '&#x1F4BC;')} ${this.formatMoney(totalInvertido)} a inversión</span>` : ''}
              <span class="cuenta-dinamico-badge">Dinámico: ${this.formatMoney(presupuestoDinamico)}</span>
            </div>
          </div>
          <div class="cuenta-header-right">
            <div class="cuenta-totals">
              <span class="gastado-label">${this.formatMoney(item.total_gastado)}</span>
              <span class="separator">/</span>
              <span class="presupuesto-label">${this.formatMoney(presupuestoDinamico)}</span>
            </div>
            <div class="cuenta-header-btns">
              <button class="btn-icon btn-edit-cuenta" data-id="${item.cuenta.id}" title="Editar cuenta">${this.icon('gear', '&#x2699;&#xFE0F;')}</button>
              <button class="btn-icon btn-categorias" data-id="${item.cuenta.id}" title="Gestionar categorías">${this.icon('tag', '&#x1F3F7;&#xFE0F;')}</button>
              <button class="btn-icon btn-presupuesto-mes" data-id="${item.cuenta.id}" title="Editar presupuesto del mes">${this.icon('calendar', '&#x1F4C5;')}</button>
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="progress-bar-track">
          <div class="progress-bar-fill ${item.presupuesto_comprometido ? 'negative' : ''}"
               style="width: ${Math.min(100, item.porcentaje_usado).toFixed(1)}%">
          </div>
        </div>
        <div class="progress-label">
          ${item.presupuesto_comprometido
            ? `${this.icon('warning', '&#x26A0;&#xFE0F;')} <strong>Presupuesto comprometido por cuotas previas</strong>`
            : `${item.porcentaje_usado.toFixed(1)}% usado — disponible: ${this.formatMoney(item.disponible)}`}
        </div>

        <!-- Categorías -->
        ${item.categorias.length > 0 ? `
        <div class="categorias-grid">
          ${item.categorias.map(cat => {
            const tipo = cat.tipo || 'EGRESO';
            // Desfasaje: solo aplica a EGRESO con límite definido
            let desfasajeHtml = '';
            if (tipo === 'EGRESO' && cat.monto_estatico > 0 && cat.gastado > cat.monto_estatico) {
              const pctDesfasaje = ((cat.gastado - cat.monto_estatico) / cat.monto_estatico * 100).toFixed(0);
              desfasajeHtml = `<span class="desfasaje-badge">+${pctDesfasaje}% sobre límite</span>`;
            }
            return `
            <div class="cat-chip ${cat.al_limite ? 'al-limite' : ''} cat-tipo-${tipo.toLowerCase().replace('ó','o')}" style="border-color: ${cat.color_hex}">
              <span class="cat-dot" style="background:${cat.color_hex}"></span>
              <span class="cat-nombre">${this.escapeHtml(cat.nombre)}</span>
              ${tipo === 'EGRESO' ? `<span class="cat-pct">${cat.porcentaje_asignacion}%</span>` : this.tipoBadge(tipo)}
              ${cat.al_limite ? `<span class="limite-badge">${this.icon('redCircle', '&#x1F534;')} Al límite</span>` : ''}
              ${desfasajeHtml}
              ${tipo === 'EGRESO'
                ? `<span class="cat-monto">${this.formatMoney(cat.gastado)} / ${this.formatMoney(cat.monto_estatico)}</span>`
                : `<span class="cat-monto">${this.formatMoney(cat.gastado)}</span>`}
            </div>`;
          }).join('')}
        </div>` : `
        <div class="no-cats-hint">
          <span>Sin categorías — <button class="btn-link btn-categorias" data-id="${item.cuenta.id}">Agregar categorías</button></span>
        </div>`}

        <!-- Movimientos (tabla con columnas INGRESO / EGRESO separadas) -->
        <details class="gastos-detail">
          <summary>Ver movimientos del mes (${item.gastos.length})</summary>
          ${item.gastos.length === 0
            ? '<p class="no-gastos-msg">No hay movimientos registrados este mes.</p>'
            : `<table class="gastos-table">
              <thead><tr>
                <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Método</th>
                <th class="col-ingreso">INGRESO (+)</th>
                <th class="col-egreso">EGRESO (-)</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${item.gastos.map(g => {
                  const tipoG = g.tipo_categoria || 'EGRESO';
                  const isIngreso = tipoG === 'INGRESO';
                  const isInversion = tipoG === 'INVERSIÓN';
                  return `
                  <tr class="mov-row-${tipoG.toLowerCase().replace('ó','o')}">
                    <td>${g.fecha}</td>
                    <td>${this.escapeHtml(g.descripcion || '-')}</td>
                    <td>
                      <span class="cat-dot-sm" style="background:${g.color_hex || '#888'}"></span>
                      ${g.categoria_nombre || '?'}
                      ${isInversion ? `<span class="inv-tag">${this.icon('investment', '&#x1F4BC;')}</span>` : ''}
                    </td>
                    <td>${g.metodo_pago}</td>
                    <td class="col-ingreso ${isIngreso ? 'monto-ingreso' : ''}">
                      ${isIngreso ? this.formatMoney(g.monto) + (g.es_recurrente ? ' ' + this.icon('repeat', '&#x1F501;') : '') : '?'}
                    </td>
                    <td class="col-egreso ${!isIngreso && !isInversion ? 'monto-egreso' : ''} ${isInversion ? 'monto-inversion' : ''}">
                      ${isIngreso ? '?' : this.formatMoney(g.monto) + (g.es_recurrente ? ' ' + this.icon('repeat', '&#x1F501;') : '') + (g.total_cuotas > 1 ? ` (${g.cuota_actual}/${g.total_cuotas})` : '')}
                    </td>
                    <td>
                      ${this.isEditableDate(g.fecha) ? `
                        <button class="btn-edit-gasto" data-id="${g.id}">${this.icon('pencil', '&#x270F;&#xFE0F;')}</button>
                        <button class="btn-del-gasto" data-id="${g.id}" data-tiene-proy="${!!g.proyeccion_id}">${this.icon('trash', '&#x1F5D1;&#xFE0F;')}</button>
                      ` : '<span title="Fuera del rango de edición">' + this.icon('lock', '&#x1F512;') + '</span>'}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
        </details>

        <!-- Acciones -->
        <div class="cuenta-actions">
          <button class="btn-nuevo-gasto" data-cuenta="${item.cuenta.id}">+ TRANSACCIÓN</button>
        </div>
      </div>`;
    }).join('');

    // Bind events
    el.querySelectorAll('.btn-nuevo-gasto').forEach(btn =>
      btn.addEventListener('click', e => this.showGastoModal(e.currentTarget.dataset.cuenta))
    );
    el.querySelectorAll('.btn-edit-gasto').forEach(btn =>
      btn.addEventListener('click', e => this.editGasto(e.target.dataset.id))
    );
    el.querySelectorAll('.btn-del-gasto').forEach(btn =>
      btn.addEventListener('click', e => this.deleteGasto(e.target.dataset.id, e.target.dataset.tieneProy === 'true'))
    );
    el.querySelectorAll('.btn-edit-cuenta').forEach(btn =>
      btn.addEventListener('click', e => { const c = this.cuentas.find(x => x.id === e.target.dataset.id); if (c) this.showCuentaModal(c); })
    );
    el.querySelectorAll('.btn-categorias').forEach(btn =>
      btn.addEventListener('click', e => this.showCategoriasModal(e.target.dataset.id))
    );
    el.querySelectorAll('.btn-presupuesto-mes').forEach(btn =>
      btn.addEventListener('click', e => this.showPresupuestoMesModal(e.target.dataset.id))
    );
  }

  // Month Navigation

  async changeMonth(delta) {
    this.currentMes += delta;
    if (this.currentMes > 12) { this.currentMes = 1; this.currentAnio++; }
    if (this.currentMes < 1)  { this.currentMes = 12; this.currentAnio--; }
    await this.refresh();
  }

  // Modal: Gestionar Cuentas

  showGestionCuentasModal() {
    const existing = document.getElementById('gestion-cuentas-overlay');
    if (existing) existing.remove();

    const html = `
      <div id="gestion-cuentas-overlay" class="modal-overlay">
        <div class="modal-box modal-wide">
          <div class="modal-title-row">
            <h3>${this.icon('gear', '&#x2699;&#xFE0F;')} Gestión de Cuentas</h3>
            <button id="btn-close-cuentas" class="btn-icon btn-close-modal">${this.icon('close', '&#x2716;')}</button>
          </div>
          <div id="cuentas-list-manage" class="manage-list"></div>
          <div class="modal-actions" style="border-top:1px solid var(--line); padding-top:16px; margin-top:8px;">
            <button id="btn-nueva-cuenta" class="btn-primary">+ Nueva Cuenta</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    this._renderCuentasManageList();

    document.getElementById('btn-close-cuentas').onclick = () =>
      document.getElementById('gestion-cuentas-overlay').remove();
    document.getElementById('btn-nueva-cuenta').onclick = () => {
      document.getElementById('gestion-cuentas-overlay').remove();
      this.showCuentaModal();
    };
  }

  _renderCuentasManageList() {
    const el = document.getElementById('cuentas-list-manage');
    if (!el) return;
    if (this.cuentas.length === 0) {
      el.innerHTML = '<p style="color:var(--muted); text-align:center; padding: 20px 0;">No hay cuentas creadas aún.</p>';
      return;
    }
    el.innerHTML = this.cuentas.map(c => `
      <div class="manage-item">
        <div class="manage-item-info">
          <strong>${c.nombre}</strong>
          <span>${this.formatMoney(c.presupuesto_mensual_base)}/mes</span>
        </div>
        <div class="manage-item-actions">
          <button class="btn-sm btn-edit" data-id="${c.id}">${this.icon('pencil', '&#x270F;&#xFE0F;')} Editar</button>
          <button class="btn-sm btn-cats" data-id="${c.id}">${this.icon('tag', '&#x1F3F7;&#xFE0F;')} Categorías</button>
          <button class="btn-sm btn-danger-sm" data-id="${c.id}">${this.icon('trash', '&#x1F5D1;&#xFE0F;')}</button>
        </div>
      </div>`).join('');

    el.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', e => {
      const c = this.cuentas.find(x => x.id === e.target.dataset.id);
      document.getElementById('gestion-cuentas-overlay')?.remove();
      if (c) this.showCuentaModal(c);
    }));
    el.querySelectorAll('.btn-cats').forEach(btn => btn.addEventListener('click', e => {
      document.getElementById('gestion-cuentas-overlay')?.remove();
      this.showCategoriasModal(e.target.dataset.id);
    }));
    el.querySelectorAll('.btn-danger-sm').forEach(btn => btn.addEventListener('click', async e => {
      const c = this.cuentas.find(x => x.id === e.target.dataset.id);
      if (!confirm(`¿Eliminar la cuenta "${c?.nombre}"? Se eliminarán todas sus categorías y gastos.`)) return;
      try {
        await this.api('DELETE', `/api/presupuesto/cuentas/${e.target.dataset.id}`);
        this.showToast('Cuenta eliminada');
        await this.loadCuentas();
        this._renderCuentasManageList();
        await this.refresh();
      } catch (err) {
        console.error('[deleteCuenta]', err);
        this.showToast(err.message || 'Error eliminando cuenta', 'error');
      }
    }));
  }

  // Modal: Crear / Editar Cuenta

  showCuentaModal(cuenta = null) {
    const isEdit = !!cuenta;
    const html = `
      <div id="cuenta-modal-overlay" class="modal-overlay">
        <div class="modal-box">
          <h3>${isEdit ? this.icon('pencil', '&#x270F;&#xFE0F;') + ' Editar Cuenta' : '+ Nueva Cuenta'}</h3>
          <form id="cuenta-form" autocomplete="off">
            <label>Nombre de la cuenta
              <input type="text" id="cf-nombre" value="${cuenta?.nombre || ''}" placeholder="Ej: Personal, MyAnanda, Familia" required>
            </label>
            <label>Presupuesto base mensual ($)
              <input type="number" id="cf-base" value="${cuenta?.presupuesto_mensual_base || ''}" min="0" step="100" placeholder="Ej: 500000" required>
            </label>
            <div class="modal-actions">
              <button type="button" id="btn-cancel-cuenta" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary">${isEdit ? 'Guardar cambios' : 'Crear cuenta'}</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('cuenta-modal-overlay');
    document.getElementById('btn-cancel-cuenta').onclick = () => overlay.remove();

    document.getElementById('cuenta-form').onsubmit = async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('cf-nombre').value.trim();
      const presupuesto_mensual_base = Number(document.getElementById('cf-base').value);
      if (!nombre) return;

      let result;
      if (isEdit) {
        result = await this.api('PATCH', `/api/presupuesto/cuentas/${cuenta.id}`, { nombre, presupuesto_mensual_base });
      } else {
        result = await this.api('POST', '/api/presupuesto/cuentas', { nombre, presupuesto_mensual_base });
      }

      if (result.error) { this.showToast(result.error, 'error'); return; }
      this.showToast(isEdit ? 'Cuenta actualizada' : 'Cuenta creada');
      overlay.remove();
      await this.loadCuentas();
      for (const c of this.cuentas) await this.loadCategoriasForCuenta(c.id);
      await this.refresh();
    };
  }

  // Modal: Gestionar Categorias

  async showCategoriasModal(cuentaId) {
    const cuentaKey = String(cuentaId);
    await this.loadCategoriasForCuenta(cuentaId);
    const cuenta = this.cuentas.find(c => String(c.id) === cuentaKey);
    const html = `
      <div id="categorias-modal-overlay" class="modal-overlay">
        <div class="modal-box modal-wide">
          <div class="modal-title-row">
            <h3>${this.icon('tag', '&#x1F3F7;&#xFE0F;')} Categorías — ${cuenta?.nombre || ''}</h3>
            <button id="btn-close-cats" class="btn-icon btn-close-modal">${this.icon('close', '&#x2716;')}</button>
          </div>
          <div id="cats-list-manage" class="manage-list"></div>
          <div class="pct-total-row" id="pct-total-row"></div>
          <form id="cat-form" autocomplete="off" style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line);">
            <h4 style="margin:0 0 12px 0;">+ Nueva categoría</h4>
            <div class="cat-form-grid">
              <label>Nombre
                <input type="text" id="catf-nombre" placeholder="Ej: Alimentación" required>
              </label>
              <label>Tipo
                <select id="catf-tipo">
                  <option value="EGRESO">${this.icon('expense', '&#x1F4B8;')} EGRESO (resta del presupuesto)</option>
                  <option value="INGRESO">${this.icon('income', '&#x1F49A;')} INGRESO (amplía disponible)</option>
                  <option value="INVERSIÓN">${this.icon('investment', '&#x1F4BC;')} INVERSIÓN (flujo separado)</option>
                </select>
              </label>
              <label id="catf-pct-label">% del presupuesto
                <input type="number" id="catf-pct" min="0" max="100" step="1" placeholder="Ej: 30">
              </label>
              <label>Color
                <input type="color" id="catf-color" value="#6366f1">
              </label>
            </div>
            <div class="modal-actions" style="margin-top:12px;">
              <button type="button" id="btn-cancel-cats" class="btn-secondary">Cerrar</button>
              <button type="submit" class="btn-primary">Agregar categoría</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('categorias-modal-overlay');

    // Toggle % field based on tipo
    const tipoSel = document.getElementById('catf-tipo');
    const pctLabel = document.getElementById('catf-pct-label');
    const togglePct = () => {
      pctLabel.style.display = tipoSel.value === 'EGRESO' ? 'flex' : 'none';
    };
    tipoSel.addEventListener('change', togglePct);
    togglePct();

    this._renderCatsList(cuentaKey);

    document.getElementById('btn-close-cats').onclick = () => overlay.remove();
    document.getElementById('btn-cancel-cats').onclick = () => overlay.remove();

    document.getElementById('cat-form').onsubmit = async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('catf-nombre').value.trim();
      const tipo = document.getElementById('catf-tipo').value;
      const porcentaje_asignacion = tipo === 'EGRESO' ? Number(document.getElementById('catf-pct').value || 0) : 0;
      const color_hex = document.getElementById('catf-color').value;
      if (!nombre) return;

      const result = await this.api('POST', `/api/presupuesto/cuentas/${cuentaId}/categorias`, {
        nombre, porcentaje_asignacion, color_hex, tipo
      });
      if (result.error) { this.showToast(result.error, 'error'); return; }
      this.showToast('Categoría agregada');
      document.getElementById('cat-form').reset();
      document.getElementById('catf-color').value = '#6366f1';
      togglePct();
      await this.loadCategoriasForCuenta(cuentaKey);
      this._renderCatsList(cuentaKey);
      await this.refresh();
    };
  }

  _renderCatsList(cuentaId) {
    const cuentaKey = String(cuentaId);
    const el = document.getElementById('cats-list-manage');
    const pctRow = document.getElementById('pct-total-row');
    if (!el) return;
    const cats = this.categorias[cuentaKey] || [];
    const egresosCats = cats.filter(c => (c.tipo || 'EGRESO') === 'EGRESO');
    const totalPct = egresosCats.reduce((s, c) => s + c.porcentaje_asignacion, 0);

    if (cats.length === 0) {
      el.innerHTML = '<p style="color:var(--muted); text-align:center; padding:16px 0;">No hay categorías. Agregá una abajo.</p>';
    } else {
      el.innerHTML = cats.map(cat => {
        const tipo = cat.tipo || 'EGRESO';
        return `
        <div class="manage-item">
          <div class="manage-item-info">
            <span class="cat-dot" style="background:${cat.color_hex}; width:14px; height:14px; border-radius:50%; display:inline-block; margin-right:6px;"></span>
            <strong>${this.escapeHtml(cat.nombre)}</strong>
            ${this.tipoBadge(tipo)}
            ${tipo === 'EGRESO' ? `<span class="cat-pct-badge">${cat.porcentaje_asignacion}%</span>` : ''}
          </div>
          <div class="manage-item-actions">
            <button class="btn-sm btn-edit-cat" data-id="${this.escapeHtml(cat.id)}" data-nombre="${this.escapeHtml(cat.nombre)}" data-pct="${cat.porcentaje_asignacion}" data-color="${this.escapeHtml(cat.color_hex)}" data-tipo="${this.escapeHtml(tipo)}">${this.icon('pencil', '&#x270F;&#xFE0F;')}</button>
            <button class="btn-sm btn-danger-sm btn-del-cat" data-id="${cat.id}">${this.icon('trash', '&#x1F5D1;&#xFE0F;')}</button>
          </div>
        </div>`;
      }).join('');

      el.querySelectorAll('.btn-edit-cat').forEach(btn => btn.addEventListener('click', e => {
        const { id, nombre, pct, color, tipo } = e.target.dataset;
        this.showEditCatModal(cuentaKey, { id, nombre, porcentaje_asignacion: Number(pct), color_hex: color, tipo: tipo || 'EGRESO' });
      }));
      el.querySelectorAll('.btn-del-cat').forEach(btn => btn.addEventListener('click', async e => {
        if (!confirm('¿Eliminar esta categoría?')) return;
        const result = await this.api('DELETE', `/api/presupuesto/categorias/${e.target.dataset.id}`);
        if (result.error) { this.showToast(result.error, 'error'); return; }
        this.showToast('Categoría eliminada');
        await this.loadCategoriasForCuenta(cuentaKey);
        this._renderCatsList(cuentaKey);
        await this.refresh();
      }));
    }

    if (pctRow) {
      const status = totalPct > 100
        ? `${this.icon('redCircle', '&#x1F534;')} Excede 100%`
        : totalPct === 100
          ? `${this.icon('ok', '&#x2705;')} 100% asignado`
          : `${this.icon('warning', '&#x26A0;&#xFE0F;')} ${totalPct}% (queda ${100 - totalPct}%)`;
      pctRow.innerHTML = `<span class="pct-total ${totalPct > 100 ? 'over' : totalPct === 100 ? 'ok' : 'under'}">Asignación EGRESO total: ${status}</span>`;
    }
  }

  showEditCatModal(cuentaId, cat) {
    const html = `
      <div id="edit-cat-overlay" class="modal-overlay" style="z-index:10010;">
        <div class="modal-box">
          <h3>${this.icon('pencil', '&#x270F;&#xFE0F;')} Editar Categoría</h3>
          <form id="edit-cat-form" autocomplete="off">
            <label>Nombre <input type="text" id="ecf-nombre" value="${this.escapeHtml(cat.nombre)}" required></label>
            <label>Tipo
              <select id="ecf-tipo">
                <option value="EGRESO" ${cat.tipo === 'EGRESO' ? 'selected' : ''}>${this.icon('expense', '&#x1F4B8;')} EGRESO</option>
                <option value="INGRESO" ${cat.tipo === 'INGRESO' ? 'selected' : ''}>${this.icon('income', '&#x1F49A;')} INGRESO</option>
                <option value="INVERSIÓN" ${cat.tipo === 'INVERSIÓN' ? 'selected' : ''}>${this.icon('investment', '&#x1F4BC;')} INVERSIÓN</option>
              </select>
            </label>
            <label id="ecf-pct-label" style="${cat.tipo !== 'EGRESO' ? 'display:none' : ''}">
              % del presupuesto <input type="number" id="ecf-pct" value="${cat.porcentaje_asignacion}" min="0" max="100" step="1">
            </label>
            <label>Color <input type="color" id="ecf-color" value="${cat.color_hex}"></label>
            <div class="modal-actions">
              <button type="button" id="btn-cancel-edit-cat" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('edit-cat-overlay');

    const tipoSel = document.getElementById('ecf-tipo');
    const pctLabel = document.getElementById('ecf-pct-label');
    tipoSel.addEventListener('change', () => {
      pctLabel.style.display = tipoSel.value === 'EGRESO' ? 'flex' : 'none';
    });

    document.getElementById('btn-cancel-edit-cat').onclick = () => overlay.remove();
    document.getElementById('edit-cat-form').onsubmit = async (e) => {
      e.preventDefault();
      const tipoVal = tipoSel.value;
      const result = await this.api('PATCH', `/api/presupuesto/categorias/${cat.id}`, {
        nombre: document.getElementById('ecf-nombre').value.trim(),
        porcentaje_asignacion: tipoVal === 'EGRESO' ? Number(document.getElementById('ecf-pct').value) : 0,
        color_hex: document.getElementById('ecf-color').value,
        tipo: tipoVal
      });
      if (result.error) { this.showToast(result.error, 'error'); return; }
      this.showToast('Categoría actualizada');
      overlay.remove();
      await this.loadCategoriasForCuenta(String(cuentaId));
      this._renderCatsList(String(cuentaId));
      await this.refresh();
    };
  }

  // Modal: Presupuesto del Mes

  showPresupuestoMesModal(cuentaId) {
    const cuentaKey = String(cuentaId);
    const dashItem = this.dashboardData?.cuentas?.find(c => String(c.cuenta.id) === cuentaKey);
    const cuenta = this.cuentas.find(c => String(c.id) === cuentaKey);
    const mesNombre = this.MESES[this.currentMes - 1];
    const actual = dashItem?.presupuesto?.monto_total ?? cuenta?.presupuesto_mensual_base ?? 0;

    const html = `
      <div id="pres-mes-overlay" class="modal-overlay">
        <div class="modal-box">
          <h3>${this.icon('calendar', '&#x1F4C5;')} Presupuesto de ${mesNombre} ${this.currentAnio}</h3>
          <p style="color:var(--muted); margin:0 0 16px 0;">Cuenta: <strong>${this.escapeHtml(cuenta?.nombre)}</strong></p>
          <form id="pres-mes-form" autocomplete="off">
            <label>Monto total del mes ($)
              <input type="number" id="pmf-monto" value="${actual}" min="0" step="100" required>
            </label>
            <div class="modal-actions">
              <button type="button" id="btn-cancel-pres-mes" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary">Aplicar</button>
            </div>
          </form>
          ${dashItem?.presupuesto ? '' : `
          <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--line);">
            <button id="btn-clonar-mes" class="btn-secondary" style="width:100%;">
              ${this.icon('clipboard', '&#x1F4CB;')} Clonar desde ${this.MESES[this.currentMes === 1 ? 11 : this.currentMes - 2]} ${this.currentMes === 1 ? this.currentAnio - 1 : this.currentAnio}
            </button>
          </div>`}
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('pres-mes-overlay');
    document.getElementById('btn-cancel-pres-mes').onclick = () => overlay.remove();

    document.getElementById('btn-clonar-mes')?.addEventListener('click', async () => {
      const result = await this.api('POST', '/api/presupuesto/mensual/clonar', {
        cuenta_id: cuentaId, mes_destino: this.currentMes, anio_destino: this.currentAnio
      });
      if (result.error) { this.showToast(result.error, 'error'); return; }
      this.showToast('Presupuesto clonado');
      overlay.remove();
      await this.refresh();
    });

    document.getElementById('pres-mes-form').onsubmit = async (e) => {
      e.preventDefault();
      const monto_total = Number(document.getElementById('pmf-monto').value);
      let result;
      if (dashItem?.presupuesto) {
        result = await this.api('PATCH', `/api/presupuesto/mensual`, { id: dashItem.presupuesto.id, monto_total });
        if (result.error) {
          result = await this.api('POST', '/api/presupuesto/mensual', {
            cuenta_id: cuentaId, mes: this.currentMes, anio: this.currentAnio, monto_total, estado: 'manual'
          });
        }
      } else {
        result = await this.api('POST', '/api/presupuesto/mensual', {
          cuenta_id: cuentaId, mes: this.currentMes, anio: this.currentAnio, monto_total, estado: 'manual'
        });
      }
      if (result.error && !result.error.includes('Ya existe')) { this.showToast(result.error, 'error'); return; }
      this.showToast('Presupuesto actualizado');
      overlay.remove();
      await this.refresh();
    };
  }

  // Modal: Nueva / Editar Transaccion

  showGastoModal(cuentaId, gastoExistente = null) {
    const cuentaKey = String(cuentaId);
    const cats = this.categorias[cuentaKey] || [];
    const fechaDefault = `${this.currentAnio}-${String(this.currentMes).padStart(2,'0')}-15`;
    const isEdit = !!gastoExistente;

    if (cats.length === 0) {
      this.showToast('Primero agregá categorías a esta cuenta', 'warning');
      this.showCategoriasModal(cuentaId);
      return;
    }

    const html = `
      <div id="gasto-modal-overlay" class="modal-overlay">
        <div class="modal-box">
          <h3>${isEdit ? this.icon('pencil', '&#x270F;&#xFE0F;') + ' Editar Transacción' : '+ Nueva TRANSACCIÓN'}</h3>
          <form id="gasto-form" autocomplete="off">
            <label>Categoría <span style="color:var(--danger)">*</span>
              <select id="gf-categoria" required>
                <option value="">— Seleccionar categoría —</option>
                ${cats.map(c => `<option value="${c.id}" data-tipo="${c.tipo || 'EGRESO'}" ${String(gastoExistente?.categoria_id || '') === String(c.id) ? 'selected' : ''}>${c.nombre} [${c.tipo || 'EGRESO'}]</option>`).join('')}
              </select>
            </label>
            <div id="gf-tipo-hint" class="tipo-hint"></div>
            <label>Descripción
              <input type="text" id="gf-descripcion" value="${this.escapeHtml(gastoExistente?.descripcion || '')}" placeholder="Ej: Supermercado">
            </label>
            <label>Monto ($)
              <input type="number" id="gf-monto" min="0" step="0.01" value="${gastoExistente?.monto || ''}" required>
            </label>
            <label>Fecha
              <input type="date" id="gf-fecha" value="${gastoExistente?.fecha || fechaDefault}" required>
            </label>
            <label>Método de Pago
              <select id="gf-metodo">
                ${['Efectivo','TC','Débito','Transferencia','Otro'].map(m => `<option ${(gastoExistente?.metodo_pago || 'Efectivo') === m ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </label>
            ${!isEdit ? `
            <label class="checkbox-label">
              <input type="checkbox" id="gf-recurrente"> Transacción recurrente (proyectar 12 meses) ${this.icon('repeat', '&#x1F501;')}
            </label>
            <label id="cuotas-label" style="display:flex; flex-direction:column; gap:4px;">
              Número de cuotas
              <input type="number" id="gf-cuotas" min="1" max="60" value="1">
            </label>
            ` : ''}
            ${isEdit && gastoExistente?.proyeccion_id ? `
            <label class="checkbox-label">
              <input type="checkbox" id="gf-cascade"> Aplicar cambio de monto a todos los meses futuros
            </label>` : ''}
            <div class="modal-actions">
              <button type="button" id="btn-cancel-gasto" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary">${isEdit ? 'Guardar Cambios' : 'Registrar'}</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('gasto-modal-overlay');

    // Dynamic behavior based on category type
    const catSel = document.getElementById('gf-categoria');
    const recCheck = document.getElementById('gf-recurrente');
    const cuotasLabel = document.getElementById('cuotas-label');
    const tipoHint = document.getElementById('gf-tipo-hint');

    const onCatChange = () => {
      const opt = catSel.options[catSel.selectedIndex];
      const tipo = opt?.dataset?.tipo || 'EGRESO';
      // Update hint
      const hints = {
        EGRESO:    `${this.icon('expense', '&#x1F4B8;')} Este monto restará del presupuesto operativo.`,
        INGRESO:   `${this.icon('income', '&#x1F49A;')} Este monto AUMENTARÁ el presupuesto dinámico del mes.`,
        'INVERSIÓN': `${this.icon('investment', '&#x1F4BC;')} Este monto se derivará a Liquidez de Inversión (no afecta el disponible operativo).`,
      };
      tipoHint.textContent = hints[tipo] || '';
      tipoHint.className = `tipo-hint tipo-hint-${tipo.toLowerCase().replace('ó','o')}`;
      // Toggle cuotas (only for EGRESO)
      if (cuotasLabel) cuotasLabel.style.display = tipo === 'EGRESO' ? 'flex' : 'none';
    };

    catSel.addEventListener('change', onCatChange);
    onCatChange(); // Run on open

    if (recCheck && cuotasLabel) {
      recCheck.addEventListener('change', () => {
        const opt = catSel.options[catSel.selectedIndex];
        const tipo = opt?.dataset?.tipo || 'EGRESO';
        cuotasLabel.style.display = (tipo === 'EGRESO' && !recCheck.checked) ? 'flex' : 'none';
      });
    }

    document.getElementById('btn-cancel-gasto').onclick = () => overlay.remove();
    document.getElementById('gasto-form').onsubmit = async (e) => {
      e.preventDefault();
      if (!catSel.value) {
        this.showToast('Seleccioná una categoría antes de continuar', 'warning');
        return;
      }
      await this.submitGasto(cuentaKey, gastoExistente);
      overlay.remove();
      await this.refresh();
    };
  }

  async submitGasto(cuentaId, gastoExistente) {
    const categoria_id = document.getElementById('gf-categoria').value;
    const descripcion = document.getElementById('gf-descripcion').value;
    const monto = parseFloat(document.getElementById('gf-monto').value);
    const fecha = document.getElementById('gf-fecha').value;
    const metodo_pago = document.getElementById('gf-metodo').value;

    if (gastoExistente) {
      const cascade_future = document.getElementById('gf-cascade')?.checked || false;
      const result = await this.api('PATCH', `/api/presupuesto/gastos/${gastoExistente.id}`, {
        categoria_id, descripcion, monto, fecha, metodo_pago, cascade_future
      });
      if (result.error) this.showToast(result.error, 'error');
      else {
        this.showToast('Transacción actualizada');
        if (result.warning) this.showToast(result.warning, 'warning');
      }
    } else {
      const es_recurrente = document.getElementById('gf-recurrente')?.checked || false;
      const total_cuotas = parseInt(document.getElementById('gf-cuotas')?.value || '1');
      const result = await this.api('POST', '/api/presupuesto/gastos', {
        categoria_id, cuenta_id: cuentaId, descripcion, monto, fecha,
        metodo_pago, es_recurrente, total_cuotas: es_recurrente ? 1 : total_cuotas
      });
      if (result.error) this.showToast(result.error, 'error');
      else {
        this.showToast(`${result.created} transacción(es) registrada(s)${result.created > 1 ? ' (proyección creada)' : ''}`);
        if (result.warning) this.showToast(result.warning, 'warning');
      }
    }
  }

  async editGasto(gastoId) {
    const idStr = String(gastoId);
    let item = this.dashboardData?.cuentas.flatMap(c => c.gastos).find(g => String(g.id) === idStr);
    if (!item) {
      const anual = this.anualMovCache.get(idStr);
      item = await this.getGastoByIdAndFecha(idStr, anual?.fecha || '');
    }
    if (!item) return;
    if (!this.categorias[String(item.cuenta_id)]) await this.loadCategoriasForCuenta(item.cuenta_id);
    this.showGastoModal(String(item.cuenta_id), item);
  }

  async deleteGasto(gastoId, tieneProy) {
    let deleteFuture = false;
    if (tieneProy) {
      deleteFuture = confirm(
        'Este gasto es parte de una serie recurrente o de cuotas.\n\n' +
        this.icon('ok', '&#x2705;') + ' Aceptar = Eliminar TODOS los meses futuros\n' +
        this.icon('error', '&#x274C;') + ' Cancelar = Eliminar SOLO este mes'
      );
    } else {
      if (!confirm('¿Eliminar esta transacción?')) return;
    }
    try {
      const result = await this.api('DELETE', `/api/presupuesto/gastos/${gastoId}`, { delete_future: deleteFuture });
      this.showToast(`${result.deleted} transacción(es) eliminada(s)`);
      await this.refresh();
    } catch (err) {
      console.error('[deleteGasto]', err);
      this.showToast(err.message || 'Error eliminando transacción', 'error');
    }
  }

  // Main Lifecycle

  async init() {
    try {
      await this.loadCuentas();
      for (const cuenta of this.cuentas) {
        await this.loadCategoriasForCuenta(cuenta.id);
      }
      await this.refresh();
    } catch (e) {
      console.error('[BudgetDashboard.init]', e);
      this.showToast(`Error inicializando el dashboard: ${e.message}`, 'error');
    }
  }

  async refresh() {
    try {
      await this.loadCuentas();
      for (const cuenta of this.cuentas) {
        await this.loadCategoriasForCuenta(cuenta.id);
      }
      if (this.cuentas.length === 0) {
        const summary = document.getElementById('budget-global-summary');
        if (summary) summary.innerHTML = '';
        this.renderEmptyState();
        return;
      }
      await this.loadDashboard();
      this.renderGlobalSummary();
      if (this.vistaAnual) {
        await this.renderVistaAnual();
      } else {
        this.renderCuentas();
      }
    } catch (e) {
      console.error('[BudgetDashboard.refresh]', e);
      this.showToast(`Error actualizando el dashboard: ${e.message}`, 'error');
    }
  }
};


