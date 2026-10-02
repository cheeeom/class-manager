// _v2211_test.js — v2.20.11：① 座次表可关闭座位　② 寝室页登记走读生　③ 班委自定义职位
//
// ① 版本与标记：四处「活动版本标记」跟 sw.js 的 CACHE_NAME 对齐（版本无关写法，下次跟版零成本）
// ② 关闭座位：纯函数行为级（置关/置开/越界/裁剪）+ seatClosePick 状态机 + autoSeat/seatDrop 跳过关闭格
// ③ 关闭座位：落盘与同步链路（state.seating.closed 随 seating 一起走）+ 导出图画出「已关闭」
// ④ 走读生：候选口径（只列没寝室的学生）+ 登记/取消行为级
// ⑤ 班委自定义：committeeAllPositions 合并语义 + syncCommitteeTags 兼容旧行为（_v290 前置）
// ⑥ 既有契约不破：_v2189 / _v2185 / _v2196 / _v2172 钉住的关键串逐条复核
//
// 为什么要「真跑」：这三处全是「状态机 + 派生标签」，静态串断言看不出
// 「关了座位还被排进去」「走读生同时挂着寝室号」这类错。
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const failures = [];
function log(ok, msg) {
  if (ok) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function has(t, s, msg) { log(String(t).indexOf(s) >= 0, msg + (String(t).indexOf(s) >= 0 ? '' : '\u300c缺 ' + JSON.stringify(String(s).slice(0, 60)) + '\u300d')); }
function notHas(t, s, msg) { log(String(t).indexOf(s) < 0, msg + (String(t).indexOf(s) < 0 ? '' : '\u300c不该有 ' + JSON.stringify(String(s).slice(0, 60)) + '\u300d')); }
function eq(a, b, msg) { log(a === b, (msg || '') + '（期望 ' + JSON.stringify(b) + '，实得 ' + JSON.stringify(a) + '）'); }
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }

/* ---------- 切片工具 ---------- */
function sliceFrom(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('切片失败：' + a.slice(0, 30) + ' → ' + b.slice(0, 30));
  return html.slice(i, j);
}
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

// ============================================================
console.log('\n【1】版本与标记（版本无关断言）');
// ============================================================
const mVer = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
ok(!!mVer, 'sw.js 能解出版本号');
const ver = mVer ? mVer[1] : '?';
console.log('    （当前版本 ' + ver + '）');
has(html, '<div class="login-version">' + ver + '</div>', '登录页版本与 CACHE_NAME 一致');
has(html, '<div class="sidebar-footer">' + ver + ' \u00b7 \u73ed\u4e3b\u4efb\u5de5\u4f5c\u53f0</div>', '侧栏版本与 CACHE_NAME 一致');
has(html, '\ud83c\udff7\ufe0f ' + ver + '</span>', '设置徽标版本与 CACHE_NAME 一致');
has(html, '\u8fd1\u7248\u66f4\u65b0\u901f\u89c8\uff08' + ver + '\uff09', '速览标题版本与 CACHE_NAME 一致');
// 「近版更新速览」按维护约定是【整体替换】（只留最新一版，不做追加）——
// 所以这里刻意不钉某一版的文案：钉了就等于每次发版都要回来改这三行。
// 改为钉「结构不变式」：标题版本已与 CACHE_NAME 对齐（上一条），正文确实有 ≥3 条条目。
// （_v2210_test.js 早已这么改过；本版把 _v2211_test.js 也一并收口，以后跟版不再红。）
const iNotes = html.indexOf('id="settingsReleaseNotes"');
const notesBlock = html.slice(iNotes, html.indexOf('</div>', iNotes));
ok(cnt(notesBlock, '<br>') >= 3, '速览正文至少 3 条（实得 ' + cnt(notesBlock, '<br>') + ' 条）');

// ============================================================
console.log('\n【2】关闭座位：纯函数 + 状态机（真跑）');
// ============================================================
// v2.21.0：锚点避开「带版本号的等号前缀」—— index.html 里那类注释永远停在旧版号，
// 跟版脚本的 A-0 守卫见到就会直接中止。起点改从「关闭座位 =」开始（唯一命中 JS 段那条注释，
// 不会误命中 CSS 段那条 `/* v2.20.11 关闭座位：...`），切片结果前面补回 `/* ` 让注释正常闭合。
const SEAT_SLICE = '/* ' + sliceFrom('关闭座位 =', 'function renderSeating(){');
const SEAT_UI_SLICE = sliceFrom('/* ---- v2.20.11 关闭座位的交互 ----', '/* ==================== v2.18.5 座次拖拽换座');

function seatSandbox(o) {
  o = o || {};
  const calls = { saves: 0, renders: 0, toasts: [], confirms: [] };
  const st = {
    students: o.students || [],
    seating: {
      cols: o.cols == null ? 3 : o.cols,
      rows: o.rows == null ? 2 : o.rows,
      seats: (o.seats || []).map(function (s) { return Object.assign({}, s); }),
      closed: (o.closed || []).slice()
    }
  };
  const api = new Function('state', 'saveData', 'showToast', 'renderSeating', 'confirm', 'seatCloseMode',
    SEAT_SLICE + '\n' + SEAT_UI_SLICE +
    '\nreturn { seatKey, isSeatClosed, seatClosedCount, pruneSeatClosed, setSeatClosed, seatClosePick, closeAllSeats, openAllSeats };'
  )(st,
    function () { calls.saves++; },
    function (m, k) { calls.toasts.push({ m: m, k: k }); },
    function () { calls.renders++; },
    function (m) { calls.confirms.push(String(m)); return o.confirm !== false; },
    !!o.mode);
  return { st: st, calls: calls, api: api };
}

ok(SEAT_SLICE.indexOf('function seatKey(row, col){') >= 0, '座位辅助函数切片含 seatKey');
ok(SEAT_SLICE.indexOf('function setSeatClosed(row, col, closed){') >= 0, '切片含 setSeatClosed');

// ---- 纯函数 ----
{
  const sb = seatSandbox({});
  eq(sb.api.seatKey(2, 5), '2-5', 'seatKey 用 行-列 且 0 基');
  eq(sb.api.isSeatClosed(0, 0), false, '初始没有关闭座位');
  eq(sb.api.seatClosedCount(), 0, '初始计数 0');
}
{
  // 关闭一个坐着人的座位 → 人必须被移出
  const sb = seatSandbox({ students: [{ id: 7, name: '张三' }], seats: [{ row: 1, col: 2, studentId: 7 }] });
  const r = sb.api.setSeatClosed(1, 2, true);
  eq(r, true, 'setSeatClosed 返回已生效');
  eq(sb.api.isSeatClosed(1, 2), true, '该格已标记为关闭');
  eq(sb.st.seating.seats.length, 0, '\u2605 座位上的人被自动移出（老板确认版语义）');
  eq(sb.st.seating.closed.join(','), '1-2', 'closed 记录 1-2');
}
{
  // 再次开启 → 标记消失，且不会把人塞回来
  const sb = seatSandbox({ closed: ['0-1', '1-2'], seats: [] });
  sb.api.setSeatClosed(1, 2, false);
  eq(sb.st.seating.closed.join(','), '0-1', '只摘掉目标那一个');
  eq(sb.api.isSeatClosed(1, 2), false, '已开启');
  sb.api.setSeatClosed(1, 2, false);   // 幂等
  eq(sb.st.seating.closed.join(','), '0-1', '重复开启幂等');
}
{
  const sb = seatSandbox({ cols: 3, rows: 2 });
  eq(sb.api.setSeatClosed(2, 0, true), false, '越界行 → 返回 false');
  eq(sb.api.setSeatClosed(0, 3, true), false, '越界列 → 返回 false');
  eq(sb.api.setSeatClosed(-1, 0, true), false, '负数 → 返回 false');
  eq(sb.st.seating.closed.length, 0, '越界不写任何标记');
}
{
  const p = seatSandbox({}).api.pruneSeatClosed;
  eq(JSON.stringify(p(['0-0', '1-2', '3-0', '0-5', '2-2'], 2, 3)), JSON.stringify(['0-0', '1-2']), '裁剪保留界内的');
  eq(JSON.stringify(p(undefined, 2, 2)), JSON.stringify([]), '非数组入参 → 空数组');
  eq(JSON.stringify(p(['x', '1-', '-1-1', '1-1'], 2, 2)), JSON.stringify(['1-1']), '脏标记被剔掉');
}
// ---- seatClosePick 状态机 ----
{
  // v2.29.1 收紧：关闭模式没开时，点已关闭的格子只提示、不开启（防误触）
  const sb = seatSandbox({ closed: ['0-1'], mode: false });
  sb.api.seatClosePick(0, 1);
  ok(sb.api.isSeatClosed(0, 1), '非关闭模式点已关闭的格子 → 保持关闭');
  eq(sb.calls.saves, 0, '不写盘');
  eq(sb.calls.renders, 0, '不重绘');
  eq(sb.calls.confirms.length, 0, '不弹确认');
  eq(sb.calls.toasts[0].k, 'info', '给 info 提示');
  has(sb.calls.toasts[0].m, '\u5173\u95ed\u6a21\u5f0f', '提示里指明要去关闭模式');
}
{
  // 关闭模式开着：点已关闭的格子直接开回来（无需确认，纯回退）
  const sb = seatSandbox({ closed: ['0-1'], mode: true });
  sb.api.seatClosePick(0, 1);
  ok(!sb.api.isSeatClosed(0, 1), '关闭模式下点已关闭的格子 → 开启');
  eq(sb.calls.saves, 1, '开启后写盘一次');
  eq(sb.calls.renders, 1, '开启后重绘一次');
  eq(sb.calls.confirms.length, 0, '开回来不需要确认');
  eq(sb.calls.toasts[0].k, 'success', '提示 success');
}
{
  // 未关闭 + 关闭模式关着 → 只提示，不动数据
  const sb = seatSandbox({ mode: false });
  sb.api.seatClosePick(0, 0);
  eq(sb.calls.saves, 0, '\u2605 非关闭模式下点空座位不写盘');
  eq(sb.st.seating.closed.length, 0, '也不标记关闭');
  eq(sb.calls.toasts[0].k, 'info', '给 info 提示');
  has(sb.calls.toasts[0].m, '\u5173\u95ed\u6a21\u5f0f', '提示里指明要去关闭模式');
}
{
  // 未关闭 + 关闭模式开着 + confirm=true → 关闭
  const sb = seatSandbox({ mode: true, students: [{ id: 3, name: '李四' }], seats: [{ row: 0, col: 1, studentId: 3 }] });
  sb.api.seatClosePick(0, 1);
  eq(sb.calls.confirms.length, 1, '弹一次确认');
  has(sb.calls.confirms[0], 'R1C2', '确认文案带坐标（人看得懂）');
  has(sb.calls.confirms[0], '\u674e\u56db', '确认文案点名要移出谁');
  eq(sb.st.seating.closed.join(','), '0-1', '已关闭');
  eq(sb.st.seating.seats.length, 0, '人已移出');
  eq(sb.calls.saves, 1, '写盘一次');
  has(sb.calls.toasts[0].m, '\u674e\u56db', '成功提示里回执被移出的人');
}
{
  // confirm=false → 完全不动
  const sb = seatSandbox({ mode: true, confirm: false, students: [{ id: 3, name: '李四' }], seats: [{ row: 0, col: 1, studentId: 3 }] });
  sb.api.seatClosePick(0, 1);
  eq(sb.calls.saves, 0, '取消确认不写盘');
  eq(sb.st.seating.closed.length, 0, '取消确认不标记');
  eq(sb.st.seating.seats.length, 1, '取消确认不动座位');
}
{
  // 空座位：确认文案里不该出现「会被移出座位」
  const sb = seatSandbox({ mode: true });
  sb.api.seatClosePick(1, 1);
  notHas(sb.calls.confirms[0], '\u88ab\u79fb\u51fa\u5ea7\u4f4d', '空座位不写「会被移出」');
  eq(sb.st.seating.closed.join(','), '1-1', '空座位同样能关');
}
{
  // 全部关闭 / 全部开启
  const sb = seatSandbox({ cols: 3, rows: 2, seats: [{ row: 0, col: 0, studentId: 1 }] });
  sb.api.closeAllSeats();
  eq(sb.st.seating.closed.length, 6, '全部关闭 = 行列全部格子');
  eq(sb.st.seating.seats.length, 0, '全部关闭清空所有排座');
  sb.api.openAllSeats();
  eq(sb.st.seating.closed.length, 0, '全部开启清空标记');
  eq(sb.calls.saves, 2, '两次操作各写盘一次');
  // 没关过再点全部开启 → 只提示
  const n0 = sb.calls.saves;
  sb.api.openAllSeats();
  eq(sb.calls.saves, n0, '没有关闭座位时「全部开启」不写盘');
}

// ---- autoSeat / seatDrop 必须跳过关闭格 ----
console.log('\n  -- autoSeat / seatDrop 与关闭格 --');
function pickSandbox(o) {
  const calls = { saves: 0, renders: 0, toasts: [], confirms: [] };
  const st = {
    students: o.students || [],
    seating: { cols: o.cols, rows: o.rows, seats: (o.seats || []).map(function (s) { return Object.assign({}, s); }), closed: (o.closed || []).slice() }
  };
  const api = new Function('state', 'saveData', 'showToast', 'renderSeating', 'confirm', 'escapeHtml',
    SEAT_SLICE + '\n' + braceFn('autoSeat') + '\n' + braceFn('seatDrop') +
    '\nreturn { autoSeat, seatDrop, isSeatClosed };'
  )(st,
    function () { calls.saves++; },
    function (m, k) { calls.toasts.push({ m: m, k: k }); },
    function () { calls.renders++; },
    function (m) { calls.confirms.push(String(m)); return true; },
    function (s) { return String(s == null ? '' : s); });
  return { st: st, calls: calls, api: api };
}
{
  // 3列×1行，第 2 列关掉；2 名学生应当被排到 (0,0) 与 (0,2)
  const sb = pickSandbox({ students: [{ id: 1, name: 'A', credit: 20 }, { id: 2, name: 'B', credit: 10 }], cols: 3, rows: 1, closed: ['0-1'] });
  sb.api.autoSeat('credit');
  const at = function (r, c) { const s = sb.st.seating.seats.filter(function (x) { return x.row === r && x.col === c; })[0]; return s ? s.studentId : null; };
  eq(at(0, 0), 1, '学分高的排到第一个可用格');
  eq(at(0, 1), null, '\u2605 关闭的格子没有被排入任何人');
  eq(at(0, 2), 2, '第二个人顺延到下一个可用格');
  has(sb.calls.confirms[0], '\u5173\u95ed\u7684\u5ea7\u4f4d', '确认文案里说明了跳过了几个关闭座位');
}
{
  // 全部空位都被关掉 → 报错且不写盘（而不是静默成功）
  const sb = pickSandbox({ students: [{ id: 1, name: 'A' }], cols: 2, rows: 1, closed: ['0-0', '0-1'] });
  sb.api.autoSeat('random');
  eq(sb.calls.saves, 0, '无可用空位 → 不写盘');
  eq(sb.calls.toasts[0].k, 'error', '报错');
  has(sb.calls.toasts[0].m, '\u5df2\u5173\u95ed', '错误提示里点出是座位被关了');
}
{
  // 拖到关闭的格子 → 不接收（原地不动、不写盘）
  const sb = pickSandbox({ students: [{ id: 1, name: 'A' }], cols: 3, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }], closed: ['0-1'] });
  sb.api.seatDrop(0, 0, 0, 1);
  eq(sb.st.seating.seats.length, 1, '\u2605 落点是关闭格 → 座位数不变');
  eq(sb.st.seating.seats[0].row * 10 + sb.st.seating.seats[0].col, 0, '学生仍停在第 1 格');
  eq(sb.calls.saves, 0, '不写盘');
  eq(sb.calls.toasts.length, 0, '不提示（静默拒绝，不当成一次操作）');
}
{
  // 未关闭时照旧（关闭格为空 ⇒ 行为与 v2.20.10 完全一致）
  const sb = pickSandbox({ students: [{ id: 1, name: 'A' }], cols: 2, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }] });
  sb.api.seatDrop(0, 0, 0, 1);
  eq(sb.st.seating.seats[0].col, 1, '没有关闭格时拖拽照旧');
  eq(sb.calls.saves, 1, '照旧写盘');
}

// ============================================================
console.log('\n【3】关闭座位：落盘 / 同步 / 导出');
// ============================================================
has(html, 'function defaultSeating(){ return { cols:8, rows:5, seats:[], closed:[] }; }', 'defaultSeating 带上 closed 字段');
{
  // closed 放在 seating 内部 ⇒ 随 seating 一起落盘/上云，不用新增 state 字段
  const cfs = html.slice(html.indexOf('const CLOUD_SYNC_FIELDS'), html.indexOf('const CLOUD_SYNC_FIELDS') + 200);
  has(cfs, "f.cfs", 'CFS 仍由 STATE_SCHEMA 派生');
  notHas(html, "key:'seatingClosed'", '\u2605 没有为关闭座位另开 state 字段（少一条同步链路）');
  has(html, "key:'seating', def:function(){ return defaultSeating(); }, cfs:1, ms:'seating' },", 'seating 仍整体同步（msSeating 取新会把 closed 一起带走）');
}
has(html, 'if(!Array.isArray(state.seating.closed)) state.seating.closed = [];', 'loadData 里自愈补 closed');
has(html, 'state.seating.closed=pruneSeatClosed(state.seating.closed,rows,cols);', '改行列时同步收缩关闭标记');
has(html, 'el.textContent=`共 ${c*r} 座位` + (cn ? ` · 已关闭 ${cn}` : \'\');', '座位总数显示里带「已关闭 N」');
{
  const exp = sliceFrom('function seatExportImage(){', '/* ==================== 值日表导出（组别制，打印贴墙用）');
  has(exp, 'closedKeys.indexOf(k) >= 0', '导出图里单独处理关闭格');
  has(exp, "ctx.fillText('已关闭'", '导出图里把关闭格写成「已关闭」');
  has(exp, "· 已关闭 ' + closedKeys.length + ' 格", '导出图副标题写明关闭几格');
}
{
  const rs = braceFn('renderSeating');
  has(rs, 'class="seat closed"', '关闭格走独立的 CSS 类');
  has(rs, 'data-seat-closed=', '关闭格带 data-seat-closed');
  ok(rs.indexOf('data-seat-closed') > 0 && rs.indexOf('const seat = seats.find') > rs.indexOf('data-seat-closed'),
     '（切片自检）关闭格分支确实落在 seats.find 之前');
  // 关闭格那一支不许挂拖拽/点击换座所需的属性
  const branch = rs.slice(rs.indexOf('data-seat-closed'), rs.indexOf('const seat = seats.find'));
  notHas(branch, 'data-seat-row', '\u2605 关闭格不挂 data-seat-row（seatDropTargetAt 自然拒绝它当落点）');
  notHas(branch, 'onpointerdown', '\u2605 关闭格不挂 onpointerdown');
  notHas(branch, 'seatClick(', '关闭格不接 seatClick（点它走 seatClosePick）');
  has(branch, 'seatClosePick(', '关闭格接 seatClosePick');
}
has(html, '.seat.closed{', '关闭格样式就位');
has(html, '.seat-close-banner{', '关闭横幅样式就位');
has(html, 'id="seatCloseBanner"', '关闭横幅节点就位');
has(html, 'id="seatCloseToggleBtn"', '工具栏开关按钮就位');
ok(html.indexOf('id="seatCloseBanner"') < html.indexOf('id="seatingScroll"'), '\u2605 横幅在 #seatingGrid 之外（网格重画抹不掉它）');
has(html, 'function toggleSeatCloseMode(){', '有模式切换函数');
has(html, 'function closeAllSeats(){', '有全部关闭');
has(html, 'function openAllSeats(){', '有全部开启');
// v2.29.1 收紧：横幅只在关闭模式里出现（退出模式后不再常驻）
has(html, "bar.style.display = seatCloseMode ? '' : 'none';", '\u2605 横幅显隐只看 seatCloseMode（v2.29.1）');
notHas(html, "seatCloseMode || n > 0", '旧的常驻显隐条件已移除');

// ============================================================
console.log('\n【4】走读生：候选口径 + 登记/取消（真跑）');
// ============================================================
const DORM_SLICE = sliceFrom("const DAY_TAG = '\u8d70\u8bfb';", 'function isDayBoarding(');
function dormSandbox(students, checkedIds) {
  const calls = { saves: 0, renders: 0, toasts: [], closedModals: [] };
  const st = { students: students.map(function (s) { return Object.assign({}, s, { tags: (s.tags || []).slice() }); }) };
  const doc = {
    querySelectorAll: function (sel) {
      return (checkedIds || []).map(function (id) { return { value: String(id), checked: true }; });
    }
  };
  const api = new Function('state', 'document', 'saveData', 'closeModal', 'renderDorm', 'showToast', 'openDayBoardingList', 'confirm',
    DORM_SLICE + '\n' + braceFn('isDayBoarding') + '\n' + braceFn('matchStudentsByName') + '\n' + braceFn('dayBoardingCands') + '\n' +
    braceFn('confirmDayBoardingAdd') + '\n' + braceFn('cancelDayBoarding') +
    '\nreturn { dayBoardingCands, confirmDayBoardingAdd, cancelDayBoarding, isDayBoarding, dormNoOf, isDormTag };'
  )(st, doc,
    function () { calls.saves++; },
    function (id) { calls.closedModals.push(id); },
    function () { calls.renders++; },
    function (m, k) { calls.toasts.push({ m: m, k: k }); },
    function () { },                 // openDayBoardingList（登记成功后刷新名单，测试里不关心）
    function () { return true; });   // confirm：取消走读要确认，测试里恒同意
  return { st: st, calls: calls, api: api };
}
{
  const sb = dormSandbox([
    { id: 1, name: '\u5f20\u4e09', sid: 'S001', tags: [] },
    { id: 2, name: '\u674e\u56db', sid: 'S002', tags: ['6\u680b-801\u5ba4'] },
    { id: 3, name: '\u738b\u4e94', sid: 'S003', tags: ['\u8d70\u8bfb'] },
    { id: 4, name: '\u8d75\u516d', sid: 'S004', tags: ['\u5bdd\u5ba4\u957f'] }
  ]);
  const pool = sb.api.dayBoardingCands('').map(function (s) { return s.id; });
  eq(pool.join(','), '1,4', '\u2605 候选只列「没寝室号且没走读」的学生');
  eq(sb.api.dayBoardingCands('S004').length, 1, '可按学号搜到');
  eq(sb.api.dayBoardingCands('\u8d75\u516d').length, 1, '可按姓名搜到');
  eq(sb.api.dayBoardingCands('\u674e\u56db').length, 0, '有寝室的学生搜不到（口径一致）');
}
{
  // 登记：勾 1、4 → 两个都挂上走读
  const sb = dormSandbox([
    { id: 1, name: 'A', sid: 'S001', tags: [] },
    { id: 4, name: 'D', sid: 'S004', tags: ['\u5bdd\u5ba4\u957f'] }
  ], [1, 4]);
  sb.api.confirmDayBoardingAdd();
  eq(sb.api.isDayBoarding(sb.st.students[0]), true, '第 1 人成为走读生');
  eq(sb.api.isDayBoarding(sb.st.students[1]), true, '第 2 人成为走读生');
  ok(sb.st.students[1].tags.indexOf('\u5bdd\u5ba4\u957f') >= 0, '原有其它标签不受影响');
  eq(sb.calls.saves, 1, '写盘一次');
  eq(sb.calls.renders, 1, '重绘寝室页');
  has(sb.calls.toasts[0].m, '2 \u540d', '提示登记人数');
}
{
  // 兜底：候选外还带寝室号（脏数据）→ 登记时顺手摘掉，绝不制造「又住校又走读」
  const sb = dormSandbox([{ id: 9, name: 'X', sid: 'S009', tags: ['6\u680b-802\u5ba4'] }], [9]);
  sb.api.confirmDayBoardingAdd();
  eq(sb.api.dormNoOf(sb.st.students[0]), '', '\u2605 寝室号标签被摘掉');
  eq(sb.api.isDayBoarding(sb.st.students[0]), true, '走读标签已挂上');
}
{
  // 一个都没勾 → 报错、不写盘
  const sb = dormSandbox([{ id: 1, name: 'A', sid: 'S001', tags: [] }], []);
  sb.api.confirmDayBoardingAdd();
  eq(sb.calls.saves, 0, '没勾选不写盘');
  eq(sb.calls.toasts[0].k, 'error', '给错误提示');
}
{
  // 取消走读
  const sb = dormSandbox([{ id: 1, name: 'A', sid: 'S001', tags: ['\u8d70\u8bfb', '\u5bdd\u5ba4\u957f'] }]);
  sb.api.cancelDayBoarding(1);
  eq(sb.api.isDayBoarding(sb.st.students[0]), false, '走读标签被摘掉');
  ok(sb.st.students[0].tags.indexOf('\u5bdd\u5ba4\u957f') >= 0, '其它标签保留');
  eq(sb.calls.saves, 1, '写盘一次');
}
has(html, 'onclick="openDayBoardingAddModal()"', '寝室页工具栏有「添加走读生」入口');
has(html, 'id="dayBoardingAddModal"', '添加走读生弹窗就位');
has(html, 'id="dayBoardingCands"', '弹窗里候选列表节点就位');
has(html, 'onclick="cancelDayBoarding(', '走读名单里可取消走读');

// ============================================================
console.log('\n【5】班委自定义职位：合并语义 + 标签联动（真跑）');
// ============================================================
const CC_CFG_ARR = html.slice(html.indexOf('const committeeConfig = ['), html.indexOf('\n];', html.indexOf('const committeeConfig = [')) + 3);
const CC_ARR = eval('(' + CC_CFG_ARR.replace(/^const committeeConfig = /, '').replace(/;$/, '') + ')');
const CC_SLICE = sliceFrom('const COMMITTEE_POS_COLORS', 'let _committeePosEditing');

function ccPosSandbox(positions) {
  const st = { committeePos: positions, committee: {} };
  const api = new Function('state', CC_CFG_ARR + '\n' + CC_SLICE +
    '\nreturn { committeeAllPositions, committeePosByKey };')(st);
  return { st: st, api: api };
}
{
  const sb = ccPosSandbox(undefined);
  const all = sb.api.committeeAllPositions();
  eq(all.length, 8, '没有自定义时 = 常设 8 岗');
  eq(all.every(function (c) { return c.builtin === true; }).toString(), 'true', '常设岗都带 builtin 标记');
  eq(sb.api.committeePosByKey('banzhang').title, '\u73ed\u957f', '能按 key 取到岗');
  eq(CC_ARR.length, 8, 'committeeConfig 常量本身仍是 8 条（_v290 硬断言）');
}
{
  const custom = { key: 'pos1', title: '\u7535\u6559\u59d4\u5458', tag: '\u7535\u6559\u59d4\u5458', count: '1\u4eba', desc: '\u7ba1\u73ed\u7ea7\u7535\u8111\u4e0e\u6295\u5f71', color: 'teal' };
  const sb = ccPosSandbox([custom]);
  const all = sb.api.committeeAllPositions();
  eq(all.length, 9, '加一条 → 9 张卡');
  eq(all[8].title, '\u7535\u6559\u59d4\u5458', '自定义职位排在常设岗之后');
  eq(!!all[8].builtin, false, '自定义职位不带 builtin（渲染成可删除）');
  // ⚠️ 关键：不许污染常量
  eq(CC_ARR.length, 8, '\u2605 committeeConfig 常量没被自定义项污染');
}
{
  // 覆盖同 key 的常设岗 → 数量不变，内容取覆盖值，仍算常设（可改职责但不可删）
  const sb = ccPosSandbox([{ key: 'xuexi', title: '\u5b66\u4e60\u59d4\u5458', tag: '\u5b66\u4e60\u59d4\u5458', count: '2\u4eba', desc: '\u6539\u5199\u8fc7\u7684\u804c\u8d23' }]);
  const all = sb.api.committeeAllPositions();
  eq(all.length, 8, '覆盖同 key 不新增卡片');
  const x = sb.api.committeePosByKey('xuexi');
  eq(x.count, '2\u4eba', '职数取覆盖值');
  eq(x.desc, '\u6539\u5199\u8fc7\u7684\u804c\u8d23', '职责取覆盖值');
  eq(x.color, CC_ARR[3].color, '没给 color 时沿用常设岗的颜色');
  eq(x.builtin, true, '仍是常设岗（前端不显示删除按钮）');
  eq(CC_ARR[3].count, '1\u4eba', '\u2605 常量里的原值没被改写');
}
{
  // hidden 的过滤（虽然本版 UI 不产出 hidden，逻辑要能兜住脏数据）
  const sb = ccPosSandbox([{ key: 'wenyi', hidden: true }]);
  const keys = sb.api.committeeAllPositions().map(function (c) { return c.key; });
  eq(keys.indexOf('wenyi'), -1, 'hidden 的岗被过滤掉');
  eq(keys.length, 7, '过滤后 7 岗');
}
has(html, 'state.committeePos = Array.isArray(d.committeePos) ? d.committeePos : [];', 'loadData 读入 committeePos');
has(html, "key:'committeePos', def:function(){ return []; }, cfs:1, ms:'committeePos'", 'committeePos 已进 STATE_SCHEMA（随云同步）');
has(html, 'committeePos:msCommitteePos,', '已注册合并策略');
has(html, 'function msCommitteePos(merged,localData,remoteData){', '合并策略实现就位（与 seating/duty 同口径取新）');
has(html, 'function openCommitteePosEdit(key){', '职位编辑入口就位');
has(html, 'function saveCommitteePos(){', '职位保存就位');
has(html, 'function deleteCommitteePos(key){', '职位删除就位');
has(html, "showToast('\u5236\u5ea6\u5e38\u8bbe\u5c97\u4f4d\u4e0d\u80fd\u5220\u9664", '\u2605 常设岗位拒绝删除（保住岗位标签体系）');
has(html, 'id="committeePosModal"', '职位弹窗就位');
has(html, 'id="committeePosDesc"', '弹窗里有职责输入');
has(html, 'id="committeePosCount"', '弹窗里有职数输入');
has(html, 'committee-add', '末尾有「＋ 自定义职位」卡片');
{
  const rc = braceFn('renderCommittee');
  has(rc, 'committeeAllPositions()', '班委页按「生效岗位」渲染');
  has(rc, 'openCommitteePosEdit(', '卡片上有编辑入口');
  has(rc, 'deleteCommitteePos(', '卡片上有删除入口');
  has(rc, 'cc-custom-tag', '自定义职位有标识');
  const ocs = braceFn('openCommitteeSelect');
  has(ocs, 'committeePosByKey(key)', '任命弹窗标题认自定义职位（不再只看常设 8 岗）');
  const css = braceFn('confirmStudentSelect');
  has(css, 'committeePosByKey(key)', '任命成功提示认自定义职位');
}
// ---- syncCommitteeTags：先证明「零自定义 = 旧行为」，再证明「有自定义能生效」 ----
console.log('\n  -- syncCommitteeTags 兼容性 --');
const SYNC_SRC = braceFn('syncCommitteeTags');
function syncSandbox(students, committee, committeePos) {
  const st = { students: students.map(function (s) { return { id: s.id, tags: (s.tags || []).slice() }; }), committee: committee, committeePos: committeePos };
  const api = new Function('state', 'committeeConfig', 'COMMITTEE_TAG', 'COMMITTEE_POSITION_TAGS',
    SYNC_SRC + '\nreturn { syncCommitteeTags: syncCommitteeTags, state: state };'
  )(st, CC_ARR, '\u73ed\u59d4', CC_ARR.map(function (c) { return c.tag; }));
  return api;
}
{
  // ★ 零自定义（committeePos 缺省）——必须与 v2.20.10（_v290 的行为级断言）逐字等价
  const api = syncSandbox([{ id: 1, name: 'A', tags: [] }], { banzhang: 1 }, undefined);
  api.syncCommitteeTags();
  eq(api.state.students[0].tags.slice().sort().join(','), ['\u73ed\u59d4', '\u73ed\u957f'].sort().join(','), '\u2605 committeePos 缺省时行为与旧版一致（任班长 → 两个标签）');
}
{
  const api = syncSandbox([{ id: 1, name: 'A', tags: ['\u56e2\u652f\u4e66', '\u73ed\u59d4'] }], { fubanzhang: 1 }, undefined);
  api.syncCommitteeTags();
  eq(api.state.students[0].tags.slice().sort().join(','), ['\u526f\u73ed\u957f', '\u73ed\u59d4'].sort().join(','), '旧「团支书」仍会被清掉');
}
{
  const api = syncSandbox([{ id: 1, name: 'A', tags: ['6\u680b-802\u5ba4', '\u8d70\u8bfb', '\u8bfe\u4ee3\u8868'] }], { banzhang: 1 }, undefined);
  api.syncCommitteeTags();
  ['6\u680b-802\u5ba4', '\u8d70\u8bfb', '\u8bfe\u4ee3\u8868'].forEach(function (t) {
    ok(api.state.students[0].tags.indexOf(t) >= 0, '非班委标签不被误删：' + t);
  });
}
{
  // ★ 有自定义：任命自定义职位 → 自动挂它的标签
  const pos = [{ key: 'posA', title: '\u7535\u6559\u59d4\u5458', tag: '\u7535\u6559\u59d4\u5458', count: '1\u4eba', desc: 'x' }];
  const api = syncSandbox([{ id: 1, name: 'A', tags: [] }], { posA: 1 }, pos);
  api.syncCommitteeTags();
  eq(api.state.students[0].tags.slice().sort().join(','), ['\u73ed\u59d4', '\u7535\u6559\u59d4\u5458'].sort().join(','), '\u2605 自定义职位任命后自动打标签');
}
{
  // ★ 删掉自定义职位 → 残留标签被摘掉（清理集合要认识「曾经的」自定义标签）
  const pos = [{ key: 'posA', title: '\u7535\u6559\u59d4\u5458', tag: '\u7535\u6559\u59d4\u5458', hidden: true }];
  const api = syncSandbox([{ id: 1, name: 'A', tags: ['\u7535\u6559\u59d4\u5458', '\u73ed\u59d4'] }], { posA: null }, pos);
  api.syncCommitteeTags();
  eq(api.state.students[0].tags.length, 0, '\u2605 职位删掉（墓碑）后残留标签被摘干净');
}
{
  // 删除动作本身：必须走墓碑，否则清理集合会「失忆」
  const del = braceFn('deleteCommitteePos');
  has(del, '{ hidden:true }', '\u2605 删除职位写成墓碑（保留 tag 供标签清理）');
  notHas(del, 'filter(c=>c.key!==key)', '删除职位不再真删（真删 = 标签没人认领）');
  has(braceFn('saveCommitteePos'), 'tomb.key', '\u2605 同名职位重新新增时按原 key 复活墓碑');
}
{
  // ★ 改常设岗的名字 → 旧标签被摘、新标签挂上
  const pos = [{ key: 'banzhang', title: '\u73ed\u7ea7\u8d1f\u8d23\u4eba', tag: '\u73ed\u7ea7\u8d1f\u8d23\u4eba', count: '1\u4eba', desc: 'x' }];
  const api = syncSandbox([{ id: 1, name: 'A', tags: ['\u73ed\u957f', '\u73ed\u59d4'] }], { banzhang: 1 }, pos);
  api.syncCommitteeTags();
  eq(api.state.students[0].tags.slice().sort().join(','), ['\u73ed\u59d4', '\u73ed\u7ea7\u8d1f\u8d23\u4eba'].sort().join(','), '\u2605 改名后旧标签被摘、新标签生效');
}
{
  // 幂等：连跑两次不产生重复标签
  const pos = [{ key: 'posA', title: '\u52b3\u52a8\u59d4\u5458', tag: '\u52b3\u52a8\u59d4\u5458', count: '1\u4eba', desc: 'x' }];
  const api = syncSandbox([{ id: 1, name: 'A', tags: [] }], { posA: 1 }, pos);
  api.syncCommitteeTags(); api.syncCommitteeTags();
  eq(api.state.students[0].tags.filter(function (t) { return t === '\u52b3\u52a8\u59d4\u5458'; }).length, 1, '幂等：标签不重复');
  eq(api.state.students[0].tags.filter(function (t) { return t === '\u73ed\u59d4'; }).length, 1, '幂等：「班委」不重复');
}

// ============================================================
console.log('\n【6】既有契约不许破（_v2185 / _v2189 / _v2196 / _v2172 钉住的串）');
// ============================================================
eq(cnt(html, 'data-seat-row="'), 2, 'data-seat-row=" 仍恰好 2 处（_v2189）');
eq(cnt(html, 'data-seat-col="'), 2, 'data-seat-col=" 仍恰好 2 处');
eq(cnt(html, 'onpointerdown="seatPointerDown(event,'), 2, 'onpointerdown 仍恰好 2 处');
eq(cnt(html, '\u4e0d\u52a8\u5df2\u6392\u5ea7\u4f4d\uff09"'), 3, '三个排座按钮的 title 仍 3 处');
eq(cnt(html, 'defaultSeating()'), 3, 'defaultSeating() 调用次数仍 3（_v2188）');
has(html, "state.seating.seats = [];\n  saveData();\n  renderSeating();\n  showToast('\u5df2\u6e05\u7a7a\u5ea7\u4f4d','info');", '清空座位那 5 行逐字未动（_v2189）');
has(html, '.seat.occupied{cursor:grab}', '拖拽抓手光标仍在');
has(html, 'function saveSeatLayoutInline(){', 'saveSeatLayoutInline 仍在');
has(html, 'function seatScrollCancel(){', 'v2.20.9 的「容器已滚动即放弃长按」仍在');
has(html, 'const SEAT_HOLD_MS = 450;', '触屏长按阈值仍 450ms');
notHas(html, 'let seatMode', '旧 seatMode 没复活');
notHas(html, 'data-seat-mode', '旧 seatMode DOM 标记没复活');
notHas(html, 'function seatDragStart(', '没引入死代码 seatDragStart');
// 座位辅助函数不许挤进 _v2196 的「DAY_TAG → isDayBoarding」切片（否则抽出会缺依赖）
{
  const seg = sliceFrom("const DAY_TAG = '\u8d70\u8bfb';", 'function isDayBoarding(');
  notHas(seg, 'seatClose', '\u2605 DAY_TAG → isDayBoarding 区段里没有塞入关闭座位代码');
  notHas(seg, 'seatKey', '同上（seatKey 不在切片内）');
}
// 「单行函数行尾不许挂 // 注释」——_v2188 的 oneLine / _v21200 的 extractFn 会整行 eval
{
  const LEGACY = [
    'function cbAlertStatusTo(s){ cbAlertStatus = ',
    'function msScalarFill(merged,localData,remoteData,key){',
    'function msTsMap(merged,localData,remoteData,key){',
    'function msMax1(merged,localData,remoteData,key){',
    'function msTsNewer(merged,localData,remoteData,key){',
    'function cmCanMinus(){'
  ];
  const bad = html.split('\n').filter(function (l) { return /^function [A-Za-z0-9_]+\([^)]*\)\{.*\}\s*\/\//.test(l); });
  const news = bad.filter(function (l) { return !LEGACY.some(function (p) { return l.indexOf(p) === 0; }); });
  eq(news.length, 0, '\u2605 新增代码里没有「单行函数 + 行尾 // 注释」这种会炸 eval 的写法' + (news.length ? '：' + news[0].slice(0, 90) : ''));
  eq(bad.length, LEGACY.length, '豁免单跟实际同步（只剩 v2.20.10 之前的 6 处遗留，修掉一处要同步删一行）');
  const evaled = ['defaultSeating', 'pad2', 'mergeTsMap', 'cloneCatDeleted', 'catTombReviveFilter',
    'applyCatTombstones', 'flattenReasonCatalog', 'cloneReasonCatalog', 'mergeReasonCatalog',
    'cbMergeBanks', 'cbNormalizeShape', 'sortOpsNewestFirst', 'smartMergeData', 'cbDefaultBank',
    'defaultDuty', 'defaultReasonCatalog', 'autoSeat', 'seatDrop', 'syncCommitteeTags'];
  const hit = evaled.filter(function (n) {
    return LEGACY.some(function (p) { return p.indexOf('function ' + n + '(') === 0; });
  });
  eq(hit.join(','), '', '\u2605 豁免单里没有任何被 oneLine / extractFn 抽取的函数');
}

// ============================================================
console.log('\n' + '\u2500'.repeat(34));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('\n失败清单：'); failures.forEach(function (m) { console.log('  \u00b7 ' + m); }); }
process.exit(fail ? 1 : 0);
