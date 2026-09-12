const fs = require('fs');
let hits = 0;
for (const f of fs.readdirSync('.').filter(f => /^_.*test.*\.js$/.test(f) || f === '_runall.js')) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (/近版更新速览|本版更新速览|settingsReleaseNotes|login-version|sidebar-footer|CACHE_NAME|v2\.19\.\d/.test(l)) {
      console.log(f + ' ' + (i + 1) + ': ' + l.trim().slice(0, 140));
      hits++;
    }
  });
}
console.log('hits:', hits);
