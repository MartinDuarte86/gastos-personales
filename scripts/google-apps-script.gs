/**
 * Pegá este script en https://script.google.com/
 * Luego desplegá como Web App con acceso "Anyone".
 */

const SHEET_NAME = 'Gastos';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    const requiredFields = ['mes', 'fecha', 'categoria', 'descripcion', 'monto', 'metodoPago'];
    for (const field of requiredFields) {
      if (!payload[field]) {
        return jsonResponse({ ok: false, message: `Falta el campo ${field}.` }, 400);
      }
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, message: `No existe la hoja ${SHEET_NAME}.` }, 400);
    }

    sheet.appendRow([
      new Date(),
      payload.mes,
      payload.fecha,
      payload.categoria,
      payload.descripcion,
      Number(payload.monto),
      payload.metodoPago
    ]);

    return jsonResponse({ ok: true, message: 'Gasto guardado.' }, 200);
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message }, 500);
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
