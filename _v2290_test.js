// _v2290_test.js — v2.29.0：值日分组改成「每组 3—4 人」，杜绝 2 人小组
//
// 老板 2026-10-02 原话：「要」（承接「要不要我把 App 也调成跟你这张表一致
// （50 多人时不再出现 2 人小组）？」）
// 背景：原表 59 人时末段正好 3 人，但**本班 58 人**按「每 4 人一段」会切出**末组 2 人**
//       —— 两个人包一周教室 + 公卫太重。
//
// ① 版本一致性（版本无关：从 sw.js 的 CACHE_NAME 反推，下次跟版零成本）
// ② dutyGroupSizes 穷举 n=1..200 的不变量（和 / 组数 / 每组 3—4 / 短组排在末尾）
// ③ 关键点位（58 / 59 / 45 / 28 / 17 / 13 / 9 / 8 / 6 / 5 / 2 / 1）
// ④ 与老板 Excel 轮值表对表（组数一致 + 人数分布一致；「哪几组是短组」刻意不同）
// ⑤ 守恒与划分不变量（全班恰好出现一次、组号连续）
// ⑥ 与 teamOrder / 随机分组 / 换人联动（**换人不改变人数分布**）
// ⑦ 文案同源 dutySizeText（全 4 人 → 「4 人」；有 3 有 4 → 「3—4 人」）
// ⑧ 契约保全（旧按天引擎 11 符号 + 常量、页面锚点、切组签名与返回形状）
// ⑨ 事故哨兵（定义次数、语法闸）
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
function has(t, s, msg) {
  const i = String(t).indexOf(s);
  log(i >= 0, msg + (i >= 0 ? '' : '「缺 ' + JSON.stringify(String(s).slice(0, 70)) + '」'));
}
function notHas(t, s, msg) {
  const i = String(t).indexOf(s);
  log(i < 0, msg + (i < 0 ? '' : '「不该有 ' + JSON.stringify(String(s).slice(0, 70)) + '」'));
}
function eq(a, b, msg) {
  log(a === b, (msg || '') + '（期望 ' + JSON.stringify(b) + '，实得 ' + JSON.stringify(a) + '）');
}
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }
/* 反向判据（"旧结构已删"）必须先剥块注释：说明性注释里会含旧结构的**字面** */
function stripCss(t) { return String(t).replace(/\/\*[\s\S]*?\*\//g, ''); }
function braceFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('未找到函数 ' + name);
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
  if (!m) throw new Error('未找到常量 ' + name);
  return m[0];
}

const V = (sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/) || [])[1] || '';

// ============================================================
console.log('\n① 版本一致性（从 sw.js 反推，版本无关）');
// ============================================================
ok(/^v\d+\.\d+\.\d+$/.test(V), 'sw.js 的 CACHE_NAME 能解析出版本号：' + V);
has(html, '<div class="login-version">' + V + '</div>', '登录页版本号 = ' + V);
has(html, '<div class="sidebar-footer">' + V + ' · 班主任工作台</div>', '侧栏页脚版本号 = ' + V);
has(html, '🏷️ ' + V + '</span>', '设置页版本徽标 = ' + V);
has(html, '📝 近版更新速览（' + V + '）', '速览标题 = ' + V);
has(sw, "CACHE_NAME = 'class-manager-" + V + "'", 'sw.js CACHE_NAME 与之一致');

// ============================================================
// 纯函数沙箱（引擎段不依赖 DOM，可整段真跑）
// ============================================================
function mkStudents(n, prefix) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ id: (prefix || 's') + i, sid: String(i).padStart(3, '0'), name: '学生' + i });
  }
  return out;
}

/* 惰性化：envSrc() 里任何 braceFn 抛错都只会让「用到它的那一段」变红，
   而不是整个文件崩掉 —— 崩溃时后面的段根本读不到数，会误判成大面积失败。 */
function envSrc() {
  return [
    constDecl('DUTY_GROUP_SIZE'),
    constDecl('DUTY_GROUP_MIN'),
    braceFn('dutyGroupSizes'),
    braceFn('dutyGroupSizesEven'),
    braceFn('dutySizeText'),
    braceFn('dutyTeamPlan'),
    braceFn('dutySyncTeamOrder'),
    braceFn('dutySwapOrder'),
    braceFn('dutyShuffleIds')
  ].join('\n');
}

function mk(students, order) {
  return new Function([
    'var state = ' + JSON.stringify({
      students: students,
      duty: { teamOrder: (order && order.length) ? order.slice() : [] }
    }) + ';',
    'function saveData(){}',
    'function renderDuty(){}',
    'function renderDutyToday(){}',
    'function renderDutyProgress(){}',
    envSrc(),
    'return { state: state,',
    '  plan: function(){ return dutyTeamPlan(state.students, state.duty.teamOrder); },',
    '  sizes: dutyGroupSizes, even: dutyGroupSizesEven, text: dutySizeText,',
    '  swap: dutySwapOrder, sync: dutySyncTeamOrder, shuffle: dutyShuffleIds,',
    '  order: function(){ return state.duty.teamOrder.slice(); },',
    '  setOrder: function(a){ state.duty.teamOrder = a.slice(); },',
    '  SIZE: DUTY_GROUP_SIZE, MIN: DUTY_GROUP_MIN };'
  ].join('\n'))();
}

// ============================================================
console.log('\n② dutyGroupSizes 穷举 n = 1..200（四条不变量，逐条找首个违例）');
// ============================================================
try {
  const S = mk([]);
  const viol = { sum: '', groups: '', lo: '', hi: '', order: '', kind: '' };
  for (let n = 1; n <= 200; n++) {
    const sz = S.sizes(n);
    if (!sz || sz.length === 0) { viol.sum = viol.sum || ('n=' + n + ' 返回空'); continue; }
    const sum = sz.reduce((a, b) => a + b, 0);
    if (sum !== n && !viol.sum) viol.sum = 'n=' + n + ' 和=' + sum;
    const want = Math.ceil(n / 4);
    if (sz.length !== want && !viol.groups) viol.groups = 'n=' + n + ' 组数=' + sz.length + '（应 ' + want + '）';
    /* 短组排在末尾 ⇒ 人数序列非递增（4…4,3…3） */
    for (let i = 0; i + 1 < sz.length; i++) {
      if (sz[i] < sz[i + 1] && !viol.order) viol.order = 'n=' + n + ' 序列 ' + sz.join(',');
    }
    if (n >= 6) {
      const mn = Math.min.apply(null, sz);
      if (mn < 3 && !viol.lo) viol.lo = 'n=' + n + ' 最小 ' + mn;
      const kinds = sz.filter(v => v !== 3 && v !== 4);
      if (kinds.length && !viol.kind) viol.kind = 'n=' + n + ' 出现 ' + kinds.join(',');
    }
    if (n >= 12) {
      const mx = Math.max.apply(null, sz);
      if (mx > 4 && !viol.hi) viol.hi = 'n=' + n + ' 最大 ' + mx;
    }
  }
  ok(!viol.sum, '① 人数守恒：任何 n 的分组人数和 = n' + (viol.sum ? '，首个违例 ' + viol.sum : ''));
  ok(!viol.groups, '② 组数恒为 ceil(n/4)（这正是周序/组号/罚扫锚点都不用改的原因）' + (viol.groups ? '，首个违例 ' + viol.groups : ''));
  ok(!viol.order, '③ 短组一律排在末尾（人数序列非递增）' + (viol.order ? '，首个违例 ' + viol.order : ''));
  ok(!viol.lo, '④ n >= 6 时每组都 >= 3 人（杜绝 2 人小组）' + (viol.lo ? '，首个违例 ' + viol.lo : ''));
  ok(!viol.kind, '⑤ n >= 6 时每组只可能是 3 或 4 人' + (viol.kind ? '，首个违例 ' + viol.kind : ''));
  ok(!viol.hi, '⑥ n >= 12 时每组都 <= 4 人' + (viol.hi ? '，首个违例 ' + viol.hi : ''));
} catch (e) { log(false, '…②段执行中止：' + e.message); }

// ============================================================
console.log('\n③ 关键点位（逐个人数直接对表）');
// ============================================================
try {
  const S = mk([]);
  const g = n => S.sizes(n).join(',');
  eq(g(58), '4,4,4,4,4,4,4,4,4,4,4,4,4,3,3', '58 人 → 13 组 4 人 + 末两组各 3 人（老板班额）');
  eq(g(59), '4,4,4,4,4,4,4,4,4,4,4,4,4,4,3', '59 人 → 14 组 4 人 + 末组 3 人（**与原表逐格不变**）');
  eq(g(45), '4,4,4,4,4,4,4,4,4,3,3,3', '45 人 → 9 组 4 人 + 末三组各 3 人');
  eq(g(28), '4,4,4,4,4,4,4', '28 人 → 7 组各 4 人（7 × 4 = 28，整除不受影响）');
  eq(g(17), '4,4,3,3,3', '17 人 → 4 + 4 + 3 + 3 + 3');
  eq(g(13), '4,3,3,3', '13 人 → 4 + 3 + 3 + 3');
  eq(g(12), '4,4,4', '12 人 → 3 组各 4 人（整除）');
  eq(g(11), '4,4,3', '11 人 → 4 + 4 + 3');
  eq(g(10), '4,3,3', '10 人 → 4 + 3 + 3');
  eq(g(9), '3,3,3', '9 人 → 3 组各 3 人');
  eq(g(8), '4,4', '8 人 → 2 组各 4 人');
  eq(g(7), '4,3', '7 人 → 4 + 3');
  eq(g(6), '3,3', '6 人 → 2 组各 3 人；**6 人起就不会再出现 2 人小组**');
  eq(g(4), '4', '4 人 → 1 组');
  eq(g(3), '3', '3 人 → 1 组');
  /* 🔴 1 / 2 / 5 人**凑不出「每组 3—4 人」**（3a + 4b = n 对这三个数无解）⇒ 均分兜底。
     现实班额用不到，但**不能崩**，也仍守住「组数 = ceil(n/4)」。 */
  eq(g(5), '3,2', '5 人 → 3 + 2（无解，均分兜底；仍 2 组）');
  eq(g(2), '2', '2 人 → 1 组（兜底）');
  eq(g(1), '1', '1 人 → 1 组（兜底）');
  eq(S.sizes(0).length, 0, '0 人 → 0 组（不崩）');
  eq(S.sizes('58').join(','), g(58), '传字符串 "58" 也走同一路径（parseInt 归一）');
  eq(S.SIZE, 4, 'DUTY_GROUP_SIZE = 4（基准）');
  eq(S.MIN, 3, 'DUTY_GROUP_MIN = 3（下限）');
  /* 推导复算：a 个 4 人组 + b 个 3 人组，b ≡ n (mod 4) 取最小非负解 */
  [58, 59, 45, 13, 9, 6, 76, 101].forEach(n => {
    const sz = S.sizes(n);
    const four = sz.filter(v => v === 4).length, three = sz.filter(v => v === 3).length;
    ok(four * 4 + three * 3 === n && three === [0, 3, 2, 1][n % 4],
      n + ' 人：4×' + four + ' + 3×' + three + ' = ' + n + '，b = ' + three + '（n % 4 = ' + (n % 4) + ' ⇒ 推导值 ' + [0, 3, 2, 1][n % 4] + '）');
  });
} catch (e) { log(false, '…③段执行中止：' + e.message); }

// ============================================================
console.log('\n④ 与老板 Excel 轮值表对表');
// ============================================================
try {
  /* 老板表 F:\26幼2\26幼2班教室与公共卫生轮值表..xlsx（2026-10-02 删王冬林后）：
     A21 标题写明「全班58人：G1—G9、G11—G14每组4人；G10、G15各3人」
     ⇒ 13 组 ×4 人 + 2 组 ×3 人 = 58 人，共 15 组。 */
  const XL = { groups: 15, fours: 13, threes: 2, total: 58 };
  const p = mk(mkStudents(58)).plan();
  const fours = p.filter(t => t.members.length === 4).length;
  const threes = p.filter(t => t.members.length === 3).length;
  eq(p.length, XL.groups, '组数与老板表一致（' + XL.groups + ' 组）');
  eq(fours, XL.fours, '4 人组数与老板表一致（' + XL.fours + ' 组）');
  eq(threes, XL.threes, '3 人组数与老板表一致（' + XL.threes + ' 组）');
  eq(p.reduce((a, t) => a + t.members.length, 0), XL.total, '总人数一致（58 人）');
  ok(p.every(t => t.members.length >= 3), '★ 不再出现 2 人小组（老板原话的落点）');
  /* ⚠️ 刻意**不同**的一点：老板表里短组是 G10 与 G15（G10 变 3 人是删王冬林的副作用），
     而 App 一律把短组排在**末尾**（G14、G15）。人数分布完全一致，只是「哪几组短」不同 ——
     老板的需求是「不再出现 2 人小组」，不是「复刻某几组的编号」。 */
  ok(p[9].members.length === 4 && p[13].members.length === 3 && p[14].members.length === 3,
    '短组位置按「一律排末尾」走：G14、G15 各 3 人（老板表的 G10 是删人副作用，不照抄）');
} catch (e) { log(false, '…④段执行中止：' + e.message); }

// ============================================================
console.log('\n⑤ 守恒与划分不变量');
// ============================================================
try {
  const students = mkStudents(58);
  const p = mk(students).plan();
  eq(p.map(t => t.no).join(','), Array.from({ length: 15 }, (_, i) => i + 1).join(','), '组号 1..15 连续');
  const flat = p.reduce((a, t) => a.concat(t.members), []);
  eq(flat.length, 58, '58 人全员恰好出现一次（数量）');
  eq(new Set(flat).size, 58, '58 人全员恰好出现一次（无重复）');
  const ids = new Set(students.map(s => s.id));
  ok(flat.every(id => ids.has(id)), '组员全部来自本班名单（没有幽灵 id）');
  ok(p.every(t => Array.isArray(t.members) && t.members.length > 0), '每个组都有人');
  ok(p.every(t => t.classroom === undefined && t.area === undefined),
    '组对象仍不带 classroom / area（岗位按周轮，不按组内前后半切）');
  /* 顺序切分：前 13 组各 4 人（下标 0..51），第 14 组 = 52..54，末组 = 55..57 */
  eq(p[0].members.join(','), students.slice(0, 4).map(s => s.id).join(','), '第 1 组 = 学号前 4 人，且保持原顺序');
  eq(p[13].members.join(','), students.slice(52, 55).map(s => s.id).join(','), '第 14 组 = 第 53～55 人');
  eq(p[14].members.join(','), students.slice(55).map(s => s.id).join(','), '末组 = 剩下的 3 人');
} catch (e) { log(false, '…⑤段执行中止：' + e.message); }

// ============================================================
console.log('\n⑥ 与 teamOrder / 随机分组 / 换人联动');
// ============================================================
try {
  const students = mkStudents(58);
  const full = students.map(s => s.id);

  // (a) 显式 teamOrder 生效
  const rev = full.slice().reverse();
  const pa = mk(students, rev).plan();
  eq(pa[0].members[0], rev[0], '传入 teamOrder 时按它切组（不再按学号）');
  eq(pa.map(t => t.members.length).join(','), '4,4,4,4,4,4,4,4,4,4,4,4,4,3,3', '换顺序不改变人数分布');

  // (b) 空数组回落按学号
  const pb = mk(students, []).plan();
  eq(pb[0].members[0], students[0].id, 'teamOrder 为空数组时回落到「按学号排序」');

  // (c) 随机分组：每组仍 3—4，且**人数分布完全不变**
  let worst = '', sizesSeen = new Set();
  for (let r = 0; r < 40; r++) {
    const sh = mk(students).shuffle(full.slice());
    if (sh.length !== 58) { worst = worst || '洗牌后长度 ' + sh.length; continue; }
    const pr = mk(students, sh).plan();
    if (pr.map(t => t.members.length).join(',') !== '4,4,4,4,4,4,4,4,4,4,4,4,4,3,3') {
      worst = worst || '第 ' + r + ' 次洗牌后分布变了：' + pr.map(t => t.members.length).join(',');
    }
    const f = pr.reduce((a, t) => a.concat(t.members), []);
    if (new Set(f).size !== 58) worst = worst || '第 ' + r + ' 次洗牌后有重复/遗漏';
    sizesSeen.add(pr.map(t => t.members.length).sort().join(','));
  }
  ok(!worst, '随机分组 40 次：每组仍 3—4 人、划分不变量不破' + (worst ? '，首个违例 ' + worst : ''));
  eq(sizesSeen.size, 1, '随机分组 40 次的人数分布**恒定**（只有 1 种：13×4 + 2×3）');

  // (d) 换人只交换位置 ⇒ 人数分布**完全不变**（这是「组数/分布由位置决定」的直接推论）
  const m2 = mk(students, full);
  const before = m2.plan().map(t => t.members.length).join(',');
  const o0 = m2.order()[0], o9 = m2.order()[9];
  eq(m2.swap(o0, o9), true, '对调两个存在的学生 → true');
  const after = m2.plan();
  eq(after.map(t => t.members.length).join(','), before, '换人后人数分布逐格不变');
  eq(mk(students, []).plan().map(t => t.members.length).join(','), before,
    'teamOrder 为空（回落按学号）与显式按学号的人数分布也一致');
  eq(m2.swap(o0, o0), false, '同一人自换 → false');
  eq(m2.swap(o0, '不存在的id'), false, '含非法 id → false');
  const flat2 = after.reduce((a, t) => a.concat(t.members), []);
  eq(new Set(flat2).size, 58, '换人后全班仍恰好出现一次');
} catch (e) { log(false, '…⑥段执行中止：' + e.message); }

// ============================================================
console.log('\n⑦ 文案同源 dutySizeText');
// ============================================================
try {
  const S = mk([]);
  const P = arr => arr.map((k, i) => ({ no: i + 1, members: new Array(k).fill('x') }));
  eq(S.text(P([4, 4, 4])), '4 人', '全是 4 人 → 「4 人」（整除班额不受影响，文案不变）');
  eq(S.text(P([4, 4, 3, 3])), '3—4 人', '有 3 有 4 → 「3—4 人」');
  eq(S.text(P([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3])), '3—4 人', '老板班额 58 人的实际文案');
  eq(S.text(P([3, 3, 3])), '3 人', '全是 3 人 → 「3 人」');
  eq(S.text(P([3, 2])), '2—3 人', '兜底场景如实反映（不撒谎）');
  eq(S.text([]), '4 人', '空计划 → 回落常量文案（不崩）');
  eq(S.text(null), '4 人', 'null 也兜住');

  /* 屏幕上 3 处 + 导出图 3 处，全都走 dutySizeText(plan)；1 处定义 + 6 处调用。 */
  eq(cnt(html, 'dutySizeText(plan)'), 7, 'dutySizeText(plan) 出现 7 处 = 1 处定义 + 6 处调用');
  [['renderDutyToday', '本周值日副标题'],
   ['renderDuty', '分组提示条'],
   ['renderDutyProgress', '周进度提示'],
   ['dutyExportImage', '导出图落款 + 两张表头']].forEach(([fn, label]) => {
    has(braceFn(fn), 'dutySizeText(plan)', label + '走 dutySizeText（不写死人数）');
  });
  eq(cnt(braceFn('dutyExportImage'), 'dutySizeText(plan)'), 3, '导出图里 3 处人数文案（落款 + 教室表头 + 公卫表头）');
  notHas(html, '4 人一组', '不再写死「4 人一组」（表头要显示「3—4 人」）');
  eq(cnt(html, "DUTY_GROUP_SIZE + ' 人'"), 1, '「4 人」字面只剩 dutySizeText 里的兜底一处');
} catch (e) { log(false, '…⑦段执行中止：' + e.message); }

// ============================================================
console.log('\n⑧ 契约保全（旧引擎 / 页面锚点 / 签名与返回形状）');
// ============================================================
try {
  has(html, 'function dutyTeamPlan(students, order){', 'dutyTeamPlan 签名未改（_v2240_test.js 钉着）');
  has(html, 'function dutyGroupSizes(n){', 'dutyGroupSizes 就位');
  has(html, 'function dutyGroupSizesEven(n){', 'dutyGroupSizesEven 兜底就位');
  has(html, 'function dutySizeText(plan){', 'dutySizeText 就位');
  has(html, 'return { no: k + 1, members: mem };', '返回形状仍是 [{no, members}]（组号从 1 连续编）');
  has(html, 'const DUTY_GROUP_SIZE = 4;', 'DUTY_GROUP_SIZE 仍是 4（基准）');
  has(html, 'const DUTY_GROUP_MIN = 3;', 'DUTY_GROUP_MIN = 3（下限）');
  eq(cnt(html, 'function dutyTeamPlan('), 1, 'dutyTeamPlan 只定义一次');
  eq(cnt(html, 'function dutyGroupSizes('), 1, 'dutyGroupSizes 只定义一次');
  eq(cnt(html, 'function dutyGroupSizesEven('), 1, 'dutyGroupSizesEven 只定义一次');
  eq(cnt(html, 'function dutySizeText('), 1, 'dutySizeText 只定义一次');
  eq(cnt(html, 'DUTY_TEAM_SIZE'), 0, '上一代 8 人一组常量仍无残影');
  eq(cnt(html, 'DUTY_TEAM_MIN_TAIL'), 0, '上一代尾巴门槛常量仍无残影');

  /* 🔴 旧按天引擎的 11 个函数 + 3 个常量必须原样保留（_v2100_test.js 真跑它们）。 */
  ['dutyEnsureQueue', 'dutyNextFrom', 'dutyGenerateWeek', 'dutyEnsureWeeks',
   'dutyRoundProgress', 'dutyRoundGroups', 'dutyClearFromWeek', 'autoWaterDuty',
   'punishStatusFor', 'chunkNames', 'localDateStr'].forEach(n => {
    has(html, 'function ' + n + '(', '旧按天引擎 ' + n + ' 仍在（契约保全）');
  });
  ['dutyDays', 'dutyAreas', 'dutyAreaCounts'].forEach(n => {
    has(html, 'const ' + n + ' =', '旧常量 ' + n + ' 仍在');
  });
  /* ⚠️ dutyRoundGroups() 体内**合法**地有 g.classroom / g.area —— 与新引擎无关，别误判。 */
  const rg = braceFn('dutyRoundGroups');
  has(rg, 'classroom', 'dutyRoundGroups 里那份同名字段仍保留（不是残留、是旧引擎自己的）');

  /* 切组不得改写 teamOrder（换人 = 对调位置，不是重排） */
  notHas(stripCss(braceFn('dutyTeamPlan')), 'teamOrder =', 'dutyTeamPlan 不写 teamOrder');
  notHas(braceFn('dutyTeamPlan'), 'splice(', 'dutyTeamPlan 不就地改数组');
  notHas(braceFn('dutyGroupSizes'), 'DUTY_GROUP_SIZE =', 'dutyGroupSizes 不改常量');

  /* 页面锚点（v2.21.0 起就是切片锚点，改名会静默崩测试） */
  has(html, 'id="dutyTeams"', '分组容器 id 就位');
  has(html, 'id="dutyTeamsHint"', '分组提示条 id 就位');
  has(html, 'id="dutyProgressBar"', '周进度容器仍在');
  has(html, '.duty-toolbar{', '.duty-toolbar 主规则在');
  has(html, "if(page==='duty')", '值日页路由仍在');
  has(html, '<!-- Duty Page（', '值日页段注释仍在（_v2208 / _v2211 拿它当切片锚点）');
  has(html, '每组 3—4 人，每周教室 1 组 + 公共卫生 1 组，按组数循环', '段注释已写明新规则（不是仍写「一组 4 人」）');
} catch (e) { log(false, '…⑧段执行中止：' + e.message); }

// ============================================================
console.log('\n⑨ 事故哨兵');
// ============================================================
try {
  /* 🔴 推导式必须是「最小非负 b」：[0,3,2,1] 这张表就是 n % 4 的映射。
     写成 [0,1,2,3] 之类会让 58 人算出 4 个 3 人组 —— 和仍是 58，但组数变 14，周序全乱。 */
  has(braceFn('dutyGroupSizes'), 'var b = [0, 3, 2, 1][n % 4];', 'b 的推导表是 [0,3,2,1]（按 n % 4 取最小非负解）');
  has(braceFn('dutyGroupSizes'), 'return dutyGroupSizesEven(n);', '无解时走均分兜底（不返回空、不崩）');
  has(braceFn('dutyGroupSizes'), 'a !== Math.floor(a)', '整除校验在位（防浮点误差做出半人组）');
  ok(braceFn('dutyTeamPlan').indexOf('dutyGroupSizes(ids.length)') > 0,
    'dutyTeamPlan 用 dutyGroupSizes 算人数分配（不是写死 4 的 for 步长）');
  notHas(braceFn('dutyTeamPlan'), 'i += DUTY_GROUP_SIZE', '旧的「每 4 人一段」步长切法已删除');

  // 内联 <script> 语法闸：坏掉时这里先红
  const blocks = html.split('<script');
  let checked = 0, syntaxOk = true, synErr = '';
  for (let i = 1; i < blocks.length; i++) {
    const seg = blocks[i];
    const close = seg.indexOf('</script>');
    if (close < 0) continue;
    const body = seg.slice(seg.indexOf('>') + 1, close);
    if (!/dutyGroupSizes/.test(body)) continue;
    checked++;
    try { new Function(body); } catch (e) { syntaxOk = false; synErr = e.message; }
  }
  ok(checked > 0, '找到含新分组代码的内联 <script> 块（' + checked + ' 个）');
  ok(syntaxOk, '该脚本块能被 JS 解析器解析通过' + (syntaxOk ? '' : '：' + synErr));
} catch (e) { log(false, '…⑨段执行中止：' + e.message); }

// ============================================================
// 汇总行用项目现行格式「结果：N 通过，M 失败」—— _rm/_runall_mirror.py 只认这个格式取断言条数。
console.log('\n' + '='.repeat(56));
console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
