// _v2280_test.js — v2.28.0：值日模块按「26幼2班教室与公共卫生轮值表」重做
//
// ① 版本一致性（版本无关：从 sw.js 的 CACHE_NAME 反推，下次跟版零成本）
// ② 与原表逐周对表 —— 15 周 × 2 岗位 = 30 格全量核对（这是「按照这个表」最硬的证据）
// ③ 基线展开 dutyExpandRole / dutyScheduleTable（无插队时 = 原表）
// ④ 罚扫：接续下周、可连点、只占它那一个岗位格、连锁顺延、不自动扣学分
// ⑤ 延缓：该周该岗位轮空、该组及后面全体顺延一周
// ⑥ 复合：先延缓再对同一组罚扫 —— 锚点必须按**展开后**的界面定位（本版最容易做错的地方）
// ⑦ 守恒不变量 —— 每个岗位队列里 base 组恰好各出现一次，长度恒为 n + 插队笔数
// ⑧ 单步撤销 dutyUndoInsert
// ⑨ 一键恢复正常轮值 dutyResetInserts
// ⑩ 契约保全 —— 旧按天引擎 11 符号、页面锚点、换人签名
// ⑪ 事故哨兵 —— 定义次数、锚点与 push 的先后、语法闸
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
  log(i >= 0, msg + (i >= 0 ? '' : '\u300c\u7f3a ' + JSON.stringify(String(s).slice(0, 70)) + '\u300d'));
}
function notHas(t, s, msg) {
  const i = String(t).indexOf(s);
  log(i < 0, msg + (i < 0 ? '' : '\u300c\u4e0d\u8be5\u6709 ' + JSON.stringify(String(s).slice(0, 70)) + '\u300d'));
}
function eq(a, b, msg) { log(a === b, (msg || '') + '\uff08\u671f\u671b ' + JSON.stringify(b) + '\uff0c\u5b9e\u5f97 ' + JSON.stringify(a) + '\uff09'); }
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }
/* 反向判据（"旧结构已删"）必须先剥块注释：说明性注释里会含旧结构的**字面** */
function stripCss(t) { return String(t).replace(/\/\*[\s\S]*?\*\//g, ''); }
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

const V = (sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/) || [])[1] || '';

// ============================================================
console.log('\n\u2460 \u7248\u672c\u4e00\u81f4\u6027\uff08\u4ece sw.js \u53cd\u63a8\uff0c\u7248\u672c\u65e0\u5173\uff09');
// ============================================================
ok(/^v\d+\.\d+\.\d+$/.test(V), 'sw.js 的 CACHE_NAME 能解析出版本号：' + V);
has(html, '<div class="login-version">' + V + '</div>', '登录页版本号 = ' + V);
has(html, '<div class="sidebar-footer">' + V + ' \u00b7 \u73ed\u4e3b\u4efb\u5de5\u4f5c\u53f0</div>', '侧栏页脚版本号 = ' + V);
has(html, '\ud83c\udff7\ufe0f ' + V + '</span>', '设置页版本徽标 = ' + V);
has(html, '\ud83d\udcdd \u8fd1\u7248\u66f4\u65b0\u901f\u89c8\uff08' + V + '\uff09', '速览标题 = ' + V);
has(sw, "CACHE_NAME = 'class-manager-" + V + "'", 'sw.js CACHE_NAME 与之一致');

// ============================================================
// 纯函数沙箱（引擎段不依赖 DOM，可整段真跑）
// ============================================================
function envSrc() {
  return [
    constDecl('DUTY_GROUP_SIZE'),
    constDecl('DUTY_GROUP_MIN'),
    braceFn('dutyGroupSizes'),
    braceFn('dutyGroupSizesEven'),
    braceFn('dutyWeekGroupIndex'),
    braceFn('dutyRoleName'),
    braceFn('dutyExpandRole'),
    braceFn('dutyCycleWeeks'),
    braceFn('dutyScheduleTable'),
    braceFn('dutyGroupWeeksOf'),
    braceFn('dutyAnchorBase'),
    braceFn('dutySyncTeamOrder'),
    braceFn('dutyTeamPlan'),
    braceFn('dutyInsertAdd'),
    braceFn('dutyPenalize'),
    braceFn('dutyDelay'),
    braceFn('dutyUndoInsert'),
    braceFn('dutyResetInserts')
  ].join('\n');
}

function mkStudents(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 's' + i, sid: String(i).padStart(2, '0'), name: '\u5b66' + i });
  return out;
}

function mk(students, dirty, confirmRet) {
  const d = Object.assign({
    teamOrder: [], inserts: [], currentWeek: 0, schedule: [], servedIds: [],
    roundLedger: [], round: 1, lastGenWeek: -1, queue: [], cursorId: null
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
    envSrc(),
    'return { env: env, state: state, PEN: dutyPenalize, DELAY: dutyDelay, UNDO: dutyUndoInsert, RESET: dutyResetInserts,',
    '  expand: dutyExpandRole, weeks: dutyCycleWeeks, table: dutyScheduleTable, gw: dutyGroupWeeksOf,',
    '  weekIdx: dutyWeekGroupIndex, roleName: dutyRoleName, anchor: dutyAnchorBase,',
    '  plan: function(){ return dutyTeamPlan(state.students, state.duty.teamOrder); },',
    '  setWeek: function(w){ state.duty.currentWeek = w; },',
    '  sched: function(){ return dutyScheduleTable(dutyTeamPlan(state.students, state.duty.teamOrder), state.duty.inserts); },',
    '  q: function(role){ return dutyExpandRole(dutyTeamPlan(state.students, state.duty.teamOrder).length, role, state.duty.inserts); },',
    '  at: function(role, g, w){ return dutyAnchorBase(dutyTeamPlan(state.students, state.duty.teamOrder).length, role, state.duty.inserts, g, w); },',
    '  SIZE: DUTY_GROUP_SIZE };'
  ].join('\n'))();
}

/* 28 人 → 7 组（奇数，两岗位各恰好覆盖全班一轮，与原表同构）。
   基线（role=0 教室 / role=1 公卫，n=7）：
     教室 i=0..6 → 组 1,3,5,7,2,4,6
     公卫 i=0..6 → 组 2,4,6,1,3,5,7 */
const S28 = mkStudents(28);
const BASE_ROOM = [1, 3, 5, 7, 2, 4, 6];
const BASE_AREA = [2, 4, 6, 1, 3, 5, 7];

// ============================================================
console.log('\n\u2461 \u4e0e\u539f\u8868\u9010\u5468\u5bf9\u8868\uff0815 \u5468 \u00d7 2 \u5c97\u4f4d = 30 \u683c\uff09');
// ============================================================
try {
/* 直接从 F:\26幼2\26幼2班教室与公共卫生轮值表..xlsx 的 A3:E18 抄下来（周次 / 教室组号 / 公卫组号） */
const XLSX = [
  ['G1', 'G2'], ['G3', 'G4'], ['G5', 'G6'], ['G7', 'G8'], ['G9', 'G10'],
  ['G11', 'G12'], ['G13', 'G14'], ['G15', 'G1'], ['G2', 'G3'], ['G4', 'G5'],
  ['G6', 'G7'], ['G8', 'G9'], ['G10', 'G11'], ['G12', 'G13'], ['G14', 'G15']
];
{
  const T = mk(mkStudents(59), {}, true);   // 59 人 → 15 组，与原表人数一致
  eq(T.plan().length, 15, '59 人切成 15 组（原表 G1—G15）');
  let bad = 0, firstBad = '';
  for (let w = 0; w < 15; w++) {
    const room = 'G' + (T.weekIdx(15, w, 0) + 1);
    const area = 'G' + (T.weekIdx(15, w, 1) + 1);
    if (room !== XLSX[w][0] || area !== XLSX[w][1]) {
      bad++;
      if (!firstBad) firstBad = '第 ' + (w + 1) + ' 周 实得 ' + room + '/' + area + '，原表 ' + XLSX[w][0] + '/' + XLSX[w][1];
    }
  }
  eq(bad, 0, '15 周的教室/公卫组号与原表**逐格一致**（不符 ' + bad + ' 格）' + (firstBad ? '\uff1a' + firstBad : ''));
  // 显式抽几条代表作（失败时一眼看得出错在哪）
  [[0, 'G1', 'G2'], [1, 'G3', 'G4'], [7, 'G15', 'G1'], [14, 'G14', 'G15']].forEach(p => {
    eq('G' + (T.weekIdx(15, p[0], 0) + 1) + '/' + 'G' + (T.weekIdx(15, p[0], 1) + 1), p[1] + '/' + p[2],
      '第 ' + (p[0] + 1) + ' 周 = ' + p[1] + ' / ' + p[2] + '（原表）');
  });
  // 第 16 周起与原表 A19 备注一致：与第 1 周相同
  eq('G' + (T.weekIdx(15, 15, 0) + 1) + '/' + 'G' + (T.weekIdx(15, 15, 1) + 1), 'G1/G2',
    '第 16 周与第 1 周相同（原表 A19「第16周起与第1周相同，循环往复」）');
  // 30 格全量覆盖统计
  const roomSet = new Set(), areaSet = new Set();
  for (let w = 0; w < 15; w++) { roomSet.add(T.weekIdx(15, w, 0)); areaSet.add(T.weekIdx(15, w, 1)); }
  eq(roomSet.size, 15, '15 周里 15 个组各做 1 次教室（无遗漏无偏心）');
  eq(areaSet.size, 15, '15 周里 15 个组各做 1 次公卫');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2462 \u5207\u7ec4\u4e0e\u57fa\u7ebf\u5c55\u5f00');
// ============================================================
try {
{
  const T = mk(S28, {}, true);
  eq(T.SIZE, 4, '一组**基准** 4 人（末段不足 3 人时会与前面的组均分）');
  eq(T.plan().length, 7, '28 人 → 7 组');
  eq(T.plan().map(g => g.members.length).join(','), '4,4,4,4,4,4,4', '每组恰好 4 人');
  ok(T.plan().every(g => g.classroom === undefined && g.area === undefined),
    '组对象不带 classroom / area（岗位按周轮，不按组内前后半切）');
  const flat = T.plan().reduce((a, g) => a.concat(g.members), []);
  eq(new Set(flat).size, 28, '划分不变量：28 人恰好各出现一次');

  const q = T.q(0);
  eq(q.length, 7, '无插队时教室队列长度 = 组数 7');
  eq(q.map(x => x.g).join(','), BASE_ROOM.join(','), '教室基线 = 1,3,5,7,2,4,6（= 原表口径）');
  eq(q.map(x => x.kind).join(','), 'base,base,base,base,base,base,base', '全部是 base 格');
  eq(T.q(1).map(x => x.g).join(','), BASE_AREA.join(','), '公卫基线 = 2,4,6,1,3,5,7');
  eq(T.weeks(7, []), 7, '无插队时一轮 7 周');

  const sch = T.sched();
  eq(sch.length, 7, '轮值表 7 行');
  eq(sch.map(r => r.classroom.g).join(','), BASE_ROOM.join(','), '轮值表教室列 = 基线');
  eq(sch.map(r => r.area.g).join(','), BASE_AREA.join(','), '轮值表公卫列 = 基线');
  ok(sch.every(r => r.classroom.kind === 'base' && r.area.kind === 'base'), '无插队时无 pen / delay 格');
  eq(T.weeks(0, []), 0, '0 组 → 0 周（不崩）');
  eq(T.expand(0, 0, []).length, 0, '0 组的展开为空');
  eq(T.expand(-3, 0, []).length, 0, '负数分组 → 空（不崩）');

  // 分组卡片的两个周次
  const w5 = T.gw(T.plan(), [], 5);
  eq(w5.classroom, 2, '第 5 组的教室周 = 第 3 周（下标 2）');
  eq(w5.area, 5, '第 5 组的公卫周 = 第 6 周（下标 5）');
  const w9 = T.gw(T.plan(), [], 9);
  eq(w9.classroom, -1, '不存在的组号 → -1（卡片显示「—」）');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2463 \u7f5a\u626b\uff1a\u63a5\u7eed\u4e0b\u5468\uff08\u53ea\u5360\u5b83\u90a3\u4e00\u4e2a\u5c97\u4f4d\u683c\uff09');
// ============================================================
try {
{
  // 第 3 周教室是第 5 组 → 点「下周继续罚扫」
  const T = mk(S28, { currentWeek: 2 }, true);
  eq(T.sched()[2].classroom.g, 5, '前提：第 3 周教室是第 5 组');
  T.PEN(0, 5);
  eq(T.state.duty.inserts.length, 1, '登记了 1 笔插队');
  const r = T.state.duty.inserts[0];
  eq(r.kind, 'pen', 'kind = pen');
  eq(r.role, 0, 'role = 0（教室）');
  eq(r.g, 5, 'g = 5');
  eq(r.at, 2, '锚点 = 基线第 3 格（就是它自己那一格）');
  eq(r.seq, 1, 'seq 从 1 起');
  eq(T.weeks(7, T.state.duty.inserts), 8, '一轮变成 8 周（插了一格）');
  const s2 = T.sched();
  eq(s2[2].classroom.g, 5, '第 3 周教室仍是第 5 组');
  eq(s2[3].classroom.g, 5, '第 4 周教室**还是**第 5 组（罚扫接续）');
  eq(s2[3].classroom.kind, 'pen', '第 4 周那一格标成 pen（界面显示「🔴 罚扫」）');
  eq(s2.slice(4).map(x => x.classroom.g).join(','), BASE_ROOM.slice(3).join(','),
    '第 5 周起全体顺延一周（回到基线顺序）');
  // 🔑 老板选的粒度：只占它那个岗位一格 —— 公卫一列**一个字节都没动**
  /* 整表多了一行 ⇒ 轮到下一轮的开头，所以只比前 7 行（第 8 行 = 第 1 周，回绕是正确行为） */
  eq(s2.slice(0, 7).map(x => x.area.g).join(','), BASE_AREA.join(','), '公卫照常轮值（只有教室被插了一格）');
  eq(T.q(1).length, 7, '公卫队列长度仍是 7');
  // 反馈与落盘
  eq(T.env.saves, 1, '罚扫落了盘');
  eq(T.env.renders.join(','), 'duty,today,progress', '罚扫刷新三个渲染入口');
  eq(T.env.toasts.length, 1, '罚扫弹了 1 条提示');
  has(T.env.toasts[0][0], '\u7b2c 5 \u7ec4', '提示里点了组号');
  has(T.env.toasts[0][0], '\u4e0d\u6263\u5b66\u5206', '提示明说「不扣学分」（老板要求不要自动扣分）');
  eq(T.env.toasts[0][1], 'success', '提示类型 success');
}
{
  // 连点两次 → 该组连做三周（等差接续，连锁自动处理）
  const T = mk(S28, { currentWeek: 2 }, true);
  T.PEN(0, 5);
  T.setWeek(3);         // 老板翻到第 4 周，看到还是第 5 组，再点一次
  T.PEN(0, 5);
  eq(T.state.duty.inserts.length, 2, '登记了 2 笔');
  eq(T.state.duty.inserts[1].at, 2, '第二笔锚点仍落在同一格（没有跑到本轮末尾去）');
  const s = T.sched();
  eq(s.length, 9, '一轮 9 周');
  eq([s[2], s[3], s[4]].map(x => x.classroom.g).join(','), '5,5,5', '第 3/4/5 周教室连着三个第 5 组');
  eq(s.slice(5).map(x => x.classroom.g).join(','), BASE_ROOM.slice(3).join(','), '之后再顺延回基线');
  eq(s.slice(0, 7).map(x => x.area.g).join(','), BASE_AREA.join(','), '公卫依然一点没动');
}
{
  // 公卫上的罚扫：同样只动公卫那一列
  const T = mk(S28, { currentWeek: 0 }, true);
  eq(T.sched()[0].area.g, 2, '前提：第 1 周公卫是第 2 组');
  T.PEN(1, 2);
  const s = T.sched();
  eq(s[0].area.g + ',' + s[1].area.g, '2,2', '第 2 周公卫还是第 2 组');
  eq(s.slice(0, 7).map(x => x.classroom.g).join(','), BASE_ROOM.join(','), '教室一列完全没动（粒度=一格）');
  eq(T.weeks(7, T.state.duty.inserts), 8, '公卫插队同样让整轮 +1 周');
}
{
  // 不自动扣学分：代码层面确认没碰学分链路
  const body = stripCss(braceFn('dutyPenalize'));
  notHas(body, 'applyCredit', '罚扫**不**调用 applyCredit（不产生扣分流水）');
  notHas(body, 'state.credit', '罚扫不碰 state.credits');
  notHas(body, 'deduct', '罚扫里没有扣分字段');
  has(body, 'saveData()', '罚扫仍会保存记录');
  has(body, 'dutyInsertAdd(', '罚扫走统一的插队登记');
  has(html, 'function dutyPenalize(role, g){', 'dutyPenalize 就位');
}
{
  // 边界：分组空 / 组号越界 / 组号非法
  const E = mk([], {}, true);
  eq(E.PEN(0, 1), undefined, '空班 → 罚扫直接返回（函数无返回值）');
  eq(E.state.duty.inserts.length, 0, '空班不登记插队');
  eq(E.env.saves, 0, '空班不写盘');
  eq(E.env.toasts.length, 1, '空班只弹一条提示');
  eq(E.env.toasts[0][1], 'error', '空班提示类型 error');
  has(E.env.toasts[0][0], '\u65e0\u6cd5\u5b89\u6392\u7f5a\u626b', '空班提示「无法安排罚扫」');

  const B = mk(S28, {}, true);
  B.PEN(0, 0);
  B.PEN(0, 8);
  B.PEN(0, -1);
  B.PEN(0, 'x');
  eq(B.state.duty.inserts.length, 0, '组号 0 / 超界 / 负数 / 非数字 一律不登记（防脏数据）');
  B.PEN(0, 3);
  eq(B.state.duty.inserts.length, 1, '合法组号能登记');
  eq(B.state.duty.inserts[0].g, 3, '组号是数字（不是字符串）');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2464 \u5ef6\u7f13\uff1a\u8be5\u5468\u8f6e\u7a7a\u3001\u8be5\u7ec4\u53ca\u540e\u9762\u5168\u4f53\u987a\u5ef6\u4e00\u5468');
// ============================================================
try {
{
  const T = mk(S28, { currentWeek: 2 }, true);
  T.DELAY(0, 5);
  eq(T.state.duty.inserts.length, 1, '登记了 1 笔');
  const r = T.state.duty.inserts[0];
  eq(r.kind, 'delay', 'kind = delay');
  eq(r.at, 2, '锚点 = 基线第 3 格');
  eq(T.weeks(7, T.state.duty.inserts), 8, '一轮 8 周');
  const s = T.sched();
  eq(s[2].classroom.g, null, '第 3 周教室**轮空**（有人延缓让位）');
  eq(s[2].classroom.kind, 'delay', '那一格标成 delay（界面显示「轮空」）');
  eq(s[3].classroom.g, 5, '第 5 组顺延到第 4 周');
  // 全体顺延：w≥3 的教室组 = 基线 w-1 的教室组
  let bad = 0;
  for (let w = 3; w <= 7; w++) if (s[w].classroom.g !== BASE_ROOM[w - 1]) bad++;
  eq(bad, 0, '从它起全体顺延一周（第 5 组及后面每一个都往后挪了一周）');
  eq(s.slice(0, 7).map(x => x.area.g).join(','), BASE_AREA.join(','), '公卫一列完全没动');
  eq(T.env.toasts[0][1], 'info', '延缓提示类型 info');
  has(T.env.toasts[0][0], '\u8f6e\u7a7a', '提示说清了「下周该岗位轮空」');
  eq(T.env.saves, 1, '延缓落盘 1 次');
}
{
  const T = mk(S28, { currentWeek: 0 }, true);
  T.DELAY(1, 2);   // 公卫第 2 组
  const s = T.sched();
  eq(s[0].area.g, null, '公卫第 1 周轮空');
  eq(s[1].area.g, 2, '第 2 组公卫顺延到第 2 周');
  eq(s.slice(0, 7).map(x => x.classroom.g).join(','), BASE_ROOM.join(','), '教室一列没动');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2465 \u590d\u5408\uff1a\u5148\u5ef6\u7f13\u518d\u5bf9\u540c\u4e00\u7ec4\u7f5a\u626b\uff08\u951a\u70b9\u5fc5\u987b\u6309\u5c55\u5f00\u540e\u7684\u754c\u9762\u5b9a\u4f4d\uff09');
// ============================================================
try {
{
  const T = mk(S28, { currentWeek: 2 }, true);
  T.DELAY(0, 5);                 // 第 3 周教室：第 5 组延缓 → 第 3 周轮空，第 5 组挪到第 4 周
  eq(T.sched()[3].classroom.g, 5, '前提：延缓后第 5 组出现在第 4 周');
  T.setWeek(3);                  // 老板翻到第 4 周，看到第 5 组，点「下周继续罚扫」
  const at = T.at(0, 5, 3);
  eq(at, 2, '\u951a\u70b9\u7b97\u51fa\u6765\u662f 2（第 5 组基线那一格），**不是 3**');
  T.PEN(0, 5);
  eq(T.state.duty.inserts.length, 2, '两笔插队都在');
  eq(T.state.duty.inserts[1].at, 2, '第二笔锚点也在第 2 格');
  const s = T.sched();
  eq(s.length, 9, '一轮 9 周');
  eq(s[2].classroom.g, null, '第 3 周仍轮空');
  eq(s[3].classroom.g + ',' + s[4].classroom.g, '5,5', '第 4、5 周教室都是第 5 组（延缓 + 罚扫各占一格）');
  eq(s[5].classroom.g, BASE_ROOM[3], '第 7 组顺延到第 6 周');
  eq(s.slice(0, 7).map(x => x.area.g).join(','), BASE_AREA.join(','), '公卫一列自始至终没动');
  ok(T.state.duty.inserts.every(x => x.at === 2), '两笔都锚在同一格 —— 没有一笔跑偏');
}
{
  /* 反向对照：锚点若拿**当前周号**当锚点（而不是回到该组真正那一格），罚扫会一路向下漂。
     教室列里第 5 组固定出现在下标 2（第 3 周）—— 所以哪怕老板在第 4 周点罚扫，锚点也必须回到 2。 */
  const T = mk(S28, { currentWeek: 2 }, true);
  eq(T.at(0, 5, 2), 2, '无插队时锚点就是当前周那一格（第 5 组在教室列正好是下标 2）');
  T.DELAY(0, 5);
  eq(T.state.duty.inserts[0].at, 2, '第 1 笔锚在下标 2');
  eq(T.sched()[3].classroom.g, 5, '延缓后第 5 组出现在第 4 周（下标 3）');
  eq(T.at(0, 5, 3), 2, '第 2 笔仍锚回下标 2（而不是顺着周号漂到 3）');
  ok(T.at(0, 5, 3) !== 3, '锚点没有按「当前周号」直线漂移');
  T.PEN(0, 5);
  const s = T.sched();
  eq(s[3].classroom.g + ',' + s[4].classroom.g, '5,5', '第 4、5 周都是第 5 组（锚点没漂的证据）');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2466 \u5b88\u6052\u4e0d\u53d8\u91cf\uff08\u65e0\u8bba\u600e\u4e48\u63d2\uff0c\u57fa\u7ebf\u90fd\u4e0d\u91cd\u4e0d\u6f0f\uff09');
// ============================================================
try {
{
  const T = mk(S28, { currentWeek: 1 }, true);
  T.PEN(0, 3);
  T.setWeek(2); T.DELAY(0, 5);
  T.setWeek(1); T.PEN(1, 4);
  T.setWeek(4); T.DELAY(1, 6);
  const ins = T.state.duty.inserts;
  eq(ins.length, 4, '4 笔插队（教室 2 笔 + 公卫 2 笔）');
  eq(T.q(0).length, 7 + 2, '教室队列长度 = 7 + 2');
  eq(T.q(1).length, 7 + 2, '公卫队列长度 = 7 + 2');
  eq(T.weeks(7, ins), 11, '整轮 = 7 + 4 = 11 周');
  eq(T.sched().length, 11, '轮值表 11 行');
  [0, 1].forEach(role => {
    const q = T.q(role);
    const base = q.filter(x => x.kind === 'base').map(x => x.g).sort((a, b) => a - b);
    eq(base.join(','), '1,2,3,4,5,6,7', 'role=' + role + '：base 格仍是全班 7 组各一次（不重不漏）');
    const nulls = q.filter(x => x.g === null).length;
    eq(nulls, role === 0 ? 1 : 1, 'role=' + role + '：恰好 1 个空槽');
  });
  // 每个 base 格都出现在正确的相对位置上
  const q0 = T.q(0);
  const baseG = q0.filter(x => x.kind === 'base').map(x => x.g).join(',');
  eq(baseG, BASE_ROOM.join(','), '教室 base 顺序没被插队弄乱');
  // 界面上每一周两个岗位都有一格（不存在「整天没人」）
  ok(T.sched().every(r => r.classroom && r.area), '每周的两个岗位都有格子（轮空是显式的 null 格，不是缺行）');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2467 \u5355\u6b65\u64a4\u9500 dutyUndoInsert');
// ============================================================
try {
{
  const T = mk(S28, { currentWeek: 1 }, true);
  T.UNDO();
  eq(T.env.toasts.length, 1, '空栈点撤销 → 1 条提示');
  eq(T.env.toasts[0][1], 'info', '提示类型 info');
  has(T.env.toasts[0][0], '\u6ca1\u6709\u53ef\u64a4\u9500', '提示「没有可撤销的罚扫 / 延缓」');
  eq(T.env.saves, 0, '空栈撤销不写盘');

  T.PEN(0, 3);
  T.setWeek(2); T.DELAY(0, 5);
  eq(T.state.duty.inserts.length, 2, '前提：2 笔插队');
  T.UNDO();
  eq(T.state.duty.inserts.length, 1, '撤销后剩 1 笔');
  eq(T.state.duty.inserts[0].kind, 'pen', '撤掉的是**最后**那笔（delay / seq 更大），第一笔完好');
  eq(T.state.duty.inserts[0].g, 3, '第一笔的内容没被改动');
  eq(T.env.renders.slice(-3).join(','), 'duty,today,progress', '撤销后刷新三个渲染入口');
  T.UNDO();
  eq(T.state.duty.inserts.length, 0, '再撤一次 → 回到基线');
  eq(T.sched().map(x => x.classroom.g).join(','), BASE_ROOM.join(','), '回到基线后轮值表与原表一致');
  eq(T.sched().map(x => x.area.g).join(','), BASE_AREA.join(','), '公卫也回到基线');
  T.UNDO();
  eq(T.env.toasts.slice(-1)[0][1], 'info', '撤空之后再点还是安全提示');
  eq(T.state.duty.inserts.length, 0, '不会出现负长度');
  ok(T.env.saves >= 2, '每次真实撤销都落盘');
}
{
  const T = mk(S28, { currentWeek: 1 }, true);
  T.PEN(0, 3);
  const before = T.sched().map(x => x.classroom.g + '/' + x.area.g).join(' ');
  T.UNDO();
  const after = T.sched().map(x => x.classroom.g + '/' + x.area.g).join(' ');
  ok(before !== after, '撤销确实改变了排班（不是个摆设按钮）');
  ok(!after.includes('BASE'), '撤销后没有残留脏标记');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2468 \u4e00\u952e\u6062\u590d\u6b63\u5e38\u8f6e\u503c dutyResetInserts');
// ============================================================
try {
{
  const T = mk(S28, { currentWeek: 1 }, true);   // confirm 返回 true
  T.RESET();
  eq(T.env.confirms.length, 0, '没有插队时根本不弹确认框');
  eq(T.env.toasts.length, 1, '只弹一条提示');
  has(T.env.toasts[0][0], '\u5f53\u524d\u5c31\u662f\u6b63\u5e38\u8f6e\u503c', '提示「当前就是正常轮值」');
  eq(T.env.saves, 0, '不写盘');
}
{
  const T = mk(S28, { currentWeek: 1 }, true);
  T.PEN(0, 3);
  T.setWeek(2); T.DELAY(0, 5);
  T.setWeek(1); T.PEN(1, 4);
  eq(T.state.duty.inserts.length, 3, '前提：3 笔');
  const savesBefore = T.env.saves;
  T.RESET();
  eq(T.state.duty.inserts.length, 0, '一键恢复清空了全部插队');
  eq(T.env.confirms.length, 1, '弹了一次确认');
  has(T.env.confirms[0], '3 \u5904', '确认文案报了要清掉的处数');
  has(T.env.confirms[0], '7 \u5468\u5faa\u73af', '确认文案报了回到几周循环');
  eq(T.sched().length, 7, '轮值表回到 7 周');
  eq(T.sched().map(x => x.classroom.g).join(','), BASE_ROOM.join(','), '教室回到基线');
  eq(T.sched().map(x => x.area.g).join(','), BASE_AREA.join(','), '公卫回到基线');
  eq(T.env.saves - savesBefore, 1, '恢复只多落盘 1 次');
  has(T.env.toasts.slice(-1)[0][0], '\u5df2\u6062\u590d\u6b63\u5e38\u8f6e\u503c', '成功后回执');
}
{
  // 取消 → 一个字节都不改
  const T = mk(S28, { currentWeek: 1 }, false);   // confirm 返回 false
  T.PEN(0, 3);                                     // 这笔不受影响（PEN 不弹确认）
  const insBefore = JSON.stringify(T.state.duty.inserts);
  T.RESET();
  eq(JSON.stringify(T.state.duty.inserts), insBefore, '取消恢复：插队层原样不动');
  eq(T.env.confirms.length, 1, '取消恢复：确实弹过确认框');
  eq(T.env.saves, 1, '取消恢复：没有多出一次写盘（只有前面罚扫那一次）');
  eq(T.env.toasts.length, 1, '取消恢复：没有弹成功提示');
}
{
  // currentWeek 超出新循环长度时会被拉回 0（否则界面会指到不存在的周）
  const T = mk(S28, { currentWeek: 20 }, true);
  eq(T.state.duty.currentWeek, 20, '前提：周号被人为翻到很后面');
  T.PEN(0, 3);
  T.RESET();
  eq(T.state.duty.currentWeek, 0, '恢复后周号被拉回第 1 周（20 ≥ 7）');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u2469 \u5951\u7ea6\u4fdd\u5168\uff08\u65e7\u884c\u4e3a\u4e0e\u9875\u9762\u951a\u70b9\uff09');
// ============================================================
try {
['dutyEnsureQueue', 'dutyNextFrom', 'dutyGenerateWeek', 'dutyEnsureWeeks',
 'dutyRoundProgress', 'dutyRoundGroups', 'dutyClearFromWeek', 'autoWaterDuty',
 'punishStatusFor', 'chunkNames', 'localDateStr'].forEach(n => {
  has(html, 'function ' + n + '(', '旧函数 ' + n + ' 仍在（_v2100_test.js 真跑，不能删）');
});
['dutyDays', 'dutyAreas', 'dutyAreaCounts'].forEach(n => {
  ok(new RegExp('const ' + n + '\\s*=').test(html), '旧常量 ' + n + ' 仍在（extractSingleConst 真跑）');
});
has(html, "const dutyAreaCounts = {'\u6559\u5ba4':4,'\u516c\u5171\u533a':4};", 'dutyAreaCounts 字面量未改');
has(html, "const dutyDays = ['\u5468\u4e00','\u5468\u4e8c','\u5468\u4e09','\u5468\u56db','\u5468\u4e94','\u5468\u65e5'];", 'dutyDays 字面量未改');

// 页面锚点（既有测试与页面结构都依赖）
has(html, 'class="page" id="page-duty"', '值日页容器串未改');
has(html, 'class="duty-toolbar"', '.duty-toolbar 类名保留');
has(html, '.duty-toolbar{', '.duty-toolbar 主规则在');
has(html, 'id="dutyTeams"', '分组容器 id 就位');
has(html, 'id="dutyTeamsHint"', '分组提示条 id 就位');
has(html, 'id="dutyTodayCard"', '本周值日卡沿用旧 id');
has(html, 'id="dutyProgressBar"', '周进度容器仍在');
has(html, 'id="dutyEmptyHint"', '空状态卡仍在');
has(html, 'id="dutyWeekNo"', '周序显示仍在');
has(html, 'onclick="dutyPrevWeek()"', '上一周按钮接线');
has(html, 'onclick="dutyNextWeek()"', '下一周按钮接线');
has(html, 'onclick="dutyGoRoundStart()"', '「回到本轮开头」按钮接线');
has(html, "function dutyGoRoundStart(){ switchWeek(0); }", 'dutyGoRoundStart 实现未改');
has(html, 'onclick="dutyUndoInsert()"', '「撤销上一步」按钮接线');
has(html, 'onclick="dutyResetInserts()"', '「恢复正常轮值」按钮接线');
eq(cnt(html, 'onclick="dutyExportImage()"'), 2, '导出图片仍是 2 个入口（工具栏 + 一览弹窗）');
has(html, '<h3 id="dutyRoundListTitle">\u503c\u65e5\u5206\u7ec4\u4e00\u89c8</h3>', '一览弹窗标题未改');
has(html, '/* ==================== \u503c\u65e5\u8868\u5bfc\u51fa\uff08\u7ec4\u522b\u5236\uff0c\u6253\u5370\u8d34\u5899\u7528\uff09',
  '导出段的区段注释保留（_v2208 / _v2211 拿它当切片锚点）');
has(html, "if(page==='duty')", '值日页路由仍在');
ok(/if\(page==='duty'\)[^\n]*renderDuty\(\)/.test(html), '路由里仍调 renderDuty()');
has(html, 'data-page="duty"', '侧栏入口仍在');

// 渲染入口与换人签名
['renderDuty', 'renderDutyToday', 'renderDutyProgress', 'dutyShowRoundList',
 'dutyExportImage', 'dutyRescheduleAll', 'dutyRescheduleShuffle',
 'dutySwapOrder', 'dutySyncTeamOrder', 'dutyTeamPlan', 'switchWeek'].forEach(n => {
  has(html, 'function ' + n + '(', n + ' 仍在');
});
has(html, 'function dutyMemClick(teamIdx, role, slot){', '换人入口签名未改（_v2172 依赖）');
{
  const d = braceFn('dutyMemClick');
  has(d, '_studentPickerPool = state.students.slice()', '换人注入全体候选池');
  has(d, 'refreshStudentPicker();', '换人刷新选择器列表');
  /* 传参发生在**调用方** renderDuty 的 chips 里（dutyMemClick 自己只是接收 role），
     所以这条锚点必须落在 renderDuty 上，不能落在 dutyMemClick 上。 */
  has(braceFn('renderDuty'), "\\'members\\'", "renderDuty 给名字 chip 传 role='members'（岗位按周轮，组内不再分前后半）");
  has(d, 'dataset', '把位置写进 dataset 传给选择器');
  has(d, 'g.members', '从 members 取当前人');
}
{
  const i = html.indexOf('function confirmStudentSelect(');
  const fn = html.slice(i, i + 2600);
  has(fn, 'dutySwapOrder(', '换人确认分支仍走 dutySwapOrder');
  has(fn, 'renderDuty()', '换人后刷新分组区');
  has(fn, 'renderDutyToday()', '换人后刷新本周卡');
  notHas(fn, 'g.area', '换人分支不再引用已删除的 g.area 字段');
}
{
  const i = html.indexOf('function confirmStudentSelectRemove(');
  const fn = html.slice(i, i + 1400);
  has(fn, '\u4e0d\u80fd\u6e05\u7a7a', '「移除」仍是提示语（分组结构不许留空位）');
  notHas(fn, 'dutySwapOrder(', '「移除」不会误调换人');
}
} catch (e) { log(false, '…段执行中止：' + e.message); }

// ============================================================
console.log('\n\u246a \u4e8b\u6545\u54e8\u5175');
// ============================================================
try {
{
  ['DUTY_GROUP_SIZE', 'dutyRoleName', 'dutyExpandRole', 'dutyCycleWeeks', 'dutyScheduleTable',
   'dutyGroupWeeksOf', 'dutyAnchorBase', 'dutyInsertAdd', 'dutyPenalize', 'dutyDelay',
   'dutyUndoInsert', 'dutyResetInserts'].forEach(n => {
    const pat = n === 'DUTY_GROUP_SIZE' ? 'const DUTY_GROUP_SIZE =' : 'function ' + n + '(';
    eq(cnt(html, pat), 1, n + ' 恰好定义 1 次');
  });
  eq(cnt(html, 'DUTY_TEAM_SIZE'), 0, '旧的 8 人一组常量已彻底下线（不留残影）');
  eq(cnt(html, 'DUTY_TEAM_MIN_TAIL'), 0, '旧的尾巴门槛常量已彻底下线');
  notHas(html, 'classroom: mem.slice(', '旧的「组内前 4 人教室」切法已删除');
}
{
  // 🔴 dutyInsertAdd 里锚点必须**先算再 push**：反过来算就会把刚插的那笔自己算进去
  const b = braceFn('dutyInsertAdd');
  const iAnchor = b.indexOf('dutyAnchorBase(');
  const iPush = b.indexOf('d.inserts.push(');
  ok(iAnchor > 0 && iPush > 0 && iAnchor < iPush, '锚点在 push 之前计算（顺序不能反）');
  has(b, 'if(gn < 1 || gn > n) return null;', '组号越界先挡掉');
  has(b, "if(!d.inserts) d.inserts = [];", '老数据没这个字段也能自愈');
  has(b, 'seq + 1', 'seq 取 max+1（单调递增，撤销靠它找最后一笔）');
}
{
  // 插队层必须是 state.duty 的子字段（不新开 state 字段，同步策略就不用动）
  const i = html.indexOf('function defaultDuty(){');
  const fn = html.slice(i, html.indexOf('\n}', i) + 2);
  has(fn, 'inserts:[]', 'defaultDuty 里声明了 inserts');
  eq(cnt(fn, 'inserts:'), 1, '只声明一次');
  has(fn, 'teamOrder:[]', 'teamOrder 仍在（旧数据兼容）');
  has(html, "key:'duty'", 'state.duty 落盘键名未改');
  has(html, 'msDuty', '云同步合并策略仍在（整体取新，插队层跟着一起同步）');
}
{
  // 插队层不得用 splice 改数组下标（会破坏锚点的可复现性）
  notHas(braceFn('dutyExpandRole'), 'splice(', '展开函数不就地改数组');
  notHas(stripCss(braceFn('dutyScheduleTable')), 'splice(', '轮值表生成不就地改数组');
}
{
  // 内联 <script> 语法闸：坏掉时这里先红（正则字面量里的花括号不会误伤）
  const blocks = html.split('<script');
  let checked = 0, syntaxOk = true, synErr = '';
  for (let i = 1; i < blocks.length; i++) {
    const seg = blocks[i];
    const close = seg.indexOf('</script>');
    if (close < 0) continue;
    const body = seg.slice(seg.indexOf('>') + 1, close);
    if (!/dutyResetInserts/.test(body)) continue;
    checked++;
    try { new Function(body); } catch (e) { syntaxOk = false; synErr = e.message; }
  }
  ok(checked > 0, '找到含新值日代码的内联 <script> 块（' + checked + ' 个）');
  ok(syntaxOk, '该脚本块能被 JS 解析器解析通过' + (syntaxOk ? '' : '：' + synErr));
}

// ============================================================
} catch (e) { log(false, '…段执行中止：' + e.message); }
// 汇总行用项目现行格式「结果：N 通过，M 失败」—— _rm/_runall_mirror.py 只认这个格式取断言条数。
console.log('\n' + '='.repeat(56));
console.log('\u7ed3\u679c\uff1a' + pass + ' \u901a\u8fc7\uff0c' + fail + ' \u5931\u8d25');
if (fail) { console.log('\n\u5931\u8d25\u9879\uff1a'); failures.forEach(f => console.log('  \u00b7 ' + f)); }
process.exit(fail ? 1 : 0);
