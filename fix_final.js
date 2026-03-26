const fs = require('fs');
const file = 'public/js/components/BudgetDashboard.js';
let t = fs.readFileSync(file, 'utf8');

const repl = {
  'ðŸ’¸': '💸',
  'ðŸ’š': '💚',
  'ðŸ’¼': '💼',
  'ðŸ”\x81': '🔁',
  'ðŸ‘¼': '👉',
  'DinÃ¡mico': 'Dinámico',
  'inversiÃ³n': 'inversión'
};

let changed = false;
for (const [k, v] of Object.entries(repl)) {
  if (t.includes(k)) {
    t = t.split(k).join(v);
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(file, t);
  console.log('Fixed final mojibake instances!');
} else {
  console.log('No remaining instances found.');
}
