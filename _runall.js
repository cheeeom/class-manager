const fs = require('fs');
const { execFileSync } = require('child_process');
const files = fs.readdirSync('.').filter(f => /^_.*test.*\.js$/.test(f)).sort();
let passFiles = 0, failFiles = [];
for (const f of files) {
  try {
    const out = execFileSync('node', [f], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/通过 (\d+) 项，失败 (\d+) 项/);
    if (m && Number(m[2]) > 0) { failFiles.push(f + ' (' + m[2] + ' failed)'); }
    else { passFiles++; }
  } catch (e) {
    const tail = String(e.stdout || '').split('\n').filter(l => /❌|失败|异常|Error/.test(l)).slice(0, 3).join(' | ');
    failFiles.push(f + ' [crash] ' + tail);
  }
}
console.log('PASS: ' + passFiles + ' files');
console.log('FAIL: ' + (failFiles.length ? '\n  ' + failFiles.join('\n  ') : 'none'));
