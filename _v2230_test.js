// _v2230_test.js — v2.23.0：请假卡「信息加料」+ 点名页布局重构
//
// ① 版本与标记（版本无关：从 sw.js 的 CACHE_NAME 反推，下次跟版零成本）
// ② 请假卡空白治理 —— 拔掉 min-height 这个「下端一大片空白」的根因
// ③ 请假卡字号 —— 姓名/日期/原因/登记时间各上调一档
// ④ 时长 —— CSS 大号数字结构 + lvDurNum 真跑 + formatDuration 仍留给弹窗
// ⑤ 点名卡片墙 —— 去掉内部滚动（老板要「全部展示、不要上下滑动」）
// ⑥ 未点到名单折叠 —— 默认收起 + rcTogglePending 真跑
// ⑦ 「本轮抽中」预览栏 —— HTML/CSS + rcRefreshStats 真跑（人名真的填进去）
// ⑧ 绿色重置按钮 —— .btn-success 与 .btn-primary 同形态、色相为石绿
// ⑨ 抽取人数自定义 —— number 输入框 + 上下界保护
// ⑩ 既有契约不破 —— 尤其 .rc-toolbar 类名（v2.21.0 拿它当 CSS 切片锚点）
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
function has(t, s, msg) { log(String(t).indexOf(s) >= 0, msg + (String(t).indexOf(s) >= 0 ? '' : '\u300c缺 ' + JSON.stringify(String(s).slice(0, 60)) + '\u300d')); }
function notHas(t, s, msg) { log(String(t).indexOf(s) < 0, msg + (String(t).indexOf(s) < 0 ? '' : '\u300c不该有 ' + JSON.stringify(String(s).slice(0, 60)) + '\u300d')); }
function eq(a, b, msg) { log(a === b, (msg || '') + '\uff08期望 ' + JSON.stringify(b) + '\uff0c实得 ' + JSON.stringify(a) + '\uff09'); }
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }
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
function sliceFrom(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b, i + 1);
  if (i < 0 || j < 0 || j <= i) throw new Error('切片失败：' + a.slice(0, 30) + ' \u2192 ' + b.slice(0, 30));
  return html.slice(i, j);
}
function ruleBody(sel) {
  const i = html.indexOf(sel);
  if (i < 0) return '';
  return html.slice(i, html.indexOf('}', i) + 1);
}
// 🔴 请假卡的规则名在 CSS 里出现**两次**：主规则 + 移动端断点里的紧凑版，
//    而且移动端断点在文件里**更早**（L1439 一带），所以 `html.indexOf('.leave-student{')`
//    会命中那条 16px 的、断言必然落空。→ 断言主规则必须**限定在主 CSS 块范围内**。
// 🔴 切片锚点**不带版本号**：`v2.23.0 「请假卡排版加料」` 那个 CSS 注释是**历史注释**，
//    跟版时 index.html 里那一行不会被改（改的只是四处活动标记），所以锚点里一旦写死版本号，
//    下次跟版就会切片失败、整套静默崩掉。这是「带版本号的注释不许当代码锚点」的同一条铁律。
const LC_START = html.indexOf('\u8bf7\u5047\u5361\u300c\u6392\u7248\u52a0\u6599\u300d');
const LC_END = html.indexOf('@media(max-width:680px){.leave-grid', LC_START);
const LC = (LC_START >= 0 && LC_END > LC_START) ? html.slice(LC_START, LC_END) : '';
function lcRule(sel) {
  const i = LC.indexOf(sel);
  if (i < 0) return '';
  return LC.slice(i, LC.indexOf('}', i) + 1);
}
// 剥块注释 —— 断言「代码里没有 X」前必做（本轮新注释里就写着「删掉 min-height:176px」）
function stripBlock(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ''); }

// ============================================================
console.log('\n\u30101\u3011版本与标记（版本无关断言）');
// ============================================================
const mVer = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
ok(!!mVer, 'sw.js 能解出版本号');
const V = mVer ? mVer[1] : '';
console.log('     （版本 = ' + V + '）');
has(html, '<div class="login-version">' + V + '</div>', '登录页标记 = ' + V);
has(html, '<div class="sidebar-footer">' + V + ' · 班主任工作台</div>', '侧栏页脚标记 = ' + V);
has(html, '\uD83C\uDFF7\uFE0F ' + V + '</span>', '设置页徽标 = ' + V);
has(html, '\uD83D\uDCDD 近版更新速览（' + V + '）', '速览标题 = ' + V);
const iN = html.indexOf('id="settingsReleaseNotes"');
const notesBlock = html.slice(iN, html.indexOf('</div>', iN));
ok(cnt(notesBlock, '<br>') >= 1, '速览正文至少 1 条（实得 ' + cnt(notesBlock, '<br>') + ' 条）');

// ============================================================
console.log('\n\u30102\u3011请假卡空白治理（拔掉 min-height 这个根因）');
// ============================================================
const c0 = html.indexOf('.leave-card{\n  display:flex;flex-direction:column');
ok(c0 > 0, '能定位 .leave-card 主规则（避开 768 断点里那条同名规则）');
const cardRule = html.slice(c0, html.indexOf('}', c0) + 1);
notHas(cardRule, 'min-height',
  '★ 卡片不再写死高度 —— 「下端一大片空白」的根因已拔掉（原来 176px 撑空 + margin-top:auto 把按钮踹到底）');
has(cardRule, 'display:flex', '仍是 flex 容器');
has(cardRule, 'flex-direction:column', '仍是竖向排列（grid 负责同行等高）');
has(cardRule, 'var(--card-bg)', '卡片底色走变量');
has(cardRule, 'var(--border)', '卡片描边走变量');
// 但「按钮对齐」这个不变量必须保住
has(html, '.leave-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto',
  '脚区 margin-top:auto 仍在（同行卡片按钮对齐靠它）');
// 旧的小号时长写法必须消失
notHas(stripBlock(html), '.leave-meta .lv-dur{margin-left:auto;font-size:12px',
  '旧的小号时长写法（12px）已清除');

// ============================================================
console.log('\n\u30103\u3011请假卡字号（老板：姓名和日期字号太小）');
// ============================================================
ok(LC.length > 2000, '能切出请假卡主 CSS 块（' + LC.length + ' 字符，避开移动端断点里那几条同名规则）');
const sRule = lcRule('.leave-student{');
has(sRule, 'font-size:17px', '姓名 17px（原 16px）');
has(sRule, 'font-weight:700', '姓名加粗到 700');
const mRule = lcRule('.leave-meta{');
has(mRule, 'font-size:14px', '日期 14px（原 13px）');
has(mRule, 'font-weight:500', '日期加粗到 500');
const rRule = lcRule('.leave-reason{');
has(rRule, 'font-size:13.5px', '原因 13.5px（原 13px）');
has(rRule, '-webkit-line-clamp:2', '原因仍最多两行');
const ctRule = lcRule('.leave-created{');
has(ctRule, 'font-size:12px', '登记时间 12px（原 11px）');
const hRule = lcRule('.leave-hist{');
has(hRule, 'font-size:11.5px', '历史记录 11.5px（原 11px）');
// 移动端断点里字号要跟着收（否则窄屏会挤爆）
const mBreak = html.indexOf('.leave-student{font-size:16px}');
ok(mBreak > 0, '移动端断点收了姓名字号（16px）');
ok(mBreak > 0 && mBreak < LC_START, '移动端收紧规则排在主规则之前（源序 ↑ 也在验证定位不能只靠 indexOf）');

// ============================================================
console.log('\n\u30104\u3011请假时长（大号数字 + 0.5/1/1.5 口径）');
// ============================================================
const durRule = lcRule('.leave-meta .lv-dur{');
has(durRule, 'margin-left:auto', '时长右对齐');
has(durRule, 'display:inline-flex', '数字与单位用 inline-flex 排版');
has(durRule, 'align-items:baseline', '按基线对齐（数字大、单位小）');
const durB = lcRule('.leave-meta .lv-dur b{');
has(durB, 'font-size:20px', '★ 数字 20px 大号（原来是 12px 的「共 2 天」）');
has(durB, 'font-weight:700', '数字加粗');
const durI = lcRule('.leave-meta .lv-dur i{');
has(durI, 'font-style:normal', '「天」字不用斜体');
has(durI, 'font-size:12px', '单位小一号');

// lvDurNum 真跑
let lvDurNum = null;
try { lvDurNum = (new Function('return ' + braceFn('lvDurNum')))(); }
catch (e) { console.log('     抽取失败：' + e.message); }
ok(typeof lvDurNum === 'function', 'lvDurNum 能被抽出并求值');
if (typeof lvDurNum === 'function') {
  eq(lvDurNum(0.5), '0.5', '半天 → 0.5（老板要的就是这个数字口径）');
  eq(lvDurNum(1), '1', '一天 → 1');
  eq(lvDurNum(1.5), '1.5', '一天半 → 1.5');
  eq(lvDurNum(2.5), '2.5', '两天半 → 2.5');
  eq(lvDurNum(3), '3', '三天 → 3');
  eq(lvDurNum('1.5'), '1.5', '字符串数字也能用（JSON 往返后是字符串）');
  eq(lvDurNum(null), '', 'null 返回空串');
  eq(lvDurNum(undefined), '', 'undefined 返回空串');
  eq(lvDurNum(0), '', '0 天不渲染时长块（而不是显示「0天」）');
  eq(lvDurNum(-1), '', '负数不渲染');
  eq(lvDurNum('abc'), '', '非数字不渲染');
  eq(lvDurNum(NaN), '', 'NaN 不渲染');
}
has(html, "lvDurNum(l.duration)?'<span class=\"lv-dur\"><b>'+lvDurNum(l.duration)+'</b><i>天</i></span>':'')",
  '★ 卡片渲染走新结构（<b>数字</b><i>天</i>）');
notHas(html, "'<span class=\"lv-dur\">\u5171 '", '不再用「共 X 天」的小字写法');
// formatDuration 仍要留给弹窗与 toast（不能顺手删掉）
has(html, 'function formatDuration(d){', 'formatDuration 保留（请假弹窗 / toast 仍在用）');
has(html, "box.textContent = formatDuration(dur) + ' ('", '弹窗仍在用 formatDuration');
ok(html.indexOf("formatDuration(dur) + ' ('") > 0 && cnt(html, 'formatDuration(') >= 3,
  'formatDuration 的既有调用点未被破坏（实得 ' + cnt(html, 'formatDuration(') + ' 处）');

// ============================================================
console.log('\n\u30105\u3011点名卡片墙：不再有内部滚动');
// ============================================================
const wallRule = ruleBody('.rc-wall{');
has(wallRule, 'display:grid', '仍是网格布局');
notHas(wallRule, 'max-height', '★ 删掉 max-height:52vh（原来卡片墙里嵌了个独立滚动区）');
notHas(wallRule, 'overflow-y', '★ 卡片墙不再自身滚动（老板：不要上下滑动）');
notHas(stripBlock(html), 'max-height:52vh', '全文（剥注释后）已无 max-height:52vh');
// 移动端断点里也不能偷偷加回限高
const mw = html.indexOf('@media(max-width:768px){\n  .rc-wall{');
ok(mw > 0, '能定位移动端 .rc-wall 断点');
if (mw > 0) {
  const mwRule = html.slice(mw, html.indexOf('}', mw) + 1);
  notHas(mwRule, 'max-height', '移动端断点里也没有限高');
}
// 触摸目标与既有美术不变量
has(wallRule, 'minmax(104px,1fr)', '桌面卡片最小 104px');
has(html, 'height:60px', '桌面卡片高 60px（≥44px 触摸目标）');
has(html, 'height:56px', '移动端卡片高 56px（≥44px 触摸目标）');

// ============================================================
console.log('\n\u30106\u3011未点到名单：默认折叠');
// ============================================================
has(html, 'id="rcPendingPanel"', '面板有 id（折叠状态挂它身上）');
has(html, 'onclick="rcTogglePending()"', '标题行可点击');
has(html, 'class="rc-panel-head" type="button"', '用真 button（无障碍优于 div+role）');
has(html, 'aria-expanded="false"', '初始 aria-expanded=false（默认收起）');
has(html, 'function rcTogglePending(){', 'rcTogglePending 函数存在');
const bodyRule = ruleBody('.rc-panel-body{');
has(bodyRule, 'display:none', '★ 折叠体默认 display:none');
has(html, '.rc-panel.open .rc-panel-body{display:block}', '加 .open 才展开');
has(html, '.rc-panel.open .rc-panel-arrow{transform:rotate(180deg)}', '展开时箭头翻转');
has(html, '.rc-panel-arrow{', '有 CSS 三角箭头（避开 i-dorm 那片畸形 symbol 区，没新增图标）');

// rcTogglePending 真跑
{
  const attrs = {};
  const head = { setAttribute(k, v) { attrs[k] = v; } };
  const cls = {};
  const panel = {
    classList: { toggle(c) { cls[c] = !cls[c]; return cls[c]; } },
    querySelector(sel) { return sel === '.rc-panel-head' ? head : null; }
  };
  let toggle = null;
  try { toggle = (new Function('document', braceFn('rcTogglePending') + '\nreturn rcTogglePending;'))({ getElementById(id) { return id === 'rcPendingPanel' ? panel : null; } }); }
  catch (e) { console.log('     抽取失败：' + e.message); }
  ok(typeof toggle === 'function', 'rcTogglePending 能被抽出并求值');
  if (typeof toggle === 'function') {
    toggle();
    ok(cls.open === true, '第一次点击 → 展开');
    eq(attrs['aria-expanded'], 'true', 'aria-expanded 同步为 true');
    toggle();
    ok(cls.open === false, '再点一次 → 收起');
    eq(attrs['aria-expanded'], 'false', 'aria-expanded 同步为 false');
    const t2 = (new Function('document', braceFn('rcTogglePending') + '\nreturn rcTogglePending;'))({ getElementById() { return null; } });
    ok(t2() === undefined, '节点不存在时安全返回（不抛异常）');
  }
}

// ============================================================
console.log('\n\u30107\u3011「本轮抽中」预览栏（开始抽取右侧）');
// ============================================================
has(html, 'class="rc-picked-panel"', 'HTML 有预览栏容器');
has(html, 'id="rcPickedNames"', '有中签人名容器');
has(html, 'id="rcPickedCnt"', '有人数容器');
const pkRule = ruleBody('.rc-picked-panel{');
has(pkRule, 'var(--success)', '预览栏色标用石绿');
has(pkRule, 'border-left:4px solid', '左侧色条（与请假卡同一套视觉语言）');
has(html, '.rc-picked-chip{', '人名标签样式存在');
has(html, "'<span class=\"rc-picked-chip\">' + escapeHtml(s.name) + '</span>'", '人名走 escapeHtml（不裸插）');
has(html, '\u5c1a\u672a\u62bd\u53d6', '未抽时显示「尚未抽取」占位');
// 位置：必须在工具栏内、且在开始抽取按钮之后
const tb = html.indexOf('<div class="rc-toolbar">');
const btnIdx = html.indexOf('id="rcStartBtn"', tb);
const pkIdx = html.indexOf('class="rc-picked-panel"', tb);
ok(tb > 0 && btnIdx > tb && pkIdx > btnIdx,
  '★ 预览栏位于「开始抽取」按钮右侧（DOM 顺序：工具栏 → 按钮 → 预览栏）');

// rcRefreshStats 真跑
const LOCALDATE = braceFn('localDateStr');
const RC_SLICE = sliceFrom('var RC_SESSION_KEY', '/* ==================== \u6210\u7ee9\u7ba1\u7406');

function elStub() {
  return {
    textContent: '', innerHTML: '', value: '1', disabled: false, max: '',
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, dataset: {},
    setAttribute() {}, getAttribute() { return null; }
  };
}
function mkSandbox(st) {
  const els = {};
  const doc = {
    getElementById(id) { if (!els[id]) els[id] = elStub(); return els[id]; },
    querySelectorAll() { return []; },
    addEventListener() {},
    hidden: false
  };
  const session = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); } };
  const win = { matchMedia: () => ({ matches: false }) };
  // 形参 10 / 实参 10 —— 必须一一对应（new Function 实参错位不报错，只会后面全变 undefined）
  const api = new Function(
    'state', 'localDateStr', 'escapeHtml', 'showToast', 'document', 'sessionStorage',
    'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    LOCALDATE + '\n' + RC_SLICE +
    '\nreturn { rcLeaveEnd, rcOnLeave, rcLeaveMap, rcCandidates, rcSample, rcHas, rcEnsureToday,' +
    ' rcLoad, rcSave, rcToggleDone, rcRefreshStats, rcStartDraw, rcReveal, rcCancelRoll, rcReset,' +
    ' rcTogglePending, rcReducedMotion, RC, getDone: function(){ return rcDoneSet; },' +
    ' getPicked: function(){ return rcPickedSet; },' +
    ' setPicked: function(a){ rcPickedSet = a; },' +
    ' setDone: function(a){ rcDoneSet = a; },' +
    ' setDate: function(d){ rcDate = d; }, setLoaded: function(b){ rcLoaded = b; } };'
  )(
    st,
    function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    function (s) { return String(s == null ? '' : s); },
    function () {},
    doc, session, win,
    function (cb) { return 1; },
    function () {},
    function (fn, ms) { return 1; }
  );
  return { st, api, els, doc };
}
{
  const st = { students: [{ id: 1, name: '张三' }, { id: 2, name: '李四' }, { id: 3, name: '王五' }], leaves: [] };
  const s = mkSandbox(st);
  ok(typeof s.api.rcRefreshStats === 'function', 'rcRefreshStats 能在沙箱里求值');
  s.api.setPicked([2]);
  s.api.setDone([2]);          // 真实流程里「抽中 = 已点到」（rcReveal 会同时 push 两处）
  s.api.rcRefreshStats();
  has(s.els['rcPickedNames'].innerHTML, '李四', '★ 抽中的人名真的填进了预览栏');
  notHas(s.els['rcPickedNames'].innerHTML, '张三', '未抽中的不出现在预览栏');
  has(s.els['rcPickedCnt'].textContent, '1', '预览栏人数 = 1');
  has(s.els['rcPendingCnt'].textContent, '2 人', '未点到计数 = 2（张三 / 王五）');
  eq(s.els['rcCount'].max, '3', '人数输入框 max = 应到 3');
  s.api.setPicked([1, 3]);
  s.api.setDone([1, 2, 3]);
  s.api.rcRefreshStats();
  has(s.els['rcPickedNames'].innerHTML, '张三', '换成另一批后预览栏跟着换');
  has(s.els['rcPickedNames'].innerHTML, '王五', '第二个中签也在');
  notHas(s.els['rcPickedNames'].innerHTML, '李四', '上一批已不在预览栏');
  has(s.els['rcPickedCnt'].textContent, '2', '人数同步为 2');
  s.api.setPicked([]);
  s.api.rcRefreshStats();
  has(s.els['rcPickedNames'].innerHTML, '\u5c1a\u672a\u62bd\u53d6', '清空后回到「尚未抽取」占位');
  has(s.els['rcPendingCnt'].textContent, '0 人', '全员点到后未点到计数归零');
  // 节点缺失时不能崩（真实页面渲染时机不定）
  const s2 = mkSandbox(st);
  s2.doc.getElementById = function () { return null; };
  let threw = false;
  try { s2.api.rcRefreshStats(); } catch (e) { threw = true; }
  ok(!threw, '预览栏节点缺失时 rcRefreshStats 不抛异常');
}

// ============================================================
console.log('\n\u30108\u3011绿色重置按钮（同形态、石绿色相）');
// ============================================================
// ⚠️ 必须用**行首**锚点：`html.dark .btn-success{` 也含子串 `.btn-success{`，
//    而暗色区在文件里更早（约 L94，主规则在 L520 一带），indexOf 会先命中暗色那条
//    —— 它刻意没有 box-shadow（夜里用不上同族阴影）。这是本轮第三次栽在
//    「同名规则在文件里更早处也有一份」上（前两次：.leave-student / .leave-meta）。
const g0 = html.indexOf('\n.btn-success{');
ok(g0 > 0, '能定位 .btn-success 主规则（用行首锚点避开 html.dark 那条）');
const gRule = html.slice(g0, html.indexOf('}', g0) + 1);
has(gRule, 'linear-gradient(135deg', '★ 实心渐变 —— 与「开始抽取」(.btn-primary) 同形态');
has(gRule, 'var(--success)', '色相用石绿 --success');
has(gRule, 'color:#fff', '白字');
has(gRule, 'box-shadow', '有同族阴影');
has(html, '.btn-success:hover{', '有悬停态');
has(html, 'transform:translateY(-1px)', '悬停上浮（与 .btn-primary 一致）');
has(html, 'html.dark .btn-success{', '暗色主题有一条（否则夜里太亮）');
has(html, 'class="btn btn-success" id="rcResetBtn"', '重置按钮用了绿色类');
has(html, 'onclick="rcReset()"', '仍绑定 rcReset');
has(html, '<use href="#i-refresh"/>', '带刷新图标');
// 旧位置（页头）必须已经没有它
const pg = html.indexOf('id="page-rollcall"');
const pgEnd = html.indexOf('id="rcStatGrid"');
const head = html.slice(pg, pgEnd);
ok(pg > 0 && pgEnd > pg, '能切出点名页页头');
notHas(head, 'rcReset()', '★ 页头不再有重置按钮（已挪进工具栏与开始抽取同一行）');
has(head, '<h3 style="margin:0">课堂点名</h3>', '页头只剩标题');

// ============================================================
console.log('\n\u30109\u3011抽取人数支持自定义');
// ============================================================
has(html, 'id="rcCount" type="number"', '★ 改成数字输入框');
notHas(stripBlock(html), '<select class="rc-count"', '旧的固定下拉已移除');
has(html, 'id="rcCount" type="number" min="1"', '下界 1');
has(html, '<span class="rc-toolbar-label">\u62bd\u53d6\u4eba\u6570</span>', '标签改为「抽取人数」');
has(html, 'if(n < 1) n = 1;', '★ 0 / 负数保护（parseInt||1 兜不住负号）');
has(html, 'if(n > cands.length) n = cands.length;', '★ 上界收敛到候选池');
has(html, 'cEl.max = String(Math.max(1, total));', 'max 跟着应到人数走');

// ============================================================
console.log('\n\u301010\u3011既有契约不破');
// ============================================================
// 🔴 .rc-toolbar 这个类名必须保留：v2.21.0 的测试拿 `.rc-toolbar{` 当 CSS 切片起点，
//    改名会让 sliceFrom 抛「切片失败」并让整个 _v2210b_test.js 崩掉。
has(html, '.rc-toolbar{', '★ .rc-toolbar 类名保留（v2.21.0 的 CSS 切片锚点）');
has(html, 'class="rc-toolbar"', '工具栏仍用该类名');
has(html, 'class="page" id="page-rollcall"', 'page-rollcall 容器串未被改动');
eq(cnt(html, 'data-page="rollcall"'), 2, '侧栏 + 移动端抽屉各一处入口');
has(html, 'id="rcWall"', '卡片墙容器仍在');
has(html, 'id="rcPendingNames"', '未点到名单容器仍在（id 未变）');
has(html, 'id="rcStatGrid"', '统计区仍在');
has(html, 'role="button" tabindex="0" onclick="rcToggleDone(', '点名卡片可访问性与点击未破坏');
has(html, 'function rcOnLeave(l, date){', '当天请假判定仍在');
has(html, 'padding-bottom:1px \u8ba9\u884c\u76d2', 'rc-badge 标定注释仍保留（防误删 padding-bottom）');
has(html, 'function renderAttendance(){', '请假页渲染函数仍在');
has(html, 'function lvShortDate(ds, refYear){', 'lvShortDate 仍在');
has(html, 'function calcLeaveDuration(startDate, startPeriod, endDate, endPeriod){', '时长计算未被改动');
has(html, "if(page==='attendance') renderAttendance();", '请假页路由未被改动');
has(html, "if(page==='rollcall') renderRollCall();", '点名页路由未被改动');
// 触摸端 hover 守卫的源序（项目铁律）
ok(html.indexOf('@media(hover:none){.rc-card:hover') < html.indexOf('.rc-card.rc-done'),
  '触摸端 hover 守卫仍排在选中态之前');
ok(html.indexOf('.rc-card.rc-done') < html.indexOf('.rc-card.rc-pick'),
  '选中态先后顺序未被破坏');
// 点名仍不落盘（一期约定）
notHas(html, "key:'rollcallSessions'", '点名仍不落 state（不落云端）');

// ============================================================
console.log('\n' + '='.repeat(56));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  \u2717 ' + f)); }
process.exit(fail ? 1 : 0);
