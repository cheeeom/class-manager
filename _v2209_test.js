// _v2209_test.js — v2.20.9：手机端座次表「保持真实列数 + 可左右滑动」+ 修「手指停一下就整页滑不动」
//
// ① 静态断言：四处活动标记（版本无关，跟 sw.js 的 CACHE_NAME 对齐）、窄屏不再强制 4 列、
//    长按阈值抽成常量、容器滚动兜底
// ② 真跑 seatLayoutSlots + 真跑 renderSeating 里那句 gridTemplateColumns 表达式
// ③ 真跑拖拽状态机（抽源码 + 假定时器）：证明「停 280ms 再滑」不再被长按劫持
// ④ 真值算术：8 列在 390px 屏上确实溢出 ⇒ 横向滚动是必须的，不是摆设
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.log('  \u2717 ' + msg); }
}
function has(t, s, msg) { assert(t.indexOf(s) >= 0, msg + ' \u300c' + s.slice(0, 46) + '\u300d'); }
function eq(a, b, msg) { assert(a === b, msg + '\uff08实得 ' + a + '，期望 ' + b + '\uff09'); }

// ============================================================
// ① 静态断言
// ============================================================
console.log('\n【1】版本与标记（版本无关断言：跟 sw.js 的 CACHE_NAME 对齐）');
const m = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
assert(!!m, 'sw.js 能解出版本号');
const ver = m[1];
console.log('    （当前版本 ' + ver + '）');
has(html, '<div class="login-version">' + ver + '</div>', '登录页版本与 CACHE_NAME 一致');
has(html, '<div class="sidebar-footer">' + ver + ' \u00b7 \u73ed\u4e3b\u4efb\u5de5\u4f5c\u53f0</div>', '侧栏版本与 CACHE_NAME 一致');
has(html, '\ud83c\udff7\ufe0f ' + ver + '</span>', '设置徽标版本与 CACHE_NAME 一致');
has(html, '\u8fd1\u7248\u66f4\u65b0\u901f\u89c8\uff08' + ver + '\uff09', '速览标题版本与 CACHE_NAME 一致');

console.log('\n【2】手机端布局：不再压成 4 列，改成横向滚动看全');
assert(html.indexOf('grid-template-columns:repeat(4,1fr) !important') < 0,
  '旧的「窄屏强制 4 列」已撤掉（它会把一排 8 座折成两行）');
assert(html.indexOf('.seat-aisle{display:none !important}') < 0,
  '旧的「窄屏隐藏过道」已撤掉（保持真实列数后过道要照常显示）');
has(html, '.seating-scroll{', '新增横向滚动容器样式');
has(html, 'overflow-x:auto', '滚动容器真的开了横向滚动');
has(html, 'overscroll-behavior-x:contain', '横向滚动不把整页一起带着甩');
has(html, '--seat-cell-min:0px', '桌面端座位最小宽度 0px（照旧等分填满，视觉不变）');
has(html, '.seating-grid{--seat-cell-min:68px;--seat-aisle:18px}', '窄屏放宽座位最小宽度 + 收窄过道');
has(html, 'id="seatingScroll"', '有横向滚动容器节点');
const iWrap = html.indexOf('id="seatingScroll"');
const iGrid = html.indexOf('id="seatingGrid"');
assert(iGrid > iWrap && iGrid - iWrap < 200, '滚动容器包着座位网格');
has(html, 'minmax(var(--seat-cell-min,0px),1fr)', '座位轨道带最小宽度（撑出横向滚动）');
has(html, '手机端左右滑动可看全所有列', '工具栏提示已告诉老师可以左右滑');

console.log('\n【3】长按阈值：200ms → 450ms（修「手指停一下就再也滑不动」）');
has(html, 'const SEAT_HOLD_MS = 450;', '长按阈值抽成 SEAT_HOLD_MS 常量 = 450ms');
has(html, 'setTimeout(seatDragActivate, SEAT_HOLD_MS)', '定时器用常量而非写死数字');
assert(html.indexOf('setTimeout(seatDragActivate, 200)') < 0, '写死的 200ms 已清除（那是本 bug 的根因）');
has(html, 'function seatScrollCancel(){', '有「容器已滚动即放弃长按」的兜底函数');
has(html, "window.addEventListener('scroll', seatScrollCancel, true)", '以捕获方式监听（能收到元素级滚动）');
has(html, "window.removeEventListener('scroll', seatScrollCancel, true)", '清理时注销，不泄漏监听');
assert(html.indexOf('\u89e6\u5c4f\u8bf7\u957f\u6309\u7ea6 0.2 \u79d2\u540e\u62d6\u52a8') < 0, '旧提示文案（0.2 秒）已清除');
has(html, '\u957f\u6309\u7ea6 0.5 \u79d2', '提示文案已改为 0.5 秒');

// ============================================================
// ② 真跑：列模板表达式
// ============================================================
console.log('\n【4】真跑列模板表达式（从 index.html 抽出来执行）');
const iAisle = html.indexOf('function seatAisleAfter');
const iRenderFn = html.indexOf('function renderSeating(){');
assert(iAisle >= 0 && iRenderFn > iAisle, '能定位到过道纯函数区段');
const srcSlots = html.slice(iAisle, iRenderFn);
const slotsApi = new Function(srcSlots + '\nreturn { seatLayoutSlots, seatAisleAfter, seatAisleCount };')();
eq(slotsApi.seatLayoutSlots(8).length, 10, '8 列 = 8 个座位 + 2 条过道 = 10 个槽位');

// 注意：必须捕整条语句（含等号左边）。只捕右边那截的话，抽出来的是个光棍表达式，
// 赋值根本不会发生，读回来永远是 undefined —— 那样测的就是一句空话。
const mTpl = html.match(/grid\.style\.gridTemplateColumns = [^\n]+;/);
assert(!!mTpl, '能抓到 gridTemplateColumns 赋值语句');
assert(mTpl[0].indexOf('=') >= 0, '捕到的是完整赋值语句（含等号左边），不是光棍表达式');
const tplOf = new Function('slots', 'grid', mTpl[0] + '\nreturn grid.style.gridTemplateColumns;');
const tpl = tplOf(slotsApi.seatLayoutSlots(8), { style: {} });
const parts = tpl.split(' ');
eq(parts.length, 10, '模板生成 10 个轨道');
eq(parts[3], 'var(--seat-aisle)', '第 4 轨是过道（第 3 列之后）');
eq(parts[7], 'var(--seat-aisle)', '第 8 轨是过道（第 6 列之后）');
const seatTracks = parts.filter((p, i) => i !== 3 && i !== 7);
assert(seatTracks.every(p => p === 'minmax(var(--seat-cell-min,0px),1fr)'),
  '其余 8 轨都是带最小宽度的座位轨道');

// ============================================================
// ③ 真跑：拖拽状态机（假定时器，不依赖浏览器）
// ============================================================
console.log('\n【5】真跑拖拽状态机：停 280ms 再滑，必须让路给滚动');
const iDragStart = html.indexOf('let _seatDrag = null;');
const iCleanupFn = html.indexOf('function seatPointerCleanup(){');
const iDragEnd = html.indexOf('\n}\n', iCleanupFn) + 2;
assert(iDragStart >= 0 && iDragEnd > iCleanupFn, '能定位到拖拽区段');
const srcDrag = html.slice(iDragStart, iDragEnd);
['seatPointerDown', 'seatDragActivate', 'seatScrollCancel', 'seatTouchMove', 'seatPointerCleanup']
  .forEach(fn => has(srcDrag, 'function ' + fn + '(', '抽出的区段含 ' + fn));

function makeEnv() {
  let now = 0, seq = 1;
  let timers = [];
  const win = {
    added: [], removed: [],
    addEventListener(t, fn) { this.added.push([t, fn]); },
    removeEventListener(t, fn) { this.removed.push([t, fn]); },
    fire(t) { this.added.filter(x => x[0] === t).forEach(x => x[1]({ type: t })); }
  };
  const api = new Function('window', 'document', 'navigator', 'setTimeout', 'clearTimeout', 'seatDrop',
    srcDrag + '\nreturn { seatPointerDown, seatDragActivate, seatScrollCancel, seatTouchMove, seatPointerMove, seatPointerUp, seatPointerCleanup, get drag(){ return _seatDrag; } };'
  )(
    win,
    { elementFromPoint: () => null },
    {},
    (fn, ms) => { const id = seq++; timers.push({ id, at: now + ms, fn }); return id; },
    (id) => { timers = timers.filter(t => t.id !== id); },
    () => {}
  );
  function advance(ms) {
    now += ms;
    const due = timers.filter(t => t.at <= now);
    timers = timers.filter(t => t.at > now);
    due.forEach(t => t.fn());
  }
  return { api, win, advance, nowRef: () => now };
}

function touchEv(x, y, counter) {
  return {
    pointerType: 'touch', button: 0, clientX: x, clientY: y, cancelable: true,
    target: { closest: () => null },
    currentTarget: { classList: { add() {}, remove() {} }, style: {} },
    preventDefault() { counter.n++; }
  };
}

// --- 例 1：正常起手滑动（手指落定 280ms 再划）不该被长按劫持 ---
{
  const { api, advance } = makeEnv();
  const pd = { n: 0 };
  api.seatPointerDown(touchEv(100, 400, pd), 0, 0, 1000);
  assert(!!api.drag && api.drag.active === false, '按下后先进入「待长按」，不立刻激活');
  advance(280);
  assert(!!api.drag && api.drag.active === false,
    '停 280ms 仍未激活（旧版 200ms 此刻已激活，正是「整页滑不动」的根因）');
  api.seatTouchMove(touchEv(100, 300, pd));   // 手指上移 100px
  assert(api.drag === null, '手指一动就放弃长按、把滚动交还页面');
  eq(pd.n, 0, '全程没有 preventDefault ⇒ 滚动没被掐断');
}

// --- 例 2：确实长按满 450ms 才激活，且此后才掐断滚动（拖拽功能没被改坏）---
{
  const { api, advance } = makeEnv();
  const pd = { n: 0 };
  api.seatPointerDown(touchEv(100, 400, pd), 0, 0, 1000);
  advance(300);
  assert(!!api.drag && api.drag.active === false, '300ms 时仍未激活');
  advance(200);                                // 累计 500ms > 450ms
  assert(!!api.drag && api.drag.active === true, '累计满 450ms 后正常激活（长按换座仍可用）');
  api.seatTouchMove(touchEv(100, 380, pd));
  eq(pd.n, 1, '激活后 touchmove 才被掐断（拖拽期间不滚动）');
  api.seatPointerCleanup();
  assert(api.drag === null, '松手后状态清干净');
}

// --- 例 3：容器先滚起来了 ⇒ 立刻放弃长按 ---
{
  const { api, advance } = makeEnv();
  const pd = { n: 0 };
  api.seatPointerDown(touchEv(100, 400, pd), 0, 0, 1000);
  advance(120);
  assert(!!api.drag && api.drag.active === false, '待长按中');
  api.seatScrollCancel();
  assert(api.drag === null, '容器一滚动就放弃长按（不会被残余定时器反杀）');
  advance(500);
  assert(api.drag === null, '定时器已清，后续再推进时间也不会激活');
}

// --- 例 4：监听器不泄漏 ---
{
  const { api, advance, win } = makeEnv();
  const pd = { n: 0 };
  api.seatPointerDown(touchEv(100, 400, pd), 0, 0, 1000);
  advance(500);
  api.seatPointerCleanup();
  const addedTouch = win.added.filter(x => x[0] === 'touchmove').length;
  const removedTouch = win.removed.filter(x => x[0] === 'touchmove').length;
  const addedScroll = win.added.filter(x => x[0] === 'scroll').length;
  const removedScroll = win.removed.filter(x => x[0] === 'scroll').length;
  eq(addedTouch, 1, '临时注册 1 个 touchmove');
  eq(removedTouch, 1, 'touchmove 已注销');
  eq(addedScroll, 1, '临时注册 1 个 scroll');
  eq(removedScroll, 1, 'scroll 已注销');
}

// ============================================================
// ④ 真值算术：68px 是否真的撑出滚动、又是否放得下 4 个汉字
// ============================================================
console.log('\n【6】真值算术：横向滚动是不是真的需要，姓名放不放得下');
const mCell = html.match(/\.seating-grid\{--seat-cell-min:(\d+)px;--seat-aisle:(\d+)px\}/);
assert(!!mCell, '能读窄屏的两个 CSS 变量');
const CELL = Number(mCell[1]), AISLE = Number(mCell[2]);
const GAP = Number((html.match(/\.seating-grid\{\n  display:grid;\n  gap:(\d+)px;/) || [0, 8])[1]);
const COLS = 8, AISLES = 2;
const total = COLS * CELL + AISLES * AISLE + (COLS + AISLES - 1) * GAP;
const vw = 390, pad = 12, content = vw - pad * 2;      // iPhone 13 宽度、内容区左右各 12px
console.log('    8 列总宽 = ' + COLS + '×' + CELL + ' + ' + AISLES + '×' + AISLE + ' + ' + (COLS + AISLES - 1) + '×' + GAP + ' = ' + total + 'px');
console.log('    390px 屏内容区 = ' + content + 'px');
assert(total > content, '8 列在 390px 屏上确实超出内容区（' + total + ' > ' + content + '）⇒ 横向滚动是必须的');
assert(CELL >= 64, '座位格最小宽度 ≥64px（不至于窄到看不清）');
const availW = CELL - 2 * 2 - 2 * 4;                   // 减 border 2px×2、padding 4px×2
console.log('    格内可用宽 = ' + CELL + ' - 4 - 8 = ' + availW + 'px；4 个 13px 汉字 = ' + 4 * 13 + 'px');
assert(availW >= 4 * 13, '格内放得下 4 个 13px 汉字（不截断）');

// ============================================================
console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exit(1);
