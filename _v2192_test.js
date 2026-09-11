/* v2.18.13 回归测试：删除墓碑 vs 重新添加按时间戳仲裁 ——
   重新添加晚于删除 → 墓碑作废（云端旧墓碑不再把重加的大类/原因整体抹掉）；
   删除晚于重新添加 → 墓碑仍生效（跨设备删除传播语义不变，_v2174 兼容）。
   运行：node _v2192_test.js */
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
const mergeTsMap = extractFn('mergeTsMap');
const catTombReviveFilter = extractFn('catTombReviveFilter');
const flattenReasonCatalog = extractFn('flattenReasonCatalog');
global.DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
global.sortOpsNewestFirst = function (ops) { return ops || []; };
global.liveOps = function (ops) { return ops || []; };
global.state = {};   // smartMergeData 会读 state.catDeletedAt/catRevived 兜底（测试置空即可）
const smartMergeData = extractFn('smartMergeData');

function baseCat() {
  return { '扣分': { '课堂纪律': ['课堂违纪', '迟到早退', '扰乱课堂'], '考勤': ['旷课'] } };
}
function mkData(cat, tomb, delAt, revived) {
  return {
    students: [], operations: [],
    reasonCatalog: cat, reasonScores: { '课堂违纪': -3, '旷课': -5 },
    reasons: flattenReasonCatalog(cat),
    catDeleted: tomb || { dirs: [], groups: [], reasons: [] },
    catDeletedAt: delAt || {}, catRevived: revived || {}
  };
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== catTombReviveFilter 纯函数 ===');
t('重加晚于删除 → 墓碑作废', () => {
  const out = catTombReviveFilter({ dirs: [], groups: ['扣分|课堂纪律'], reasons: [] }, { '扣分|课堂纪律': 100 }, { '扣分|课堂纪律': 200 });
  eq(out.groups.length, 0);
});
t('删除晚于重加 → 墓碑保留', () => {
  const out = catTombReviveFilter({ dirs: [], groups: ['扣分|课堂纪律'], reasons: [] }, { '扣分|课堂纪律': 300 }, { '扣分|课堂纪律': 200 });
  eq(out.groups.length, 1);
});
t('旧墓碑无时间戳（按 0）+ 有重加记录 → 作废', () => {
  const out = catTombReviveFilter({ dirs: [], groups: ['扣分|课堂纪律'], reasons: [] }, {}, { '扣分|课堂纪律': 123 });
  eq(out.groups.length, 0);
});
t('旧墓碑无重加记录 → 保留（v2.17.30 语义不变）', () => {
  const out = catTombReviveFilter({ dirs: [], groups: ['扣分|课堂纪律'], reasons: ['课堂违纪'] }, {}, {});
  eq(out.groups.length, 1);
  eq(out.reasons.length, 1);
});
t('mergeTsMap：同 key 取大者', () => {
  eq(mergeTsMap({ a: 1, b: 5 }, { a: 2, c: 3 }).a, 2);
  eq(mergeTsMap({ a: 1, b: 5 }, { a: 2, c: 3 }).b, 5);
  eq(mergeTsMap({ a: 1, b: 5 }, { a: 2, c: 3 }).c, 3);
  eq(Object.keys(mergeTsMap(undefined, undefined)).length, 0);
});

console.log('\n=== 端到端合并（老板本次事故场景） ===');
t('★云端旧墓碑 + 本地重加大类 → 合并后大类保留（事故复现）', () => {
  const local = mkData(baseCat(), { dirs: [], groups: [], reasons: [] }, {}, { '扣分|课堂纪律': Date.now() });  // 今晨重加
  const remote = mkData({ '扣分': { '考勤': ['旷课'] } }, { dirs: [], groups: ['扣分|课堂纪律'], reasons: [] }, {}, {});  // 昨晚删过、墓碑推上云
  const m = smartMergeData(local, remote);
  eq(!!m.reasonCatalog['扣分']['课堂纪律'], true, '重加的大类不得被云端旧墓碑抹掉');
  eq(m.reasonCatalog['扣分']['课堂纪律'].indexOf('课堂违纪'), 0, '大类下的原因完整保留');
});
t('★重加原因晚于删除 → 原因保留、墓碑作废', () => {
  const now = Date.now();
  const local = mkData(baseCat(), { dirs: [], groups: [], reasons: [] }, {}, { '扰乱课堂': now });
  const remote = mkData(baseCat(), { dirs: [], groups: [], reasons: ['扰乱课堂'] }, { '扰乱课堂': now - 86400000 }, {});
  const m = smartMergeData(local, remote);
  eq(m.reasonCatalog['扣分']['课堂纪律'].indexOf('扰乱课堂') >= 0, true, '重加的原因保留');
  eq(m.catDeleted.reasons.indexOf('扰乱课堂'), -1, '作废墓碑不得写回');
});
t('删除晚于重加 → 仍然删除（跨设备删除传播不回退）', () => {
  const now = Date.now();
  const local = mkData(baseCat(), { dirs: [], groups: [], reasons: [] }, {}, { '扰乱课堂': now - 100000 });
  const remote = mkData(baseCat(), { dirs: [], groups: [], reasons: ['扰乱课堂'] }, { '扰乱课堂': now }, {});
  const m = smartMergeData(local, remote);
  eq(m.reasonCatalog['扣分']['课堂纪律'].indexOf('扰乱课堂'), -1, '新删除仍生效');
  eq(m.catDeleted.reasons.indexOf('扰乱课堂') >= 0, true, '墓碑保留');
});
t('无时间戳的纯旧数据 → 行为与 v2.17.30 一致（_v2174 兼容）', () => {
  const local = mkData({ '扣分': { '考勤': ['旷课'] } }, { dirs: [], groups: ['扣分|课堂纪律'], reasons: ['课堂违纪', '迟到早退'] }, {}, {});
  const remote = mkData(baseCat(), { dirs: [], groups: [], reasons: [] }, {}, {});
  const m = smartMergeData(local, remote);
  eq(!!m.reasonCatalog['扣分']['课堂纪律'], false, '旧删除语义不变');
  eq(!!m.reasonCatalog['扣分']['考勤'], true);
});
t('两侧墓碑时间戳取大者合并', () => {
  const local = mkData(baseCat(), { dirs: [], groups: [], reasons: [] }, { '旷课': 100 }, { '课堂违纪': 200 });
  const remote = mkData(baseCat(), { dirs: [], groups: [], reasons: [] }, { '旷课': 300 }, { '迟到早退': 50 });
  const m = smartMergeData(local, remote);
  eq(m.catDeletedAt['旷课'], 300);
  eq(m.catRevived['课堂违纪'], 200);
  eq(m.catRevived['迟到早退'], 50);
});

console.log('\n=== 五链路护栏（新字段） ===');
t('CLOUD_SYNC_FIELDS 含 catDeletedAt/catRevived', () => {
  has(html, "'catDeleted','catDeletedAt','catRevived',", '同步白名单');
});
t('state 默认含两 map', () => {
  has(html, 'catDeletedAt: {},   // v2.18.8', 'state 默认（注释为引入版本，不随升版盲替）');
  has(html, 'catRevived: {},     // v2.18.8', 'state 默认');
});
t('saveData 落盘两 map', () => {
  has(html, 'catDeletedAt: state.catDeletedAt || {}', 'saveData');
  has(html, 'catRevived: state.catRevived || {}', 'saveData');
});
t('loadData 读取 + 自愈过滤', () => {
  has(html, 'state.catDeletedAt = (d.catDeletedAt && typeof d.catDeletedAt', 'loadData');
  has(html, '_tomb = catTombReviveFilter(_tomb, state.catDeletedAt, state.catRevived)', '自愈');
});
t('catDeletedAdd / catDelUndo 记录时间戳', () => {
  has(html, 'state.catDeletedAt[key] = Date.now();', '删除记时');
  has(html, 'state.catRevived[key] = Date.now();', '重加记时');
  has(html, 'delete state.catDeletedAt[key];', '重加清删除时');
});
t('恢复预设清空时间戳', () => {
  has(html, 'state.catDeletedAt = {}; state.catRevived = {};', 'askResetReasonCatalog');
});

console.log('\n=== 版本 ===');
t('版本标记统一 v2.18.13', () => {
  has(html, '<div class="login-version">v2.18.13</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.13 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.13</span>', '设置徽标');
  has(fs.readFileSync('sw.js', 'utf8'), "CACHE_NAME = 'class-manager-v2.18.13'", 'SW');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
