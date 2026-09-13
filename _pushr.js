// 推送重试器：间歇性断连按退避重试（每次重试前先 rebase 吸收设备 auto-sync）
const { execFileSync } = require('child_process');
function git(args) {
  return execFileSync('git', ['-c', 'http.proxy=', '-c', 'https.proxy='].concat(args), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function tryPush() {
  try { const o = git(['push', 'origin', 'main']); return { ok: true, o }; }
  catch (e) { return { ok: false, o: String(e.stdout || '') + String(e.stderr || '') }; }
}
const delays = [0, 15000, 30000, 45000, 60000, 90000];
for (let i = 0; i < delays.length; i++) {
  if (delays[i]) {
    console.log('等待 ' + delays[i] / 1000 + 's...');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delays[i]);
    try { git(['pull', '--rebase', '-q', 'origin', 'main']); console.log('  (rebase 吸收设备 auto-sync)'); } catch (e) { console.log('  rebase 失败: ' + String(e.stderr || e.message).slice(0, 120)); }
  }
  const r = tryPush();
  if (r.ok) { console.log('PUSH OK\n' + r.o); process.exit(0); }
  console.log('第 ' + (i + 1) + ' 次失败: ' + r.o.slice(0, 110));
}
console.log('ALL RETRIES FAILED');
process.exit(1);
