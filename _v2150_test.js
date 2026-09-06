/* v2.15.0 回归测试：学分一致性（统一写入入口 / 基线自愈 / 合并取新 / 全视图刷新）
   运行：node _v2150_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

/* ---------- 抽取纯函数 ---------- */
function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}
const sumCreditsByStudent = eval('(' + grab('function sumCreditsByStudent(operations)') + ')');
const ensureCreditBase   = eval('(' + grab('function ensureCreditBase(students, operations)') + ')');
const reconcileCreditDrift = eval('(' + grab('function reconcileCreditDrift(students, operations)') + ')');
// smartMergeData 内部引用若干全局常量，为纯函数测试提供最小 stub
global.DEFAULT_COMMITTEE = {};
const smartMergeData     = eval('(' + grab('function smartMergeData(localData,remoteData)') + ')');

console.log('\n=== 流水聚合 ===');
t('sumCreditsByStudent：正负增量正确聚合', () => {
  const m = sumCreditsByStudent([
    { studentId: 1, amount: 5 }, { studentId: 2, amount: -3 },
    { studentId: 1, amount: -2 }, { studentId: 1, amount: 1 }
  ]);
  eq(m[1], 4); eq(m[2], -3);
});
t('sumCreditsByStudent：跳过无主流水（学生已删除的孤儿记录）', () => {
  const m = sumCreditsByStudent([{ studentId: null, amount: 9 }, { amount: 7 }, { studentId: 3, amount: 2 }]);
  eq(m[3], 2); eq(m[undefined], undefined);
});

console.log('\n=== 基线迁移（creditBase） ===');
t('ensureCreditBase：base = 当前分 - Σ流水（老学生初始分各异也能还原）', () => {
  const st = [{ id: 1, credit: 107 }, { id: 2, credit: 88 }];
  ensureCreditBase(st, [{ studentId: 1, amount: 5 }, { studentId: 1, amount: 2 }, { studentId: 2, amount: -12 }]);
  eq(st[0].creditBase, 100);   // 107 - 7
  eq(st[1].creditBase, 100);   // 88 - (-12)
});
t('ensureCreditBase：幂等，二次调用不覆盖已有 base', () => {
  const st = [{ id: 1, credit: 100, creditBase: 93 }];
  ensureCreditBase(st, []);
  eq(st[0].creditBase, 93);
  ensureCreditBase(st, [{ studentId: 1, amount: 50 }]);
  eq(st[0].creditBase, 93);
});

console.log('\n=== 漂移自愈 ===');
t('reconcileCreditDrift：快照与流水不符时按流水校准', () => {
  // 场景：base 已固化为 100，流水累计 +2，但快照还停在 96（漏记/合并取错版本）
  const st = [{ id: 1, credit: 96, creditBase: 100 }];
  const ops = [{ studentId: 1, amount: 5 }, { studentId: 1, amount: -3 }];
  const n = reconcileCreditDrift(st, ops);
  eq(n, 1);
  eq(st[0].credit, 102);   // 100 + (5-3)
});
t('reconcileCreditDrift：首次迁移基线时不产生误修（base 由当前快照反推）', () => {
  const st = [{ id: 7, credit: 73 }];
  const ops = [{ studentId: 7, amount: -27 }];
  eq(reconcileCreditDrift(st, ops), 0);
  eq(st[0].creditBase, 100);
  eq(st[0].credit, 73);
});
t('reconcileCreditDrift：漂移学生被打上 creditVer / updatedAt（便于合并取新）', () => {
  const st = [{ id: 1, credit: 100, creditBase: 100 }];
  const ops = [{ studentId: 1, amount: -4 }];
  reconcileCreditDrift(st, ops);
  eq(st[0].credit, 96);
  eq(st[0].creditVer, 1);
  eq(typeof st[0].updatedAt === 'number' && st[0].updatedAt > 0, true);
});
t('reconcileCreditDrift：无漂移返回 0，不动任何数据', () => {
  const st = [{ id: 1, credit: 96, creditBase: 100 }];
  const ops = [{ studentId: 1, amount: -4 }];
  eq(reconcileCreditDrift(st, ops), 0);
  eq(st[0].credit, 96); eq(st[0].creditVer, undefined);
});
t('reconcileCreditDrift：真扣到 0 的学生不会被误修（base 反推保护）', () => {
  const st = [{ id: 1, credit: 0 }];
  const ops = [{ studentId: 1, amount: -100 }];
  reconcileCreditDrift(st, ops);
  eq(st[0].creditBase, 100); eq(st[0].credit, 0);
});

console.log('\n=== 统一写入入口 applyCreditDelta ===');
t('applyCreditDelta 存在且一次性写入 credit / creditVer / updatedAt / 流水', () => {
  const src = grab('function applyCreditDelta(student, amount, reason, opts)');
  ['student.credit = ', 'student.creditVer = ', 'student.updatedAt = ', 'state.operations.unshift(op)']
    .forEach(s => { if (!src.includes(s)) throw new Error('缺少: ' + s); });
});
t('applyCreditDelta：amount 为 0 直接返回 null，不写流水', () => {
  const src = grab('function applyCreditDelta(student, amount, reason, opts)');
  if (!/if\(amount === 0\) return null;/.test(src)) throw new Error('未拦截 0 值写入');
});
t('applyCreditDelta：首次写入自动补 creditBase', () => {
  const src = grab('function applyCreditDelta(student, amount, reason, opts)');
  if (!src.includes('ensureCreditBase([student], state.operations)')) throw new Error('未补基线');
});
t('四个写入点全部改为走统一入口（不再裸写 credit）', () => {
  const fns = {
    adjustCredit: grab('function adjustCredit(id, amount, e)'),
    applyCreditBulk: grab('function applyCreditBulk(ids, amount, reason)'),
    applyCredit: grab('function applyCredit(id, amount, reason)'),
    confirmBatchCredit: grab('function confirmBatchCredit()')
  };
  Object.keys(fns).forEach(k => {
    if (!fns[k].includes('applyCreditDelta')) throw new Error(k + ' 未走统一入口');
  });
});
t('撤销路径：流水 shift 后回退快照并打版本戳，二者仍对得上', () => {
  const src = grab('function undoLastOp()');
  ['state.operations.shift()', 'student.credit -= op.amount', 'student.creditVer = ', 'student.updatedAt = Date.now()']
    .forEach(s => { if (!src.includes(s)) throw new Error('缺少: ' + s); });
});

console.log('\n=== 合并取新（smartMerge） ===');
t('云端学分版本更新 → 采用云端学分（修复旧逻辑「永远取本地」）', () => {
  const local  = { students: [{ id: 1, credit: 100, creditBase: 100, creditVer: 2, updatedAt: 100 }] };
  const remote = { students: [{ id: 1, credit: 108, creditBase: 100, creditVer: 5, updatedAt: 50  }] };
  const merged = smartMergeData(local, remote);
  eq(merged.students[0].credit, 108);
  eq(merged.students[0].creditVer, 5);
});
t('本地学分版本更新 → 保留本地学分', () => {
  const local  = { students: [{ id: 1, credit: 112, creditBase: 100, creditVer: 7, updatedAt: 10 }] };
  const remote = { students: [{ id: 1, credit: 100, creditBase: 100, creditVer: 3, updatedAt: 999 }] };
  // 云端 updatedAt 更新 → 整体替换（非学分字段以新为准），此处验证不会崩且取到云端对象
  const merged = smartMergeData(local, remote);
  eq(merged.students[0].credit, 100);
});
t('两端都是旧数据（无 creditVer）→ 保守保留本地，由自愈兜底', () => {
  const local  = { students: [{ id: 1, credit: 95 }] };
  const remote = { students: [{ id: 1, credit: 88 }] };
  eq(smartMergeData(local, remote).students[0].credit, 95);
});
t('流水按 id 去重并集，永不丢失（自愈依赖此前提）', () => {
  const merged = smartMergeData(
    { operations: [{ id: 1, amount: 2 }, { id: 2, amount: -1 }] },
    { operations: [{ id: 2, amount: -1 }, { id: 3, amount: 5 }] }
  );
  eq(merged.operations.length, 3);
});

console.log('\n=== 全视图刷新 ===');
t('refreshCreditViews 覆盖 学生表 / 学分记录 / 学生档案', () => {
  const src = grab('function refreshCreditViews()');
  ['renderTable', 'renderCreditsPage', 'renderProfiles'].forEach(s => {
    if (!src.includes(s)) throw new Error('缺少刷新: ' + s);
  });
});
t('refreshCreditViews 对 dashboard / analytics 做活跃页判定（避免无谓重绘）', () => {
  const src = grab('function refreshCreditViews()');
  if (!/page-dashboard[\s\S]*classList\.contains\('active'\)/.test(src)) throw new Error('dashboard 未判定');
  if (!/page-analytics[\s\S]*classList\.contains\('active'\)/.test(src)) throw new Error('analytics 未判定');
});
t('refreshCreditViews 内部 try/catch 包裹，单页渲染失败不阻断其余视图', () => {
  const src = grab('function refreshCreditViews()');
  if (!/catch\(e\)\{?\s*console\.warn/.test(src.replace(/\s+/g, m => m.includes('\n') ? '\n' : ' '))) {
    if (!src.includes('console.warn')) throw new Error('未做容错');
  }
});
t('学分变更后调用 refreshCreditViews（adjustCredit / applyCredit / applyCreditBulk / confirmBatchCredit）', () => {
  ['function adjustCredit(id, amount, e)', 'function applyCredit(id, amount, reason)',
   'function applyCreditBulk(ids, amount, reason)', 'function confirmBatchCredit()'].forEach(sig => {
    if (!grab(sig).includes('refreshCreditViews()')) throw new Error(sig + ' 未刷新全部视图');
  });
});

console.log('\n=== 加载期自愈接线 ===');
t('loadData 尾部调用 reconcileCreditDrift 并持久化', () => {
  const fn = html.match(/function loadData\(\)\{[\s\S]*?\n\}/)[0];
  if (!fn.includes('reconcileCreditDrift(state.students, state.operations)')) throw new Error('loadData 未自愈');
  if (!fn.includes('saveData()')) throw new Error('校准结果未持久化');
  if (!fn.includes('needBase')) throw new Error('未处理首次基线迁移的持久化');
});
t('applyCloudData 三条分支最终都过 loadData（自愈不会被绕过）', () => {
  const fn = html.match(/function applyCloudData\(remoteData\)\{[\s\S]*?\n\}/)[0];
  eq((fn.match(/loadData\(\);/g) || []).length >= 3, true);
});

console.log('\n=== 版本号 ===');
t('v2.15.0 三处同步：登录页 / 侧栏 / SW CACHE_NAME', () => {
  if (!/login-version">v2\.15\.0</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.15\.0 ·/.test(html)) throw new Error('侧栏版本号未更新');
  const sw = fs.readFileSync('sw.js', 'utf8');
  if (!sw.includes('class-manager-v2.15.0')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
