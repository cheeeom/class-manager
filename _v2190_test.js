/* v2.18.13 回归测试：reasonScores 本地优先合并 —— 本地未推送的分值编辑不被云端旧值覆盖；
   本地已删键由 catDeleted.reasons 墓碑兜底剔除（不复活）。运行：node _v2190_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

function extractFn(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return eval('(' + buf.join('\n') + ')');
}
const cloneCatDeleted = extractFn('cloneCatDeleted');
const catDelAdd = extractFn('catDelAdd');
const applyCatTombstones = extractFn('applyCatTombstones');
const mergeReasonCatalog = extractFn('mergeReasonCatalog');
const cloneReasonCatalog = extractFn('cloneReasonCatalog');
const flattenReasonCatalog = extractFn('flattenReasonCatalog');
global.DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
// smartMergeData 内部引用的辅助函数（本测试只关心 reasonScores，作桩即可）
global.sortOpsNewestFirst = function (ops) { return ops || []; };
global.liveOps = function (ops) { return ops || []; };
// v2.19.0 表驱动：smartMergeData 依赖 STATE_SCHEMA + MERGE_ST 策略表，从 index.html 真实实现切片注入
const STATE_SCHEMA = eval('(' + html.slice(html.indexOf('const STATE_SCHEMA'), html.indexOf('\n];', html.indexOf('const STATE_SCHEMA')) + 3).replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
eval(html.slice(html.indexOf('function msStudents'), html.indexOf('/* MERGE_ENGINE_END')));
const smartMergeData = extractFn('smartMergeData');
// v2.18.9 smartMergeData 墓碑仲裁依赖（外部符号桩）
global.mergeTsMap = extractFn('mergeTsMap');
global.catTombReviveFilter = extractFn('catTombReviveFilter');
global.state = global.state || {};

function base() {
  return {
    students: [], operations: [],
    reasonCatalog: { '扣分': { '课堂纪律': ['课堂违纪', '迟到早退'] } },
    reasonScores: { '课堂违纪': -3, '迟到早退': -2 },
    reasons: ['课堂违纪', '迟到早退'],
    catDeleted: { dirs: [], groups: [], reasons: [] }
  };
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.18.13 reasonScores 本地优先 ===');
t('本地改分值（未推送）→ 云端旧值不覆盖，保留本地新值', () => {
  const local = base();
  local.reasonScores = { '课堂违纪': -8, '迟到早退': -2 };   // 老板把 -3 改成 -8
  const remote = base();                                       // 云端还是旧副本
  remote.reasonScores = { '课堂违纪': -3, '迟到早退': -2 };
  const m = smartMergeData(local, remote);
  eq(m.reasonScores['课堂违纪'], -8, '本地新分值必须保留');
});

t('云端新增本地没有的键 → 并入（不丢跨设备新增）', () => {
  const local = base();
  const remote = base();
  remote.reasonScores = Object.assign({}, base().reasonScores, { '旷课': -5 });
  const m = smartMergeData(local, remote);
  eq(m.reasonScores['旷课'], -5, '远端新键并入');
  eq(m.reasonScores['课堂违纪'], -3, '本地无冲突键仍取云端值');
});

t('本地删除某分值键 → 墓碑兜底，云端旧值不复活', () => {
  const local = base();
  delete local.reasonScores['迟到早退'];
  local.catDeleted.reasons = ['迟到早退'];   // catDeleteReason 同步登记墓碑
  const remote = base();                      // 云端仍带旧键
  const m = smartMergeData(local, remote);
  eq('迟到早退' in m.reasonScores, false, '被删键不得复活');
  eq(m.reasonScores['课堂违纪'], -3);
});

t('两侧同名键、本地值不变 → 云端值原样保留（正常同步不受影响）', () => {
  const local = base();
  const remote = base();
  remote.reasonScores = { '课堂违纪': -3, '迟到早退': -2 };
  const m = smartMergeData(local, remote);
  eq(m.reasonScores['课堂违纪'], -3);
  eq(m.reasonScores['迟到早退'], -2);
});

t('云端无 reasonScores（旧数据）→ 本地分值完整保留', () => {
  const local = base();
  const remote = base();
  delete remote.reasonScores;
  const m = smartMergeData(local, remote);
  eq(m.reasonScores['课堂违纪'], -3);
  eq(m.reasonScores['迟到早退'], -2);
});

t('本地无 reasonScores → 云端完整采纳', () => {
  const local = base();
  delete local.reasonScores;
  const remote = base();
  const m = smartMergeData(local, remote);
  eq(m.reasonScores['课堂违纪'], -3);
  eq(m.reasonScores['迟到早退'], -2);
});

console.log('\n=== 源码护栏 ===');
t('旧「云端优先」实现已移除', () => {
  const bad = html.indexOf('Object.assign({}, localData.reasonScores||{}, remoteData.reasonScores)');
  eq(bad, -1, '不得残留旧云端优先合并');
});
t('新「本地优先」实现已写入', () => {
  has(html, 'Object.assign({}, _rs, _ls)', '本地优先合并');
});
t('版本标记统一 v2.18.13', () => {
  has(html, '<div class="login-version">v2.19.0</div>', '登录页版本');
  has(html, '<div class="sidebar-footer">v2.19.0 · 班主任工作台</div>', '侧栏版本');
  has(html, '🏷️ v2.19.0</span>', '设置页徽标');
});
t('sw.js CACHE_NAME 已升版', () => {
  has(fs.readFileSync('sw.js', 'utf8'), "CACHE_NAME = 'class-manager-v2.19.0'", 'sw 缓存名');
});
t('速览新增修复条目', () => {
  has(html, '原因分值合并改为本地优先', '近版更新速览');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
