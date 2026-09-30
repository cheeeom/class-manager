// _v2210b_test.js — v2.21.0：课堂点名（随机抽人）
//
// 命名避让：`_v2210_test.js` 是 v2.20.10、`_v2211_test.js` 是 v2.20.11 —— v2.21.0 的缩写同样是 2210，
// 直接写会覆盖既有测试。沿用项目已有的避让后缀先例（`_v2191fix_test.js`）取 `b` 后缀。
//
// ① 版本与标记：四处活动标记跟 sw.js 的 CACHE_NAME 对齐（版本无关写法，下次跟版零成本）
// ② 页面接入：侧栏 / 抽屉 / 页面容器 / pageTitles / navigateTo / 墨线图标 i-roll
// ③ 当天请假判定 rcLeaveEnd / rcOnLeave / rcLeaveMap —— 纯函数，重点钉「提前销假」与边界日
// ④ 候选池 rcCandidates —— 已点到与当天请假都必须落在池外
// ⑤ 无放回抽样 rcSample —— 不重复 / 超量降级 / 空池
// ⑥ 点击切换 + 统计口径 —— 已点到 + 未点到 == 应到 == 全班 − 当天请假
// ⑦ 动效状态机 —— 先抽签后滚动、抽中即出池、中断可复位、动效期只改 classList
// ⑧ 落盘 sessionStorage —— 跨天自动失效
// ⑨ 既有契约不破 —— 请假模块的关键串逐条复核
//
// 为什么要「真跑」：抽人这套东西的错都在「状态之间」——
// 「抽过的又被抽一次」「请假的被抽中」「抽完一轮按钮不变成重置」这类，静态串断言一个都看不出来。
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
function eq(a, b, msg) { log(a === b, (msg || '') + '\uff08期望 ' + JSON.stringify(b) + '\uff0c实得 ' + JSON.stringify(a) + '\uff09'); }
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }

/* ---------- 切片工具 ---------- */
function sliceFrom(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b, i + 1);
  if (i < 0 || j < 0 || j <= i) throw new Error('切片失败：' + a.slice(0, 30) + ' \u2192 ' + b.slice(0, 30));
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
console.log('\n\u30101\u3011版本与标记（版本无关断言）');
// ============================================================
const mVer = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
ok(!!mVer, 'sw.js 能解出版本号');
const ver = mVer ? mVer[1] : '?';
console.log('    （当前版本 ' + ver + '）');
has(html, '<div class="login-version">' + ver + '</div>', '登录页版本与 CACHE_NAME 一致');
has(html, '<div class="sidebar-footer">' + ver + ' \u00b7 \u73ed\u4e3b\u4efb\u5de5\u4f5c\u53f0</div>', '侧栏版本与 CACHE_NAME 一致');
has(html, '\ud83c\udff7\ufe0f ' + ver + '</span>', '设置徽标版本与 CACHE_NAME 一致');
has(html, '\u8fd1\u7248\u66f4\u65b0\u901f\u89c8\uff08' + ver + '\uff09', '速览标题版本与 CACHE_NAME 一致');
// 速览文案不钉具体某一版（钉了就等于每次发版都要回来改），只钉结构
const _iN = html.indexOf('id="settingsReleaseNotes"');
const _blk = html.slice(_iN, html.indexOf('</div>', _iN));
ok(cnt(_blk, '<br>') >= 3, '速览正文至少 3 条（实得 ' + cnt(_blk, '<br>') + ' 条）');

// ============================================================
console.log('\n\u30102\u3011页面接入（侧栏 / 抽屉 / 容器 / 路由 / 图标）');
// ============================================================
has(html, '<span class="nav-icon"><svg class="ic"><use href="#i-roll"/></svg></span><span>\u8bfe\u5802\u70b9\u540d</span>', '侧栏新增「课堂点名」');
eq(cnt(html, 'data-page="rollcall"'), 2, '侧栏 + 移动端抽屉各一处入口');
has(html, 'class="page" id="page-rollcall"', '有 page-rollcall 容器');
has(html, "rollcall:'\u8bfe\u5802\u70b9\u540d'", 'pageTitles 有 rollcall 条目');
has(html, "if(page==='rollcall') renderRollCall();", 'navigateTo 有 rollcall 分发');
has(html, '<symbol id="i-roll"', '新增墨线图标 i-roll');
has(html, 'id="rcWall"', '有卡片墙容器');
has(html, 'id="rcStartBtn"', '有「开始抽取」按钮');
has(html, 'id="rcCount"', '有抽人人数选择');
has(html, 'id="rcPendingNames"', '有「未点到名单」容器');
// 图标必须是完整自闭合的 symbol（底部那段 i-dorm 的畸形写法不能蔓延过来）
has(sliceFrom('<symbol id="i-roll"', '</symbol>') + '</symbol>', '<symbol id="i-roll" viewBox="0 0 24 24">', 'i-roll 是标准 symbol 写法');

// ============================================================
console.log('\n\u30103\u3011当天请假判定（真跑）');
// ============================================================
const LOCALDATE = braceFn('localDateStr');
const RC_SLICE = sliceFrom('var RC_SESSION_KEY', '/* ==================== \u6210\u7ee9\u7ba1\u7406');

function elStub() {
  return {
    textContent: '', innerHTML: '', value: '1', disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, dataset: {}
  };
}
function mkSandbox(st, opts) {
  opts = opts || {};
  const calls = { toasts: [], rafs: [], cancels: [], timers: [], saved: 0 };
  const els = {};
  const doc = {
    getElementById(id) { if (!els[id]) els[id] = elStub(); return els[id]; },
    querySelectorAll() { return []; },
    addEventListener() {},
    hidden: false
  };
  // sessionStorage 桩可由外部传入 —— 否则每个沙箱都是一个新的空存储，
  // 「存了再读」这类用例根本测不到（本版第一遍就栽在这上面）
  const session = opts.session || {
    _m: {},
    getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
    setItem(k, v) { this._m[k] = String(v); }
  };
  const win = { matchMedia: () => ({ matches: !!opts.reduced }) };
  // 形参 10 个 / 实参 10 个 —— 必须一一对应（new Function 的实参错位不会报错，只会让后面全变 undefined）
  const api = new Function(
    'state', 'localDateStr', 'escapeHtml', 'showToast', 'document', 'sessionStorage',
    'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    LOCALDATE + '\n' + RC_SLICE +
    '\nreturn { rcLeaveEnd, rcOnLeave, rcLeaveMap, rcCandidates, rcSample, rcHas, rcEnsureToday,' +
    ' rcLoad, rcSave, rcToggleDone, rcRefreshStats, rcStartDraw, rcReveal, rcCancelRoll, rcReset,' +
    ' rcReducedMotion, RC, getDone: function(){ return rcDoneSet; },' +
    ' getPicked: function(){ return rcPickedSet; }, getDate: function(){ return rcDate; },' +
    ' setDate: function(d){ rcDate = d; }, setLoaded: function(b){ rcLoaded = b; } };'
  )(
    st,
    function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    function (s) { return String(s == null ? '' : s); },
    function (m, k) { calls.toasts.push({ m: m, k: k }); },
    doc, session, win,
    function (cb) { calls.rafs.push(cb); return calls.rafs.length; },
    function (id) { calls.cancels.push(id); },
    function (fn, ms) { calls.timers.push({ fn: fn, ms: ms }); return calls.timers.length; }
  );
  return { st, calls, api, session, doc, els };
}

const TODAY = (function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const D = (dd) => dd;   // 日期字面量直写，便于阅读

{
  const st = { students: [], leaves: [] };
  const { api } = mkSandbox(st);
  // 正常假：9/14 ~ 9/16
  eq(api.rcLeaveEnd({ startDate: '2026-09-14', endDate: '2026-09-16' }), '2026-09-16', '未销假：结束日取 endDate');
  ok(api.rcOnLeave({ startDate: '2026-09-14', endDate: '2026-09-16' }, '2026-09-14'), '起始日当天算在假');
  ok(api.rcOnLeave({ startDate: '2026-09-14', endDate: '2026-09-16' }, '2026-09-16'), '结束日当天算在假');
  ok(!api.rcOnLeave({ startDate: '2026-09-14', endDate: '2026-09-16' }, '2026-09-13'), '起始日前一天不算在假');
  ok(!api.rcOnLeave({ startDate: '2026-09-14', endDate: '2026-09-16' }, '2026-09-17'), '结束日后一天不算在假');

  // 提前销假：9/20 ~ 9/25，但 9/21 就销假回校
  const early = { startDate: '2026-09-20', endDate: '2026-09-25', returnDate: '2026-09-21' };
  eq(api.rcLeaveEnd(early), '2026-09-21', '提前销假：结束日收缩到 returnDate');
  ok(api.rcOnLeave(early, '2026-09-21'), '提前销假：销假当天仍算在假');
  ok(!api.rcOnLeave(early, '2026-09-22'), '提前销假：销假次日已回校，不算在假（这正是取 min 的意义）');

  // 滞后销假：假到 9/16，9/18 才销假 —— 不应把 9/17 也算成在假
  const late = { startDate: '2026-09-14', endDate: '2026-09-16', returnDate: '2026-09-18' };
  eq(api.rcLeaveEnd(late), '2026-09-16', '滞后销假：仍以 endDate 为准');
  ok(!api.rcOnLeave(late, '2026-09-17'), '滞后销假：假满次日不算在假');

  // 跨月 / 跨年字符串比较
  ok(api.rcOnLeave({ startDate: '2026-09-28', endDate: '2026-10-03' }, '2026-10-01'), '跨月区间判定正确');
  ok(api.rcOnLeave({ startDate: '2026-12-30', endDate: '2027-01-02' }, '2027-01-01'), '跨年区间判定正确');
  ok(!api.rcOnLeave({ startDate: '2026-09-14', endDate: '2026-09-16' }, ''), '空日期不判定为在假');

  // rcLeaveMap：同日多条只留一条
  st.leaves = [
    { studentId: 1, startDate: '2026-09-14', endDate: '2026-09-16' },
    { studentId: 2, startDate: '2026-09-20', endDate: '2026-09-25', returnDate: '2026-09-21' },
    { studentId: 3, startDate: '2026-10-01', endDate: '2026-10-02' }
  ];
  const m1 = api.rcLeaveMap('2026-09-14');
  eq(Object.keys(m1).length, 1, '9/14 只有 1 人在假');
  ok(!!m1[1], '9/14 的请假表含 id=1');
  const m2 = api.rcLeaveMap('2026-09-22');
  eq(Object.keys(m2).length, 0, '9/22 无人在假（提前销假已收缩）');
  const m3 = api.rcLeaveMap('2026-09-21');
  eq(Object.keys(m3).length, 1, '9/21 提前销假当天仍算 1 人');
}

// ============================================================
console.log('\n\u30104\u3011候选池 = 全班 − 已点到 − 当天请假');
// ============================================================
{
  const st = {
    students: [
      { id: 1, name: 'A', credit: 0, tags: [] },
      { id: 2, name: 'B', credit: 0, tags: [] },
      { id: 3, name: 'C', credit: 0, tags: [] },
      { id: 4, name: 'D', credit: 0, tags: [] }
    ],
    leaves: [{ studentId: 3, startDate: TODAY, endDate: TODAY }]
  };
  const { api } = mkSandbox(st);
  api.setDate(TODAY);
  let cands = api.rcCandidates();
  eq(cands.length, 3, '全班 4 人 − 当天请假 1 人 = 候选 3 人');
  ok(!cands.some(s => s.id === 3), '请假的 C 不在候选池');

  api.getDone().push(2);
  cands = api.rcCandidates();
  eq(cands.length, 2, '标记 B 已点到后，候选池只剩 2 人');
  ok(!cands.some(s => s.id === 2), '已点到的 B 不在候选池');

  api.getDone().push(1, 4);
  eq(api.rcCandidates().length, 0, '除请假外全部点到 ⇒ 候选池空');
  api.getDone().length = 0;
  eq(api.rcCandidates().length, 3, '清空已点到后候选池恢复（请假的仍在池外）');
}

// ============================================================
console.log('\n\u30105\u3011无放回抽样 rcSample');
// ============================================================
{
  const st = { students: [], leaves: [] };
  const { api } = mkSandbox(st);
  const pool = [1, 2, 3, 4, 5].map(i => ({ id: i }));
  const three = api.rcSample(pool, 3);
  eq(three.length, 3, '从 5 个里抽 3 个，得 3 个');
  eq(new Set(three.map(s => s.id)).size, 3, '抽出的 3 个互不相同');
  ok(three.every(s => pool.some(p => p.id === s.id)), '抽出的都来自原池');

  const over = api.rcSample(pool, 10);
  eq(over.length, 5, '要抽 10 个但池里只有 5 个 ⇒ 降级为 5 个');
  eq(new Set(over.map(s => s.id)).size, 5, '降级后仍互不相同');

  eq(api.rcSample([], 3).length, 0, '空池抽 0 个');
  eq(api.rcSample(pool, 0).length, 0, '抽 0 个得 0 个');

  // 原池不可被就地改动（否则会把 state.students 顺序打乱）
  const before = pool.map(s => s.id).join(',');
  api.rcSample(pool, 5);
  eq(pool.map(s => s.id).join(','), before, 'rcSample 不改动传入的数组');

  // 分布健全性：抽 1 个跑 400 次，5 个元素每个都应被抽到过
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(api.rcSample(pool, 1)[0].id);
  eq(seen.size, 5, '抽 1 个跑 400 次，5 个元素都被抽到过（无系统性偏置）');
}

// ============================================================
console.log('\n\u30106\u3011点击切换 + 统计口径');
// ============================================================
{
  const st = {
    students: [
      { id: 1, name: 'A', credit: 0, tags: [] },
      { id: 2, name: 'B', credit: 0, tags: [] },
      { id: 3, name: 'C', credit: 0, tags: [] }
    ],
    leaves: [{ studentId: 3, startDate: TODAY, endDate: TODAY }]
  };
  const { api, els, calls } = mkSandbox(st);
  api.setLoaded(true);
  api.setDate(TODAY);

  api.rcToggleDone(1);
  eq(api.getDone().length, 1, '点击卡片 ⇒ 进入已点到');
  api.rcRefreshStats();
  eq(els['rcStatTotal'].textContent, 2, '应到 = 全班 3 − 请假 1 = 2');
  eq(els['rcStatDone'].textContent, 1, '已点到 1');
  eq(els['rcStatPending'].textContent, 1, '未点到 1');
  eq(els['rcStatLeave'].textContent, 1, '今天请假 1');
  eq(Number(els['rcStatDone'].textContent) + Number(els['rcStatPending'].textContent),
     Number(els['rcStatTotal'].textContent), '已点到 + 未点到 == 应到');

  api.rcToggleDone(1);
  eq(api.getDone().length, 0, '再点一次 ⇒ 退出已点到（可逆）');

  calls.toasts.length = 0;
  api.rcToggleDone(3);
  eq(api.getDone().length, 0, '点请假的卡片不改变状态');
  ok(calls.toasts.length > 0, '点请假的卡片给出提示');

  // 名单区渲染
  api.rcToggleDone(1);
  api.rcRefreshStats();
  has(els['rcPendingNames'].innerHTML, '>B<', '未点到名单里含 B');
  notHas(els['rcPendingNames'].innerHTML, '>C<', '未点到名单里不含请假的 C');
  // 注意：不能用裸 'C' 做断言 —— 「rcFocusCard」里就有大写 C，会假命中
  ok(els['rcPendingNames'].innerHTML.indexOf('>C<') < 0, '（同上，按渲染出的姓名节点判断而不是裸字母）');
  api.rcToggleDone(2);
  api.rcRefreshStats();
  has(els['rcPendingNames'].innerHTML, '\u5168\u73ed\u5df2\u70b9\u5230', '全员点到后显示「全班已点到」');
}

// ============================================================
console.log('\n\u30107\u3011动效状态机（先抽签后滚动 / 抽中即出池 / 中断可复位）');
// ============================================================
{
  const st = {
    students: [1, 2, 3].map(i => ({ id: i, name: 'S' + i, credit: 0, tags: [] })),
    leaves: []
  };
  const { api, calls, doc } = mkSandbox(st);
  api.setLoaded(true);
  api.setDate(TODAY);

  eq(api.RC.phase, 'idle', '初始 phase = idle');
  api.rcStartDraw();
  eq(api.RC.phase, 'rolling', '开始抽取后 phase = rolling');
  eq(api.RC.queue.length, 1, '默认抽 1 人');
  ok(api.RC.queue[0] && api.getDone().length === 0, '中签名单在动效开始前就算好了，但尚未计入已点到');

  // 动效期间点卡片应被忽略
  const before = api.getDone().length;
  api.rcToggleDone(1);
  eq(api.getDone().length, before, '动效期间点击卡片被忽略');

  // 揭晓：中签者进已点到 + 进本批中签
  const pickedId = api.RC.queue[0].id;
  calls.toasts.length = 0;
  api.rcReveal();
  ok(api.getDone().indexOf(pickedId) >= 0, '揭晓后中签者已点到');
  ok(api.getPicked().indexOf(pickedId) >= 0, '揭晓后中签者在本批黄框名单');
  ok(calls.toasts.length > 0, '揭晓时给出 toast 播报中签者');
  ok(api.rcCandidates().every(s => s.id !== pickedId), '中签者已移出候选池（一轮内不再重复抽）');

  // 抽到池空
  while (api.rcCandidates().length > 0) {
    api.rcStartDraw();
    if (api.RC.queue.length) api.rcReveal();
  }
  eq(api.rcCandidates().length, 0, '继续抽直到候选池空');
  eq(new Set(api.getDone()).size, 3, '已点到去重后正好 3 人（没有重复抽中同一个人）');

  // 中断复位
  api.rcCancelRoll();
  eq(api.RC.phase, 'idle', '中断后 phase 复位为 idle');
  eq(api.RC.cur, null, '中断后当前高亮清空');

  // 重置
  api.rcReset();
  eq(api.getDone().length, 0, '重置后已点到清空');
  eq(api.getPicked().length, 0, '重置后本批中签清空');
  eq(api.rcCandidates().length, 3, '重置后全员回池');
}

// ============================================================
console.log('\n\u30108\u3011落盘 sessionStorage（跨天失效）');
// ============================================================
{
  const st = { students: [{ id: 1, name: 'A', credit: 0, tags: [] }], leaves: [] };
  const { api, session } = mkSandbox(st);
  api.setDate(TODAY);
  api.getDone().push(1);
  api.getPicked().push(1);
  api.rcSave();
  has(session.getItem('cm_rc_state') || '', TODAY, '落盘的 key 里带当天日期');
  has(session.getItem('cm_rc_state') || '', '"done":[1]', '落盘含已点到');

  // 同日可恢复（共用上面那个 sessionStorage 桩，才能真的读到刚写进去的东西）
  const b = mkSandbox(st, { session }).api;
  b.setDate('');
  b.rcLoad();
  eq(b.getDate(), TODAY, '同日 rcLoad 恢复日期');
  eq(b.getDone().length, 1, '同日 rcLoad 恢复已点到');

  // 跨天失效：必须自己造一条「别的日期」的记录 ——
  // rcLoad 比的是【真实今天】而不是 rcDate（这是对的），所以用 setDate 根本造不出跨天场景
  const c2 = mkSandbox(st);
  c2.session.setItem('cm_rc_state', JSON.stringify({ date: '1999-01-01', done: [1], picked: [1] }));
  c2.api.setDate('');
  c2.api.rcLoad();
  eq(c2.api.getDone().length, 0, '跨天 rcLoad 不恢复（date 与今天不符 ⇒ 整条作废）');
  eq(c2.api.getDate(), '', '跨天时 rcDate 不被写脏');

  // 脏数据不炸
  const s2 = mkSandbox(st);
  s2.session.setItem('cm_rc_state', '{{{not json');
  let threw = false;
  try { s2.api.rcLoad(); } catch (e) { threw = true; }
  ok(!threw, 'sessionStorage 里是脏数据时 rcLoad 不抛异常');
  threw = false;
  try { s2.api.rcSave(); } catch (e) { threw = true; }
  ok(!threw, 'rcSave 不抛异常');
}

// ============================================================
console.log('\n\u30109\u3011美术与无障碍约束');
// ============================================================
{
  // 切片一直取到 </style>：.rc-* 是插在样式表末尾的，
  // 只切到 @media(max-width:768px){ 会把后面的 prefers-reduced-motion 与移动端尺寸全漏掉
  const CS = sliceFrom('.rc-toolbar{', '</style>');
  has(CS, 'var(--success)', '滚动高亮用 --success（石绿），不是硬编码绿');
  has(CS, 'var(--warning)', '中签高亮用 --warning（琥珀），不是硬编码黄');
  notHas(CS, '#FFD700', '不用刺眼的纯金黄');
  has(CS, 'var(--radius-sm)', '卡片圆角走 --radius-sm');
  has(CS, 'var(--card-bg)', '卡片底走 --card-bg');
  has(CS, 'var(--border)', '卡片边线走 --border');
  has(CS, '@media(hover:none)', '有触摸端 hover 守卫（项目已踩过两次的坑）');
  has(html, '-webkit-tap-highlight-color:transparent', '卡片关掉触摸高亮');
  has(CS, 'prefers-reduced-motion', '有 prefers-reduced-motion 降级');
  // 守卫必须写在 .rc-pick / .rc-done 之前，否则触摸端会把选中态的高亮夺走
  ok(CS.indexOf('@media(hover:none)') < CS.indexOf('.rc-card.rc-done'),
     '触摸守卫写在 .rc-done 之前（同特异度靠源序）');
  ok(CS.indexOf('.rc-card.rc-done') < CS.indexOf('.rc-card.rc-pick'),
     '.rc-pick 写在 .rc-done 之后（同特异度靠源序，黄框才压得住灰底）');
  // 触摸目标 ≥44px：卡片高 60px（移动端 56px）
  has(CS, 'height:60px', '桌面卡片高 60px（≥44px 触摸目标）');
  has(CS, 'height:56px', '移动端卡片高 56px（≥44px 触摸目标）');
  // 动效只改 classList，不重建卡片墙
  const JS_SLICE = sliceFrom('function rcTick(', 'function rcReveal(');
  notHas(JS_SLICE, 'innerHTML', '动效循环里没有 innerHTML（不重建 DOM）');
  has(JS_SLICE, 'classList.remove', '动效循环只做 classList.remove');
}

// ============================================================
console.log('\n\u301010\u3011既有契约不破（请假模块 / 导航）');
// ============================================================
has(html, 'function renderAttendance(){', '请假页渲染函数仍在');
has(html, "if(page==='attendance') renderAttendance();", '请假页路由未被改动');
has(html, 'function confirmAddLeave(){', '登记请假函数仍在');
has(html, 'function returnLeave(id){', '销假函数仍在');
has(html, 'function msLeaves(merged,localData,remoteData){', '请假合并策略仍在');
has(html, 'id="leaveList"', '请假列表容器仍在');
has(html, 'nav-item" data-page="attendance"', '侧栏请假入口仍在');
has(html, 'more-item" data-page="attendance"', '抽屉请假入口仍在');
// 点名模块不落 state（一期约定：结果只放 sessionStorage，不开同步链路）
notHas(html, "key:'rollcallSessions'", '一期不给点名开 state 字段（不落云端）');
notHas(html, 'cm_rc_state\').push', 'sessionStorage 之外没有第二处点名持久化');

// ============================================================
console.log('\n' + '='.repeat(56));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  \u2717 ' + f)); }
process.exit(fail ? 1 : 0);
