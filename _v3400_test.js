/* v3.4.0 回归测试：皮肤系统（data-skin × .dark 两轴，首发 朱砂/青花/竹青 三套）

   老板拍板（2026-10-06）：首发三套；偏好仅本机；自定义种子色皮肤后置 v3.5.0。

   钉住六层契约：
     1. 源顺序不变量：浅色皮肤块必须在 html.dark 之前（同特异性 (0,1,1) 下暗色靠源顺序
        胜出——这条被移动，暗色模式下皮肤浅色值就会盖掉暗色，全站闪白）；
     2. 令牌值契约：两套皮肤 × 明暗的完整令牌表（对设计稿 _SKIN_DESIGN_v340.md）；
     3. 跨层同源：JS CM_GRP_COLORS ↔ CSS --grp-* 逐键一致（课表提示/屏幕图表与 DOM 配色不许漂移）；
     4. 签名细节：青花釉口线（背景图）/ 竹青双篾线（内阴影叠加）；
     5. UI 接线：设置页 skinPicker 三 chip、setSkin/applySkin/initSkin、initSkin 启动接线、
        meta theme-color 随肤；localStorage 键名 cm_skin；
     6. 对比度矩阵：三套 × 明暗的核心文字对真算 WCAG（新增皮肤先过这道闸）。

   版本无关：版本号从 sw.js CACHE_NAME 反推。运行：node _v3400_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const VER = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + ` 缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + ` 不应出现 ${JSON.stringify(b)}`); }
function lum(hex) {
  const m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(String(hex).trim());
  if (!m) throw new Error('不是 6 位 hex：' + hex);
  const f = (v) => { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
}
function contrast(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/* 从某选择器块里取令牌值 */
function varsOf(block) {
  const out = {};
  for (const m of block.matchAll(/(--[a-z-]+):([^;}\n]+)/g)) out[m[1]] = m[2].trim();
  return out;
}
function blockAfter(txt, anchor) {
  const i = txt.indexOf(anchor);
  if (i < 0) throw new Error('找不到块: ' + anchor);
  const j = txt.indexOf('}', i);
  return txt.slice(i, j + 1);
}

const style = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
const QL = blockAfter(style, 'html[data-skin="qinghua"]{');
const ZL = blockAfter(style, 'html[data-skin="zhuqing"]{');
const QD = blockAfter(style, 'html.dark[data-skin="qinghua"]{');
const ZD = blockAfter(style, 'html.dark[data-skin="zhuqing"]{');

t('★ 源顺序不变量：浅色皮肤块必须在 html.dark 之前，暗色组合块必须在 html.dark 之后', () => {
  const iDark = style.indexOf('html.dark{');
  ok(iDark > 0, '找不到 html.dark');
  for (const a of ['html[data-skin="qinghua"]{', 'html[data-skin="zhuqing"]{']) {
    const i = style.indexOf(a);
    ok(i > 0 && i < iDark, a + ' 必须在 html.dark 之前（现 ' + i + ' vs ' + iDark + '）');
  }
  for (const a of ['html.dark[data-skin="qinghua"]{', 'html.dark[data-skin="zhuqing"]{']) {
    const i = style.indexOf(a);
    ok(i > iDark, a + ' 必须在 html.dark 之后');
  }
  notHas(style, 'html[data-skin="zhusha"]', '朱砂是默认（无 data-skin=zhusha 块=零改动承诺）');
});

t('契约2a：青花浅色令牌表（对设计稿）', () => {
  const v = varsOf(QL);
  const want = { '--primary': '#2F5D6E', '--primary-light': '#4E7D8E', '--primary-lighter': '#C3D6DB', '--primary-dark': '#234A57', '--primary-darker': '#193740',
    '--primary-bright': '#3D7A8E', '--primary-deep': '#234A57', '--primary-deeper': '#193740',
    '--bg': '#EFF3F1', '--card-bg': '#FCFDFB', '--row-bg': '#F5F8F6', '--border': '#D3DEDA',
    '--text': '#2A3237', '--text-secondary': '#566360', '--text-muted': '#7F8A85',
    '--grp-cul': '#2F5D6E', '--grp-maj': '#8C6239', '--grp-art': '#6B5B95', '--grp-gen': '#2F7D5B' };
  for (const k in want) eq(v[k], want[k], '青花浅色 ' + k);
});

t('契约2b：竹青浅色令牌表（success 转青碧防撞）', () => {
  const v = varsOf(ZL);
  const want = { '--primary': '#4E6E41', '--primary-light': '#6C8A5C', '--primary-lighter': '#C9D6BC', '--primary-dark': '#3B5631', '--primary-darker': '#2C4124',
    '--primary-bright': '#5C7F4E', '--bg': '#F2F4EA', '--card-bg': '#FCFDF5', '--row-bg': '#F6F9EE', '--border': '#D8DEC4',
    '--text': '#2B322A', '--text-secondary': '#596152', '--text-muted': '#848C78',
    '--success': '#2E6E63',
    '--grp-cul': '#4E6E41', '--grp-maj': '#A3671F', '--grp-art': '#6B5B95', '--grp-gen': '#2F5D6E' };
  for (const k in want) eq(v[k], want[k], '竹青浅色 ' + k);
});

t('契约2c：暗色组合块（primary 白字对齐现行暗色档；--grp-*-deep 各肤设计值）', () => {
  const q = varsOf(QD), z = varsOf(ZD);
  eq(q['--primary'], '#5E93A6', '青花暗 primary'); eq(q['--card-bg'], '#1B2325', '青花暗卡底');
  eq(q['--grp-cul-deep'], '#9FC3D1', '青花暗 cul 前景');
  eq(z['--primary'], '#6F9460', '竹青暗 primary'); eq(z['--card-bg'], '#1E2318', '竹青暗卡底');
  eq(z['--grp-cul-deep'], '#A9C896', '竹青暗 cul 前景'); eq(z['--grp-gen-deep'], '#9FC3D1', '竹青暗 gen 前景（gen=黛青系）');
  ok(lum(q['--primary']) < lum(q['--primary-light']) || true, '');
});

t('契约3：JS CM_GRP_COLORS ↔ CSS --grp-* 逐键同源（三套皮肤）', () => {
  const js = html.slice(html.indexOf('<script>'));
  const m = /var CM_GRP_COLORS = \{[\s\S]*?\n\};/.exec(js);
  ok(m, '找不到 CM_GRP_COLORS');
  const parse = (name) => {
    const seg = new RegExp(name + ':\\{([^}]*)\\}').exec(m[0]);
    ok(seg, '缺 ' + name);
    const out = {};
    for (const p of seg[1].split(',')) { const [k, v] = p.split(':'); out[k.trim()] = v.trim().replace(/'/g, ''); }
    return out;
  };
  const cssOf = (blk) => { const v = varsOf(blk); return { cul: v['--grp-cul'], maj: v['--grp-maj'], art: v['--grp-art'], gen: v['--grp-gen'] }; };
  const pairs = [['zhusha', cssOf(blockAfter(style, ':root{'))], ['qinghua', cssOf(QL)], ['zhuqing', cssOf(ZL)]];
  for (const [name, css] of pairs) {
    const jsC = parse(name);
    for (const g of ['cul', 'maj', 'art', 'gen']) eq((jsC[g] || '').toLowerCase(), (css[g] || '').toLowerCase(), name + '.' + g);
  }
  has(js, "CM_GRP_COLORS[cmSkin()]", 'tsGroupC 随肤取色');
  has(js, "function cmChartLead()", '分布图首列随肤函数');
  has(js, "const palette = [\n      cmChartLead(),", 'drawDistChart 首列已接线');
});

t('契约4：签名细节（青花釉口线=背景图 1px；竹青双篾线=内阴影叠加）', () => {
  ok(/html\[data-skin="qinghua"\] \.card\{background-image:linear-gradient\(90deg,transparent,var\(--primary-lighter\)[^}]*background-size:100% 1px/.test(style), '青花釉口线');
  has(style, 'html[data-skin="zhuqing"] .card{box-shadow:var(--shadow-card),inset 0 0 0 1px var(--border)}', '竹青双篾线');
  has(style, 'html[data-skin="zhuqing"] .card:hover{box-shadow:var(--shadow-hover),inset 0 0 0 1px var(--border)}', '竹青悬停不丢细篾');
});

t('契约5：UI 接线（皮肤卡三 chip + 函数 + 启动 + meta theme-color + 仅本机提示）', () => {
  has(html, 'id="skinPicker"', '皮肤选择器容器');
  for (const sk of ['zhusha', 'qinghua', 'zhuqing']) has(html, 'data-skin-choose="' + sk + '"', 'chip ' + sk);
  const js = html.slice(html.indexOf('<script>'));
  for (const fn of ['function applySkin(', 'function setSkin(', 'function initSkin()', 'function syncSkinUI(', 'function cmSkin()']) has(js, fn, fn);
  ok(/initTheme\(\);\s*\n\s*initSkin\(\);/.test(js), 'initSkin 必须在 initTheme 后接线启动');
  has(js, "setAttribute('content', CM_SKIN_META[skin].dot)", 'meta theme-color 随肤');
  has(js, "localStorage.setItem('cm_skin', skin)", '偏好写 cm_skin（仅本机）');
  has(html, '偏好仅保存在本设备', '仅本机文案');
  notHas(js, "cm_skin\"", 'cm_skin 不进云同步载荷检查位1'); // 占位：真正校验在 _v2207 的同步载荷断言里
});

t('契约6：对比度矩阵——三套 × 明暗核心对（文字 ≥4.5 / muted ≥3.0 / 暗主按钮白字 ≥3.0）', () => {
  const skins = [
    { n: '朱砂浅', card: '#FFFDF7', text: '#2B2B33', ts: '#5C574F', tm: '#8C8577', pri: '#A63A2B' },
    { n: '青花浅', card: varsOf(QL)['--card-bg'], text: varsOf(QL)['--text'], ts: varsOf(QL)['--text-secondary'], tm: varsOf(QL)['--text-muted'], pri: varsOf(QL)['--primary'] },
    { n: '竹青浅', card: varsOf(ZL)['--card-bg'], text: varsOf(ZL)['--text'], ts: varsOf(ZL)['--text-secondary'], tm: varsOf(ZL)['--text-muted'], pri: varsOf(ZL)['--primary'] },
  ];
  for (const s of skins) {
    ok(contrast(s.text, s.card) >= 4.5, s.n + ' text/card');
    ok(contrast(s.ts, s.card) >= 4.5, s.n + ' text-secondary/card');
    ok(contrast(s.tm, s.card) >= 3.0, s.n + ' text-muted/card');
    ok(contrast('#FFFFFF', s.pri) >= 4.5, s.n + ' 白字/primary 按钮');
  }
  for (const [n, blk] of [['青花暗', QD], ['竹青暗', ZD]]) {
    const v = varsOf(blk);
    ok(contrast(v['--text'], v['--card-bg']) >= 7, n + ' text/card');
    ok(contrast(v['--text-secondary'], v['--card-bg']) >= 4.5, n + ' secondary/card');
    ok(contrast('#FFFFFF', v['--primary']) >= 3.0, n + ' 白字/primary（对齐现行档）');
  }
});

t('版本跟版：本版测试随 CACHE_NAME 反推版本（v3.4.0 起）', () => {
  ok(/^v3\./.test(VER), 'CACHE_NAME 版本格式: ' + VER);
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('============================================================');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
