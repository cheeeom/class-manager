/* v3.9.8 回归：静态脚本版本串必须与页面版本同步
   ------------------------------------------------------------------
   背景（真实故障）：老板升级到 v3.9.7 后，数据分析页**只有两个页签**，
   刷新一次也不出来，第二次刷新才正常。

   原因：sw.js 对静态资源是「缓存优先 + 后台更新」——
       caches.match(req).then(cached => cached || fetchPromise)
   ⇒ 只要缓存里有，就**先把旧的返给页面**，新的下轮才生效；
   而导航请求（index.html）是网络优先，刷新立刻拿到新版。
   两者错位 ⇒ 页面已是新版、cmgx.js 还是旧版。
   「请假分析」页签正是 cmgx.js 运行时注入的，于是整个页签消失。

   修法：脚本 URL 带版本串（?v=x.y.z）。URL 一变，缓存必然落空 ⇒ 立即取新版；
   离线时该 URL 已在 install 阶段预缓存，不影响离线开屏。
   ⚠️ 但这也意味着三处必须同步：index.html 的 src、sw.js 的 CACHE_NAME、
      sw.js 的 CORE_ASSETS。任意一处对不上，要么缓存再次错位，
      要么 CORE_ASSETS 里预缓存的是一个没人请求的地址（白占空间），
      严重时 addAll 拿到 404 会整体 reject ⇒ SW 安装失败、离线全废。
   本套测试就是把这三处的同步关系钉死（版本号从 CACHE_NAME 反推，版本无关）。
*/
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

/* ---------- 版本号从 CACHE_NAME 反推（不写死，跟版不用改本文件） ---------- */
const m = sw.match(/const CACHE_NAME = 'class-manager-(v\d+\.\d+\.\d+)';/);
ok(!!m, 'CACHE_NAME 形如 class-manager-vX.Y.Z');
const VER = m ? m[1] : 'v0.0.0';
const VER_NUM = VER.slice(1);

/* ---------- ① index.html 的脚本引用必须带版本串 ---------- */
const srcRe = /<script src="\.\/cmgx\.js(\?v=([\d.]+))?"><\/script>/;
const srcHit = html.match(srcRe);
ok(!!srcHit, 'index.html 有 <script src="./cmgx.js…">');
ok(!!srcHit && !!srcHit[1], '脚本引用带 ?v= 版本串（否则旧缓存会一直顶上）');
ok(!!srcHit && srcHit[2] === VER_NUM, '脚本引用版本与 CACHE_NAME 同版（' + (srcHit && srcHit[2]) + ' vs ' + VER_NUM + '）');

/* ---------- ② 不许再有裸引用（否则会多下一份、缓存两份） ---------- */
ok(html.indexOf('<script src="./cmgx.js"></script>') < 0, '没有裸的 cmgx.js 引用（都会走带版本串那一个）');

/* ---------- ③ CORE_ASSETS 必须与页面请求的 URL 完全一致 ---------- */
const coreSrc = sw.match(/<script src="\.\/cmgx\.js\?v=[\d.]+"><\/script>/); // 仅用于提示，实际取 sw
const coreHit = sw.match(/'\s*\.\/cmgx\.js(\?v=[\d.]+)?\s*'/);
ok(!!coreHit, 'CORE_ASSETS 含 ./cmgx.js');
ok(!!coreHit && coreHit[1] === '?v=' + VER_NUM,
   'CORE_ASSETS 的脚本地址与页面请求一字不差（' + (coreHit && coreHit[1]) + '）');
ok(sw.indexOf("'./cmgx.js',") < 0, 'CORE_ASSETS 里没有残留的裸地址（预缓存不会被浪费）');

/* ---------- ④ 页面四个可见版本位必须同版 ---------- */
const spots = [
  ['<div class="login-version">' + VER + '</div>', '登录页版本位'],
  ['<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>', '侧栏版本位'],
  ['>🏷️ ' + VER + '</span>', '设置页版本徽标'],
  ['近版更新速览（' + VER + '）', '近版更新速览标题'],
];
spots.forEach(function (p) { ok(html.indexOf(p[0]) >= 0, p[1] + ' = ' + VER); });

/* ---------- ⑤ 缓存策略本身的契约（防止有人「顺手优化」回旧行为） ---------- */
ok(/event\.request\.mode === 'navigate'/.test(sw), '导航请求单独分支（index.html 网络优先）');
ok(/cache: 'no-store'/.test(sw), '导航/静态请求都绕开 HTTP 缓存');
ok(/return cached \|\| fetchPromise/.test(sw), '静态资源仍是缓存优先（本版本靠 URL 版本串解决错位，未改策略）');

/* ---------- ⑥ 预缓存清单里每一项都真实存在（addAll 全成全败，缺一个就全废） ---------- */
const coreBlock = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
ok(!!coreBlock, '能取到 CORE_ASSETS 数组');
if (coreBlock) {
  const items = coreBlock[1]
    .split('\n')
    .map(function (l) { return (l.match(/'([^']+)'/) || [])[1]; })
    .filter(Boolean);
  ok(items.length >= 8, 'CORE_ASSETS 有 ' + items.length + ' 项');
  const missing = [];
  items.forEach(function (it) {
    const clean = it.split('?')[0].replace(/^\.\//, '');
    const full = path.join(DIR, clean || 'index.html');
    if (!clean) return;                       // './' 就是站点根，跳过
    if (clean.endsWith('/')) {                // 目录形态（./portal/）
      if (!fs.existsSync(full)) missing.push(it);
      return;
    }
    if (!fs.existsSync(full)) missing.push(it);
  });
  ok(missing.length === 0, '预缓存清单全部文件都在（缺的：' + (missing.join(', ') || '无') + '）');
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ': ' + pass + ' 项通过，' + fail + ' 项失败');
process.exit(fail === 0 ? 0 : 1);
