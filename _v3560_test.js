// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
const V = (function () {
  try {
    var m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(require('fs').readFileSync(require('path').join(__dirname, 'sw.js'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
if (!V) throw new Error('[版本无关化] 未能从 sw.js 反推版本号（CACHE_NAME 缺失或路径不对）');
/* v3.5.6 回归测试：侧栏折叠 rail（三态：展开固定 / 折叠 rail / 悬停·单击临时浮层展开）
   覆盖：
     ① HTML 契约：19 个 nav-text 包裹、logo-texts、rail-toggle 按钮（版本前缀原样）
     ② JS 契约：cmRailApply/Toggle/Enter/Leave 四函数、1s 悬停 / 400ms 收回、localStorage 记忆、rail-init 防首帧动画
     ③ CSS 契约：rail 68px / rail-open 浮层（width+负 margin 占位恒 68）/ 分段文字动画 / reduced-motion
     ④ 既有锚点兼容：nav-item 开标签、settings 正则切片、sidebar-footer 版本前缀
   运行：node _v3560_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('四处跟版 ' + V + '（登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME）', () => {
  has(html, '<div class="login-version">' + V + '</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">' + V, '侧栏版本前缀未跟版');
  has(html, '🏷️ ' + V + '</span>', '设置徽标未跟版');
  has(sw, "CACHE_NAME = 'class-manager-" + V + "'", 'SW CACHE_NAME 未跟版');
});
t('速览标题与 CACHE_NAME 同版本号', () => {
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
});

console.log('=== ① HTML 契约 ===');
t('19 个 nav-item 文本已包 nav-text（与 19 个 nav-item 一一对应）', () => {
  eq((html.match(/class="nav-text">/g) || []).length, 19);
  eq((html.match(/class="nav-item[ "]/g) || []).length, 19);
});
t('logo 文字容器有 logo-texts 标记', () => {
  has(html, '<div class="logo-texts">', 'logo-texts 缺失');
});
t('rail-toggle 按钮在 sidebar 内、footer 外（footer 完整闭合原样，桌面 build.js 锚不破坏）', () => {
  const seg = html.match(/<button class="rail-toggle"[\s\S]*?<\/button>\s*<div class="sidebar-footer">[\s\S]*?<\/div>/)[0];
  has(seg, 'cmRailToggle()', '按钮未接线');
  has(seg, V + ' · 班主任工作台</div>', 'footer 版本串未完整闭合');
});
t('既有 nav-item 锚点不破坏（settings 正则切片 / publicity / bank / attendance 开标签）', () => {
  const settingsNav = html.match(/<div class="nav-item" data-page="settings">[\s\S]*?<\/div>/);
  ok(settingsNav, 'settings 正则切片失效');
  has(settingsNav[0], 'nav-text', 'settings 文本未包裹');
  has(html, 'class="nav-item" data-page="publicity"', '公示入口锚点破坏');
  has(html, '<div class="nav-item" data-page="bank"', '银行入口锚点破坏');
  has(html, 'nav-item" data-page="attendance"', '请假入口锚点破坏');
});

console.log('=== ② JS 契约 ===');
t('cmRail 四函数齐 + 1s 悬停 / 400ms 收回 / localStorage 键', () => {
  has(html, 'function cmRailApply(', '缺 cmRailApply');
  has(html, 'function cmRailToggle(', '缺 cmRailToggle');
  has(html, 'function cmRailEnter(', '缺 cmRailEnter');
  has(html, 'function cmRailLeave(', '缺 cmRailLeave');
  const mod = html.match(/var cmRailSidebar = document\.getElementById\('sidebar'\);[\s\S]*?cmRailSidebar\.classList\.remove\('rail-init'\);[\s\S]*?\n  \} catch\(e\)\{\}\n}/);
  ok(mod, 'rail 模块切片失败');
  has(mod[0], '}, 1000);', '悬停 1s 计时缺失');
  has(mod[0], '}, 400);', '收回 400ms 缺失');
  has(mod[0], "localStorage.setItem('cm_sidebar_rail'", '状态记忆缺失');
  has(mod[0], "localStorage.getItem('cm_sidebar_rail') === '1'", '启动恢复缺失');
  has(mod[0], "classList.add('rail-init', 'rail')", '首帧防动画缺失');
  has(mod[0], "addEventListener('mouseenter', cmRailEnter)", 'mouseenter 未接线');
  has(mod[0], "addEventListener('mouseleave', cmRailLeave)", 'mouseleave 未接线');
});
t('rail 态单击图标立即展开（capture 监听，不阻断跳页）', () => {
  const mod = html.match(/document\.getElementById\('nav'\)\.addEventListener\('click'[\s\S]*?\}, true\);/);
  ok(mod, 'nav click capture 缺失');
  has(mod[0], "classList.add('rail-open')", '点击未展开浮层');
  ok(mod[0].indexOf('preventDefault') < 0, '不应阻断原跳页');
});

console.log('=== ③ CSS 契约 ===');
t('rail 68px / rail-open 浮层（width + 负 margin 占位恒 68）', () => {
  has(html, '.sidebar.rail{width:68px}', 'rail 宽度缺失');
  has(html, '.sidebar.rail-open{width:var(--sidebar-w);margin-right:calc(68px - var(--sidebar-w));', '浮层宽度+负边距缺失');
  has(html, 'box-shadow:8px 0 28px', '浮层卡片阴影缺失');
  has(html, 'cubic-bezier(.22,1,.36,1)', '丝滑缓动缺失');
});
t('分段文字动画 + 首帧防动画 + reduced-motion', () => {
  has(html, '.sidebar.rail .nav-text,.sidebar.rail .logo-texts{opacity:0;transform:translateX(-6px);pointer-events:none;transition-delay:0s;transition-duration:.12s}', '折叠淡出编排缺失');
  has(html, '.sidebar.rail-open .nav-text,.sidebar.rail-open .logo-texts{opacity:1;transform:translateX(0);transition-delay:.12s}', '展开淡入编排缺失');
  has(html, '.sidebar.rail-init,.sidebar.rail-init *{transition:none!important}', 'rail-init 缺失');
  has(html, '@media (prefers-reduced-motion:reduce){.sidebar,.sidebar .nav-text,.sidebar .logo-texts,.rail-toggle{transition:none!important}}', 'reduced-motion 缺失');
});
t('nav-item 原有 transition 四项不被污染（动效契约）', () => {
  has(html, 'transition:background-color var(--transition),color var(--transition),box-shadow var(--transition),transform var(--transition)', 'nav-item 原 transition 四项被改动');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 500).unref();
