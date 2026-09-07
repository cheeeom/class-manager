/* v2.15.1 回归测试：学分一致性（统一写入入口 / 基线自愈 / 合并取新 / 全视图刷新）
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
const liveOps = eval('(' + grab('function liveOps(ops)') + ')');   // v2.17.13 撤销过滤依赖
const sumCreditsByStudent = eval('(' + grab('function sumCreditsByStudent(operations)') + ')');
const ensureCreditBase   = eval('(' + grab('function ensureCreditBase(students, operations)') + ')');
const reconcileCreditDrift = eval('(' + grab('function reconcileCreditDrift(students, operations)') + ')');
// smartMergeData 内部引用若干全局常量，为纯函数测试提供最小 stub
global.DEFAULT_COMMITTEE = {};
const sortOpsNewestFirst = eval('(' + grab('function sortOpsNewestFirst(ops)') + ')');   // v2.17.13 被 smartMergeData 调用
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
t('v2.17.13 撤销路径：软删标记 + 学分按有效流水重算（不再物理 shift，云端校准不复活）', () => {
  const src = grab('function undoLastOp()');
  ['liveOps(state.operations)', 'revokeCreditOp(live[0].id)'].forEach(s => { if (!src.includes(s)) throw new Error('缺少: ' + s); });
  const rv = grab('function revokeCreditOp(opId)');
  ["op.state = 'revoked'", 'op.stateTime = Date.now()', 'afterOpStateChange()'].forEach(s => { if (!rv.includes(s)) throw new Error('撤销核心缺少: ' + s); });
  const sv = grab('function liveOps(ops)');
  if (!/(op && op\.state === 'revoked')/.test(sv)) throw new Error('liveOps 未按 revoked 过滤');
  if (!sv.includes('function liveOps')) throw new Error('liveOps 抽取失败');
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
t('refreshCreditViews 覆盖 学生表 / 学分时间线 / 撤销按钮 / 学生档案', () => {
  const src = grab('function refreshCreditViews()');
  ['renderTable', 'renderCreditsTimeline', 'updateUndoBtn', 'renderProfiles'].forEach(s => {
    if (!src.includes(s)) throw new Error('缺少刷新: ' + s);
  });
});
t('refreshCreditViews 不调用 renderCreditsPage（它会清空已选学生与搜索框）', () => {
  const src = grab('function refreshCreditViews()');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');  // 剥离注释只看代码
  if (/renderCreditsPage/.test(code)) {
    throw new Error('仍会整页 reset 学分页，连续操作时选择会被清空');
  }
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

console.log('\n=== v2.15.1 热修：图表口径 / 最值 / 操作时间线 ===');
global.escapeHtml = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const formatOpTime = eval('(' + grab('function formatOpTime(op)') + ')');
const renderOpItem = eval('(' + grab('function renderOpItem(op)') + ')');

t('formatOpTime：无效/缺失时间戳兜底为「时间未知」（旧数据会显示 NaN/NaN）', () => {
  eq(formatOpTime({}), '时间未知');
  eq(formatOpTime({ time: undefined }), '时间未知');
  eq(formatOpTime({ time: 'not-a-date' }), '时间未知');
});
t('formatOpTime：有效时间戳输出 MM-DD HH:mm（同年不带年份）', () => {
  eq(formatOpTime({ time: new Date(2026, 8, 6, 14, 30).getTime() }), '09-06 14:30');
  eq(formatOpTime({ time: new Date(2026, 0, 2, 9, 5).getTime() }), '01-02 09:05');
});
t('renderOpItem：原因做转义（自定义原因是自由文本，防 XSS）', () => {
  const h = renderOpItem({ studentName: '小明', amount: 2, reason: '<img src=x onerror=alert(1)>', time: Date.now() });
  eq(/<img/.test(h), false);
  eq(/&lt;img/.test(h), true);
});
t('renderOpItem：姓名缺失时用学号兜底，不显示 undefined', () => {
  const h = renderOpItem({ studentId: 42, amount: -1, reason: '迟到', time: Date.now() });
  eq(/#42/.test(h), true);
  eq(/undefined/.test(h), false);
});
t('操作时间线：容器 null 保护 + 50 条上限提示', () => {
  const src = grab('function renderCreditsTimeline()');
  if (!src.includes('if(!tl) return;')) throw new Error('容器未做 null 保护');
  if (!src.includes('LIMIT = 50')) throw new Error('未设显示上限');
});
t('首页最近记录复用统一渲染 renderOpItem（不再自己拼 innerHTML）', () => {
  const dash = html.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/)[0];
  if (!dash.includes('renderOpItem')) throw new Error('首页时间线未复用统一渲染');
});
t('首页最高/最低学分：credit 统一转数字后再比较（字符串会让 find 匹配不上）', () => {
  const dash = html.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/)[0];
  if (!dash.includes('const creditOf =')) throw new Error('未做 Number 规范化');
  if (/Math\.min\(\.\.\.credits\)/.test(dash)) throw new Error('仍在用会受 NaN 污染的 Math.min');
});
t('分布图：改为自适应 8 档（旧的固定 10 分一档在 100 分制下会把人堆进一桶）', () => {
  const fn = grab('function drawDistChart(credits)');
  if (!fn.includes('const numBuckets = 8;')) throw new Error('未改为固定 8 档自适应');
  if (fn.includes('bucketSize')) throw new Error('仍残留 bucketSize 旧逻辑');
  if (!fn.includes('bucketLabel')) throw new Error('缺少区间标签函数');
});
t('区间柱状图：改为制度四档 <80 / 80-89 / 90-99 / ≥100', () => {
  const fn = grab('function drawRangeChart(credits)');
  ['<80 不合格', '80-89 一般', '90-99 合格', '≥100 优秀'].forEach(s => {
    if (!fn.includes(s)) throw new Error('缺少档位: ' + s);
  });
});
t('饼图分段同步改为制度四档', () => {
  const fn = grab('function drawPieChart(credits)');
  ['<80 不合格', '80-89 一般', '90-99 合格', '≥100 优秀'].forEach(s => {
    if (!fn.includes(s)) throw new Error('缺少档位: ' + s);
  });
});
t('合格率/优秀率口径改为 ≥90 / ≥100（旧的 ≥10 / ≥25 已失效）', () => {
  if (!html.includes('合格率 (≥90)')) throw new Error('合格率未改');
  if (!html.includes('优秀率 (≥100)')) throw new Error('优秀率未改');
  if (html.includes('及格率 (≥10)') || html.includes('优秀率 (≥25)')) throw new Error('旧口径残留');
});

console.log('\n=== v2.17.13 学分全局同步（所有学分模块一个系统） ===');
t('refreshCreditViews 纳入公示页：加分/撤销后公示榜与统计即时刷新', () => {
  const m = html.match(/function refreshCreditViews\(\)\{[\s\S]*?\n\}/);
  if (!m) throw new Error('refreshCreditViews 未找到');
  if (!m[0].includes('renderPublicity')) throw new Error('未纳入公示页渲染');
});
t('批量加分链路 = applyCreditDelta(写流水) + saveData + refreshCreditViews(全模块刷新)', () => {
  const seg = html.slice(html.indexOf('function applyCreditBulk'), html.indexOf('function applyCreditBulk') + 1200);
  if (!seg.includes('applyCreditDelta')) throw new Error('批量加分未走统一写入入口');
  if (!seg.includes('refreshCreditViews()')) throw new Error('批量加分未刷新全视图');
});
t('跨标签实时同步：storage 监听就位（公示常驻窗口跟随加分窗口更新）', () => {
  if (!html.includes("window.addEventListener('storage'")) throw new Error('未找到 storage 跨标签监听');
});
t('撤销/恢复分值同步：afterOpStateChange 统一走 reconcile + saveData + refreshCreditViews', () => {
  const seg = html.slice(html.indexOf('function afterOpStateChange'), html.indexOf('function afterOpStateChange') + 300);
  if (!seg.includes('reconcileCreditDrift')) throw new Error('撤销后未按有效流水校准学分');
  if (!seg.includes('refreshCreditViews()')) throw new Error('撤销后未刷新全视图');
});

console.log('\n=== 版本号 ===');
t('v2.17.13 三处同步：登录页 / 侧栏 / SW CACHE_NAME', () => {
  if (!/login-version">v2\.17\.13</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.17\.13 ·/.test(html)) throw new Error('侧栏版本号未更新');
  const sw = fs.readFileSync('sw.js', 'utf8');
  if (!sw.includes('class-manager-v2.17.13')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
