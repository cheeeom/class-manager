/* v3.3.0 回归测试：颜色令牌还债的「守卫层」——把 _v2273 的机制守卫推广到全站颜色

   背景：v3.4.0 要上皮肤系统（html[data-skin] × .dark），届时任何一处「不吃令牌的
   硬编码表面色」都会变成「换肤换不掉的钉子户」。本轮（v3.3.0）把全站 CSS 收敛为：
     A. 令牌定义块（:root / html.dark / 未来的 [data-skin]）——颜色的唯一合法产地；
     B. var() 引用——已收编；
     C. /*肤免* / 标记——刻意保留的固定色（奖牌/徽章/语义 chips/白字等），
        每一处都可 grep、可审计；导出图用色在 JS 侧同理（品牌固定色，见 CM_COLOR 注释）。
   本测试钉住这个格局不许倒退：**任何新增的、不带肤免的裸 hex 一律判红**。

   另外三层契约：
     1. 新令牌（--primary-bright / --grp-* 八件）存在且值正确（浅色零像素的锚）；
     2. CM_COLOR（JS 品牌调色对象）与 CSS 令牌同源——逐键比对，不许漂移；
     3. 对比度自动校验（WCAG 相对亮度真算）：核心文字对 ≥4.5，暗色主按钮白字 ≥3.0
        （对齐现行暗色档位），以后加皮肤先过这道闸。

   运行：node _v3300_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + ` 缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + ` 不应出现 ${JSON.stringify(b)}`); }
function blockOf(txt, anchor) {
  const i = txt.indexOf(anchor);
  if (i < 0) throw new Error('找不到规则: ' + anchor);
  const j = txt.indexOf('}', i);
  return txt.slice(i, j + 1);
}
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
function varOf(block, name) {
  const m = new RegExp('--' + name + '\\s*:\\s*([^;]+);').exec(block);
  if (!m) throw new Error('取不到变量 --' + name);
  return m[1].trim();
}

const style = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
const ROOT = blockOf(style, ':root{');
const DARK = blockOf(style, 'html.dark{');

/* ---------- 拍平规则（剥注释 + @media 嵌套展平），供守卫扫描 ----------
   注意：注释替换为等长空白，但「肤免」标记必须保留成可见文本——它就是豁免凭证本身 */
function flatRules(styleText) {
  const noComment = styleText.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.indexOf('肤免') >= 0 ? ' 肤免 ' : ' '.repeat(m.length)));
  const rules = [];
  const stack = [];
  let buf = '', sel = '', depth = 0;
  for (const ch of noComment) {
    if (ch === '{') {
      if (depth === 0) { sel = buf.trim(); buf = ''; }
      else { stack.push(sel); sel = buf.trim(); buf = ''; }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) { rules.push({ sel, body: buf.trim() }); buf = ''; sel = stack.pop() || ''; }
      else { rules.push({ sel: (stack.length ? stack[stack.length - 1] + ' > ' : '') + sel, body: buf.trim() }); buf = ''; sel = stack.pop() || ''; }
    } else buf += ch;
  }
  return rules;
}

const WHITE_IDIOM = new Set(['color:#fff', 'color:#ffffff', 'background:#fff', 'background:#ffffff', 'border:2pxsolid#fff', 'border:solid#fff']);

t('★ 全站守卫：非令牌定义块里的裸 hex 必须带 /*肤免*/（白字/白底惯用式除外）', () => {
  const offenders = [];
  for (const r of flatRules(style)) {
    const ns = r.sel.replace(/\s+/g, '');
    if (ns === ':root' || ns === 'html.dark' || ns.startsWith('[data-skin')) continue; // 颜色的合法产地
    for (let decl of r.body.split(';')) {
      if (!/#[0-9a-fA-F]{3,8}\b/.test(decl)) continue;
      const norm = decl.replace(/\s+/g, '').toLowerCase();
      if (WHITE_IDIOM.has(norm)) continue;
      if (decl.indexOf('肤免') >= 0) continue;
      offenders.push(r.sel.slice(0, 60) + ' ⇒ ' + decl.trim().slice(0, 90));
    }
  }
  ok(offenders.length === 0, '发现 ' + offenders.length + ' 处无豁免裸 hex（加令牌或补 /*肤免*/）:\n      ' + offenders.slice(0, 8).join('\n      '));
});

t('守卫反向校验：/*肤免*/ 只许出现在真正含 hex 的声明上（防豁免注水）', () => {
  let seen = 0;
  for (const r of flatRules(style)) {
    const ns = r.sel.replace(/\s+/g, '');
    if (ns === ':root' || ns === 'html.dark') continue;
    for (const decl of r.body.split(';')) {
      if (decl.indexOf('肤免') < 0) continue;
      ok(/#[0-9a-fA-F]{3,8}\b/.test(decl), '豁免声明里没有 hex：' + decl.trim().slice(0, 80));
      seen++;
    }
  }
  ok(seen >= 60, '豁免数量异常偏少（' + seen + '），疑似扫描失灵');
});

t('契约1：--primary-bright/deep/deeper 与学分四组 --grp-* 存在且值正确', () => {
  eq(varOf(ROOT, 'primary-bright'), '#B0432F', '--primary-bright');
  eq(varOf(ROOT, 'primary-deep'), '#8C2F22', '--primary-deep');
  eq(varOf(ROOT, 'primary-deeper'), '#6F251B', '--primary-deeper');
  ok(DARK.indexOf('--primary-deep') < 0, '--primary-deep 不得随暗色翻转');
  ok(DARK.indexOf('--primary-deeper') < 0, '--primary-deeper 不得随暗色翻转');
  const grp = { 'grp-cul': '#A63A2B', 'grp-maj': '#2F7D5B', 'grp-art': '#6B5B95', 'grp-gen': '#B96A1F',
                'grp-cul-deep': '#8C2F22', 'grp-maj-deep': '#256349', 'grp-art-deep': '#54447A', 'grp-gen-deep': '#8F5217' };
  for (const k in grp) eq(varOf(ROOT, k), grp[k], '--' + k);
});

t('契约1b：登录印章/按钮渐变与课表四组全部改走 var()（渐变深端用不翻转变的 deep 令牌）', () => {
  has(style, 'linear-gradient(145deg,var(--primary-bright),var(--primary-deep))', '印章渐变');
  has(style, '.key-ok:hover{background:linear-gradient(145deg,var(--primary-deep),var(--primary-deeper))', 'key-ok hover');
  has(style, 'border-left-color:var(--grp-cul)', '课表组边框示例');
  has(style, '.ts-cell.g-cul .cs{color:var(--grp-cul-deep)}', '课表组深字示例');
});

t('契约2：CM_COLOR 与 CSS 令牌同源（逐键比对，JS/CSS 不许漂移）', () => {
  const m = /var CM_COLOR = \{[\s\S]*?\};/.exec(html);
  ok(m, '找不到 CM_COLOR 定义');
  for (const pair of [['primary', 'primary'], ['success', 'success'], ['warning', 'warning'], ['danger', 'danger'], ['purple', 'purple'], ['orange', 'orange'], ['gold', 'gold']]) {
    const jsV = new RegExp(pair[0] + ":'([^']+)'").exec(m[0]);
    ok(jsV, 'CM_COLOR 缺键 ' + pair[0]);
    eq(jsV[1].toLowerCase(), varOf(ROOT, pair[1]).toLowerCase(), 'CM_COLOR.' + pair[0] + ' vs --' + pair[1]);
  }
  has(html, "CB_LEVEL_COLORS[lv] || CM_COLOR.success", 'tierColorOf 兜底走 CM_COLOR');
});

t('契约3：对比度自动校验——浅色核心对（真算 WCAG，≥4.5；muted ≥3.0）', () => {
  const card = varOf(ROOT, 'card-bg');
  ok(contrast(varOf(ROOT, 'text'), card) >= 4.5, 'text/card-bg');
  ok(contrast(varOf(ROOT, 'text-secondary'), card) >= 4.5, 'text-secondary/card-bg');
  ok(contrast(varOf(ROOT, 'text-muted'), card) >= 3.0, 'text-muted/card-bg');
  ok(contrast(varOf(ROOT, 'primary'), card) >= 4.5, 'primary/card-bg');
  ok(contrast('#FFFFFF', varOf(ROOT, 'primary')) >= 4.5, 'white/primary 按钮');
  ok(contrast('#FFFFFF', varOf(ROOT, 'success')) >= 4.5, 'white/success 按钮');
  ok(contrast('#FFFFFF', varOf(ROOT, 'danger')) >= 4.5, 'white/danger 按钮');
  for (const g of ['grp-cul-deep', 'grp-maj-deep', 'grp-art-deep', 'grp-gen-deep']) {
    ok(contrast(varOf(ROOT, g), card) >= 4.5, g + '/card-bg');
  }
});

t('契约3b：对比度自动校验——暗色档（text ≥7 / secondary ≥4.5 / 主按钮白字 ≥3.0 对齐现行档位）', () => {
  const card = varOf(DARK, 'card-bg');
  ok(contrast(varOf(DARK, 'text'), card) >= 7, 'dark text/card-bg');
  ok(contrast(varOf(DARK, 'text-secondary'), card) >= 4.5, 'dark text-secondary/card-bg');
  ok(contrast('#FFFFFF', varOf(DARK, 'primary')) >= 3.0, 'dark white/primary 按钮');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('============================================================');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
