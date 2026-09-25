// _v2208_test.js — v2.20.8：座次表过道排版 + 导出座次表图片
// ① 静态断言：版本四处、过道 CSS、工具栏按钮、历史注释未被误伤
// ② 真跑 seatLayoutSlots / seatAisleCount / seatAisleAfter（纯函数，直接执行）
// ③ 真跑 seatExportImage()：mock canvas 记录全部绘制指令，验几何
//    （不越界 / 过道只出现在第 3、6 列后 / 其余列间只有普通间距 / 座位数对得上 /
//     每个格子里重建出的姓名与原文完全一致，不丢字不截断）
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
function near(a, b, eps) { return Math.abs(a - b) < (eps || 0.6); }

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

console.log('\n【2】过道排版接线');
has(html, '.seat-aisle{', '过道元素有样式');
has(html, 'background-size:2px 100%', '过道用居中虚线示意（可走人的通道）');
  // v2.20.9 推翻：窄屏不再「强制 4 列 + 隐藏过道」——那会把一排 8 座折成两行、与教室排布对不上。
  // 现在保持真实列数 + 座位最小宽度 68px，靠 .seating-scroll 横向滚动看全。
  assert(html.indexOf('grid-template-columns:repeat(4,1fr) !important') < 0, '窄屏不再强制 4 列折行（v2.20.9 改）');
  has(html, '.seating-grid{--seat-cell-min:68px;--seat-aisle:18px}', '窄屏保持真实列数 + 座位最小宽度');
  has(html, 'class="seating-scroll"', '新增横向滚动容器');
has(html, '--seat-aisle:26px', '过道宽度可调（CSS 变量）');
  // v2.20.9：座位轨道由 '1fr' 改为带最小宽度的 minmax(...) —— 窄屏下不再把列压扁，而是撑出横向滚动。
  has(html, "slots.map(s => s.type === 'aisle' ? 'var(--seat-aisle)' : 'minmax(var(--seat-cell-min,0px),1fr)').join(' ')", '屏幕网格列模板按 slots 生成（座位轨道带最小宽度）');
has(html, 'html += \'<div class="seat-aisle"></div>\'; continue;', '屏幕网格真的插入过道元素');

console.log('\n【3】导出按钮');
has(html, 'onclick="seatExportImage()"', '工具栏有导出按钮并接线');
has(html, '\ud83d\uddbc\ufe0f \u5bfc\u51fa\u5ea7\u6b21\u8868', '按钮文案');
  // v2.20.10：出图与下载统一走 pngExport()（toBlob → ObjectURL → 先插进 DOM 再 click）。
  // 旧写法 `a.href = canvas.toDataURL(...)` 在 iOS 上点了毫无反应，原因有二：
  //   ① data: URL 实测长 171,170 字符，iOS Safari 不认它上面的 download 属性；
  //   ② <a> 从没插进 DOM，游离节点的 click() 在 WebKit / 安卓 WebView 上不保证生效。
  // ⇒ 断言改钉新实现，别再钉旧代码。
  has(html, "pngExport(canvas, (state.className || '\u73ed\u7ea7') + '-\u5ea7\u6b21\u8868.png'", '导出为 PNG 并带班级名文件名（统一出口 pngExport）');
  has(html, 'canvas.toBlob(', '走 canvas.toBlob 出图（不再拼超长 data: URL）');
  // toDataURL 只允许留在「没有 toBlob」的极老浏览器兜底分支里，且那条分支也必须先 appendChild 再 click。
  // （别写成「全文不许出现 toDataURL」—— 兜底分支留着它是对的，那不是旧写法。）
  const _iFb = html.indexOf("typeof canvas.toBlob !== 'function'");
  assert(_iFb >= 0, '保留了「无 toBlob」的极老浏览器兜底分支');
  const _fb = html.slice(_iFb, _iFb + 400);
  assert(_fb.indexOf('canvas.toDataURL') >= 0, '兜底分支才用 toDataURL');
  assert(_fb.indexOf('document.body.appendChild(a)') >= 0, '兜底分支同样先插进 DOM 再 click');
  const _iMain = html.indexOf('canvas.toBlob(function(blob){');
  assert(_iMain >= 0, '主路径改用 toBlob');
  assert(html.slice(_iMain, _iMain + 700).indexOf('toDataURL') < 0, '主路径里没有任何 toDataURL（不再拼 17 万字符的 data: URL）');

console.log('\n【4】历史注释未被误伤（改版本时不许动）');
['\u6570\u636e\u6258\u7ba1\u8fc1\u79fb', '\u79c1\u6709\u6570\u636e\u4ed3\u7684\u300c\u8bfb\u300d\u5165\u53e3',
 '\u7531 getDataJsonUrl() \u6539\u5199', '\u6821\u9a8c\u5bf9\u8c61\u4ece']
  .forEach(k => has(html, k, '保留历史注释'));

// ============================================================
// ②③ 抽代码 → mock 环境真跑
// ============================================================
const iLayout = html.indexOf('/* v2.20.8 \u5ea7\u6b21\u8fc7\u9053\u6392\u7248');
const iRender = html.indexOf('function renderSeating(){');
const iExport = html.indexOf('/* ==================== v2.20.8 \u5ea7\u6b21\u8868\u5bfc\u51fa');
const iDuty = html.indexOf('/* ==================== \u503c\u65e5\u8868\u5bfc\u51fa');
assert(iLayout >= 0 && iRender > iLayout && iExport > iRender && iDuty > iExport, '能定位到新增代码的三个区段');
const srcLayout = html.slice(iLayout, iRender);
const srcExport = html.slice(iExport, iDuty);

function makeCanvas() {
  const ops = [];
  let pts = [];
  const bbox = () => {
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic',
    _font: '16px sans-serif', _align: 'left',
    get font() { return this._font; }, set font(v) { this._font = v; },
    get textAlign() { return this._align; }, set textAlign(v) { this._align = v; },
    fillRect(x, y, w, h) { ops.push({ t: 'fillRect', x, y, w, h }); },
    beginPath() { pts = []; }, closePath() {},
    moveTo(x, y) { pts.push([x, y]); }, lineTo(x, y) { pts.push([x, y]); },
    arcTo(x1, y1, x2, y2) { pts.push([x1, y1], [x2, y2]); },
    arc() {}, scale() {}, clearRect() {},
    setLineDash(a) { ops.push({ t: 'dash', a: String(a) }); },
    fill() { ops.push({ t: 'fill', bbox: bbox(), style: this.fillStyle }); },
    stroke() { ops.push({ t: 'stroke', bbox: bbox(), style: this.strokeStyle, lw: this.lineWidth }); },
    fillText(s, x, y) { ops.push({ t: 'text', s: String(s), x, y, align: this._align, w: this.measureText(s).width }); },
    measureText(s) {
      const n = parseInt(this._font) || 16;
      let w = 0;
      String(s).split('').forEach(ch => { w += /[\u4e00-\u9fff\uff08\uff09]/.test(ch) ? n : n * 0.55; });
      return { width: w };
    }
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,AAA',   // 只在「没有 toBlob」的极老浏览器兜底分支用得到
    // v2.20.10 主路径走 toBlob。这里同步回调 —— 断言才能在同一个 tick 后就拿到最终结果。
    toBlob(cb) { cb({ size: 4096, type: 'image/png' }); }
  };
  return { canvas, ops };
}

const NAMES = ['\u9648\u4e00', '\u738b\u5c0f\u660e', '\u6b27\u9633\u5a1c\u5a1c', '\u674e\u601d\u5f64\uff08\u5927\uff09',
  '\u5f20\u4f1f', '\u8d75\u654f', '\u94b1\u591a\u591a', '\u5b59\u827a\u6d32', '\u5468\u6770\u4f26', '\u5434\u4ea6\u51e1'];

function makeState(cols, rows, n) {
  const students = [];
  for (let i = 0; i < n; i++) students.push({ id: 's' + i, name: NAMES[i % NAMES.length] });
  const seats = [];
  for (let i = 0; i < n; i++) seats.push({ row: Math.floor(i / cols) % rows, col: i % cols, studentId: students[i].id });
  const seen = {}, uniq = [];
  seats.forEach(s => { const k = s.row + '-' + s.col; if (!seen[k]) { seen[k] = 1; uniq.push(s); } });
  return { className: '\u0032\u0036\u7ea7\u5e7c\u4fdd\u0032\u73ed', students, seating: { cols, rows, seats: uniq } };
}

let last = null;
function runExport(state) {
  const mock = makeCanvas();
  // 假 DOM：v2.20.10 起要求「先把 a 插进 DOM 再 click」，所以 a 得有 remove()/isConnected
  const links = [];
  const attached = [];      // 此刻还在 body 里的
  const everAttached = [];  // 历史上插过的（用来证明「确实插入过」，而不只是「用完删干净了」）
  const toasts = [];
  const doc = {
    body: {
      appendChild(n) { everAttached.push(n); attached.push(n); if (n) n.isConnected = true; return n; },
      removeChild(n) { const i = attached.indexOf(n); if (i >= 0) attached.splice(i, 1); if (n) n.isConnected = false; }
    },
    createElement(tag) {
      if (tag === 'canvas') return mock.canvas;
      const a = { href: '', download: '', isConnected: false, clicked: false,
        click() { this.clicked = true; links.push(a); },
        remove() { const i = attached.indexOf(a); if (i >= 0) attached.splice(i, 1); a.isConnected = false; } };
      return a;
    }
  };
  // Node 自带的 URL 是 WHATWG 实现、没有 createObjectURL ⇒ 必须注入假的，否则主路径直接抛异常。
  const urlApi = { n: 0, made: [], revoked: [],
    createObjectURL(b) { this.n++; this.made.push(b); return 'blob:mock/' + this.n; },
    revokeObjectURL(u) { this.revoked.push(u); } };
  // 桌面：matchMedia 命中 (hover:hover) ⇒ _isTouchOnly() === false ⇒ 走直接下载、不弹图
  const win = { matchMedia() { return { matches: true }; } };
  const fn = new Function('document', 'state', 'showToast', 'localDateStr', 'window', 'URL',
    srcLayout + '\n' + srcExport + '\nreturn { seatLayoutSlots, seatAisleCount, seatAisleAfter, seatCellName, seatExportImage };');
  const api = fn(doc, state, function (msg, type) { toasts.push([msg, type]); }, function () { return '\u0032\u0030\u0032\u0036-09-25'; }, win, urlApi);
  api.seatExportImage();
  last = { ops: mock.ops, canvas: mock.canvas, links, attached, everAttached, toasts, urlApi };
  return api;
}

console.log('\n【5】真跑 seatLayoutSlots：过道规则');
{
  const api = runExport(makeState(9, 7, 59));
  const SL = api.seatLayoutSlots;
  const shape = cols => SL(cols).map(s => s.type === 'aisle' ? '|' : 'S').join('');
  [[3, 'SSS'], [4, 'SSS|S'], [5, 'SSS|SS'], [6, 'SSS|SSS'], [7, 'SSS|SSS|S'],
   [8, 'SSS|SSS|SS'], [9, 'SSS|SSS|SSS'], [12, 'SSS|SSS|SSS|SSS']]
    .forEach(c => assert(shape(c[0]) === c[1], c[0] + ' \u5217 \u2192 ' + c[1] + '\uff08\u5b9e\u5f97 ' + shape(c[0]) + '\uff09'));
  assert(api.seatAisleCount(9) === 2, '9 列 \u2192 2 条过道');
  assert(api.seatAisleCount(8) === 2, '8 列 \u2192 2 条过道');
  assert(api.seatAisleCount(6) === 1, '6 列 \u2192 1 条过道（第 6 列后是墙，不能算）');
  assert(api.seatAisleCount(3) === 0, '3 列 \u2192 0 条过道（两侧都是墙）');
  assert(api.seatAisleAfter(2, 9) === true, '第 3 列后有过道');
  assert(api.seatAisleAfter(5, 9) === true, '第 6 列后有过道');
  assert(api.seatAisleAfter(8, 9) === false, '最后一列后没有过道（靠墙）');
  assert(api.seatAisleAfter(2, 3) === false, '只有 3 列时第 3 列后也没有过道（靠墙）');
  assert(SL(9).length === 11, '9 列 \u2192 11 条轨道（9 座位 + 2 过道）');
  assert(SL(9)[SL(9).length - 1].type === 'seat', '最后一格永远是座位，不会是过道');
  assert(SL(9).filter(s => s.type === 'seat').map(s => s.c).join(',') === '0,1,2,3,4,5,6,7,8', '座位列号连续无跳号');
}

console.log('\n【6】真跑 seatExportImage：导出的几何');
{
  const COLS = 9, ROWS = 7, N = 59, W = 750, PAD = 24, AISLE = 30, CELLH = 66, GAP = 6;
  runExport(makeState(COLS, ROWS, N));
  const ops = last.ops, cvs = last.canvas;
  assert(cvs.width === W, '画布宽 ' + cvs.width + '（与值日表导出同为 750）');
  assert(cvs.height > 700 && cvs.height < 1000, '画布高 ' + cvs.height + ' 落在合理区间');

  // 文字可见范围要按对齐方式算：center 居中、right 右端在 x、left 左端在 x
  function textSpan(o) {
    if (o.align === 'right') return [o.x - o.w, o.x];
    if (o.align === 'left') return [o.x, o.x + o.w];
    return [o.x - o.w / 2, o.x + o.w / 2];
  }
  const oob = ops.filter(o => {
    if (o.t === 'fill' || o.t === 'stroke') {
      const b = o.bbox; if (!b) return false;
      return b.x0 < -0.5 || b.x1 > W + 0.5 || b.y0 < -0.5 || b.y1 > cvs.height + 0.5;
    }
    if (o.t === 'text') { const s = textSpan(o); return s[0] < -0.5 || s[1] > W + 0.5; }
    return false;
  });
  assert(oob.length === 0, '没有任何绘制越出画布（越界 ' + oob.length + ' 处' +
    (oob.length ? '：' + oob.slice(0, 3).map(o => (o.s || o.t) + '@' + (o.x === undefined ? JSON.stringify(o.bbox) : o.x)).join(' | ') : '') + '）');

  const cells = ops.filter(o => o.t === 'stroke' && o.bbox && near(o.bbox.y1 - o.bbox.y0, CELLH));
  assert(cells.length === COLS * ROWS, '格子数 = 列\u00d7行 = ' + (COLS * ROWS) + '（实得 ' + cells.length + '）');
  const occupied = cells.filter(o => o.style === '#A63A2B');
  assert(occupied.length === N, '已入座格子 = ' + N + '（实得 ' + occupied.length + '）');
  assert(cells.length - occupied.length === COLS * ROWS - N, '空座格子 = ' + (COLS * ROWS - N));

  const bands = ops.filter(o => o.t === 'fill' && o.bbox && near(o.bbox.x1 - o.bbox.x0, AISLE)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  assert(bands.length === 2, '画出 2 条过道带（实得 ' + bands.length + '）');

  // 每列一个不同的 x 位置（按左缘排序）
  const colX = [];
  cells.map(o => [o.bbox.x0, o.bbox.x1]).forEach(r => { if (!colX.some(u => near(u[0], r[0]))) colX.push(r); });
  colX.sort((a, b) => a[0] - b[0]);
  assert(colX.length === COLS, '座位横向占 ' + COLS + ' 个不同 x 位置（实得 ' + colX.length + '）');
  const cw = colX[0][1] - colX[0][0];

  // 过道带两端夹住：必须正好夹在 第3列|第4列 与 第6列|第7列 之间
  const pair = (i, j, band) => near(band.bbox.x0, colX[i][1] + GAP) && near(colX[j][0], band.bbox.x1 + GAP);
  assert(pair(2, 3, bands[0]), '第 1 条过道正好夹在第 3 列与第 4 列之间');
  assert(pair(5, 6, bands[1]), '第 2 条过道正好夹在第 6 列与第 7 列之间');
  // 其余相邻列之间只有普通间距（GAP），没有过道
  const plain = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8]];
  const badGap = plain.filter(p => !near(colX[p[1]][0] - colX[p[0]][1], GAP));
  assert(badGap.length === 0, '其余相邻列间距都只有 ' + GAP + 'px（异常 ' + badGap.length + ' 处）');
  const aisleGap = colX[3][0] - colX[2][1];
  assert(aisleGap > GAP * 3, '过道处的空隙（' + aisleGap.toFixed(1) + 'px，= 过道宽 + 两侧间距 ' + (AISLE + GAP * 2) + '）明显大于普通列间距（' + GAP + 'px）');
  assert(near(aisleGap, AISLE + GAP * 2), '空隙 = 过道 30 + 两侧间距 6\u00d72');
  // 两侧靠墙
  assert(near(colX[0][0], PAD + 74), '第一列左缘贴行号列之后（靠墙）');
  assert(near(colX[COLS - 1][1], W - PAD), '最后一列右缘贴右边距（靠墙）');

  const texts = ops.filter(o => o.t === 'text').map(o => o.s);
  assert(texts.some(s => s.indexOf('\u5ea7\u6b21\u8868') >= 0 && s.indexOf('\u5e7c\u4fdd') >= 0), '标题含班级名 + 座次表');
  assert(texts.indexOf('\u8bb2 \u53f0') >= 0, '画出讲台');
  assert(texts.some(s => s.indexOf('\u5df2\u5165\u5ea7 ' + N + ' \u4eba') >= 0), '标题条写明已入座人数');
  assert(texts.some(s => s.indexOf('3\u7ec4') >= 0), '标题条写明分几组（过道分组的直接产物）');
  for (let c = 1; c <= COLS; c++) assert(texts.indexOf('\u7b2c' + c + '\u5217') >= 0, '有「第' + c + '列」列号');
  for (let r = 1; r <= ROWS; r++) assert(texts.indexOf('\u7b2c' + r + '\u6392') >= 0, '有「第' + r + '排」行号');

  // v2.20.10：下载管线的关键约束 —— 这几条正是「手机端点了没反应」的根因，逐条钉死
  assert(last.links.length === 1, '点了恰好 1 次下载链接（实得 ' + last.links.length + '）');
  const a0 = last.links[0];
  assert(/^blob:/.test(a0.href), 'a.href 是 blob: 短链（实得 ' + String(a0.href).slice(0, 24) + '…）');
  assert(a0.href.length < 200, 'a.href 只有 ' + a0.href.length + ' 字符（旧写法是 171,170 字符的 data: URL）');
  assert(a0.download === '26级幼保2班-座次表.png', 'a.download 带班级名文件名（实得 ' + a0.download + '）');
  assert(last.everAttached.length === 1 && last.everAttached[0] === a0, 'a 真的被插进 DOM 才 click（游离节点的 click() 在 WebKit / 安卓 WebView 上不生效）');
  assert(a0.clicked === true, '确实调用了 click()');
  assert(last.attached.length === 0, 'click 完立刻 remove()，DOM 不留垃圾');
  assert(last.urlApi.made.length === 1, '恰好 createObjectURL 1 次（实得 ' + last.urlApi.made.length + '）');
  assert(last.urlApi.revoked.length === 0, '桌面端不立即 revoke（延后 5 秒交给定时器）—— 立刻 revoke 图会裂');
  assert(last.toasts.length === 1 && String(last.toasts[0][0]).indexOf('座次表已导出') >= 0, '桌面端只弹一次成功提示（实得 ' + JSON.stringify(last.toasts) + '）');
}

console.log('\n【7】真跑：逐格重建姓名，必须与原文逐字一致（不丢字、不截断）');
{
  const COLS = 9, ROWS = 7, N = 59, CELLH = 66;
  runExport(makeState(COLS, ROWS, N));
  const ops = last.ops;
  const cells = ops.filter(o => o.t === 'stroke' && o.bbox && near(o.bbox.y1 - o.bbox.y0, CELLH) && o.style === '#A63A2B');
  const texts = ops.filter(o => o.t === 'text');
  const rebuilt = cells.map(b => texts
    .filter(o => o.x > b.bbox.x0 - 1 && o.x < b.bbox.x1 + 1 && o.y > b.bbox.y0 - 1 && o.y < b.bbox.y1 + 1)
    .map(o => o.s).join(''));
  assert(rebuilt.length === N, '重建出 ' + N + ' 个格子的姓名（实得 ' + rebuilt.length + '）');
  const bad = rebuilt.filter(s => NAMES.indexOf(s) < 0);
  assert(bad.length === 0, '每个格子重建出的姓名都在名单内（异常：' + (bad.slice(0, 5).join('/') || '无') + '）');
  // 逐个姓名出现次数必须与填充规律一致（59 人 = 10 个名字 5 轮 + 前 9 个各多 1 次）
  const expect = {};
  for (let i = 0; i < N; i++) expect[NAMES[i % NAMES.length]] = (expect[NAMES[i % NAMES.length]] || 0) + 1;
  const got = {};
  rebuilt.forEach(s => { got[s] = (got[s] || 0) + 1; });
  const mismatch = Object.keys(expect).filter(k => got[k] !== expect[k]);
  assert(mismatch.length === 0, '各姓名出现次数与填充规律一致（不符：' + (mismatch.map(k => k + ' ' + got[k] + '/' + expect[k]).join(', ') || '无') + '）');
  // 单条文字片段不得超出格子可用宽度
  const cw = cells[0].bbox.x1 - cells[0].bbox.x0;
  const nameFrags = texts.filter(o => o.x > cells[0].bbox.x0 - 1 && o.x < cells[0].bbox.x1 + 1 && NAMES.some(n => n.indexOf(o.s) >= 0));
  const tooWide = nameFrags.filter(o => o.w > cw - 8 + 0.5);
  assert(tooWide.length === 0, '没有任何姓名片段超出格子可用宽度（超宽 ' + tooWide.length + ' 处，格子可用宽 ' + (cw - 8).toFixed(1) + '）');
}

console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exit(1);
