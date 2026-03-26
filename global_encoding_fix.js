const fs = require('fs');
const path = require('path');

const repl = {
  'ðŸ“Š': '📊',
  'ðŸ’°': '💰',
  'ðŸ“…': '📅',
  'ðŸ“ˆ': '📈',
  'ðŸ“‰': '📉',
  'ðŸ”„': '🔄',
  'ðŸ’µ': '💵',
  'ðŸ”Ž': '🔍',
  'ðŸš€': '🚀',
  'ðŸ’¡': '💡',
  'ðŸ‘€': '👀',
  'â—€': '◀',
  'â–¶': '▶',
  'âš™ï¸\x8F': '⚙️',
  'âš™ï¸': '⚙️',
  'â€”': '—',
  'Ã¡': 'á', 'Ã©': 'é', 'Ã\xAD': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
  'Ã\x81': 'Á', 'Ã\x89': 'É', 'Ã\x8D': 'Í', 'Ã\x93': 'Ó', 'Ã\x9A': 'Ú',
  'Ã±': 'ñ', 'Ã‘': 'Ñ',
  'Â¿': '¿', 'Â¡': '¡',
  'â€¢': '•', 'â€œ': '“', 'â€': '”', 'â€˜': '‘', 'â€™': '’'
};

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  let changedFiles = 0;
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      changedFiles += processDirectory(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.html') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      for (const [k, v] of Object.entries(repl)) {
        content = content.split(k).join(v);
      }
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed encoding in:', fullPath);
        changedFiles++;
      }
    }
  }
  return changedFiles;
}

const total = processDirectory(path.join(__dirname, 'public'));
console.log('Total files fixed:', total);
