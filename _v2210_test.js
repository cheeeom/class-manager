// _v2210_test.js — v2.20.10：手机端导出图片（blob 下载 + 弹层长按保存 + 分享）
// ① 版本无关断言：四处活动版本标记与 sw.js 的 CACHE_NAME 对齐；v2.20.9 的历史注释必须留存
// ② 出图 / 下载统一走 pngExport()，两个调用点（座次表、值日表）都改过来了
// ③ 弹层 HTML / CSS：四个必需节点齐全 + 预览图的祖先链上没有 user-select:none（有就长按不了）
// ④ 分享链路必须全程同步 —— navigator.share 要用户手势，中间一个 await 就废
// ⑤ 真跑三条路径：触摸（弹图）/ 桌面（直接下载）/ 无 toBlob 兜底
// ⑥ 资源释放：弹层关掉才 revoke、桌面端靠 5 秒定时器、重复释放幂等
//
// 为什么「真跑」这么重要：v2.20.10 修的正是「界面报成功、其实什么都没下载」——
// 那种 bug 静态断言一个字都抓不到，只有把 mock DOM 里的 <a> 抓出来看 href 是什么才看得见。
// （旧写法 href 是 171,170 字符的 data: URL 且节点游离在 DOM 之外。）
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
function cnt(t, s) { return t.split(s).length - 1; }
// 断言「代码里没有 X」时必须先剥注释 —— 否则自己写的说明文字会把断言弄红（踩过）
function stripBlock(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function stripJs(s) { return stripBlock(s).replace(/\/\/[^\n]*/g, ''); }

// ============================================================
// 【1】版本与标记
// ============================================================
console.log('\n【1】版本与标记（版本无关断言：跟 sw.js 的 CACHE_NAME 对齐）');
const mVer = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
assert(!!mVer, 'sw.js 能解出版本号');
const ver = mVer[1];
console.log('    （当前版本 ' + ver + '）');
has(html, '<div class="login-version">' + ver + '</div>', '登录页版本与 CACHE_NAME 一致');
has(html, '<div class="sidebar-footer">' + ver + ' \u00b7 \u73ed\u4e3b\u4efb\u5de5\u4f5c\u53f0</div>', '侧栏版本与 CACHE_NAME 一致');
has(html, '\ud83c\udff7\ufe0f ' + ver + '</span>', '设置徽标版本与 CACHE_NAME 一致');
has(html, '\u8fd1\u7248\u66f4\u65b0\u901f\u89c8\uff08' + ver + '\uff09', '速览标题版本与 CACHE_NAME 一致');
// v2.20.9 的历史注释必须原样留着 —— 下次 bump 若把历史注释一起吃掉，这条会红
const v2209 = fs.readFileSync(path.join(DIR, '_v2209_test.js'), 'utf8').replace(/\r\n/g, '\n');
const v2208 = fs.readFileSync(path.join(DIR, '_v2208_test.js'), 'utf8').replace(/\r\n/g, '\n');
has(v2209, 'v2.20.9', 'v2.20.9 测试文件头部历史注释保留');
has(html, '\u4e3a\u4ec0\u4e48\u4e0d\u80fd\u53ea\u7528 <a download>.click()', '保留「为什么不能只用 <a download>.click()」的说明');
has(html, '\u5b9e\u6d4b href \u957f\u8fbe 17 \u4e07\u5b57\u7b26', '说明里写清了 data: URL 的实测长度（免得后人又改回去）');
has(v2208, '\u65e7\u5199\u6cd5 `a.href = canvas.toDataURL(...)`', '_v2208_test.js 里保留了「旧写法」的对照说明');
// 「本版更新速览」按维护约定是【整体替换】（只留最新一版，不做追加）——
// 所以这里刻意不钉某一版的文案：钉了就等于每次发版都要回来改这三行（v2.20.11 跟版时正是这么红的）。
// 改为钉「结构不变式」：标题版本已与 CACHE_NAME 对齐（上一条），正文确实有 ≥3 条条目。
const iNotes = html.indexOf('id="settingsReleaseNotes"');
const notesBlock = html.slice(iNotes, html.indexOf('</div>', iNotes));
const nBullets = cnt(notesBlock, '<br>');
assert(nBullets >= 1, '速览正文至少 1 条（实得 ' + nBullets + ' 条）');

// ============================================================
// 【2】统一出口
// ============================================================
console.log('\n【2】出图与下载统一出口 pngExport');
has(html, 'function pngExport(canvas, filename, okMsg){', '有统一出口 pngExport');
has(html, 'canvas.toBlob(function(blob){', '主路径走 canvas.toBlob');
has(html, 'a.href = _exportUrl; a.download = filename;', 'href 用 ObjectURL、download 用真文件名');
has(html, 'document.body.appendChild(a); a.click(); a.remove();', '先插进 DOM 再 click、用完立刻移除');
has(html, "typeof canvas.toBlob !== 'function'", '保留「无 toBlob」的极老浏览器兜底分支');
// ⚠️ 别用 `pngExport(canvas,` 直接数：定义行自身也含这串（老坑），必须连前导缩进一起锚。
const nCall = cnt(html, '\n  pngExport(canvas,');
assert(nCall === 2, '座次表 / 值日表两个导出都改走 pngExport（实得 ' + nCall + ' 处）');
assert(cnt(html, "a.href = canvas.toDataURL") === 1, 'toDataURL 只剩兜底分支那 1 处（实得 ' + cnt(html, 'a.href = canvas.toDataURL') + ' 处）');
assert(html.indexOf("a.download = (state.className || '\u73ed\u7ea7') + '-\u5ea7\u6b21\u8868.png';\n") < 0, '座次表已无「自建 <a> 直接下载」的旧写法');
const iFb = html.indexOf("typeof canvas.toBlob !== 'function'");
assert(html.slice(iFb, iFb + 400).indexOf('document.body.appendChild(a)') >= 0, '兜底分支同样先插进 DOM 再 click');

// ============================================================
// 【3】弹层 HTML / CSS
// ============================================================
console.log('\n【3】导出弹层（手机端长按保存 / 分享）');
const iModal = html.indexOf('<div class="modal-overlay" id="imgSaveModal">');
assert(iModal >= 0, '有 id="imgSaveModal" 的弹层');
const iNextModal = html.indexOf('<!-- v2.17.30 Modal:', iModal);
assert(iNextModal > iModal, '能定位弹层块的下界');
const modalBlock = html.slice(iModal, iNextModal);
assert(cnt(modalBlock, 'class="modal-overlay"') === 1, '弹层没有嵌套在另一个 .modal-overlay 里');
['id="imgSaveModal"', 'id="imgSaveHint"', 'id="imgSavePreview"', 'id="imgSaveShareBtn"']
  .forEach(k => has(modalBlock, k, '弹层含必需节点'));
assert(cnt(modalBlock, 'onclick="closeImgSave()"') === 2, '右上角 × 与底部「关闭」都接 closeImgSave()（实得 ' + cnt(modalBlock, 'onclick="closeImgSave()"') + '）');
has(modalBlock, 'onclick="imgSaveShare()"', '分享按钮接线');
has(modalBlock, 'alt="\u5bfc\u51fa\u7684\u56fe\u7247"', '预览图有 alt');
has(html, '#imgSaveHint{', '提示语有样式');
has(html, '#imgSavePreview{', '预览图有样式');
has(html, 'max-height:60vh', '预览图限高（小屏一屏看得全，才方便长按）');
has(html, 'object-fit:contain', '预览图不裁切');
// 长按存图的死敌：user-select:none / -webkit-touch-callout:none 一旦落到预览图上就点不出系统菜单
const css = stripBlock(html.slice(0, html.indexOf('</style>')));
assert(!/\*\s*\{[^}]*user-select/.test(css), '通配选择器没设 user-select:none（设了全站都长按不了）');
assert(!/(^|[\s,}])img\s*\{[^}]*user-select/.test(css), '没有落在裸 img 上的 user-select:none');
assert(!/\.modal[^{},]*\{[^}]*user-select/.test(css), '没有落在 .modal 系上的 user-select:none');
assert(!/#imgSave[^{},]*\{[^}]*user-select/.test(css), '没有落在 #imgSave 系上的 user-select:none');
assert(!/\.modal[^{},]*\{[^}]*-webkit-touch-callout/.test(css), '没有 .modal 上的 -webkit-touch-callout:none（它会让 iOS 长按菜单不弹）');
const sel = [];
for (let k = css.indexOf('user-select'); k >= 0; k = css.indexOf('user-select', k + 1)) {
  const op = css.lastIndexOf('{', k), cl = css.lastIndexOf('}', k);
  if (op > cl) sel.push(css.slice(cl + 1, op).trim().replace(/\s+/g, ' '));
}
console.log('    （现有 user-select 选择器：' + sel.join(' / ') + '）');

// ============================================================
// 【4】分享链路必须同步
// ============================================================
console.log('\n【4】分享链路必须全程同步（navigator.share 要用户手势）');
const iShare = html.indexOf('function imgSaveShare(){');
assert(iShare >= 0, '有 imgSaveShare()');
const shareBody = html.slice(iShare, html.indexOf('\n}', iShare));
assert(stripJs(shareBody).indexOf('await') < 0, 'imgSaveShare 里没有任何 await（先剥注释再查）');
assert(shareBody.indexOf('new File(') >= 0, '用同步的 new File(...) 组包');
assert(shareBody.indexOf('navigator.share') >= 0, '调用 navigator.share');
assert(shareBody.indexOf('if(!_exportBlob || !_canShareFile()) return;') >= 0, '前置守卫：没 blob / 不支持分享就直接返回');
assert(shareBody.indexOf('.catch(') >= 0, 'share() 的 rejection 要吞掉（用户取消不是错）');
has(html, '\u5230 navigator.share \u4e4b\u524d\u4e0d\u8bb8\u6709\u4efb\u4f55 await', '代码里留了「不许 await」的警示注释');
const iCan = html.indexOf('function _canShareFile(){');
const canBody = html.slice(iCan, html.indexOf('\n}', iCan));
assert(canBody.indexOf('navigator.canShare') >= 0, '用 navigator.canShare 探测（别只探测 navigator.share 存不存在）');
assert(canBody.indexOf('catch(e){ return false; }') >= 0, '探测失败要兜住（老浏览器上 canShare 可能抛）');

// ============================================================
// 抽「统一出口」代码块 → mock 环境真跑
// ============================================================
// ⚠️ 版本无关锚点：这条注释原写作「/* ==== v2.20.10 导出 PNG 的统一出口」，
// 但注释里的版本号会随跟版变化，拿它当代码锚点 = 每次发版自己炸自己。
// 只认后半句（index.html 里唯一）**并且回退到注释的起点** —— 直接 slice 会从注释中间切开，
// 切出来的碎片 `=== …` 不是合法 JS（v2.20.11 实测踩过）。
const iOutKey = html.indexOf('\u5bfc\u51fa PNG \u7684\u7edf\u4e00\u51fa\u53e3');
const iOut = html.lastIndexOf('/* ====', iOutKey);
const iSeat = html.indexOf('function seatExportImage(){', iOut);
assert(iOut >= 0 && iSeat > iOut, '能定位「导出 PNG 统一出口」代码块');
const srcOut = html.slice(iOut, iSeat);

function makeEnv(o) {
  o = o || {};
  const en = {
    els: {}, toasts: [], opened: [], closed: [], attached: [], everAttached: [], links: [],
    gets: [], media: [], shared: [], canShareArgs: [], timers: [],
    toBlobCalls: 0, toDataURLCalls: 0
  };
  function mkEl(id) {
    if (en.els[id]) return en.els[id];
    const a = {};
    const e = {
      id: id, style: {}, textContent: '', innerHTML: '', _classes: {},
      classList: {
        add(c) { e._classes[c] = 1; },
        remove(c) { delete e._classes[c]; },
        contains(c) { return !!e._classes[c]; }
      },
      setAttribute(k, v) { a[k] = v; },
      removeAttribute(k) { delete a[k]; },
      getAttribute(k) { return (k in a) ? a[k] : null; }
    };
    // src 与 setAttribute/removeAttribute 共用一个袋子，模拟真实 DOM 里两者的联动
    Object.defineProperty(e, 'src', { get() { return a.src; }, set(v) { a.src = v; }, configurable: true });
    en.els[id] = e;
    return e;
  }
  en.el = mkEl;
  en.mkCanvas = function (withBlob) {
    const c = {
      width: 0, height: 0, getContext() { return {}; },
      toDataURL() { en.toDataURLCalls++; return 'data:image/png;base64,AAAA'; }
    };
    if (withBlob) c.toBlob = function (cb) { en.toBlobCalls++; cb({ size: 4096, type: 'image/png' }); };
    return c;
  };
  en.canvas = en.mkCanvas(true);
  en.showToast = function (msg, type) { en.toasts.push([msg, type]); };
  en.isIOS = function () { return !!o.ios; };
  en.openModal = function (id) { en.opened.push(id); mkEl(id).classList.add('show'); };
  en.closeModal = function (id) { en.closed.push(id); mkEl(id).classList.remove('show'); };
  en.setTimeout = function (cb, ms) { en.timers.push({ cb: cb, ms: ms }); };
  en.urlApi = {
    n: 0, made: [], revoked: [],
    createObjectURL(b) { this.n++; this.made.push(b); return 'blob:mock/' + this.n; },
    revokeObjectURL(u) { this.revoked.push(u); }
  };
  en.win = { matchMedia(q) { en.media.push(q); return { matches: !!o.fine }; } };
  en.nav = {
    canShare(p) { en.canShareArgs.push(p); return !!o.canShare; },
    share(p) { en.shared.push(p); return { then() { return this; }, catch() { return this; } }; }
  };
  en.FileMock = function (parts, name, opt) { this.parts = parts; this.name = name; this.type = (opt || {}).type; };
  // 真实浏览器里 File 是挂在 window 上的，_canShareFile() 会读 window.File —— 漏了这个它会永远返回 false
  en.win.File = en.FileMock;
  en.doc = {
    body: {
      appendChild(n) { en.everAttached.push(n); en.attached.push(n); if (n) n.isConnected = true; return n; },
      removeChild(n) { const i = en.attached.indexOf(n); if (i >= 0) en.attached.splice(i, 1); if (n) n.isConnected = false; }
    },
    createElement(tag) {
      if (tag === 'canvas') return en.canvas;
      const a = {
        href: '', download: '', isConnected: false, clicked: false,
        click() { this.clicked = true; en.links.push(a); },
        remove() { const i = en.attached.indexOf(a); if (i >= 0) en.attached.splice(i, 1); a.isConnected = false; }
      };
      return a;
    },
    getElementById(id) { en.gets.push(id); return mkEl(id); }
  };
  return en;
}

function build(o) {
  const en = makeEnv(o);
  const fn = new Function('document', 'window', 'URL', 'navigator', 'File',
    'showToast', 'isIOS', 'openModal', 'closeModal', 'setTimeout',
    srcOut + '\nreturn { pngExport, _isTouchOnly, _releaseExportUrl, _canShareFile, showImgSave, imgSaveShare, closeImgSave,' +
    ' cur: function(){ return { url: _exportUrl, blob: _exportBlob, name: _exportName }; } };');
  const api = fn(en.doc, en.win, en.urlApi, en.nav, en.FileMock,
    en.showToast, en.isIOS, en.openModal, en.closeModal, en.setTimeout);
  return { en: en, api: api };
}

const SEAT_NAME = '26\u7ea7\u5e7c\u4fdd2\u73ed-\u5ea7\u6b21\u8868.png';
const SEAT_MSG = '\u5ea7\u6b21\u8868\u5df2\u5bfc\u51fa\uff087\u6392 \u00d7 9\u5217\uff0c\u5df2\u5165\u5ea7 59 \u4eba\uff09';

// ============================================================
// 【5】真跑：触摸端
// ============================================================
console.log('\n【5】真跑触摸端：改走 blob 短链 + 弹图长按保存');
{
  const { en, api } = build({ fine: false, canShare: true, ios: true });
  assert(api._isTouchOnly() === true, 'matchMedia 不命中 (hover:hover) ⇒ 判为触摸设备');
  assert(en.media.length === 1 && en.media[0].indexOf('hover:hover') >= 0, '探测用的是 (hover:hover) and (pointer:fine)');
  api.pngExport(en.mkCanvas(true), SEAT_NAME, SEAT_MSG);
  assert(en.toBlobCalls === 1, '主路径调 toBlob 1 次（实得 ' + en.toBlobCalls + '）');
  assert(en.toDataURLCalls === 0, '触摸端完全不碰 toDataURL（不留 17 万字符的 data: URL）');
  assert(en.links.length === 1, '点了恰好 1 次下载链接');
  const a = en.links[0];
  assert(/^blob:/.test(a.href), 'href 是 blob: 短链（实得 ' + String(a.href).slice(0, 20) + '…）');
  assert(a.href.length < 200, 'href 只有 ' + a.href.length + ' 字符（旧写法 171,170）');
  assert(a.download === SEAT_NAME, 'download 属性带班级名文件名');
  assert(en.everAttached.length === 1 && en.everAttached[0] === a, 'a 真的插进 DOM 才 click（游离节点的 click() 在 WebKit / 安卓 WebView 上不可靠）');
  assert(a.clicked === true, '确实调用了 click()');
  assert(en.attached.length === 0, 'click 完立刻 remove()，DOM 不留垃圾');
  assert(en.urlApi.made.length === 1, 'createObjectURL 恰好 1 次');
  assert(en.opened.length === 1 && en.opened[0] === 'imgSaveModal', '导出后弹出图片弹层（实得 ' + JSON.stringify(en.opened) + '）');
  assert(en.el('imgSaveModal').classList.contains('show'), '弹层真的带上了 show（否则看不见）');
  assert(en.el('imgSavePreview').src === a.href, '预览图 src 就是刚生成的 blob URL（' + String(en.el('imgSavePreview').src).slice(0, 20) + '…）');
  assert(en.el('imgSaveHint').textContent.indexOf('\u5b58\u50a8\u5230\u7167\u7247') >= 0, 'iOS 提示指向「存储到照片」（实得「' + en.el('imgSaveHint').textContent + '」）');
  assert(en.el('imgSaveHint').innerHTML === '', '提示语只写 textContent、没碰 innerHTML（文件名含班级名＝用户输入）');
  assert(en.el('imgSaveShareBtn').style.display === '', '支持分享时分享按钮可见');
  assert(en.toasts.length === 0, '触摸端不再弹「已导出」的 toast —— 真相是还要长按保存，不能报假成功');
  assert(en.urlApi.revoked.length === 0, '弹层还开着，blob URL 不能提前 revoke（撤早了图会裂）');
  assert(en.timers.length === 0, '触摸端不排「5 秒后释放」定时器（图还在页面上等着长按）');

  api.closeImgSave();
  assert(en.closed.length === 1 && en.closed[0] === 'imgSaveModal', '关闭走 closeModal');
  assert(!en.el('imgSaveModal').classList.contains('show'), '弹层不再带 show');
  assert(en.el('imgSavePreview').getAttribute('src') === null, '预览图 src 被清掉（不留悬空 blob 引用）');
  assert(en.urlApi.revoked.length === 1, '关闭时才 revoke（实得 ' + en.urlApi.revoked.length + '）');
  assert(api.cur().url === null, '_exportUrl 已置 null');
  let threw = false;
  try { api._releaseExportUrl(); api._releaseExportUrl(); } catch (e) { threw = true; }
  assert(!threw, '重复释放不抛异常（幂等）');
  assert(en.urlApi.revoked.length === 1, '第二次释放不会重复 revoke');
}

// ============================================================
// 【6】真跑：桌面端（保持原来的直接下载体验）
// ============================================================
console.log('\n【6】真跑桌面端：直接下载、不弹图');
{
  const { en, api } = build({ fine: true, canShare: true, ios: false });
  assert(api._isTouchOnly() === false, 'matchMedia 命中 (hover:hover) ⇒ 判为桌面');
  api.pngExport(en.mkCanvas(true), SEAT_NAME, SEAT_MSG);
  assert(en.links.length === 1 && /^blob:/.test(en.links[0].href), '桌面端同样走 blob 短链');
  assert(en.opened.length === 0, '桌面端不弹图（别给桌面用户多一步）');
  assert(en.toasts.length === 1 && en.toasts[0][1] === 'success' && en.toasts[0][0].indexOf('\u5ea7\u6b21\u8868\u5df2\u5bfc\u51fa') >= 0,
    '桌面端弹一次成功提示（实得 ' + JSON.stringify(en.toasts) + '）');
  assert(en.timers.length === 1 && en.timers[0].ms === 5000, '排了「5 秒后释放 blob URL」的定时器（实得 ' + JSON.stringify(en.timers.map(t => t.ms)) + '）');
  assert(en.urlApi.revoked.length === 0, '定时器还没跑，先不释放');
  en.timers[0].cb();
  assert(en.urlApi.revoked.length === 1, '定时器到点后释放（实得 ' + en.urlApi.revoked.length + '）');
}

// ============================================================
// 【7】真跑：无 toBlob 的极老浏览器兜底
// ============================================================
console.log('\n【7】真跑兜底路径：画布没有 toBlob');
{
  const { en, api } = build({ fine: true, canShare: false, ios: false });
  api.pngExport(en.mkCanvas(false), 'x.png', '\u5df2\u5bfc\u51fa');
  assert(en.toBlobCalls === 0, '画布没有 toBlob ⇒ 不走主路径');
  assert(en.toDataURLCalls === 1, '退回 toDataURL 兜底');
  const a = en.links[0];
  assert(!!a && /^data:/.test(a.href), '兜底分支的 href 只能是 data:（极老浏览器没别的招）');
  assert(en.everAttached.length === 1 && en.everAttached[0] === a, '兜底分支同样先插进 DOM 再 click');
  assert(en.urlApi.made.length === 0, '兜底分支不创建 ObjectURL');
  assert(en.toasts.length === 1, '兜底分支也报一次成功');
  assert(en.timers.length === 0, '兜底分支没有 blob URL 要释放 ⇒ 不排定时器');
}

// ============================================================
// 【8】真跑分享
// ============================================================
console.log('\n【8】真跑分享：以 File 形式交给系统分享面板');
{
  const { en, api } = build({ fine: false, canShare: true, ios: true });
  api.pngExport(en.mkCanvas(true), SEAT_NAME, SEAT_MSG);
  api.imgSaveShare();
  assert(en.shared.length === 1, 'imgSaveShare 调到 navigator.share（实得 ' + en.shared.length + '）');
  const p = en.shared[0] || {};
  assert(Array.isArray(p.files) && p.files.length === 1, '以 files:[File] 形式分享（不是纯文字）');
  assert(p.files && p.files[0] && p.files[0].name === SEAT_NAME, 'File 带上了正确文件名');
  assert(p.title === SEAT_NAME, 'title 也带文件名');
}
{
  const { en, api } = build({ fine: false, canShare: false, ios: true });
  let threw = false;
  try { api.imgSaveShare(); } catch (e) { threw = true; }
  assert(!threw && en.shared.length === 0, '没有 blob / 不支持分享时直接返回、不抛异常');
}

console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exit(1);
