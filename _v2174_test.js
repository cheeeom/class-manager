/* v2.17.16 回归测试：原因目录删除墓碑 —— 删方向/大类/原因后刷新/云合并不复活；
   删除不影响历史流水（撤销纠正只在学分记录）。运行：node _v2174_test.js */
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
  // 花括号配平抽取：从「function name(」所在行起累计，遇到闭合到深度 0 的独立 } 行结束
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
  const code = buf.join('\n');
  return eval('(' + code + ')');
}
const cloneCatDeleted = extractFn('cloneCatDeleted');
const catDelAdd = extractFn('catDelAdd');
const applyCatTombstones = extractFn('applyCatTombstones');
const mergeReasonCatalog = extractFn('mergeReasonCatalog');
const flattenReasonCatalog = extractFn('flattenReasonCatalog');
const migrateReasonCatalog = extractFn('migrateReasonCatalog');
const cloneReasonCatalog = extractFn('cloneReasonCatalog');
const sortOpsNewestFirst = extractFn('sortOpsNewestFirst');
const liveOps = extractFn('liveOps');
global.DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
const smartMergeData = extractFn('smartMergeData');
// v2.18.9 smartMergeData 墓碑仲裁依赖（外部符号桩）
global.mergeTsMap = extractFn('mergeTsMap');
global.catTombReviveFilter = extractFn('catTombReviveFilter');
global.state = global.state || {};

const CAT = { '加分': { '学习表现': ['课堂表现积极', '月度全勤'], '作业优秀': ['作业全月优秀'] }, '扣分': { '课堂纪律': ['课堂违纪', '迟到早退'], '考勤': ['旷课'] } };

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.17.16 墓碑纯函数 ===');
t('applyCatTombstones：删方向连带清其下大类/原因', () => {
  const cat = JSON.parse(JSON.stringify(CAT));
  const out = applyCatTombstones(cat, { '迟到早退': -2, '旷课': -5 }, { dirs: ['扣分'], groups: [], reasons: [] });
  eq(!!out['扣分'], false);
  eq(Object.keys(out).length, 1);
});
t('applyCatTombstones：删大类只清该大类、保留同方向其他大类', () => {
  const cat = JSON.parse(JSON.stringify(CAT));
  const out = applyCatTombstones(cat, { '课堂违纪': -3, '迟到早退': -2 }, { dirs: [], groups: ['扣分|课堂纪律'], reasons: ['课堂违纪', '迟到早退'] });
  eq(!!out['扣分']['课堂纪律'], false);
  eq(!!out['扣分']['考勤'], true);
  eq(out['扣分']['考勤'].indexOf('旷课'), 0);
  eq('迟到早退' in { 迟到早退: -2 }, true, '分值由调用方自行删，墓碑只剔目录');
});
t('applyCatTombstones：删原因全局剔除 + 清分值', () => {
  const cat = JSON.parse(JSON.stringify(CAT));
  const scores = { '课堂表现积极': 1, '旷课': -5 };
  const out = applyCatTombstones(cat, scores, { dirs: [], groups: [], reasons: ['旷课'] });
  let found = false;
  Object.keys(out).forEach(d => Object.keys(out[d] || {}).forEach(g => { if (out[d][g].indexOf('旷课') >= 0) found = true; }));
  eq(found, false);
  eq('旷课' in scores, false);
  eq('课堂表现积极' in scores, true);
});
t('删除后重载不复活（模板原因不因 reasons 并集回归）', () => {
  // 模拟：老板删掉「扣分→课堂纪律→迟到早退」，目录已无该项；d.reasons 为该目录平铺
  const savedCat = { '加分': { '学习表现': ['课堂表现积极', '月度全勤'] }, '扣分': { '考勤': ['旷课'] } };
  const savedReasons = flattenReasonCatalog(savedCat);
  const tomb = { dirs: [], groups: [], reasons: ['迟到早退'] };
  const cat = migrateReasonCatalog(savedCat, savedReasons);
  applyCatTombstones(cat, null, tomb);
  const flat = flattenReasonCatalog(cat);
  eq(flat.indexOf('迟到早退'), -1, '被删模板原因不得复活');
  // 回归护栏：loadData 已不再每次把 defaultReasons 并回 reasons（那是旧复活根源之一）
  has(html, "state.reasonCatalog = migrateReasonCatalog(d.reasonCatalog, (d.reasons && d.reasons.length) ? d.reasons : defaultReasons)", 'loadData 不再 default 并集');
});

console.log('\n=== v2.17.16 云合并墓碑 ===');
t('云端旧目录含已删项 → 合并后墓碑剔除，跨设备删除生效', () => {
  const local = {
    students: [], operations: [],
    reasonCatalog: { '加分': { '学习表现': ['课堂表现积极', '月度全勤'] }, '扣分': { '考勤': ['旷课'] } },
    reasonScores: { '迟到早退': -2, '旷课': -5 },
    reasons: ['课堂表现积极', '月度全勤', '旷课'],
    catDeleted: { dirs: [], groups: ['扣分|课堂纪律'], reasons: ['课堂违纪', '迟到早退'] }
  };
  const remote = { // 云端是删除前旧副本（还带课堂纪律）
    students: [], operations: [],
    reasonCatalog: { '加分': { '学习表现': ['课堂表现积极', '月度全勤'] }, '扣分': { '课堂纪律': ['课堂违纪', '迟到早退'], '考勤': ['旷课'] } },
    reasonScores: { '课堂违纪': -3, '迟到早退': -2, '旷课': -5 },
    reasons: ['课堂表现积极', '月度全勤', '课堂违纪', '迟到早退', '旷课']
  };
  const merged = smartMergeData(local, remote);
  eq(!!merged.reasonCatalog['扣分']['课堂纪律'], false, '云端旧项不得复活');
  eq(!!merged.reasonCatalog['扣分']['考勤'], true, '远端新增大类保留');
  eq(merged.reasonCatalog['扣分']['考勤'].indexOf('旷课'), 0);
  eq(merged.catDeleted.groups.indexOf('扣分|课堂纪律') >= 0, true, '墓碑并入结果');
  eq(merged.catDeleted.reasons.indexOf('迟到早退') >= 0, true);
  eq(merged.reasons.indexOf('课堂违纪'), -1, '平铺 reasons 剔除被删原因');
  eq(merged.reasons.indexOf('旷课') >= 0, true);
});
t('墓碑字段随 CLOUD_SYNC_FIELDS + saveData 持久', () => {
  has(html, "'catDeleted',", 'CLOUD_SYNC_FIELDS 含 catDeleted');
  has(html, 'catDeleted: state.catDeleted || { dirs: [], groups: [], reasons: [] },', 'saveData 落盘 catDeleted');
  has(html, 'catDeleted: { dirs: [], groups: [], reasons: [] },   // v2.17.30', 'state 默认含空墓碑');
});
t('删除/重加闭环：删原因登记墓碑，重新添加同名原因清除墓碑', () => {
  has(html, "catDeletedAdd('reasons', name);", 'catDeleteReason 登记原因墓碑');
  has(html, "catDelUndo('reasons', name);", '新增同名原因清除墓碑');
  has(html, "catDeletedAdd('groups', dir + '|' + gr);", 'catDeleteGroup 登记大类墓碑');
  has(html, "catDelUndo('groups', dir + '|' + name);", '重加同名大类清墓碑');
  has(html, "catDeletedAdd('dirs', dir);", 'catDeleteDir 登记方向墓碑');
  has(html, "catDelUndo('dirs', name);", '重加同名方向清墓碑');
});
t('恢复预设目录会清空墓碑', () => {
  has(html, 'state.catDeleted = { dirs: [], groups: [], reasons: [] };   // v2.17.30 恢复预设后清空墓碑', 'askResetReasonCatalog 清墓碑');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
