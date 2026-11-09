/* v3.9.10 回归：网页版主应用 / PWA / 落地页三处图标同源 + 缓存失效链
   ------------------------------------------------------------------
   真实需求：桌面版 v1.7.4 换成老板选定的 A · 朱砂 C 标后，网页版标签页、
   PWA 安装图标、落地页仍各挂各的脸（红色四瓣结 / 朱砂「班」字印章）。
   本版把三处统一到 designs.mjs → iconA() 的同一条几何。

   🔴 两条来自 v2.17.12 翻车现场的铁律（当轮只换磁盘 PNG、没升 CACHE_NAME，
      老板刷新后标签图标仍旧）：
     ① 标签页图标只认 index.html <head> 内嵌的 data:image/png;base64；
     ② 改 index.html 必须升 sw.js CACHE_NAME，否则 SW 一直交付缓存里的旧 HTML。
   🔴 第三条是 v3.9.8 的同型坑：文件名不变但内容变了，静态资源「缓存优先」
      会拿 HTTP 缓存里的旧字节 ⇒ 引用必须带 ?v=，且 index / manifest / sw
      三处逐字一致，否则预缓存落空（addAll 全成全败）。

   本套 = 结构化 audit（一处定义，好样本跑断言 + 四种变异证伪）。
   版本号一律从 sw.js 的 CACHE_NAME 反推，跟版不用改本文件。
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = __dirname;
const buf = (f) => fs.readFileSync(path.join(DIR, f));
const txt = (f) => buf(f).toString('utf8').replace(/\r\n/g, '\n');

const ARC = 'M344 171 A122 122 0 1 0 344 341';
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

/* ── PNG / ICO 最小解码：只验尺寸、颜色类型、四角 alpha ────── */
function pngInfo(b) {
  if (!b || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const colorType = b[25];
  const idat = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + len));
    i += 12 + len;
    if (type === 'IEND') break;
  }
  if (!idat.length) return { w, h, colorType, tl: -1, tr: -1 };
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) return { w, h, colorType, tl: -1, tr: -1 };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const f = raw[0];
  const row = Buffer.from(raw.subarray(1, 1 + stride));
  for (let x = bpp; x < stride; x++) {
    const a = row[x - bpp];
    if (f === 1) row[x] = (row[x] + a) & 255;
    else if (f === 3) row[x] = (row[x] + (a >> 1)) & 255;
    else if (f === 4) row[x] = (row[x] + a) & 255;
  }
  // colortype=2（Chromium 对整张不透明图的优化）压根没有 alpha 通道，
  // 按 RGBA 四字节步进会读出假 alpha —— 按颜色类型分支，不能直接取 row[3]。
  const alpha = (n) => colorType === 6 ? row[n * bpp + 3] : 255;
  return { w, h, colorType, tl: alpha(0), tr: alpha(w - 1) };
}

function icoEntries(b) {
  if (!b || b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) return null;
  const n = b.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    const size = b.readUInt8(o) || 256;
    const len = b.readUInt32LE(o + 8);
    const off = b.readUInt32LE(o + 12);
    out.push({ size, data: b.subarray(off, off + len) });
  }
  return out;
}

/* ── 结构化 audit：一处定义，好样本与变异样本共用 ─────────── */
function audit(H, S, M, A, L) {
  const fails = [];
  const chk = (cond, name) => { if (!cond) fails.push(name); };
  const has = (s, n, name) => chk(s.indexOf(n) >= 0, name);

  const vm = S.match(/const CACHE_NAME = 'class-manager-(v\d+\.\d+\.\d+)';/);
  chk(!!vm, 'sw.js 反推不出版本号');
  const VER = vm ? vm[1] : 'v0.0.0';
  const NUM = VER.slice(1);
  const Q = '?v=' + NUM;

  /* ① 版本链：可见版本位 / 脚本引用 / 缓存名同源 */
  has(H, '<div class="login-version">' + VER + '</div>', '登录页版本位未跟版');
  has(H, '<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>', '侧栏版本位未跟版');
  has(H, '🏷️ ' + VER + '</span>', '关于页徽章未跟版');
  has(H, '📝 近版更新速览（' + VER + '）', '速览标题未跟版');
  has(H, '<script src="./cmgx.js?v=' + NUM + '"></script>', '页面脚本引用未跟版');
  has(S, "'./cmgx.js?v=" + NUM + "'", 'CORE_ASSETS 脚本引用与页面不一致（预缓存会落空）');
  // 历史注释说的是 v3.9.9 / v3.9.8 那两次改动，不许被「全局替换版本号」误伤
  has(H, '/* v3.9.9 口径对齐', '历史注释 v3.9.9 被误改');
  has(H, '<!-- v3.9.8 脚本地址带版本号', '历史注释 v3.9.8 被误改');

  /* ② 内嵌 favicon：标签页唯一来源，必须与 icon_64.png 逐字节同源 */
  const fm = H.match(/<link rel="icon" type="image\/png" href="data:image\/png;base64,([^"]+)">/);
  chk(!!fm, '找不到内嵌 data-URI favicon');
  if (fm) {
    let embedded = null;
    try { embedded = Buffer.from(fm[1], 'base64'); } catch (e) { /* 留在下面统一报 */ }
    chk(!!embedded, '内嵌 favicon base64 解不开');
    if (embedded) {
      chk(embedded.equals(A['icon_64.png']), '内嵌 favicon 与 icon_64.png 不同源（刷新仍是旧图）');
      const fi = pngInfo(embedded);
      chk(!!fi && fi.w === 64 && fi.h === 64, '内嵌 favicon 不是 64×64');
      chk(!!fi && fi.colorType === 6 && fi.tl <= 8 && fi.tr <= 8, '内嵌 favicon 四角不透明（白方块底）');
    }
  }

  /* ③ 图标资产：四个尺寸各自独立、四角透明、ICO 九条目同源 */
  for (const [name, side] of [['icon_64.png', 64], ['icon_192.png', 192], ['icon_256.png', 256], ['icon_512.png', 512]]) {
    const b = A[name];
    const pi = b && pngInfo(b);
    chk(!!pi, '缺图标资产或不是 PNG：' + name);
    if (pi) {
      chk(pi.w === side && pi.h === side, name + ' 尺寸与文件名不符');
      chk(pi.colorType === 6, name + ' 没有 alpha 通道');
      chk(pi.tl <= 8 && pi.tr <= 8, name + ' 四角不透明（会带白方块）');
    }
  }
  const entries = icoEntries(A['favicon.ico']);
  chk(!!entries && entries.length === ICO_SIZES.length, 'favicon.ico 不是九条目 ICO');
  if (entries) {
    entries.forEach((e, i) => {
      chk(e.size === ICO_SIZES[i], 'ICO 第 ' + (i + 1) + ' 条尺寸不是 ' + ICO_SIZES[i]);
      const pi = pngInfo(e.data);
      chk(!!pi && pi.w === e.size && pi.h === e.size, 'ICO 第 ' + (i + 1) + ' 条 PNG 与目录尺寸不符');
    });
    const e64 = entries.find((e) => e.size === 64);
    const e256 = entries.find((e) => e.size === 256);
    chk(!!e64 && e64.data.equals(A['icon_64.png']), 'ICO 64 条目与 icon_64.png 不同源');
    chk(!!e256 && e256.data.equals(A['icon_256.png']), 'ICO 256 条目与 icon_256.png 不同源');
  }

  /* ④ 缓存失效链：index / manifest / sw 三处图标 URL 逐字一致 */
  has(H, '<link rel="apple-touch-icon" href="./icon_192.png' + Q + '">', 'apple-touch-icon 缺 ?v= 破缓存');
  let icons = [];
  try { icons = JSON.parse(M).icons || []; } catch (e) { fails.push('manifest.json 不是合法 JSON'); }
  chk(icons.length === 3, 'manifest 图标条目数不是 3');
  icons.forEach((it, i) => {
    chk(/^icon_(192|512)\.png\?v=/.test(it.src), 'manifest 第 ' + (i + 1) + ' 条图标缺 ?v=');
    chk(it.src.indexOf(Q) > 0, 'manifest 第 ' + (i + 1) + ' 条 ?v= 与 CACHE_NAME 不同版');
  });
  has(S, "'./icon_192.png" + Q + "'", 'sw CORE_ASSETS 的 icon_192 缺 ?v=（会与页面请求错位）');
  has(S, "'./icon_512.png" + Q + "'", 'sw CORE_ASSETS 的 icon_512 缺 ?v=');
  // 全文件扫一遍：不允许残留任何一条不带版本串的图标引用
  const naked = [H, M, S].some((s) => /icon_(192|512)\.png(?!\?v=)/.test(s));
  chk(!naked, '仍存在不带 ?v= 的图标引用（HTTP 缓存会交付旧图）');

  /* ⑤ 落地页同源（兄弟仓存在才验；换机器/单仓检出不因此假红） */
  if (L) {
    const sym = L.match(/<symbol id="seal"[^>]*>([\s\S]*?)<\/symbol>/);
    chk(!!sym, '落地页找不到 #seal 印章');
    if (sym) {
      has(sym[0], 'viewBox="0 0 512 512"', '落地页印章不是 512 基准几何');
      has(sym[1], ARC, '落地页印章的 C 弧与 A 款不同源');
      has(sym[1], 'url(#cmSealGrad)', '落地页印章没引用文档级渐变');
    }
    has(L, 'linearGradient id="cmSealGrad"', '落地页缺文档级渐变定义（<use> 阴影树解析不到会变黑块）');
    const fvm = L.match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)">/);
    chk(!!fvm, '落地页找不到 SVG data-URI favicon');
    if (fvm) {
      let svg = '';
      try { svg = decodeURIComponent(fvm[1]); } catch (e) { /* 下面统一报 */ }
      has(svg, ARC, '落地页 favicon 的 C 弧与印章不同源');
    }
    chk((L.match(/<use href="#seal"\/>/g) || []).length >= 3, '落地页顶栏/首屏/页脚没全部复用 #seal');
    /* v3.9.17 动态化：兜底版本从桌面版 package.json 反推（写死版本号第 N 次返工的教训） */
    const dPkgVer = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, '..', 'class-manager-desktop', 'app', 'package.json'), 'utf8')).version; }
      catch (e) { return null; }
    })();
    if (dPkgVer) has(L, 'WINDOWS 桌面版 · V' + dPkgVer, '落地页静态版本兜底没跟到桌面版 v' + dPkgVer);
    chk(L.indexOf('朱砂「班」字印章') < 0, '落地页仍写着「班」字印章的 aria 文案');
  }

  return { VER, Q, fails };
}

/* ── 跑好样本 ──────────────────────────────────────────────── */
const assets = {};
for (const f of ['icon_64.png', 'icon_192.png', 'icon_256.png', 'icon_512.png', 'favicon.ico']) {
  assets[f] = buf(f);
}
const LANDING = path.join(DIR, '..', 'class-manager-desktop', 'index.html');
const L = fs.existsSync(LANDING) ? fs.readFileSync(LANDING, 'utf8').replace(/\r\n/g, '\n') : null;

const H = txt('index.html'), S = txt('sw.js'), M = txt('manifest.json');
const good = audit(H, S, M, assets, L);
const goodSet = new Set(good.fails);

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

console.log('\n=== ① 版本链（版本无关，从 CACHE_NAME 反推 ' + good.VER + '） ===');
const versionNames = [
  'sw.js 反推不出版本号', '登录页版本位未跟版', '侧栏版本位未跟版', '关于页徽章未跟版',
  '速览标题未跟版', '页面脚本引用未跟版', 'CORE_ASSETS 脚本引用与页面不一致（预缓存会落空）',
  '历史注释 v3.9.9 被误改', '历史注释 v3.9.8 被误改'
];
versionNames.forEach((n) => ok(!goodSet.has(n), n.replace('未跟版', '已跟版').replace('被误改', '原样保留').replace('反推不出', '可反推').replace('与页面不一致（预缓存会落空）', '与页面逐字一致')));

console.log('\n=== ② 内嵌 favicon 与 icon_64.png 逐字节同源 ===');
['找不到内嵌 data-URI favicon', '内嵌 favicon base64 解不开',
 '内嵌 favicon 与 icon_64.png 不同源（刷新仍是旧图）', '内嵌 favicon 不是 64×64',
 '内嵌 favicon 四角不透明（白方块底）'].forEach((n) => ok(!goodSet.has(n), n.replace('找不到', '找到').replace('解不开', '可解码').replace('不同源（刷新仍是旧图）', '同源').replace('不是', '是').replace('四角不透明', '四角透明')));

console.log('\n=== ③ 四张 PNG + 九条目 ICO 同源 ===');
const names3 = [];
for (const [name, side] of [['icon_64.png', 64], ['icon_192.png', 192], ['icon_256.png', 256], ['icon_512.png', 512]]) {
  ['缺图标资产或不是 PNG：' + name, name + ' 尺寸与文件名不符', name + ' 没有 alpha 通道', name + ' 四角不透明（会带白方块）']
    .forEach((n) => names3.push(n));
}
names3.push('favicon.ico 不是九条目 ICO');
for (let i = 0; i < ICO_SIZES.length; i++) {
  names3.push('ICO 第 ' + (i + 1) + ' 条尺寸不是 ' + ICO_SIZES[i]);
  names3.push('ICO 第 ' + (i + 1) + ' 条 PNG 与目录尺寸不符');
}
names3.push('ICO 64 条目与 icon_64.png 不同源', 'ICO 256 条目与 icon_256.png 不同源');
names3.forEach((n) => ok(!goodSet.has(n), n.replace('不是九条目', '是九条目').replace('不是 ', '= ').replace('不符', '相符').replace('不同源', '同源').replace('四角不透明（会带白方块）', '四角透明').replace('没有 alpha 通道', '带 alpha 通道').replace('缺图标资产或不是 PNG：', '存在且为 PNG：')));

console.log('\n=== ④ 缓存失效链：index / manifest / sw 三处 ?v=' + good.Q.slice(3) + ' 一致 ===');
const names4 = [
  'apple-touch-icon 缺 ?v= 破缓存', 'manifest.json 不是合法 JSON', 'manifest 图标条目数不是 3',
  'sw CORE_ASSETS 的 icon_192 缺 ?v=（会与页面请求错位）', 'sw CORE_ASSETS 的 icon_512 缺 ?v=',
  '仍存在不带 ?v= 的图标引用（HTTP 缓存会交付旧图）'
];
for (let i = 1; i <= 3; i++) {
  names4.push('manifest 第 ' + i + ' 条图标缺 ?v=');
  names4.push('manifest 第 ' + i + ' 条 ?v= 与 CACHE_NAME 不同版');
}
names4.forEach((n) => ok(!goodSet.has(n), n
  .replace('缺 ?v= 破缓存', '带 ?v= 破缓存')
  .replace('缺 ?v=（会与页面请求错位）', '带 ?v=（与页面请求一致）')
  .replace('缺 ?v=', '带 ?v=')
  .replace('不是合法 JSON', '是合法 JSON')
  .replace('条目数不是 3', '条目数 = 3')
  .replace('不同版', '同版')
  .replace('仍存在不带 ?v= 的图标引用（HTTP 缓存会交付旧图）', '无裸图标引用（HTTP 缓存不会交付旧图）')));

console.log('\n=== ⑤ 落地页 #seal 与 favicon 同源 ===');
if (!L) {
  console.log('  ⊘ 兄弟仓 class-manager-desktop 不在本机，跳过落地页断言（不计失败）');
} else {
  const names5 = [
    '落地页找不到 #seal 印章', '落地页印章不是 512 基准几何', '落地页印章的 C 弧与 A 款不同源',
    '落地页印章没引用文档级渐变', '落地页缺文档级渐变定义（<use> 阴影树解析不到会变黑块）',
    '落地页找不到 SVG data-URI favicon', '落地页 favicon 的 C 弧与印章不同源',
    '落地页顶栏/首屏/页脚没全部复用 #seal', '落地页静态版本兜底没跟到 V1.7.4',
    '落地页仍写着「班」字印章的 aria 文案'
  ];
  names5.forEach((n) => ok(!goodSet.has(n), n.replace('找不到', '找到').replace('不是 512 基准几何', '是 512 基准几何').replace('不同源', '同源').replace('没引用', '引用').replace('缺文档级', '有文档级').replace('（<use> 阴影树解析不到会变黑块）', '').replace('没全部复用', '三处复用').replace('没跟到', '已跟到').replace('仍写着', '已移除')));
}

/* ── 变异证伪：把修复拆掉，audit 必须咬人 ─────────────────── */
console.log('\n=== ⑥ 变异证伪（把关键改动拆掉，守卫必须报红） ===');
const mut = (name, fn, expectName) => {
  const mH = H, mS = S, mM = M, mL = L;
  const x = fn({ H: mH, S: mS, M: mM, L: mL });
  const r = audit(x.H, x.S, x.M, assets, x.L);
  ok(r.fails.length > 0 && (!expectName || r.fails.indexOf(expectName) >= 0),
    '拆掉「' + name + '」后被咬住（' + r.fails.slice(0, 1).join('') + '）');
};
mut('内嵌 favicon 换回旧图', (x) => ({ ...x, H: H.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+">/, 'data:image/png;base64,AAAA">') }),
  '内嵌 favicon 与 icon_64.png 不同源（刷新仍是旧图）');
mut('manifest 去掉 ?v=', (x) => ({ ...x, M: M.replace(/\?v=[0-9.]+/g, '') }),
  'manifest 第 1 条图标缺 ?v=');
mut('CACHE_NAME 退回旧版', (x) => ({ ...x, S: S.replace(/class-manager-v\d+\.\d+\.\d+/, 'class-manager-v3.9.9') }),
  '登录页版本位未跟版');
if (L) {
  mut('落地页 C 弧换成别的路径', (x) => ({ ...x, L: L.replace(ARC, 'M1 1 L2 2') }),
    '落地页印章的 C 弧与 A 款不同源');
}

// 兜底：audit 若产生了上面没列举的失败名，也必须算红（防止新增断言忘了登记）
ok(good.fails.length === 0, 'audit 无遗漏失败（' + (good.fails.length ? good.fails.join(' / ') : '0 项') + '）');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ': ' + pass + ' 项通过，' + fail + ' 项失败');
if (fail) process.exitCode = 1;
