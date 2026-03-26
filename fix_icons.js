const fs = require('fs');
let t = fs.readFileSync('public/js/components/BudgetDashboard.js', 'utf8');

// Match all left/right arrows, calendars and gears explicitly
const repl = {
  'â—€': '◀',
  'â–¶': '▶',
  'ðŸ“…': '📅',
  'âš™ï¸\x8F': '⚙️',
  'âš™ï¸': '⚙️',
  'ðŸ“Š': '📊',
  'â€”': '—'
};

for (const [k, v] of Object.entries(repl)) {
  t = t.split(k).join(v);
}
fs.writeFileSync('public/js/components/BudgetDashboard.js', t);
console.log('Fixed remaining mojibake icons!');
