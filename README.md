# App de gastos personales + Google Sheets

Aplicación web para registrar gastos mensuales y guardarlos automáticamente en Google Sheets usando Google Apps Script.

## 1) Preparar Google Sheet

1. Creá una hoja de cálculo en Google Sheets.
2. Creá una pestaña llamada `Gastos`.
3. (Opcional) En la fila 1 colocá encabezados:
   - Timestamp
   - Mes
   - Fecha
   - Categoría
   - Descripción
   - Monto
   - Método de pago

## 2) Crear el Web App en Apps Script

1. Abrí la hoja y luego `Extensiones -> Apps Script`.
2. Copiá el contenido de `scripts/google-apps-script.gs`.
3. Guardá el proyecto.
4. Ir a `Implementar -> Nueva implementación -> Aplicación web`.
5. Ejecutar como: `Tú`.
6. Quién tiene acceso: `Cualquiera` (o según tu necesidad).
7. Copiá la URL del Web App.

## 3) Configurar la app web

1. Copiá el archivo de configuración:

```bash
cp public/config.example.js public/config.js
```

2. Editá `public/config.js` y pegá la URL del Web App en `GOOGLE_SCRIPT_URL`.

## 4) Ejecutar la app

```bash
npm run dev
```

Abrí `http://localhost:3000`.

## Estructura

- `public/index.html`: formulario de carga de gastos.
- `public/app.js`: envío de datos al Web App.
- `public/config.js`: URL de integración.
- `scripts/google-apps-script.gs`: script para insertar filas en la sheet.
- `server.js`: servidor estático local.
