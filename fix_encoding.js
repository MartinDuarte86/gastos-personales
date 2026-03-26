const fs = require('fs');
let t = fs.readFileSync('public/js/components/BudgetDashboard.js', 'utf8');
const repl = { 
  'ðŸ“Š': '📊', 'â€”': '—', 'DINÃ¡MICO': 'DINÁMICO', 'DinÃ¡mico': 'Dinámico', 
  'inversiÃ³n': 'inversión', 'InversiÃ³n': 'Inversión', 'INVERSIÃ“N': 'INVERSIÓN', 
  'TRANSACCIÃ“N': 'TRANSACCIÓN', 'TransacciÃ³n': 'Transacción', 'LÃ³gica': 'Lógica', 
  'MÃ³dulo': 'Módulo', 'AÃ±o': 'Año', 'AÃ±adir': 'Añadir', 'CategorÃ\xADa': 'Categoría', 
  'DescripciÃ³n': 'Descripción', 'Ãº': 'ú', 'Ã³': 'ó', 'Ã¡': 'á', 'Ã©': 'é', 
  'Ã\xAD': 'í', 'Ã‘': 'Ñ', 'Ã±': 'ñ', 'Â¿': '¿', 'Â¡': '¡' 
};
for(let k in repl) t = t.split(k).join(repl[k]);
fs.writeFileSync('public/js/components/BudgetDashboard.js', t);
console.log('Fixed encoding!');
