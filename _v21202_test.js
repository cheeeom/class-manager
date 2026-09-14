/* v2.20.0 回归测试：预警中心——办结复活修复 + 删除记录墓碑 + 渲染过滤。
   运行：node _v21202_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== 静态检查 ===');
t('index.html 版本号已升至 v2.20.0', () => { if (!/v2\.20\.0/.test(html)) throw new Error('未找到 v2.20.0'); });
t('sw.js CACHE_NAME 已跟版 v2.20.0', () => { if (!/class-manager-v2\.20\.0/.test(fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n'))) throw new Error('CACHE_NAME 未跟版'); });
t('cbScanAlerts 含「办结后复活」修复（monthAll 历史仲裁）', () => { if (html.indexOf('v2.20.0 修复「办结后复活」') < 0) throw new Error('缺少修复标记'); });
t('cbAlertDelete 已定义并挂载删除按钮', () => {
  if (html.indexOf('function cbAlertDelete') < 0) throw new Error('缺少 cbAlertDelete');
  if ((html.match(/cbAlertDelete\(/g) || []).length < 3) throw new Error('删除按钮未挂载');
});
t('两处渲染过滤已删除记录', () => {
  if ((html.match(/a\.status !== 'deleted'/g) || []).length < 2) throw new Error('渲染过滤缺失');
});

console.log('=== 行为验证（无头执行主脚本后驱动扫描引擎） ===');
const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</' + 'script>', start);
const js = html.slice(start, end);
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
function fakeEl() { return { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '', querySelector: () => null, querySelectorAll: () => [], appendChild(c) { this.children.push(c); }, remove() {}, addEventListener() {}, scrollIntoView() {}, focus() {}, click() {}, getBoundingClientRect: () => ({ width: 100, height: 100 }), getContext: () => { const noop = () => {}; return { scale: noop, clearRect: noop, fillText: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc: noop, clip: noop, save: noop, restore: noop, drawImage: noop, createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }) }; } }; }
global.document = { querySelectorAll: () => [], querySelector: () => fakeEl(), getElementById: () => fakeEl(), addEventListener() {}, createElement: () => fakeEl(), documentElement: fakeEl(), body: fakeEl() };
global.window = { addEventListener() {}, location: { pathname: '/class-manager/' } };
global.navigator = {};
global.fetch = () => new Promise(() => {});
global.confirm = () => true;

const testCode = `
// 场景：两名学生，甲 45 分（橙色档 40-49）、乙 55 分（黄色档 50-59）
state.students = [
  { id: 1, sid: 'S0001', name: '甲', credit: 45, tags: [] },
  { id: 2, sid: 'S0002', name: '乙', credit: 55, tags: [] }
];
state.creditBank = cbDefaultBank();
if (state.creditBank.settings) state.creditBank.settings.alertEnabled = true;

t('初始扫描：为预警档学生各建一条 pending', function() {
  var n = cbScanAlerts();
  if (n < 2) throw new Error('应新建 ≥2 条，实际 ' + n);
  var opens = state.creditBank.alerts.filter(function(a){ return a.status === 'pending'; });
  eq(opens.length, 2, 'pending 数');
});

t('重复扫描幂等：不重复建条', function() {
  var before = state.creditBank.alerts.length;
  cbScanAlerts();
  eq(state.creditBank.alerts.length, before, '条数应不变');
});

t('★ 办结后同档同月不再复活（本次修复的核心）', function() {
  var a = state.creditBank.alerts.find(function(x){ return x.status === 'pending'; });
  cbAlertMark(a.sid, a.id, 'resolved');
  // 触发一次扫描（saveData 前置钩子的同款调用）
  var n = cbScanAlerts();
  eq(n, 0, '不应有任何新建/变更');
  var stillResolved = state.creditBank.alerts.find(function(x){ return x.id === a.id; }).status;
  eq(stillResolved, 'resolved', '办结状态应保持');
});

t('另一学生办结后同样不复活', function() {
  var b = state.creditBank.alerts.find(function(x){ return x.status === 'pending'; });
  cbAlertMark(b.sid, b.id, 'resolved');
  eq(cbScanAlerts(), 0, '不应有变更');
});

t('删除记录：墓碑化 + 渲染过滤 + 不再重建', function() {
  var a = state.creditBank.alerts.find(function(x){ return x.status === 'resolved'; });
  var id = a.id, sid = a.sid;
  cbAlertDelete(sid, id);
  var del = state.creditBank.alerts.find(function(x){ return x.id === id; });
  eq(del.status, 'deleted', '状态应为 deleted');
  if (!del.deletedAt) throw new Error('缺少 deletedAt');
  // 渲染过滤：学生档案数据装配不含已删除
  var p = cbBankProfileOf(sid);
  eq(p.alerts.filter(function(x){ return x.status === 'deleted'; }).length, 0, '档案渲染不应包含已删除');
  // 不再重建
  eq(cbScanAlerts(), 0, '删除后扫描不应重建');
});

t('恶化升级：新档更严重时仍会叠加新预警', function() {
  var s = state.students[1];   // 乙 55 分（黄）
  var yellow = state.creditBank.alerts.find(function(x){ return String(x.sid) === cbWalletKey(s.id); });
  // 甲的记录已删，乙的记录已删 → 手动把乙降到 30 分（红色档，比黄更严重）
  s.credit = 30;
  var n = cbScanAlerts();
  var fresh = state.creditBank.alerts.filter(function(x){ return String(x.sid) === cbWalletKey(s.id) && x.status === 'pending'; });
  if (fresh.length !== 1) throw new Error('恶化升级应新建 1 条 pending，实际 ' + fresh.length + '（扫描变更 ' + n + '）');
  eq(fresh[0].level, 'red', '应为红色档');
});

t('回升 ≥60：自动办结', function() {
  var s = state.students[1];
  s.credit = 88;
  cbScanAlerts();
  var opens = state.creditBank.alerts.filter(function(x){ return String(x.sid) === cbWalletKey(s.id) && x.status === 'pending'; });
  eq(opens.length, 0, '回升后不应有 pending');
});

console.log(\`通过 \${pass} 项，失败 \${fail} 项\`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 500).unref();
`;
eval(js + '\n' + testCode);
