/* v2.19.2 回归测试：修复 catDeleted 墓碑指数膨胀（msCatTomb concat 不去重）。
   背景：推送前必然执行 smartMergeData（本地⊕云端），msCatTomb 原实现把两侧墓碑数组
   直接 concat 且不去重 → 多设备交替同步下每轮翻倍，实测一天 156KB→12.5MB。
   修法：dirs/groups/reasons 三组 concat 后按条目名去重（墓碑语义=已删条目名的集合）。
   运行：node _v21201_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== 静态检查 ===');
t('index.html 版本号已升至 v2.19.2', () => {
  if (!/v2\.19\.2/.test(html)) throw new Error('未找到 v2.19.2');
});
t('sw.js CACHE_NAME 已跟版 v2.19.2', () => {
  if (!/class-manager-v2\.19\.2/.test(sw)) throw new Error('CACHE_NAME 未跟版');
});
t('msCatTomb 已引入 _uniqTomb 去重', () => {
  if (html.indexOf('function _uniqTomb') < 0) throw new Error('缺少 _uniqTomb');
});
t('旧的无去重 concat 写法已消失', () => {
  if (html.indexOf('{ dirs: _td.dirs.concat(_tr.dirs)') >= 0) throw new Error('仍存在无去重 concat');
});

console.log('=== 行为验证（无头执行主脚本后驱动合并引擎） ===');
const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</' + 'script>', start);
const js = html.slice(start, end);
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
function ctxStub() { const noop = () => {}; return { scale: noop, clearRect: noop, fillText: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc: noop, clip: noop, save: noop, restore: noop, drawImage: noop, closePath: noop, quadraticCurveTo: noop, createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }) }; }
function fakeEl() { return { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '', querySelector: () => null, querySelectorAll: () => [], appendChild(c) { this.children.push(c); }, removeChild(c) { this.children = this.children.filter(x => x !== c); }, remove() {}, addEventListener() {}, scrollIntoView() {}, focus() {}, click() {}, select() {}, getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }), getContext: () => ctxStub() }; }
global.document = { querySelectorAll: () => [], querySelector: () => fakeEl(), getElementById: () => fakeEl(), addEventListener() {}, createElement: () => fakeEl(), documentElement: fakeEl(), body: fakeEl() };
global.window = { addEventListener() {}, location: { pathname: '/class-manager/' } };
global.navigator = {};
global.fetch = () => new Promise(() => {});

const testCode = `
// 膨胀态构造：真实事故中每个墓碑名重复上万次
var dupNames = ['违纪扣分大类', '月度全勤', '课堂表现积极', 'D6栋', '走读方向'];
var bloated = { dirs: [], groups: [], reasons: [] };
for (var r = 0; r < 40000; r++) { dupNames.forEach(function(n){ bloated.dirs.push(n); bloated.reasons.push(n + '子项'); }); }

t('膨胀态（20 万条重复墓碑）合并后收敛到唯一集合', function() {
  state.catDeletedAt = {}; state.catRevived = {};
  var local = { catDeleted: bloated, catDeletedAt: {}, catRevived: {} };
  var remote = { catDeleted: { dirs: dupNames.slice(), groups: [], reasons: dupNames.map(function(n){ return n + '子项'; }) }, catDeletedAt: {}, catRevived: {} };
  var merged = {};
  msCatTomb(merged, local, remote);
  eq(merged.catDeleted.dirs.length, 5, 'dirs 去重后');
  eq(merged.catDeleted.reasons.length, 5, 'reasons 去重后');
  if (JSON.stringify(merged.catDeleted).length > 2000) throw new Error('合并结果未收敛');
});

t('多轮合并体积恒定（原 bug 每轮翻倍）', function() {
  var carrier = { catDeleted: { dirs: dupNames.slice(), groups: [], reasons: dupNames.map(function(n){ return n + '子项'; }) }, catDeletedAt: {}, catRevived: {} };
  var sizes = [];
  for (var i = 0; i < 6; i++) {
    var m2 = {};
    msCatTomb(m2, carrier, carrier);
    sizes.push(JSON.stringify(m2.catDeleted).length);
    carrier = { catDeleted: m2.catDeleted, catDeletedAt: m2.catDeletedAt, catRevived: m2.catRevived };
  }
  sizes.forEach(function(sz){ if (sz !== sizes[0]) throw new Error('体积不恒定: ' + sizes.join(','));
  });
});

t('revive 语义保持：重加晚于删除 → 墓碑作废', function() {
  state.catDeletedAt = { '旧原因': 1000 }; state.catRevived = { '旧原因': 2000 };
  var m3 = {};
  msCatTomb(m3,
    { catDeleted: { dirs: ['旧原因'], groups: [], reasons: [] }, catDeletedAt: {}, catRevived: {} },
    { catDeleted: { dirs: ['旧原因'], groups: [], reasons: [] }, catDeletedAt: {}, catRevived: {} });
  eq(m3.catDeleted.dirs.length, 0, 'revive 后');
});

t('删除晚于 revive → 墓碑继续生效', function() {
  state.catDeletedAt = { 'X类': 3000 }; state.catRevived = { 'X类': 2000 };
  var m4 = {};
  msCatTomb(m4,
    { catDeleted: { dirs: ['X类'], groups: [], reasons: [] }, catDeletedAt: {}, catRevived: {} },
    { catDeleted: { dirs: ['X类'], groups: [], reasons: [] }, catDeletedAt: {}, catRevived: {} });
  eq(m4.catDeleted.dirs.length, 1, '墓碑应保留');
});

t('本地无墓碑、云端有 → 正常继承', function() {
  state.catDeletedAt = {}; state.catRevived = {};
  var m5 = {};
  msCatTomb(m5,
    { catDeleted: null, catDeletedAt: {}, catRevived: {} },
    { catDeleted: { dirs: ['A'], groups: [], reasons: [] }, catDeletedAt: {}, catRevived: {} });
  eq(m5.catDeleted.dirs.length, 1, '应继承云端墓碑');
});
`;
eval(js + '\n' + testCode);

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 500).unref();
