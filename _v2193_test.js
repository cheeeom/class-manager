/* v2.18.13 回归测试：往隐式重建的大类里添加原因 → 大类/方向同步 revive，
   云端旧大类墓碑不再在推送前合并/拉取时把整组连同新原因一起抹掉。
   运行：node _v2193_test.js */
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
global.sortOpsNewestFirst = function (ops) { return ops || []; };
global.liveOps = function (ops) { return ops || []; };
global.state = {};
global.DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
const smartMergeData = extractFn('smartMergeData');

/* ---- 行为级沙箱：真跑 catSaveNewItem（隐式建大类 + 加原因） ---- */
function freshState() {
  global.state = {
    reasonCatalog: { '扣分': { '考勤': ['旷课'] } },   // 课堂纪律已被抹掉
    reasonScores: { '旷课': -5 },
    reasons: ['旷课'],
    catDeleted: { dirs: [], groups: [], reasons: [] },
    catDeletedAt: {}, catRevived: {}
  };
  return global.state;
}
function buildCatSaveNewItem() {
  const els = {};
  const el = id => els[id] || (els[id] = { value: '', style: {}, innerHTML: '', textContent: '' });
  els['catDirSel'] = { value: '扣分' };
  els['catGroupSel'] = { value: '__new__' };
  els['catNewGroupInput'] = { value: '课堂纪律' };
  els['catNameInput'] = { value: '上课讲话' };
  els['catScoreInput'] = { value: '-2' };
  const sandbox = new Function(
    'state', 'document', 'flattenReasonCatalog', 'catDelUndo', 'closeModal', 'catRefresh', 'showToast',
    extractFnSource('catSaveNewItem') + '\nreturn catSaveNewItem;'
  );
  return sandbox(
    global.state,
    { getElementById: el },
    flattenReasonCatalog,
    function (kind, key) {   // 真·catDelUndo 逻辑（内联，等价 index.html 实现）
      const t = state.catDeleted;
      if (t && t[kind]) { const i = t[kind].indexOf(key); if (i >= 0) t[kind].splice(i, 1); }
      if (!state.catDeletedAt) state.catDeletedAt = {};
      if (!state.catRevived) state.catRevived = {};
      delete state.catDeletedAt[key];
      state.catRevived[key] = Date.now();
    },
    () => {}, () => {}, () => {}
  );
}
function extractFnSource(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return buf.join('\n');
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== 行为级：catSaveNewItem 隐式建大类 ===');
t('★隐式建大类加原因 → 大类与方向都记 revive、清墓碑', () => {
  const st = freshState();
  // 预置云端同步下来的旧墓碑（本地已被坏合并写回）
  st.catDeleted.groups.push('扣分|课堂纪律');
  st.catDeleted.reasons.push('上课讲话');
  const catSaveNewItem = buildCatSaveNewItem();
  catSaveNewItem();
  eq(st.reasonCatalog['扣分']['课堂纪律'].indexOf('上课讲话'), 0, '原因已加入');
  eq(st.catDeleted.groups.indexOf('扣分|课堂纪律'), -1, '大类墓碑已清');
  eq(st.catDeleted.reasons.indexOf('上课讲话'), -1, '原因墓碑已清');
  eq(st.catRevived['扣分|课堂纪律'] > 0, true, '大类记 revive');
  eq(st.catRevived['上课讲话'] > 0, true, '原因记 revive');
  eq(st.catRevived['扣分'] > 0, true, '方向记 revive');
});

console.log('\n=== 端到端：加完 → 推送前合并 → 拉取，整组存活 ===');
t('★推送前合并（云端旧大类墓碑）不再抹组、不再把墓碑推上云', () => {
  const st = freshState();
  st.catDeleted.groups.push('扣分|课堂纪律');
  const catSaveNewItem = buildCatSaveNewItem();
  catSaveNewItem();
  // 推送前合并：ctx.remote 是云端旧副本（带墓碑、无该组）
  const remote = {
    students: [], operations: [],
    reasonCatalog: { '扣分': { '考勤': ['旷课'] } },
    reasonScores: { '旷课': -5 }, reasons: ['旷课'],
    catDeleted: { dirs: [], groups: ['扣分|课堂纪律'], reasons: [] },
    catDeletedAt: {}, catRevived: {}
  };
  const payload = smartMergeData(JSON.parse(JSON.stringify(st)), remote);
  eq(!!payload.reasonCatalog['扣分']['课堂纪律'], true, '推送载荷里大类必须在');
  eq(payload.reasonCatalog['扣分']['课堂纪律'].indexOf('上课讲话'), 0, '新原因必须在载荷里');
  eq(payload.catDeleted.groups.indexOf('扣分|课堂纪律'), -1, '作废墓碑不得推上云');
});
t('★刷新拉取合并：整组与新原因保留', () => {
  const local = {
    students: [], operations: [],
    reasonCatalog: { '扣分': { '课堂纪律': ['上课讲话'], '考勤': ['旷课'] } },
    reasonScores: { '上课讲话': -2, '旷课': -5 }, reasons: ['上课讲话', '旷课'],
    catDeleted: { dirs: [], groups: [], reasons: [] },
    catDeletedAt: {}, catRevived: { '扣分|课堂纪律': Date.now(), '上课讲话': Date.now(), '扣分': Date.now() }
  };
  const remote = {
    students: [], operations: [],
    reasonCatalog: { '扣分': { '考勤': ['旷课'] } },
    reasonScores: { '旷课': -5 }, reasons: ['旷课'],
    catDeleted: { dirs: [], groups: ['扣分|课堂纪律'], reasons: ['上课讲话'] },
    catDeletedAt: {}, catRevived: {}
  };
  const m = smartMergeData(local, remote);
  eq(!!m.reasonCatalog['扣分']['课堂纪律'], true, '大类保留');
  eq(m.reasonCatalog['扣分']['课堂纪律'].indexOf('上课讲话'), 0, '新原因保留');
  eq(m.catDeleted.groups.indexOf('扣分|课堂纪律'), -1, '大类墓碑作废');
  eq(m.catDeleted.reasons.indexOf('上课讲话'), -1, '原因墓碑作废');
});
t('删除晚于重加 → 仍照常删除（v2.18.8 语义不回退）', () => {
  const now = Date.now();
  const local = {
    students: [], operations: [],
    reasonCatalog: { '扣分': { '课堂纪律': ['上课讲话'], '考勤': ['旷课'] } },
    reasonScores: {}, reasons: ['上课讲话', '旷课'],
    catDeleted: { dirs: [], groups: [], reasons: [] },
    catDeletedAt: {}, catRevived: { '扣分|课堂纪律': now - 100000 }
  };
  const remote = {
    students: [], operations: [],
    reasonCatalog: { '扣分': { '考勤': ['旷课'] } },
    reasonScores: {}, reasons: ['旷课'],
    catDeleted: { dirs: [], groups: ['扣分|课堂纪律'], reasons: [] },
    catDeletedAt: { '扣分|课堂纪律': now }, catRevived: {}
  };
  const m = smartMergeData(local, remote);
  eq(!!m.reasonCatalog['扣分']['课堂纪律'], false, '新删除仍生效');
  eq(m.catDeleted.groups.indexOf('扣分|课堂纪律') >= 0, true, '墓碑保留');
});

console.log('\n=== 源码护栏 ===');
t('catSaveNewItem 含 groups+dirs revive', () => {
  const src = extractFnSource('catSaveNewItem');
  has(src, "catDelUndo('groups', dir + '|' + group)", '大类 revive');
  has(src, "catDelUndo('dirs', dir)", '方向 revive');
});
t('openReasonGroupModal 新增大类含 dirs revive', () => {
  const src = extractFnSource('openReasonGroupModal');
  has(src, "catDelUndo('groups', dir + '|' + name)", '大类 revive');
  has(src, "catDelUndo('dirs', dir)", '方向 revive');
  has(src, 'catRefresh();', '保存链完整（catRefresh 未丢）');
});
t('版本标记统一 v2.18.13', () => {
  has(html, '<div class="login-version">v2.18.14</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.14 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.14</span>', '设置徽标');
  has(fs.readFileSync('sw.js', 'utf8'), "CACHE_NAME = 'class-manager-v2.18.14'", 'SW');
});
t('近版更新速览含新条', () => {
  has(html, '隐式新建大类/方向时同步清除其旧删除记录', 'notes');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
