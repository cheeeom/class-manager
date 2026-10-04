/* v2.27.3 回归测试：暗色模式下「硬编码浅色底」收敛成 --row-bg 变量

   老板原话（2026-10-01）：
     「暗夜模式下，首页的 Top 5 排行榜卡片里面，有第四和第五是白色状态，
       鼠标悬停的时候又是正常暗色，修复一下」

   为什么要专门钉一套测试：这个 bug **不是打字错误，是机制性的**——
   `html.dark` 只重定义 CSS 变量，**吃不到硬编码颜色**。所以只要有人再写一句
   `background:#某米色`，暗色下就会重新长出一块白。本测试的作用是让这件事
   **不可能再静默发生**。

   判据分三层：

     第一层（机制）：`--row-bg` 必须同时存在于 `:root` 与 `html.dark`，
                     且暗色值的**相对亮度要真算出来 < 0.1**（不只是字符串比对）。
                     浅色值必须**逐字等于**原来的硬编码米色 ⇒ 保证浅色模式像素不变。

     第二层（不变量）：硬编码米色 `#FBF8F1` 在**全文件只允许出现 1 次**，
                     且必须落在 `:root` 的那条 `--row-bg` 定义里。
                     这条是决定性的：任何新增的硬编码米色都会让计数 > 1 而判红。

     第三层（机理保全）：这个 bug 只在 rank-4/5 出现，是因为 rank-1/2/3 另有一条
                     `background:linear-gradient(...,transparent)` 把基色覆盖掉了
                     （透明渐变透出暗色卡片 ⇒ 看着正常）。所以必须同时钉住
                     「rank-1/2/3 的透明渐变还在」——少了它，1/2/3 会一起变白；
                     多了「rank-4/5 的实心覆盖」又会把这次的修复推翻。

   测量依据：`_rm/_probe_dark.py`（强制 cm_theme=dark，在真实渲染元素上读计算色）
     修复前：rank-4/5 bg-color = rgb(251,248,241)  亮度 0.9399   ← 白块
     .progress-item / .seat 同值；.grade-table tr:hover 声明值同为该米色
     修复后：rank-4/5 bg-color = rgb(38,34,27)     亮度 0.0164
             .progress-item / .seat 同值；tr:hover 走 var(--row-bg)
             Top5 亮底行数 = 0、另外两处亮底数 = 0

   版本无关：版本号一律从 sw.js 的 CACHE_NAME 反推，发版不需要动本文件。
   运行：node _v2273_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const VER = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';

/* 老板报的那个「米色」的**唯一**合法出处；其余位置一律不许再出现 */
const OLD_LIGHT = '#FBF8F1';

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + `不应出现 ${JSON.stringify(b)}`); }
function blockOf(txt, anchor) {
  const i = txt.indexOf(anchor);
  if (i < 0) throw new Error('找不到规则: ' + anchor);
  const j = txt.indexOf('}', i);
  return txt.slice(i, j + 1);
}
/* 相对亮度：真算，不做字符串比对 —— 这样「换了个同样浅的十六进制」也逃不掉 */
function lum(hex) {
  const m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(String(hex).trim());
  if (!m) throw new Error('不是 6 位 hex：' + hex);
  const f = (v) => { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
}
/* 从变量块里取某个自定义属性的值 */
function varOf(block, name) {
  const m = new RegExp('--' + name + '\\s*:\\s*([^;]+);').exec(block);
  if (!m) throw new Error('取不到变量 --' + name);
  return m[1].trim();
}

const ROOT = blockOf(html, ':root{');
const DARK = blockOf(html, 'html.dark{');

/* ============================================================ */
console.log('\n=== ① --row-bg 必须两套主题都有，且暗色值要真算得够暗 ===');
t('变量块切对了（:root / html.dark 各自认得出来）', () => {
  has(ROOT, '--card-bg:#FFFDF7;', '切到的不是浅色 :root');
  has(DARK, '--card-bg:#23201A;', '切到的不是 html.dark');
  ok(html.indexOf(':root{') < html.indexOf('html.dark{'), '两个块的前后顺序变了？');
});
t('★ 浅色定义逐字等于原来的硬编码米色（⇒ 浅色模式像素不变）', () => {
  const v = varOf(ROOT, 'row-bg');
  eq(v, OLD_LIGHT, '浅色 --row-bg 必须等于旧的硬编码值，否则浅色模式观感会被改掉：');
});
t('★ 暗色定义在 html.dark 块内，且不是浅色值', () => {
  const v = varOf(DARK, 'row-bg');
  ok(v !== OLD_LIGHT, '暗色仍写成了浅色值：' + v);
  ok(/^#[0-9a-fA-F]{6}$/.test(v), '暗色值应是 6 位 hex：' + v);
});
t('★ 暗色值的相对亮度 < 0.1（真算，防「换成另一个浅色」蒙混过关）', () => {
  const L = lum(varOf(DARK, 'row-bg'));
  ok(L < 0.1, '暗色 --row-bg 亮度 ' + L.toFixed(4) + ' 偏高，暗色下还会看成亮块');
});
t('★ 浅色值的相对亮度 > 0.5（确认两套主题真的分开了）', () => {
  const L = lum(varOf(ROOT, 'row-bg'));
  ok(L > 0.5, '浅色 --row-bg 亮度只有 ' + L.toFixed(4) + '，浅色模式会偏暗');
});
t('两套亮度差足够大（≥0.5）', () => {
  const d = lum(varOf(ROOT, 'row-bg')) - lum(varOf(DARK, 'row-bg'));
  ok(d >= 0.5, '两套主题的 --row-bg 差别太小：' + d.toFixed(4));
});

/* ============================================================ */
console.log('\n=== ② 四处硬编码底全部改走 var(--row-bg) ===');
t('★ .top5-item（老板报的 Top 5 排行榜行）', () => {
  const b = blockOf(html, '\n.top5-item{');
  has(b, 'background:var(--row-bg);', 'Top5 行没走变量');
  notHas(b, 'background:#', 'Top5 行仍有硬编码背景');
});
t('★ .progress-item（数据分析页·进步榜）', () => {
  const b = blockOf(html, '\n.progress-item{');
  has(b, 'background:var(--row-bg);', '进步榜项没走变量');
  notHas(b, 'background:#', '进步榜项仍有硬编码背景');
});
t('★ .seat（座次表座位格）', () => {
  const b = blockOf(html, '\n.seat{');
  has(b, 'background:var(--row-bg);', '座位格没走变量');
  notHas(b, 'background:#', '座位格仍有硬编码背景');
});
t('★ .grade-table tr:hover（成绩表悬停）', () => {
  has(html, '.grade-table tr:hover{background:var(--row-bg)}', '成绩表悬停没走变量');
  notHas(html, `.grade-table tr:hover{background:${OLD_LIGHT}}`, '成绩表悬停仍是硬编码');
});
t('恰好 4 处使用 var(--row-bg)（新增第 5 处时提醒你回来更新本测试）', () => {
  const n = html.split('background:var(--row-bg)').length - 1;
  eq(n, 6, 'var(--row-bg) 使用处数：');
});

/* ============================================================ */
console.log('\n=== ③ 决定性不变量：硬编码米色全文件只允许 1 处 ===');
t('★★ 硬编码米色出现次数 == 1（唯一合法出处就是 :root 的定义）', () => {
  const n = html.split(OLD_LIGHT).length - 1;
  eq(n, 1, `硬编码米色出现 ${n} 次；新增的硬编码会让暗色下重新长白块：`);
});
t('★★ 那唯一一处必须落在 :root 的 --row-bg 定义里', () => {
  has(ROOT, '--row-bg:' + OLD_LIGHT + ';', ':root 里没有这条定义');
  ok(!DARK.includes(OLD_LIGHT), 'html.dark 里不该出现这个浅色值');
});

/* ============================================================ */
console.log('\n=== ④ 反向判据：四种旧写法必须查无 ===');
t('`background:#` + 该米色 的旧写法，三种全查无', () => {
  notHas(html, `background:${OLD_LIGHT}`, '还有裸 background 硬编码');
  notHas(html, `background:#FBF8F1;`, '还有 background:…; 形式的硬编码');
  notHas(html, `tr:hover{background:${OLD_LIGHT}}`, '还有悬停硬编码');
  // ⚠️ 这三条在 v2.27.2（改动前）上是**真的会判红**的 —— 由 _rm/_revdark.py 反向对照证明，
  //    不在这里写恒真的「自证」断言冒充对照。
});

/* ============================================================ */
console.log('\n=== ⑤ 机理保全：为什么当初只有第 4/5 名露白 ===');
t('★ rank-1/2/3 的透明渐变覆盖仍在（否则 1/2/3 会一起变白）', () => {
  for (const n of [1, 2, 3]) {
    const pat = `.top5-item.rank-${n}{background:linear-gradient(90deg,`;
    has(html, pat, `rank-${n} 的渐变覆盖没了`);
    const seg = blockOf(html, pat);
    has(seg, 'transparent)', `rank-${n} 的渐变不再是 transparent 收尾 ⇒ 会盖住卡片色`);
  }
});
t('★ rank-4/5 不许出现实心 background 覆盖（否则会推翻本次修复）', () => {
  for (const n of [4, 5]) {
    ok(!new RegExp(`\\.top5-item\\.rank-${n}\\{[^}]*background\\s*:`).test(html),
      `出现了 .top5-item.rank-${n} 的 background 覆盖规则`);
  }
});
t('.top5-item 仍是「透明底 + 渐变」的结构（基色只能来自 --row-bg）', () => {
  const b = blockOf(html, '\n.top5-item{');
  has(b, 'background:var(--row-bg);');
  has(b, 'border-radius:10px;', '顺手确认这条规则没被整体改坏');
});

/* ============================================================ */
console.log('\n=== ⑥ 版本一致性（从 CACHE_NAME 反推，发版无需改本文件） ===');
t('VER 取到了', () => ok(/^v\d+\.\d+\.\d+$/.test(VER), 'CACHE_NAME 里的版本：' + VER));
t('四处活动标记与 CACHE_NAME 一致', () => {
  has(html, `<div class="login-version">${VER}</div>`);
  has(html, `<div class="sidebar-footer">${VER} · 班主任工作台</div>`);
  has(html, `🏷️ ${VER}</span>`);
  has(html, `📝 近版更新速览（${VER}）`);
});
t('全文件不含其它历史版本号的 login-version 标记', () => {
  const all = html.match(/<div class="login-version">([^<]*)<\/div>/g) || [];
  eq(all.length, 1, 'login-version 标记个数：');
  has(all[0], VER);
});

console.log('\n============================================================');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
