const form = document.getElementById('gasto-form');
const statusEl = document.getElementById('status');
const scriptUrl = window.APP_CONFIG?.GOOGLE_SCRIPT_URL;

function showStatus(message, ok = true) {
  statusEl.textContent = message;
  statusEl.className = ok ? 'ok' : 'error';
}

if (!scriptUrl || scriptUrl.includes('REEMPLAZAR_URL')) {
  showStatus('Configurá public/config.js con la URL de tu Google Apps Script.', false);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!scriptUrl || scriptUrl.includes('REEMPLAZAR_URL')) {
    showStatus('No se puede guardar: falta configurar la URL del script.', false);
    return;
  }

  showStatus('Guardando gasto...', true);

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      showStatus(data.message || 'No se pudo guardar el gasto.', false);
      return;
    }

    form.reset();
    showStatus('Gasto guardado correctamente en Google Sheets.', true);
  } catch (_error) {
    showStatus('Error de conexión. Verificá la URL de Apps Script y permisos CORS.', false);
  }
});
