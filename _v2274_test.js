// _v2274_test.js — v2.27.4：值日「重新分组」支持随机安排
//
// 老板原话（2026-10-02）：「值周安排中的重新分组要支持随机安排，不用按学号分组」
// 岔路口已问过（两个按钮都留 / 轮值队列先不动）：
//   ①「🎲 随机分组」 = dutyRescheduleShuffle() → dutyReschedule('shuffle')
//   ②「按学号分组」  = dutyRescheduleAll()     → dutyReschedule('sid')   ← 旧名字与 () 签名保留
//
// 本套的三层判据：
//   ① 版本一致性（版本无关：从 sw.js 的 CACHE_NAME 反推，下次跟版零成本）
//   ② dutyShuffleIds 真跑 —— 多重集守恒 / 就地改 / 边界 / **无偏性**（Fisher-Yates 写法）
//   ③ dutyReschedule 真跑（带 mock 的沙箱）—— 两分支的 teamOrder 语义 / 复位字段 / 二次确认
//      / 空班短路 / 副作用次数 / toast 文案
//   ④ 端到端 —— 随机分组后 dutyTeamPlan 仍是「全班恰好一个划分」，且真的与按学号不同
//   ⑤ 🔑 随机结果**必须能活下来** —— dutySyncTeamOrder 不得把它按学号重排（否则刷新即白随机）
//   ⑥ 接线 —— 两个按钮的 onclick / 空状态按钮 / 旧文案查无
//   ⑦ 契约保全 —— 轮值队列仍按学号、dutyTeamPlan([]) 仍回落按学号、_v2240_test.js 的锚点仍在
//   ⑧ 事故哨兵 —— v2.27.4 补丁曾把 dutySwapOrder 尾部与 dutyGoRoundStart 削掉过
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const failures = [];
function log(okc, msg) {
  if (okc) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function has(t, s, msg) { const c = String(t).indexOf(s) >= 0; log(c, msg + (c ? '' : '\u300c\u7f3a ' + JSON.stringify(String(s).slice(0, 80)) + '\u300d')); }
function notHas(t, s, msg) { const c = String(t).indexOf(s) < 0; log(c, msg + (c ? '' : '\u300c\u4e0d\u8be5\u6709 ' + JSON.stringify(String(s).slice(0, 80)) + '\u300d')); }
function eq(a, b, msg) { log(a === b, (msg || '') + '\uff08\u671f\u671b ' + JSON.stringify(b) + '\uff0c\u5b9e\u5f97 ' + JSON.stringify(a) + '\uff09'); }
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }
function braceFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('\u672a\u627e\u5230\u51fd\u6570 ' + name);
  let depth = 0, began = false, out = '';
  for (let k = i; k < html.length; k++) {
    const ch = html[k];
    out += ch;
    if (ch === '{') { depth++; began = true; }
    else if (ch === '}') { depth--; if (began && depth === 0) break; }
  }
  return out;
}
function constDecl(name) {
  const m = html.match(new RegExp('const ' + name + '\\s*=[^;]*;'));
  if (!m) throw new Error('\u672a\u627e\u5230\u5e38\u91cf ' + name);
  return m[0];
}
// 🔴 反向判据（「旧结构已删」）必须先剥注释：新写的说明性注释里会含旧结构的**字面**，
//    不剥就会自己判红自己。本套的「⚡ 重新分组已查无」尤其需要。
function stripAll(t) {
  return String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
}

const V = (sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/) || [])[1] || '';

// 学生 id 与产品一致：`state.nextId` 默认 1、且合并策略是 max ⇒ 真实 id 恒 ≥ 1
// （id 若能为 0，本版 `cursorId = queue[0] || null` 会把它折成 null —— 现实中取不到，故不为此改产品码）
function mkStudents(n, from) {
  const out = [];
  const base = (from === undefined ? 1 : from);
  for (let i = 0; i < n; i++) {
    const k = base + i;
    out.push({ id: k, sid: String(k).padStart(3, '0'), name: '\u5b66\u751f' + k });
  }
  return out;
}

// ============================================================
console.log('\n\u2460 \u7248\u672c\u4e00\u81f4\u6027\uff08\u4ece sw.js \u53cd\u63a8\uff0c\u7248\u672c\u65e0\u5173\uff09');
// ============================================================
ok(/^v\d+\.\d+\.\d+$/.test(V), 'sw.js 的 CACHE_NAME 能解析出版本号：' + V);
has(html, '<div class="login-version">' + V + '</div>', '登录页版本号 = ' + V);

// ============================================================
console.log('\n\u2461 dutyShuffleIds \u771f\u8dd1\uff08\u6d17\u724c\u7b97\u6cd5\u672c\u4f53\uff09');
// ============================================================
// 🔴 真跑类断言依赖源码里真有那几个函数。反向对照（把本套跑在「改之前」的字节上）时
//    这些函数整个不存在 —— 那时要的是「判红」，**不是让进程崩掉**（崩掉就只剩一行堆栈，
//    看不出到底哪些断言是有效的）。所以每段真跑都包一层 try/catch，崩了就记一条失败。
try {
const SHUF = new Function(braceFn('dutyShuffleIds') + '\nreturn dutyShuffleIds;')();
{
  const body = braceFn('dutyShuffleIds');
  // Fisher-Yates 的**无偏写法**：j = floor(random()*(i+1))，随 i 递减。
  // 写成 random()*a.length 会「不是置换」（可能丢人）或有偏；随机源只该出现一次。
  has(body, 'for(var i = a.length - 1; i > 0; i--)', '是 Fisher-Yates 由后向前的写法');
  has(body, 'Math.floor(Math.random() * (i + 1))', 'j 的取值上界是 i+1（无偏的关键）');
  eq(cnt(body, 'Math.random()'), 1, '随机源恰好出现 1 次（不是「每对交换一次」的有偏写法）');
  has(body, 'return a;', '返回入参数组本身（就地改，调用方拿得到）');

  // 边界
  eq(JSON.stringify(SHUF([])), '[]', '空数组 → 空数组（不进循环）');
  eq(JSON.stringify(SHUF([7])), '[7]', '单元素 → 原样');
  const two = SHUF([1, 2]);
  eq(two.slice().sort().join(','), '1,2', '两元素 → 多重集守恒');

  // 就地改 + 返回同一引用
  const arr = [1, 2, 3, 4, 5];
  const ret = SHUF(arr);
  ok(ret === arr, '返回的与传入的是同一个引用');

  // 多重集守恒（含重复值）
  const dupArr = [5, 5, 3, 3, 3, 1];
  ok(SHUF(dupArr.slice()).sort().join(',') === dupArr.slice().sort().join(','), '含重复值时多重集守恒');

  // 真的打乱了：58 人跑 100 次，恒等排列出现 0 次（1/58! 天文数字小）
  const base58 = mkStudents(58).map(s => s.id);
  let identity = 0, maxFixed = 0;
  for (let t = 0; t < 100; t++) {
    const out = SHUF(base58.slice());
    if (out.join(',') === base58.join(',')) identity++;
    let fixed = 0;
    for (let i = 0; i < out.length; i++) if (out[i] === base58[i]) fixed++;
    if (fixed > maxFixed) maxFixed = fixed;
  }
  eq(identity, 0, '58 人洗 100 次，没有一次是恒等排列（确实在洗）');
  ok(maxFixed <= 12, '单次最多 ' + maxFixed + ' 人原地不动（期望约 1 个不动点，≤12 属正常抖动）');

  // 位置 0 的元素会跑掉（不是「只洗后半段」之类的半吊子实现）
  let headStayed = 0;
  for (let t = 0; t < 3000; t++) {
    if (SHUF(base58.slice())[0] === base58[0]) headStayed++;
  }
  ok(headStayed < 200, '原首位 3000 次里只留在原位 ' + headStayed + ' 次（期望 ≈ 52，上限 200）');

  // 🔑 无偏性真算：4 元素 20000 次，每个元素落到每个位置的次数都应 ≈ 5000。
  //    有偏实现（如 j=floor(random()*n) 或「对每对独立抛硬币」）会在这里明显偏斜。
  const N = 20000, K = 4;
  const grid = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let t = 0; t < N; t++) {
    const out = SHUF([0, 1, 2, 3]);
    for (let p = 0; p < K; p++) grid[out[p]][p]++;
  }
  let worst = 0, worstCell = '';
  for (let e = 0; e < K; e++) for (let p = 0; p < K; p++) {
    const d = Math.abs(grid[e][p] - N / K);
    if (d > worst) { worst = d; worstCell = '元素' + e + '@位置' + p + '=' + grid[e][p]; }
  }
  const tol = N / K * 0.08;   // 8%（≈6.5 个标准差，几乎不可能误报）
  ok(worst < tol, '40000 格分布均匀：最大偏差 ' + worst.toFixed(0) + ' < ' + tol.toFixed(0) + '（' + worstCell + '）');
}
} catch (e) { log(false, '\u2461 \u6bb5\u6267\u884c\u4e2d\u6b62\uff1a' + e.message); }

// ============================================================
console.log('\n\u2462 dutyReschedule \u771f\u8dd1\uff08\u4e24\u5206\u652f\u8bed\u4e49\uff09');
// ============================================================
const S58 = mkStudents(58);   // 58 人（老板班上的真实人数），各段共用；不依赖源码，放在 try 外面
try {
function mkDuty(students, confirmRet, dirty) {
  const d = Object.assign({
    teamOrder: [], currentWeek: 0, schedule: [], servedIds: [], roundLedger: [],
    round: 1, lastGenWeek: -1, queue: [], cursorId: null
  }, dirty || {});
  return new Function([
    'var env = { confirms: [], toasts: [], saves: 0, renders: [], ret: ' + JSON.stringify(!!confirmRet) + ' };',
    'var state = ' + JSON.stringify({ students: students, duty: d }) + ';',
    'function showToast(m, t){ env.toasts.push([m, t]); }',
    'function confirm(m){ env.confirms.push(m); return env.ret; }',
    'function saveData(){ env.saves++; }',
    'function renderDuty(){ env.renders.push("duty"); }',
    'function renderDutyToday(){ env.renders.push("today"); }',
    'function renderDutyProgress(){ env.renders.push("progress"); }',
    constDecl('DUTY_TEAM_SIZE'),
    constDecl('DUTY_TEAM_MIN_TAIL'),
    braceFn('dutyShuffleIds'),
    braceFn('dutyEnsureQueue'),
    braceFn('dutySyncTeamOrder'),
    braceFn('dutyTeamPlan'),
    braceFn('dutyReschedule'),
    braceFn('dutyRescheduleAll'),
    braceFn('dutyRescheduleShuffle'),
    'return { env: env, state: state,',
    '  reschedule: dutyReschedule, all: dutyRescheduleAll, rnd: dutyRescheduleShuffle,',
    '  shuffle: dutyShuffleIds, sync: dutySyncTeamOrder, ensureQueue: dutyEnsureQueue,',
    '  plan: function(){ return dutyTeamPlan(state.students, state.duty.teamOrder); },',
    '  sidOrder: function(){ return state.students.slice().sort(function(a,b){return String(a.sid).localeCompare(String(b.sid));}).map(function(s){return s.id;}); },',
    '  setRet: function(v){ env.ret = v; } };'
  ].join('\n'))();
}

{
  // --- 按学号分支 ---
  const m = mkDuty(S58, true);
  m.reschedule('sid');
  eq(m.state.duty.teamOrder.length, 0, '按学号：teamOrder 落成空数组（空数组=按学号，是 dutyTeamPlan 的规范表示）');
  eq(m.state.duty.currentWeek, 0, '按学号：回到第 1 周');
  eq(m.env.confirms.length, 1, '按学号：弹了一次二次确认');
  has(m.env.confirms[0], '\u6309\u5b66\u53f7\u91cd\u65b0\u5206\u7ec4', '按学号的确认文案说清了是「按学号」');
  has(m.env.confirms[0], '\u624b\u52a8\u6362\u4eba', '确认文案提示了会清空手动换人');
  eq(m.env.saves, 1, '按学号：落盘 1 次');
  eq(m.env.renders.join(','), 'duty,today,progress', '按学号：三个渲染入口都被刷新');
  eq(m.env.toasts[0][1], 'success', '按学号：toast 是 success');
  has(m.env.toasts[0][0], '\u5df2\u6309\u5b66\u53f7\u5206\u7ec4', '按学号：toast 文案');
  eq(m.plan().length, 7, '58 人按学号切成 7 组');
}

{
  // --- 随机分支 ---
  const m = mkDuty(S58, true);
  m.reschedule('shuffle');
  const order = m.state.duty.teamOrder;
  eq(order.length, 58, '随机：teamOrder 有 58 个 id（不是空数组）');
  ok(order.slice().sort((a, b) => a - b).join(',') === S58.map(s => s.id).sort((a, b) => a - b).join(','),
    '随机：teamOrder 是全班的一个排列（不多不少不重复）');
  ok(order.join(',') !== m.sidOrder().join(','), '随机：结果与按学号顺序不同（真的洗了）');
  eq(m.state.duty.currentWeek, 0, '随机：回到第 1 周');
  eq(m.plan().length, 7, '随机：58 人仍切成 7 组');
  eq(m.env.confirms.length, 1, '随机：弹了一次二次确认');
  has(m.env.confirms[0], '\u968f\u673a', '随机的确认文案说清了是「随机」');
  eq(m.env.saves, 1, '随机：落盘 1 次');
  has(m.env.toasts[0][0], '\u5df2\u968f\u673a\u5206\u7ec4', '随机：toast 文案');
  has(m.env.toasts[0][0], '7 \u7ec4', '随机：toast 里报了组数');
  has(m.env.toasts[0][0], '\u7b2c 1 \u5468', '随机：toast 里报了从第 1 周开始');

  // 🔑 全组划分不变量：并集 = 全班、无重复
  const flat = m.plan().reduce((a, t) => a.concat(t.members), []);
  eq(flat.length, 58, '随机：划分后总人数守恒');
  eq(new Set(flat).size, 58, '随机：全班恰好出现一次（划分不变量保持）');
  eq(flat.slice().sort((a, b) => a - b).join(','), S58.map(s => s.id).sort((a, b) => a - b).join(','),
    '随机：成员集合与全班完全相同');

  // 🔑🔑 随机结果必须「活下来」—— dutySyncTeamOrder 不得把它按学号重排。
  //     这是本版最容易白干的地方：若把 order 留空/丢失，刷新一次就被按学号补齐。
  const synced = m.sync(m.state.duty, m.state.students);
  eq(synced.join(','), order.join(','), '随机：dutySyncTeamOrder 原样保留随机顺序（刷新不会白随机）');
  const reRender = m.sync(m.state.duty, m.state.students);
  eq(reRender.join(','), order.join(','), '随机：反复 sync 仍稳定（幂等）');
  ok(order.join(',') !== m.sidOrder().join(','), '随机：sync 之后仍不是学号序');
}

{
  // --- 复位字段（两条路径都要清干净）---
  const dirty = {
    currentWeek: 5,
    schedule: [{ day: 1, area: 'a', studentId: 1, week: 5 }],
    servedIds: [1, 2, 3],
    roundLedger: [{ w: 5, id: 1 }],
    round: 4,
    lastGenWeek: 5
  };
  for (const mode of ['sid', 'shuffle']) {
    const m = mkDuty(S58, true, dirty);
    m.reschedule(mode);
    const d = m.state.duty;
    eq(d.schedule.length, 0, mode + '：清空按天排班旧数据 schedule');
    eq(d.servedIds.length, 0, mode + '：清空 servedIds');
    eq(d.roundLedger.length, 0, mode + '：清空 roundLedger');
    eq(d.round, 1, mode + '：轮次回到第 1 轮');
    eq(d.lastGenWeek, -1, mode + '：lastGenWeek 复位到 -1');
    eq(d.currentWeek, 0, mode + '：currentWeek 复位到 0');
  }
}

{
  // --- 二次确认取消 → 一个字节都不改 ---
  for (const mode of ['sid', 'shuffle', undefined]) {
    const m = mkDuty(S58, false, { currentWeek: 3, round: 2, roundLedger: [{ w: 3, id: 9 }] });
    m.reschedule(mode);
    const d = m.state.duty;
    eq(d.teamOrder.length, 0, '取消（mode=' + mode + '）：teamOrder 没动');
    eq(d.currentWeek, 3, '取消（mode=' + mode + '）：currentWeek 没动');
    eq(d.round, 2, '取消（mode=' + mode + '）：round 没动');
    eq(d.roundLedger.length, 1, '取消（mode=' + mode + '）：roundLedger 没动');
    eq(m.env.saves, 0, '取消（mode=' + mode + '）：没有落盘');
    eq(m.env.renders.length, 0, '取消（mode=' + mode + '）：没有重渲染');
    eq(m.env.toasts.length, 0, '取消（mode=' + mode + '）：没有弹 toast');
  }
}

{
  // --- 空班短路 ---
  for (const mode of ['sid', 'shuffle']) {
    const m = mkDuty([], true);
    m.reschedule(mode);
    eq(m.env.confirms.length, 0, mode + '：空班时根本不弹确认框');
    eq(m.env.toasts.length, 1, mode + '：空班时只弹一条提示');
    eq(m.env.toasts[0][0], '\u8bf7\u5148\u6dfb\u52a0\u5b66\u751f', mode + '：提示语是「请先添加学生」');
    eq(m.env.toasts[0][1], 'error', mode + '：提示类型是 error');
    eq(m.env.saves, 0, mode + '：空班不写盘');
  }
}

{
  // --- 未传参 / 传了别的字符串 → 一律走按学号（向后兼容，bySid = mode !== 'shuffle'）---
  for (const mode of [undefined, '', 'sid', 'SID', 'xxx', null]) {
    const m = mkDuty(mkStudents(10), true);
    m.reschedule(mode);
    eq(m.state.duty.teamOrder.length, 0,
      'mode=' + JSON.stringify(mode) + ' → 走按学号（teamOrder 为空）');
  }
  for (const mode of ['sid', 'shuffle', 'Shuffle', 'SHUFFLE', ' shuffle', 'shuffle ']) {
    const wouldBeRandom = (mode === 'shuffle');
    const m = mkDuty(mkStudents(10), true);
    m.reschedule(mode);
    eq(m.state.duty.teamOrder.length, wouldBeRandom ? 10 : 0,
      'mode=' + JSON.stringify(mode) + ' → ' + (wouldBeRandom ? '走随机' : '走按学号'));
  }
  // 严格相等是刻意的：两个薄壳只传 'shuffle' / 'sid' 两个字面量，不需要容错大小写。
  const rk = braceFn('dutyReschedule');
  has(rk, "if(bySid){\n    state.duty.teamOrder = [];", '判据是严格相等（不做 toLowerCase 容错）');
}
} catch (e) { log(false, '\u2462 \u6bb5\u6267\u884c\u4e2d\u6b62\uff1a' + e.message); }

// ============================================================
console.log('\n\u2463 \u4e24\u4e2a\u8584\u58f3\u4e0e\u9875\u9762\u63a5\u7ebf');
// ============================================================
try {
{
  // dutyRescheduleShuffle：小班也要能洗（10 人 1 组 + 尾巴并给前面）
  const m = mkDuty(mkStudents(10), true);
  m.rnd();
  eq(m.state.duty.teamOrder.length, 10, 'dutyRescheduleShuffle() 无参调用 → 走随机');
  eq(m.state.duty.teamOrder.slice().sort((a, b) => a - b).join(','), mkStudents(10).map(s => s.id).join(','),
    'shuffle 薄壳：10 人全在、不重不漏');
  eq(m.env.confirms.length, 1, 'shuffle 薄壳会弹确认');
  has(m.env.confirms[0], '\u968f\u673a', 'shuffle 薄壳的确认文案是「随机」');
}
{
  // dutyRescheduleAll：旧名字 + () 签名保留，无参调用仍是按学号（_v2240_test.js 钉着）
  const m = mkDuty(mkStudents(10), true);
  m.all();
  eq(m.state.duty.teamOrder.length, 0, 'dutyRescheduleAll() 无参调用 → 仍走按学号');
  eq(m.env.confirms.length, 1, 'all 薄壳会弹确认');
  has(m.env.confirms[0], '\u6309\u5b66\u53f7', 'all 薄壳的确认文案是「按学号」');
}
{
  // 连续两次随机 → 两次结果（几乎必然）不同 ⇒ 按钮不是「幂等摆设」
  const orders = [];
  for (let i = 0; i < 5; i++) {
    const m = mkDuty(S58, true);
    m.rnd();
    orders.push(m.state.duty.teamOrder.join(','));
  }
  eq(new Set(orders).size, 5, '连点 5 次「随机分组」，5 次结果互不相同');
}
{
  // 页面接线：工具栏两个按钮
  const toolbarStart = html.indexOf('onclick="dutyGoRoundStart()"');
  const toolbarEnd = html.indexOf('onclick="dutyExportImage()"') + 40;
  ok(toolbarStart > 0 && toolbarEnd > toolbarStart + 40, '能切出值日页工具栏区块');
  const toolbar = html.slice(toolbarStart, toolbarEnd);
  has(toolbar, 'onclick="dutyRescheduleShuffle()"', '工具栏有「随机分组」按钮且直连 dutyRescheduleShuffle()');
  has(toolbar, 'onclick="dutyRescheduleAll()"', '工具栏有「按学号分组」按钮且直连 dutyRescheduleAll()');
  has(toolbar, '>\ud83c\udfb2 \u968f\u673a\u5206\u7ec4</button>', '随机按钮文案带骰子图标 +「随机分组」');
  has(toolbar, '>\u6309\u5b66\u53f7\u5206\u7ec4</button>', '另一个按钮文案是「按学号分组」');
  has(toolbar, 'onclick="dutyGoRoundStart()"', '「回到本轮开头」仍在（没被挤掉）');
  has(toolbar, 'onclick="dutyExportImage()"', '「导出图片」仍在（没被挤掉）');
  eq(cnt(toolbar, 'dutyRescheduleShuffle()'), 1, '工具栏里随机按钮恰好 1 个');
  eq(cnt(toolbar, 'dutyRescheduleAll()'), 1, '工具栏里按学号按钮恰好 1 个');

  // 空状态（全班 0 人时的提示卡）
  const ei = html.indexOf('id="dutyEmptyHint"');
  ok(ei > 0, '能定位空状态提示卡');
  const emptyHint = html.slice(ei, ei + 400);
  has(emptyHint, 'onclick="dutyRescheduleShuffle()"', '空状态卡的按钮也是「随机分组」（随机是主操作）');

  // 旧文案查无（剥注释后再查 —— 说明性注释里可能提到它）
  notHas(stripAll(html), '\u26a1 \u91cd\u65b0\u5206\u7ec4', '旧按钮「⚡ 重新分组」已查无（剥注释后）');
  notHas(stripAll(html), '\u786e\u8ba4\u91cd\u65b0\u5206\u7ec4\uff1f', '旧的「确认重新分组？」文案已换掉（现在两分支各有专述文案）');

  // 两个薄壳的定义形态
  has(html, "function dutyRescheduleAll(){ dutyReschedule('sid'); }", 'dutyRescheduleAll 仍是 () 签名 + 委托 mode=sid');
  has(html, "function dutyRescheduleShuffle(){ dutyReschedule('shuffle'); }", 'dutyRescheduleShuffle 是 () 签名 + 委托 mode=shuffle');
  notHas(html, "function dutyRescheduleShuffle(mode)", 'dutyRescheduleShuffle 不接受参数（按钮调用不传参）');
}
} catch (e) { log(false, '\u2463 \u6bb5\u6267\u884c\u4e2d\u6b62\uff1a' + e.message); }

// ============================================================
console.log('\n\u2464 \u5951\u7ea6\u4fdd\u5168\uff08\u65e7\u884c\u4e3a\u4e0d\u80fd\u88ab\u8fd9\u6b21\u6539\u6389\uff09');
// ============================================================
try {
{
  // ① 轮值队列仍按学号（老板 2026-10-02：先不动）
  const students = mkStudents(12);
  const m = mkDuty(students.slice().reverse(), true);   // 故意逆序传，看它会不会被重排
  m.rnd();
  const q = m.state.duty.queue;
  eq(q.length, 12, '随机分组后队列里仍是 12 人');
  eq(q.join(','), students.map(s => s.id).join(','), '轮值队列仍按学号排序（随机只作用于小组划分，不作用于饮水机轮次）');
  eq(m.state.duty.cursorId, q[0], 'cursorId 指向队首');
  has(braceFn('dutyEnsureQueue'), 'localeCompare', 'dutyEnsureQueue 仍按学号比较（没被改成随机）');
  notHas(braceFn('dutyEnsureQueue'), 'dutyShuffleIds', 'dutyEnsureQueue 没有偷偷接上洗牌');

  // ② dutyTeamPlan 传空数组仍回落按学号（_v2240_test.js 钉着的契约）
  const m2 = mkDuty(students, true);
  const byEmpty = m2.plan();
  const direct = new Function([
    constDecl('DUTY_TEAM_SIZE'), constDecl('DUTY_TEAM_MIN_TAIL'), braceFn('dutyTeamPlan'),
    'return dutyTeamPlan;'
  ].join('\n'))();
  const byFull = direct(students, students.map(s => s.id));
  eq(JSON.stringify(byEmpty), JSON.stringify(byFull), 'teamOrder 为空 → dutyTeamPlan 回落按学号（与显式按学号结果一致）');

  // ③ dutyReschedule 里 teamOrder 的赋值只有这一处（共用一个函数体，不是抄两份）
  const rb = braceFn('dutyReschedule');
  eq(cnt(rb, 'state.duty.teamOrder ='), 2,
    'dutyReschedule 里只有两处 teamOrder 赋值（就是 if/else 那两支，没有再散落第三处）');
  has(rb, "if(bySid){\n    state.duty.teamOrder = [];", 'bySid 分支 → 空数组');
  has(rb, 'state.duty.teamOrder = dutyShuffleIds(', 'else 分支 → 落盘真实的打乱结果');
  has(rb, 'var bySid = (mode !== \'shuffle\');', 'bySid 的判据 = mode !== \'shuffle\'（未传参默认按学号）');
  // 两条分支共用一个函数体：只有 1 个 confirm、1 个 saveData、1 个 showToast
  eq(cnt(rb, 'confirm('), 1, 'dutyReschedule 里只有一个 confirm');
  eq(cnt(rb, 'saveData();'), 1, 'dutyReschedule 里只有一个 saveData');
  eq(cnt(rb, 'showToast('), 2, 'dutyReschedule 里两处 showToast（空班提示 + 成功反馈）');

  // ④ _v2240_test.js 钉住的四条行为锚点仍在该函数体内
  has(rb, 'state.duty.teamOrder = []', '_v2240 锚点 1：重新分组会清空 teamOrder');
  has(rb, 'state.duty.currentWeek = 0;', '_v2240 锚点 2：重新分组会回到第 1 周');
  has(rb, 'if(!confirm(', '_v2240 锚点 3：重新分组有二次确认');
  has(rb, 'showToast(', '_v2240 锚点 4：有结果反馈');
  // _v2240_test.js 用 braceFn('dutyReschedule') 取函数体，因此函数声明必须仍存在
  has(html, 'function dutyReschedule(mode){', 'dutyReschedule 函数声明仍在（_v2240_test.js 的重定向目标）');
}
} catch (e) { log(false, '\u2464 \u6bb5\u6267\u884c\u4e2d\u6b62\uff1a' + e.message); }

// ============================================================
console.log('\n\u2465 \u4e8b\u6545\u54e8\u5175\uff08v2.27.4 \u8865\u4e01\u66fe\u524a\u574f\u8fc7\u8fd9\u4e24\u5904\uff09');
// ============================================================
{
  // 补丁脚本先做变长 replace、再用旧下标 splice，把 dutySwapOrder 的尾巴
  // 与整个 dutyGoRoundStart 削掉了（102 字符）。这两条守着不再犯。
  has(braceFn('dutySwapOrder'), '  order[i] = bId; order[j] = aId;\n  return true;\n}',
    'dutySwapOrder 尾部完整（含 order[i]=bId / order[j]=aId / return true）');
  has(html, 'function dutyGoRoundStart(){ switchWeek(0); }', 'dutyGoRoundStart 定义还在');
  ok(cnt(html, 'dutyGoRoundStart') >= 2, 'dutyGoRoundStart 至少出现 2 次（定义 + 「回到本轮开头」按钮）');
  has(html, 'onclick="dutyGoRoundStart()"', '「回到本轮开头」按钮的 onclick 还在');

  // 反事故：洗牌函数必须定义在 dutyReschedule 之前被引用到也没关系（函数声明提升），
  // 但要确认它没被塞进别处、也没重复定义。
  eq(cnt(html, 'function dutyShuffleIds('), 1, 'dutyShuffleIds 恰好定义 1 次');
  eq(cnt(html, 'function dutyReschedule('), 1, 'dutyReschedule 恰好定义 1 次');
  eq(cnt(html, 'function dutyRescheduleAll('), 1, 'dutyRescheduleAll 恰好定义 1 次');
  eq(cnt(html, 'function dutyRescheduleShuffle('), 1, 'dutyRescheduleShuffle 恰好定义 1 次');

  // 内联 <script> 的语法闸：直接拿 Node 的解析器解析（不执行）——
  // 补丁把花括号削坏时这里会立刻红，比手数花括号可靠（正则字面量里的花括号不会误伤）。
  const blocks = html.split('<script');
  let checked = 0, syntaxOk = true, synErr = '';
  for (let i = 1; i < blocks.length; i++) {
    const seg = blocks[i];
    const close = seg.indexOf('</script>');
    if (close < 0) continue;
    const body = seg.slice(seg.indexOf('>') + 1, close);
    if (!/dutyReschedule/.test(body)) continue;
    checked++;
    try { new Function(body); } catch (e) { syntaxOk = false; synErr = e.message; }
  }
  ok(checked > 0, '找到含值日代码的内联 <script> 块（' + checked + ' 个）');
  ok(syntaxOk, '该脚本块能被 JS 解析器解析通过（语法坏掉时这里先红）' + (syntaxOk ? '' : '：' + synErr));
}

// ============================================================
// 汇总行用项目现行格式「结果：N 通过，M 失败」—— _rm/_runall_mirror.py 只认这个格式取断言条数。
// （早期文件写的是「通过 N 项，失败 M 项」，那套的条数在全量统计里会被漏掉。）
console.log('\n' + '='.repeat(56));
console.log(`\u7ed3\u679c\uff1a${pass} \u901a\u8fc7\uff0c${fail} \u5931\u8d25`);
if (fail) { console.log('\n\u5931\u8d25\u9879\uff1a'); failures.forEach(f => console.log('  \u00b7 ' + f)); }
process.exit(fail ? 1 : 0);
