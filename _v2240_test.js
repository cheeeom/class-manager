// _v2240_test.js — v2.24.0：值日「小组划分」重做 + 饮水机深色修复 + 劳动整改不扣分
//
// ① 版本一致性（版本无关：从 sw.js 的 CACHE_NAME 反推，下次跟版零成本）
// ② 切组引擎 dutyTeamPlan 真跑 —— 一组 8 人（4 教室 + 4 公区），尾巴规则
// ③ 轮值映射 dutyWeekGroupIndex —— 组号即周序，含负周 / 越界 / 非数字
// ④ 名单对齐 dutySyncTeamOrder —— 退班移除、新人按学号补尾、幂等、不改入参
// ⑤ 换人 dutySwapOrder —— 只对调位置，「全班恰好一个划分」不变量不破
// ⑥ 饮水机卡片深色修复 —— 硬编码 #fff → 主题令牌（老板报的「黑底下依旧白色」）
// ⑦ 劳动整改不扣分 —— 去掉 applyCredit 与扣分输入框，deduct 恒 0
// ⑧ 劳动整改卡片脱离 <table> —— foster-parenting 造成的「多余卡片边缘」
// ⑨ 旧引擎契约保留 —— _v2100_test.js 真跑 11 个旧符号，一个都不能少
// ⑩ 导出图与新分组同源 —— 同一份 dutyTeamPlan，不另算一套切组
// ⑪ 页面结构与渲染入口
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
function has(t, s, msg) { log(String(t).indexOf(s) >= 0, msg + (String(t).indexOf(s) >= 0 ? '' : '\u300c缺 ' + JSON.stringify(String(s).slice(0, 70)) + '\u300d')); }
function notHas(t, s, msg) { log(String(t).indexOf(s) < 0, msg + (String(t).indexOf(s) < 0 ? '' : '\u300c不该有 ' + JSON.stringify(String(s).slice(0, 70)) + '\u300d')); }
function eq(a, b, msg) { log(a === b, (msg || '') + '\uff08期望 ' + JSON.stringify(b) + '\uff0c实得 ' + JSON.stringify(a) + '\uff09'); }
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
// 🔴 反向判据（「旧结构已删」）必须先剥块注释：新写的说明性注释里会含旧结构的**字面**
//    （本版就把 `<table>` 写进了「这里原先在 <table> 内」的注释里），不剥就会自己判红自己。
function stripCss(t) { return String(t).replace(/\/\*[\s\S]*?\*\//g, ''); }
function stripHtmlComment(t) { return String(t).replace(/<!--[\s\S]*?-->/g, ''); }

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
console.log('\n\u2461 \u5207\u7ec4\u5f15\u64ce dutyTeamPlan \u771f\u8dd1');
// ============================================================
const TEAM = new Function([
  constDecl('DUTY_TEAM_SIZE'),
  constDecl('DUTY_TEAM_MIN_TAIL'),
  braceFn('dutySyncTeamOrder'),
  braceFn('dutyTeamPlan'),
  braceFn('dutyWeekGroupIndex'),
  'return { plan: dutyTeamPlan, sync: dutySyncTeamOrder, weekIdx: dutyWeekGroupIndex, SIZE: DUTY_TEAM_SIZE, TAIL: DUTY_TEAM_MIN_TAIL };'
].join('\n'))();

eq(TEAM.SIZE, 8, '一组 8 人');
eq(TEAM.TAIL, 5, '尾巴门槛 5（最小可值班组合「教室 4 + 公区 1」）');

function mkStudents(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 's' + i, sid: String(i).padStart(2, '0'), name: '\u5b66' + i });
  return out;
}
const S16 = mkStudents(16);
const S48 = mkStudents(48);
const S58 = mkStudents(58);

// --- 老板班额 58 人：本版的核心场景 ---
const p58 = TEAM.plan(S58, []);
eq(p58.length, 7, '58 \u4eba \u2192 7 \u7ec4');
eq(p58.map(t => t.members.length).join(','), '9,9,8,8,8,8,8', '58 \u4eba \u2192 9/9/8/8/8/8/8\uff08\u5c3e\u5df4 2 \u4eba\u5e76\u5165\u524d\u4e24\u7ec4\uff09');
eq(p58.map(t => t.no).join(','), '1,2,3,4,5,6,7', '组号 1..7 连续');
ok(p58.every(t => t.classroom.length === 4), '\u6bcf\u7ec4\u6559\u5ba4\u6052\u4e3a 4 \u4eba');
eq(p58[0].area.length, 5, '第 1 组（9 人）公区 5 人');
eq(p58[6].area.length, 4, '第 7 组（8 人）公区 4 人');
ok(p58.every(t => t.classroom.length + t.area.length === t.members.length), '教室 + 公区 = 组员总数');
const flat58 = p58.reduce((a, t) => a.concat(t.members), []);
eq(flat58.length, 58, '58 人全员恰好出现一次（数量）');
eq(new Set(flat58).size, 58, '58 人全员恰好出现一次（无重复）');
const S58ids = new Set(S58.map(s => s.id));
ok(flat58.every(id => S58ids.has(id)), '组员全部来自本班名单');
// 尾巴 2 人被并进的是「最前面的组」（chunks[0] / chunks[1]）
const chunk0 = S58.slice(0, 8), chunk1 = S58.slice(8, 16);
ok(p58[0].members.includes(chunk0[0].id) && p58[0].members.includes(S58[56].id), '尾巴第 1 人并入第 1 组');
ok(p58[1].members.includes(chunk1[0].id) && p58[1].members.includes(S58[57].id), '尾巴第 2 人并入第 2 组');
ok(p58[2].members.length === 8 && !p58[2].members.includes(S58[56].id), '尾巴未污染后面的组');

// --- 整除 ---
const p48 = TEAM.plan(S48, []);
eq(p48.length, 6, '48 \u4eba \u2192 6 \u7ec4');
ok(p48.every(t => t.members.length === 8), '48 \u4eba \u2192 \u6bcf\u7ec4\u6070\u597d 8 \u4eba');

// --- 尾巴 = 5（自成一组的门槛，教室 4 + 公区 1）---
const p45 = TEAM.plan(mkStudents(45), []);
eq(p45.length, 6, '45 \u4eba \u2192 6 \u7ec4');
eq(p45[5].members.length, 5, '尾巴 5 人自成一组');
eq(p45[5].classroom.length, 4, '尾巴组教室 4 人');
eq(p45[5].area.length, 1, '尾巴组公区 1 人（刚好凑得出一个岗位）');

// --- 尾巴 = 4 且已有整组 → 拆开并入（老板原话「最后一组两人的，就分别分配一人到其他组」）---
const p52 = TEAM.plan(mkStudents(52), []);
eq(p52.length, 6, '52 \u4eba \u2192 6 \u7ec4\uff08\u5c3e\u5df4 4 \u4eba\u62c6\u5f00\u5e76\u5165\uff09');
eq(p52.map(t => t.members.length).join(','), '9,9,9,9,8,8', '4 人依次并给最前面的 4 个组');
eq(p52.reduce((a, t) => a + t.members.length, 0), 52, '人数守恒');

// --- 边界：全班不足 8 人 ---
eq(TEAM.plan([], []).length, 0, '空名单 → 0 组（不崩）');
eq(TEAM.plan(mkStudents(3), []).length, 1, '全班 3 人 → 1 组（凑不满也自成一组）');
eq(TEAM.plan(mkStudents(3), [])[0].members.length, 3, '3 人组人数正确');
eq(TEAM.plan(mkStudents(4), []).length, 1, '全班 4 人 → 1 组');
eq(TEAM.plan(mkStudents(5), [])[0].area.length, 1, '5 人组：教室 4 + 公区 1');
eq(TEAM.plan(mkStudents(8), []).length, 1, '全班 8 人 → 1 组');
eq(TEAM.plan(mkStudents(9), []).length, 1, '9 人 → 1 组（尾巴 1 人并入，不单独成组）');
eq(TEAM.plan(mkStudents(13), []).map(t => t.members.length).join(','), '8,5', '13 人 → 8 + 5');
eq(TEAM.plan(mkStudents(16), []).length, 2, '16 人 → 2 组');
eq(TEAM.plan(mkStudents(17), []).map(t => t.members.length).join(','), '9,8', '17 人 → 9 + 8');
eq(TEAM.plan(mkStudents(1), [])[0].classroom.length, 1, '单人班：教室 1 人（不足 4 不报错）');

// --- order 优先于 students ---
const ord16 = S16.map(s => s.id).reverse();
const pA = TEAM.plan(S16, ord16);
eq(pA[0].members[0], ord16[0], '传入 teamOrder 时按它切组（不再按学号）');
eq(pA.length, 2, 'order 路径组数正确');
const pB = TEAM.plan(S16, []);
eq(pB[0].members[0], S16[0].id, 'order 为空数组时回落到「按学号排序」');
const badOrder = ['\u4e0d\u5b58\u5728\u7684id'];
eq(TEAM.plan(S16, badOrder).length, 1, 'order 里塞了非法 id 也不崩（按它切出 1 组）');

// ============================================================
console.log('\n\u2462 \u8f6e\u503c\u6620\u5c04 dutyWeekGroupIndex\uff08\u7ec4\u53f7\u5373\u5468\u5e8f\uff09');
// ============================================================
eq(TEAM.weekIdx(7, 0), 0, '第 1 周 → 第 1 组');
eq(TEAM.weekIdx(7, 6), 6, '第 7 周 → 第 7 组');
eq(TEAM.weekIdx(7, 7), 0, '第 8 周绕回第 1 组（7 周一轮）');
eq(TEAM.weekIdx(7, 13), 6, '第 14 周 → 第 7 组');
eq(TEAM.weekIdx(7, 14), 0, '第 15 周 → 第 1 组');
eq(TEAM.weekIdx(1, 5), 0, '只有 1 组时恒为第 1 组');
eq(TEAM.weekIdx(0, 3), -1, '0 组 → -1（调用方据此隐藏本周卡）');
eq(TEAM.weekIdx(-2, 3), -1, '负数分组 → -1（不崩）');
eq(TEAM.weekIdx(7, -1), 6, '负周号取模后落到第 7 组（不出现负下标）');
eq(TEAM.weekIdx(7, '3'), 3, '字符串周号能解析');
eq(TEAM.weekIdx(7, null), 0, 'null 周号回落第 0 周');
eq(TEAM.weekIdx(7, '\u4e5d'), 0, '非数字周号回落第 0 周（不产生 NaN）');
{
  const seen = new Set();
  for (let w = 0; w < 7; w++) seen.add(TEAM.weekIdx(7, w));
  eq(seen.size, 7, '一轮 7 周里 7 个组各值一次（无偏心）');
}
{
  const seen = new Set();
  for (let w = 0; w < 70; w++) seen.add(TEAM.weekIdx(7, w));
  eq(seen.size, 7, '轮转 70 周仍只覆盖这 7 组');
}

// ============================================================
console.log('\n\u2463 \u540d\u5355\u5bf9\u9f50 dutySyncTeamOrder');
// ============================================================
{
  const s58 = mkStudents(58);
  const fresh = TEAM.sync({ teamOrder: [] }, s58);
  eq(fresh.length, 58, '空 teamOrder → 补齐全班 58 人');
  eq(fresh[0], s58[0].id, '补全时按学号排序（第 1 个是学号最小的）');
  eq(fresh[57], s58[57].id, '补全时按学号排序（最后一个最大）');

  const kept = { teamOrder: [s58[3].id, s58[5].id, s58[0].id] };
  const r1 = TEAM.sync(kept, s58);
  eq(r1.slice(0, 3).join(','), [s58[3].id, s58[5].id, s58[0].id].join(','), '已有顺序原样保留（不重排）');
  eq(r1.length, 58, '缺失成员补到队尾');
  eq(r1[57], s58[57].id, '补到队尾的新人仍按学号升序');

  // 退班移除
  const s55 = mkStudents(55);
  const r2 = TEAM.sync({ teamOrder: s58.map(s => s.id) }, s55);
  eq(r2.length, 55, '退班 3 人后 aligns 到 55');
  ok(r2.every(id => s55.some(s => s.id === id)), '退班的人被移除（不留幽灵 id）');

  // 新人按学号插入到队尾
  const s60 = mkStudents(60);
  const r3 = TEAM.sync({ teamOrder: s58.map(s => s.id) }, s60);
  eq(r3.length, 60, '转来 2 人后 aligns 到 60');
  eq(r3.slice(-2).join(','), [s60[58].id, s60[59].id].join(','), '新人按学号顺序补到队尾');

  // 幂等
  const a1 = TEAM.sync({ teamOrder: [] }, s58);
  const a2 = TEAM.sync({ teamOrder: a1 }, s58);
  eq(a2.join(','), a1.join(','), 'sync 幂等（跑两次结果一致）');

  // 不改入参
  const holder = s58.map(s => s.id);
  const snapshot = holder.join(',');
  TEAM.sync({ teamOrder: mkStudents(50).map(s => s.id) }, s58);
  eq(holder.join(','), snapshot, '不改动传入的 students/数组（渲染函数里调用安全）');

  // 缺失字段不崩
  eq(TEAM.sync(null, s58).length, 58, 'duty 为 null 不崩');
  eq(TEAM.sync({}, s58).length, 58, 'duty 无 teamOrder 字段不崩');
  eq(TEAM.sync({ teamOrder: null }, s58).length, 58, 'teamOrder 为 null 不崩');
  eq(TEAM.sync({ teamOrder: [] }, []).length, 0, '空班不崩');
}

// ============================================================
console.log('\n\u2464 \u6362\u4eba dutySwapOrder\uff08\u53ea\u5bf9\u8c03\u4f4d\u7f6e\uff09');
// ============================================================
{
  const students = mkStudents(18);
  const mk = () => new Function([
    'var state = ' + JSON.stringify({ students: students, duty: { teamOrder: students.map(s => s.id) } }) + ';',
    constDecl('DUTY_TEAM_SIZE'),
    constDecl('DUTY_TEAM_MIN_TAIL'),
    braceFn('dutySyncTeamOrder'),
    braceFn('dutyTeamPlan'),
    braceFn('dutySwapOrder'),
    'return { swap: dutySwapOrder, plan: function(){ return dutyTeamPlan(state.students, state.duty.teamOrder); }, getOrder: function(){ return state.duty.teamOrder.slice(); }, students: state.students };'
  ].join('\n'))();

  const m = mk();
  const before = m.plan();
  const o0 = m.getOrder()[0], o1 = m.getOrder()[9];
  eq(m.swap(o0, o1), true, '对调两个存在的学生 → true');
  const afterOrder = m.getOrder();
  eq(afterOrder[0], o1, '位置 0 换成了后者');
  eq(afterOrder[9], o0, '位置 9 换成了前者');
  const after = m.plan();
  eq(after.length, before.length, '换人不改变组数');
  const f2 = after.reduce((a, t) => a.concat(t.members), []);
  eq(new Set(f2).size, 18, '换人后全班仍恰好出现一次（划分不变量保持）');
  eq(f2.length, 18, '换人后人数守恒');
  ok(f2.sort().join(',') === students.map(s => s.id).sort().join(','), '换人前后成员集合完全相同');

  const m2 = mk();
  eq(m2.swap(o0, o0), false, '同一人自换 → false（不产生重影）');
  eq(m2.swap(o0, '\u4e0d\u5b58\u5728'), false, '含非法 id → false');
  eq(m2.swap('\u4e0d\u5b58\u5728A', '\u4e0d\u5b58\u5728B'), false, '两个都非法 → false');
  eq(m2.getOrder().join(','), students.map(s => s.id).join(','), '失败的换人不改任何状态');

  // 跨组换人：把第 1 组的人换到第 2 组
  const m3 = mk();
  const a = m3.getOrder()[0], b = m3.getOrder()[8];
  m3.swap(a, b);
  const p3 = m3.plan();
  ok(p3[1].members.includes(a), '第 1 组的人确实进了第 2 组');
  ok(p3[0].members.includes(b), '第 2 组的人确实进了第 1 组');
}

// ============================================================
console.log('\n\u2465 \u996e\u6c34\u673a\u5361\u7247\u6df1\u8272\u4fee\u590d');
// ============================================================
{
  const i = html.indexOf('\n.duty-water-card{');
  ok(i >= 0, '.duty-water-card 主规则存在（行首锚点定位，避免命中注释里的同名串）');
  const body = i >= 0 ? html.slice(i + 1, html.indexOf('}', i) + 1) : '';
  has(body, 'background:var(--card-bg)', '\u80cc\u666f\u8d70 --card-bg\uff08\u6df1\u8272\u4e3b\u9898\u4f1a\u81ea\u52a8\u53d8\u6df1\uff09');
  has(body, 'box-shadow:var(--shadow-card)', '阴影走 --shadow-card（不再写死浅色阴影）');
  has(body, 'border:1px solid var(--border)', '边框走 --border');
  notHas(body, '#fff', '\u4e0d\u518d\u51fa\u73b0\u786c\u7f16\u7801\u767d\u5e95 #fff\uff08\u8001\u677f\u62a5\u7684 bug\uff09');
  notHas(body, '#FFF', '不再出现硬编码白底 #FFF');
  notHas(body, 'background:#FFFFFF', '不再出现硬编码白底 #FFFFFF');
  notHas(body, 'background:white', '不再出现 background:white');
}
{
  // 值日页新 CSS 块：整块不许有硬编码白底
  const a = html.indexOf('.duty-weekbar{');
  const b = html.indexOf('/* ==================== Mobile Tab Bar ==================== */', a);
  ok(a >= 0 && b > a, '值日页新 CSS 块已定位');
  const block = (a >= 0 && b > a) ? html.slice(a, b) : '';
  ok(block.length > 1500, 'CSS 块长度合理（' + block.length + ' 字符）');
  notHas(block, 'background:#fff', '\u65b0\u503c\u65e5 CSS \u91cc\u6ca1\u6709\u786c\u7f16\u7801\u767d\u5e95');
  notHas(block, 'background:#FFF', '新值日 CSS 里没有 #FFF 白底');
  has(block, '.duty-now{', '.duty-now 容器规则在');
  has(block, 'background:var(--card-bg)', '.duty-now 用主题卡片底色');
  has(block, '.duty-team{', '.duty-team 组卡规则在');
  has(block, 'background:var(--card-bg)', '.duty-team 用主题卡片底色');
  has(block, '.duty-weekbar{', '周切换条规则在');
  has(block, '.duty-sect-label{', '教室/公区标签规则在');
  has(block, '.duty-mem{', '成员 chip 规则在');
  ok(block.indexOf('@media(hover:none){.duty-mem:hover') > block.indexOf('.duty-mem:hover{'),
    '\u89e6\u6478\u7aef hover \u5b88\u536b\u5199\u5728\u57fa\u7840 hover \u4e4b\u540e\uff08\u6e90\u5e8f\u94c1\u5f8b\uff09');
  has(block, 'minmax(176px,1fr)', '组卡网格 176px 起（58 人 7 组能铺得开）');
  has(block, 'minmax(158px,1fr)', '900px 断点有紧凑档');
  has(block, 'repeat(1,minmax(0,1fr))', '520px 断点降到单列');
  // 断点成对、且 680 类小断点在后（同特异度靠源序）
  ok(block.indexOf('@media(max-width:900px)') < block.indexOf('@media(max-width:520px)'),
    '两个断点源序正确（大断点在前，小断点在后）');
}
{
  // 旧结构已删（剥注释后判断）
  const clean = stripCss(html);
  notHas(clean, '.duty-today-card{', '\u65e7 .duty-today-card \u5df2\u6574\u5757\u5220\u9664');
  notHas(clean, '.duty-today-item{', '旧 .duty-today-item 已删除');
  notHas(clean, '.duty-today-list{', '旧 .duty-today-list 已删除');
  notHas(clean, '.duty-table{', '旧 .duty-table 已删除');
  notHas(clean, '.duty-cell{', '旧 .duty-cell 已删除');
  notHas(clean, '.duty-name{', '旧 .duty-name 已删除');
  notHas(clean, '.duty-empty{', '旧 .duty-empty 已删除');
  notHas(clean, '.duty-student{', '旧 .duty-student 已删除');
}
{
  // 深色覆盖里不应有把新值日组件又拉回白底的后手（靠令牌即可，不需要逐条覆盖）
  notHas(html, 'html.dark .duty-water-card', '深色覆盖里没有针对 .duty-water-card 的硬覆盖（靠令牌即可）');
  notHas(html, 'html.dark .duty-now', '深色覆盖里没有针对 .duty-now 的硬覆盖');
  notHas(html, 'html.dark .duty-team{', '深色覆盖里没有针对 .duty-team 主规则的硬覆盖（只允许 hover 那条）');
  // 唯一允许的深色专属规则：悬停阴影（浅色底上的阴影在深色里看不见，必须换一档）
  has(html, 'html.dark .duty-team:hover{box-shadow:0 4px 14px rgba(0,0,0,.35)}',
    '深色下只额外调了组卡悬停阴影（唯一的 dark 专属值）');
}

// ============================================================
console.log('\n\u2466 \u52b3\u52a8\u6574\u6539\u4e0d\u6263\u5206');
// ============================================================
{
  const body = braceFn('confirmPunish');
  // 🔴 断言前先剥块注释：我在这段代码里写了「不再调用 applyCredit」的说明注释，
  //    不剥就会命中注释里的字面、把自己判红。
  const bodyCode = stripCss(body);
  has(bodyCode, 'deduct: 0', 'confirmPunish 里 deduct 固定写 0');
  notHas(bodyCode, 'applyCredit', '\u4e0d\u518d\u8c03 applyCredit\uff08\u4e0d\u4ea7\u751f\u6263\u5206\u6d41\u6c34\uff09');
  notHas(bodyCode, 'punishDeduct', '不再读扣分输入框');
  has(bodyCode, 'saveData()', '仍会保存记录');
  has(bodyCode, 'renderPunishments()', '仍会刷新列表');
  has(bodyCode, '\u672a\u6263\u5206', '提示语明说「未扣分」');
  has(bodyCode, "state.punishments.unshift(", '仍把记录插到列表头');
}
notHas(html, 'id="punishDeduct"', '\u5f39\u7a97\u91cc\u7684\u6263\u5206\u8f93\u5165\u6846\u5df2\u5220\u9664');
notHas(html, 'punishDeduct', '整个文件里再也没有 punishDeduct 这个符号');
notHas(html, 'applyCredit(id, -deduct', '\u65e7\u7684\u201c\u4fdd\u5b58\u5e76\u6263\u5206\u201d\u8c03\u7528\u5df2\u5220');
notHas(html, "'\u52b3\u52a8\u6574\u6539\u00b7' + area", '不再拼「劳动整改·」流水原因');
notHas(html, '\u4fdd\u5b58\u5e76\u6263\u5206', '按钮文案不再写「保存并扣分」');
has(html, '>保存</button>', '确认按钮改回「保存」');
has(html, '\u672c\u8bb0\u5f55<b>\u4e0d\u8ba1\u5165\u6263\u5206</b>', '弹窗提示：本记录不计入扣分');
has(html, '\u4e0d\u518d\u6263\u5b66\u5206', '值日页说明：不再扣学分');
has(html, '\u4e0d\u56de\u6eaf\u9000\u5206', '说明历史已扣学分不回溯');
has(html, "(p.deduct ? '\u5df2\u6263 ' + p.deduct + ' \u5206' : '\u4e0d\u6263\u5206')",
  '\u5217\u8868\u663e\u793a\u533a\u5206\u65b0\u65e7\uff08\u65b0\u8bb0\u5f55\u663e\u793a\u300c\u4e0d\u6263\u5206\u300d\uff0c\u5386\u53f2\u4ecd\u663e\u793a\u300c\u5df2\u6263 N \u5206\u300d\uff09');
// 契约：这些不能顺手删掉
has(html, 'function punishStatusFor(p, today){', 'punishStatusFor 未被改动（_v2100_test.js 真跑）');
has(html, 'id="punishArea"', '劳动类型下拉仍在');
has(html, 'id="punishDays" value="7" min="1" max="30"', '整改天数输入框原样保留');
has(html, 'days > 30', '天数上界保护仍在');
has(html, 'onPunishAreaChange()', '劳动类型联动仍在');
has(html, 'function finishPunish(pid){', '核销流程未被破坏');
has(html, 'function deletePunish(pid){', '删除流程未被破坏');
has(html, '\u4e0d\u9000\u5b66\u5206', '删除确认文案已同步（不退学分）');
eq(cnt(html, 'deduct: 0'), 1, '全站只有一处写 deduct: 0');

// ============================================================
console.log('\n\u2467 \u52b3\u52a8\u6574\u6539\u5361\u7247\u8131\u79bb <table>\uff08foster-parenting\uff09');
// ============================================================
{
  const i = html.indexOf('<!-- Duty Page');
  const j = html.indexOf('<!-- Credits Page');
  ok(i >= 0 && j > i, '值日页 HTML 段已定位');
  const seg = (i >= 0 && j > i) ? html.slice(i, j) : '';
  const clean = stripHtmlComment(seg);
  ok(clean.length > 1200, '值日页 HTML 段长度合理（' + clean.length + ' 字符）');
  notHas(clean, '<table', '\u503c\u65e5\u9875\u5185\u5df2\u65e0\u4efb\u4f55 <table>\uff08\u65e7\u503c\u65e5\u8868\u5df2\u6458\u9664\uff09');
  notHas(clean, '</table>', '也没有残留的 </table>');
  notHas(clean, '<tbody', '没有游离的 tbody');
  notHas(clean, 'id="dutyTable"', 'dutyTable 容器已删除');
  notHas(clean, 'week-toggle', '旧的周几切换控件已删除');
  notHas(clean, '\u5468\u4e00', '\u503c\u65e5\u9875\u4e0d\u518d\u51fa\u73b0\u661f\u671f\u6807\u8bb0\uff08\u5468\u4e00\uff09');
  notHas(clean, '\u5468\u4e8c', '不再出现星期标记（周二）');
  notHas(clean, '\u5468\u4e94', '不再出现星期标记（周五）');
  notHas(clean, '\u5468\u65e5', '不再出现星期标记（周日）');
  has(clean, 'id="dutyWeekNo"', '改成了「第 N 周」周序显示');
  // 卡片顺序：分组区 → 劳动整改卡 → 饮水机卡（全部平级在 .page 内）
  const pTeams = clean.indexOf('id="dutyTeams"');
  const pEmpty = clean.indexOf('id="dutyEmptyHint"');
  const pPunish = clean.indexOf('<div class="card" style="margin-top:18px">');
  const pWater = clean.indexOf('id="dutyWaterCard"');
  ok(pTeams > 0 && pEmpty > pTeams, '分组容器在空状态提示之前');
  ok(pPunish > pEmpty, '\u52b3\u52a8\u6574\u6539\u5361\u7247\u4f4d\u4e8e\u7a7a\u72b6\u6001\u4e4b\u540e\uff08\u4e0d\u518d\u88ab\u6248\u5230\u8868\u683c\u524d\u9762\uff09');
  ok(pWater > pPunish, '饮水机卡片在劳动整改之后');
  ok(cnt(clean, 'id="dutyWaterCard"') === 1, '饮水机卡片只出现一次');
  // 卡片自身不该带「多余的一圈边」：不是 margin-top:0 + 独立 border 叠罗汉
  ok(pPunish > 0, '劳动整改卡片标记定位成功');
}
{
  const card = html.slice(html.indexOf('<div class="card" style="margin-top:18px">'),
                          html.indexOf('<div class="duty-water-card"'));
  ok(card.indexOf('<div class="section-title"') > 0, '劳动整改卡片内含标题行');
  ok(card.indexOf('id="punishList"') > 0, '劳动整改卡片内含列表容器');
  notHas(card, 'border:', '劳动整改卡片外层未再叠一层自定义边框（走 .card 统一规则）');
  notHas(card, 'box-shadow', '劳动整改卡片外层未再叠阴影');
}

// ============================================================
console.log('\n\u2468 \u65e7\u5f15\u64ce\u5951\u7ea6\u4fdd\u7559\uff08_v2100_test.js \u771f\u8dd1 11 \u4e2a\u7b26\u53f7\uff09');
// ============================================================
['dutyEnsureQueue', 'dutyNextFrom', 'dutyGenerateWeek', 'dutyEnsureWeeks',
 'dutyRoundProgress', 'dutyRoundGroups', 'punishStatusFor', 'chunkNames',
 'autoWaterDuty', 'dutyClearFromWeek', 'localDateStr'].forEach(n => {
  has(html, 'function ' + n + '(', '\u65e7\u51fd\u6570 ' + n + ' \u4ecd\u5728\uff08\u4e0d\u80fd\u5220\uff09');
});
['dutyDays', 'dutyAreas', 'dutyAreaCounts'].forEach(n => {
  ok(new RegExp('const ' + n + '\\s*=').test(html), '旧常量 ' + n + ' 仍在（extractSingleConst 真跑）');
});
has(html, "const dutyDays = ['\u5468\u4e00','\u5468\u4e8c','\u5468\u4e09','\u5468\u56db','\u5468\u4e94','\u5468\u65e5'];",
  'dutyDays 字面量未改（旧引擎仍按天生成）');
has(html, "const dutyAreaCounts = {'\u6559\u5ba4':4,'\u516c\u5171\u533a':4};", 'dutyAreaCounts 字面量未改（教室 4 + 公共区 4）');
has(html, 'function switchWeek(', 'switchWeek 仍在（周导航依赖）');
has(html, 'function dutyPrevWeek(', 'dutyPrevWeek 仍在');
has(html, 'function dutyNextWeek(', 'dutyNextWeek 仍在');
has(html, 'function renderWaterDuty(', 'renderWaterDuty 仍在');
has(html, 'function openPunishModal(', 'openPunishModal 仍在');
has(html, "key:'duty'", 'state.duty 落盘键名未改（数据兼容）');
has(html, 'function defaultDuty(){', 'defaultDuty 仍在');
has(html, 'teamOrder:[]', 'defaultDuty 里新增了 teamOrder（本版唯一新字段）');
eq(cnt(html, 'teamOrder:'), 1, 'teamOrder 只作为 state 字段声明了一次（没有第二处新 state 字段）');

// ============================================================
console.log('\n\u2469 \u5bfc\u51fa\u56fe\u4e0e\u65b0\u5206\u7ec4\u540c\u6e90');
// ============================================================
{
  const body = braceFn('dutyExportImage');
  has(body, 'dutyTeamPlan(', '\u5bfc\u51fa\u56fe\u7528\u7684\u662f\u540c\u4e00\u4efd dutyTeamPlan\uff08\u4e0d\u53e6\u7b97\u4e00\u5957\u5207\u7ec4\uff09');
  has(body, 'dutyWeekGroupIndex(', '本周高亮同样走 dutyWeekGroupIndex');
  has(body, '\u503c\u65e5\u5206\u7ec4\u8868', '标题为「值日分组表」');
  has(body, 'DUTY_TEAM_SIZE', '副标题引用同一常量');
  has(body, '\u6559\u5ba4\uff084 \u4eba\uff09', '表头「教室（4 人）」');
  has(body, '\u516c\u5171\u533a', '表头「公共区」');
  has(body, '\u6253\u5370\u5f20\u8d34', '落款含「打印张贴」');
  has(body, '-值日分组表.png', '文件名后缀正确');
  notHas(body, 'chunkNames(', '不再用旧的手搓切组分块');
}
has(html, 'function dutyExportImage(){', 'dutyExportImage 仍在');
eq(cnt(html, 'onclick="dutyExportImage()"'), 2, '值日页 + 分一览弹窗各一处导出入口');
has(html, '\u503c\u65e5\u5206\u7ec4\u4e00\u89c8', '弹窗标题改为「值日分组一览」');
// ⚠️ 「本轮名单」仍会以**历史注释**形式出现在旧引擎说明与弹窗 HTML 注释里（无害），
//    所以只断言**标题元素本体**，不去查全文。
has(html, '<h3 id="dutyRoundListTitle">\u503c\u65e5\u5206\u7ec4\u4e00\u89c8</h3>',
  '弹窗 h3 标题本体已是「值日分组一览」（不再是「本轮名单」）');

// ============================================================
console.log('\n\u246a \u9875\u9762\u7ed3\u6784\u4e0e\u6e32\u67d3\u5165\u53e3');
// ============================================================
has(html, 'class="page" id="page-duty"', '\u503c\u65e5\u9875\u5bb9\u5668\u4e32\u672a\u88ab\u6539\u52a8\uff08\u65e7\u6d4b\u8bd5\u9501\u5b9a\uff09');
has(html, 'class="duty-toolbar"', '\u2605 .duty-toolbar \u7c7b\u540d\u4fdd\u7559\uff08v2.21.0 \u62ff\u5b83\u5f53 CSS \u5207\u7247\u951a\u70b9\uff09');
has(html, '.duty-toolbar{', '.duty-toolbar 主规则仍在');
has(html, 'id="dutyTeams"', '分组容器 id 就位');
has(html, 'id="dutyTeamsHint"', '分组提示条 id 就位');
has(html, 'id="dutyTodayCard"', '本周值日卡容器沿用旧 id（未破坏引用）');
has(html, 'id="dutyProgressBar"', '周进度容器仍在');
has(html, 'onclick="dutyPrevWeek()"', '上一周按钮接线');
has(html, 'onclick="dutyNextWeek()"', '下一周按钮接线');
has(html, 'onclick="dutyGoRoundStart()"', '「回到本轮开头」按钮接线');
has(html, "function dutyGoRoundStart(){ switchWeek(0); }", 'dutyGoRoundStart 实现正确（回第 1 周）');
has(html, 'function dutyMemClick(teamIdx, role, slot){', '\u6362\u4eba\u5165\u53e3 dutyMemClick \u5c31\u4f4d');
notHas(html, 'function dutyCellClick', '旧的单元格点击入口已移除');
has(html, 'function renderDuty(){', 'renderDuty 函数名与签名保留（_v2130_test.js 锁整块）');
has(html, 'function renderDutyToday(){', 'renderDutyToday 仍在');
has(html, 'function renderDutyProgress(){', 'renderDutyProgress 仍在');
has(html, 'function dutyShowRoundList(){', 'dutyShowRoundList 仍在');
has(html, 'function dutyRescheduleAll(){', 'dutyRescheduleAll 仍在（按钮仍叫这个名字）');
has(html, 'function dutySyncTeamOrder(duty, students){', 'dutySyncTeamOrder 就位');
has(html, 'function dutyTeamPlan(students, order){', 'dutyTeamPlan 就位');
has(html, 'function dutyWeekGroupIndex(teamCount, week){', 'dutyWeekGroupIndex 就位');
has(html, 'function dutySwapOrder(aId, bId){', 'dutySwapOrder 就位');
{
  const b = braceFn('dutyRescheduleAll');
  has(b, 'teamOrder = []', '重新分组会清空 teamOrder（丢掉手动调整）');
  has(b, 'currentWeek = 0', '重新分组会回到第 1 周');
  has(b, 'confirm(', '重新分组有二次确认');
  has(b, 'showToast(', '有结果反馈');
}
{
  const b = braceFn('dutyMemClick');
  has(b, 'dataset', 'dutyMemClick 把组号/角色写进 dataset 传给选择器');
  has(b, 'studentSelectModal', '复用通用学生选择器');
}
{
  // 换人的确认分支
  const i = html.indexOf('function confirmStudentSelect(');
  const fn = html.slice(i, i + 2600);
  has(fn, 'dutySwapOrder(', '学生选择器走 dutySwapOrder（不是直接改数组）');
  has(fn, 'renderDuty()', '换人后刷新分组区');
  has(fn, 'renderDutyToday()', '换人后刷新本周卡');
}
{
  const i = html.indexOf('function confirmStudentSelectRemove(');
  const fn = html.slice(i, i + 1400);
  has(fn, '\u4e0d\u80fd\u6e05\u7a7a', '「移除」在小组结构下改成提示语（结构上不可能留空位）');
  notHas(fn, 'dutySwapOrder(', '「移除」不会再误调换人');
}
{
  // 路由
  has(html, "if(page==='duty')", '值日页路由仍在');
  ok(/if\(page==='duty'\)[^\n]*renderDuty\(\)/.test(html), '路由里仍调 renderDuty()');
  has(html, 'data-page="duty"', '侧栏入口仍在');
}

// ============================================================
console.log('\n' + '='.repeat(56));
console.log('\u901a\u8fc7 ' + pass + ' \u9879\uff0c\u5931\u8d25 ' + fail + ' \u9879');
if (fail) { console.log('\n\u5931\u8d25\u9879\uff1a'); failures.forEach(f => console.log('  \u2717 ' + f)); }
process.exit(fail ? 1 : 0);
