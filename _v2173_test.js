/* v2.17.9 回归测试：流水软删撤销 —— 撤销=打 revoked 标记，学分按有效流水重算，
   撤销状态随云端合并传播（任何设备/校准都不复活已撤流水）。
   运行：node _v2173_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.17.9 撤销语义纯函数 ===');
const liveOps = eval('(' + grab('function liveOps(ops)') + ')');
const sumCreditsByStudent = eval('(' + grab('function sumCreditsByStudent(operations)') + ')');
const ensureCreditBase = eval('(' + grab('function ensureCreditBase(students, operations)') + ')');
const reconcileCreditDrift = eval('(' + grab('function reconcileCreditDrift(students, operations)') + ')');
const sortOpsNewestFirst = eval('(' + grab('function sortOpsNewestFirst(ops)') + ')');   // smartMergeData 依赖
global.DEFAULT_COMMITTEE = {};   // smartMergeData 内部引用的最小 stub
const smartMergeData = eval('(' + grab('function smartMergeData(localData,remoteData)') + ')');
// v2.18.8 smartMergeData 墓碑仲裁依赖（外部符号桩）
global.mergeTsMap = eval('(' + grab('function mergeTsMap(a, b)') + ')');
global.catTombReviveFilter = eval('(' + grab('function catTombReviveFilter(tomb, delAt, revived)') + ')');
global.state = global.state || {};
// v2.17.16 smartMergeData 删除墓碑依赖（抽取自 index.html 真实实现）
const cloneCatDeleted = eval('(' + grab('function cloneCatDeleted(t)') + ')');
const catDelAdd = eval('(' + grab('function catDelAdd(list, key)') + ')');
const applyCatTombstones = eval('(' + grab('function applyCatTombstones(cat, scores, tomb)') + ')');
const flattenReasonCatalog = eval('(' + grab('function flattenReasonCatalog(cat)') + ')');
t('liveOps 过滤 revoked、保留有效流水（不改原数组）', () => {
  const ops = [
    { id: 1, amount: -10, state: 'revoked', stateTime: 100 },
    { id: 2, amount: -7 },
    { id: 3, amount: 3, state: 'ok' }
  ];
  const out = liveOps(ops);
  eq(out.length, 2);
  eq(out[0].id, 2);
  eq(ops.length, 3, '入参不应被改');
});
t('sumCreditsByStudent 不计已撤销流水', () => {
  const sums = sumCreditsByStudent([
    { id: 1, studentId: 5, amount: -10, state: 'revoked' },
    { id: 2, studentId: 5, amount: -7 },
    { id: 3, studentId: 6, amount: 3 }
  ]);
  eq(sums[5], -7);
  eq(sums[6], 3);
});
t('撤销核心结构：revokeCreditOp 打标记 + afterOpStateChange（reconcile 重算学分）', () => {
  const rv = grab('function revokeCreditOp(opId)');
  ["op.state = 'revoked'", 'op.stateTime = Date.now()', 'afterOpStateChange()'].forEach(s => { if (!rv.includes(s)) throw new Error('revokeCreditOp 缺少: ' + s); });
  const rs = grab('function restoreCreditOp(opId)');
  ["op.state = 'ok'", 'op.stateTime = Date.now()', 'afterOpStateChange()'].forEach(s => { if (!rs.includes(s)) throw new Error('restoreCreditOp 缺少: ' + s); });
  const ac = grab('function afterOpStateChange()');
  ['reconcileCreditDrift(state.students, state.operations)', 'saveData()', 'refreshCreditViews()'].forEach(s => { if (!ac.includes(s)) throw new Error('afterOpStateChange 缺少: ' + s); });
});
t('学分核算链路：reconcileCreditDrift 用有效流水（撤销后 credit 自动回补）', () => {
  const reconcileCreditDrift = eval('(' + grab('function reconcileCreditDrift(students, operations)') + ')');
  const ensureCreditBase = eval('(' + grab('function ensureCreditBase(students, operations)') + ')');
  const st = [{ id: 5, name: '黄丽萍', credit: 100, creditBase: 100, creditVer: 0 }];
  const ops = [
    { id: 1, studentId: 5, amount: -10, reason: '违禁品烟酒手机', time: 1 },
    { id: 2, studentId: 5, amount: -10, reason: '违禁品烟酒手机', state: 'revoked', stateTime: 2, time: 2 }
  ];
  // 先降分（模拟扣过两次）
  st[0].credit = 80; ensureCreditBase(st, ops);
  // reconcile 只看有效流水：100 + (-10) = 90（撤销的那笔 -10 不计）
  const fixed = reconcileCreditDrift(st, ops);
  eq(fixed, 1);
  eq(st[0].credit, 90, '撤销后学分应回补到 90');
});
t('undoLastOp 撤销的是最新一笔有效操作（跳过已撤销）', () => {
  const src = grab('function undoLastOp()');
  if (!src.includes('liveOps(state.operations)')) throw new Error('未按有效流水找最新');
  if (!src.includes('revokeCreditOp(live[0].id)')) throw new Error('未复用 revokeCreditOp');
  // 模拟：两条扣分，最新一条已撤销 → undoLastOp 应指向更早那条
  const st = [{ id: 5, credit: 100, creditBase: 100, creditVer: 0, updatedAt: 0 }];
  const ops = [
    { id: 11, studentId: 5, amount: -7, reason: '课堂违纪', time: 100 },
    { id: 12, studentId: 5, amount: -10, reason: '违禁品烟酒手机', state: 'revoked', stateTime: 200, time: 200 }
  ];
  reconcileCreditDrift(st, ops);
  eq(st[0].credit, 93, '已撤 -10 不计，剩 -7 → 93');
});

console.log('\n=== v2.17.9 云端合并撤销传播（根治复活） ===');
t('本地已撤销 + 云端仍是无标记旧流水 → 合并后保持已撤销（不复活）', () => {
  const local  = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, reason: '违禁品烟酒手机', time: 1, state: 'revoked', stateTime: 500 }] };
  const remote = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, reason: '违禁品烟酒手机', time: 1 }] };  // 云端还是旧版
  const merged = smartMergeData(local, remote);
  eq(merged.operations.length, 1);
  eq(merged.operations[0].state, 'revoked', '本地撤销应保留，云端校准不得复活');
});
t('云端(别的设备)撤销过 + 本地无标记 → 合并采用撤销态（撤销跨设备生效）', () => {
  const local  = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, time: 1 }] };
  const remote = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, time: 1, state: 'revoked', stateTime: 900 }] };
  const merged = smartMergeData(local, remote);
  eq(merged.operations[0].state, 'revoked', '远端撤销应传到本机');
  eq(merged.operations[0].stateTime, 900);
});
t('两端口径一致（都未撤销）时合并不覆盖、不丢 op', () => {
  const local  = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, time: 1 }] };
  const remote = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, time: 1 }, { id: 10, studentId: 5, amount: 3, time: 2 }] };
  const merged = smartMergeData(local, remote);
  eq(merged.operations.length, 2);
  eq(merged.operations[0].id, 10, '最新在前');
});
t('恢复（本地 ok + stateTime 更新）能跨设备传播', () => {
  const local  = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, time: 1, state: 'revoked', stateTime: 300 }] };
  const remote = { students: [], operations: [{ id: 9, studentId: 5, amount: -10, time: 1, state: 'ok', stateTime: 900 }] };  // 另一台设备点了恢复
  const merged = smartMergeData(local, remote);
  eq(merged.operations[0].state, 'ok', '恢复应跨设备生效（stateTime 取新）');
});

console.log('\n=== v2.17.9 消费点排除已撤销流水 ===');
t('时间线/详情/公示/月度/首页 均按 revoked 过滤', () => {
  const checks = [
    ['function renderCreditsTimeline()', 'liveOps(state.operations)'],
    ['function openDetailPanel(id)', "!(o.state==='revoked')"],
    ['function renderProgressList()', "!(o.state==='revoked')"],
    ['function monthlySettlePlan(nowTs)', 'liveOps(state.operations)'],
    ['function computePublicityData(students, operations, rangeKind, nowDate)', "!(o.state === 'revoked')"],
    ['function normalizeInitialCredits(students, operations)', 'liveOps(operations)']
  ];
  checks.forEach(([fnSig, marker]) => {
    const src = grab(fnSig);
    if (!src.includes(marker)) throw new Error(fnSig + ' 未排除已撤销: 缺 ' + marker);
  });
});
t('时间线条目带逐条撤销按钮（onclick=revokeCreditOp，id 数字安全）', () => {
  const src = grab('function renderOpItem(op)');
  if (!src.includes('revokeCreditOp(')) throw new Error('renderOpItem 缺撤销按钮');
  if (!/revokeCreditOp\(\$\{Number\(op\.id\)\}\)/.test(src)) throw new Error('撤销按钮未用 Number(op.id)');
});
t('撤销抽屉 renderRevokedDrawer 展示已撤销并可恢复', () => {
  const src = grab('function renderRevokedDrawer()');
  if (!src.includes("o.state === 'revoked'")) throw new Error('未筛选已撤销流水');
  if (!src.includes('restoreCreditOp(')) throw new Error('抽屉缺恢复按钮');
  const tl = grab('function renderCreditsTimeline()');
  if (!tl.includes('renderRevokedDrawer()')) throw new Error('时间线渲染未带抽屉');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
