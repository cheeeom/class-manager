/* v2.18.13 回归测试：平板/矮窗口侧栏导航「设置」显示不全且无法滑动 ——
 * 根因：.nav 是 column flex（.sidebar）的子项，只有 flex:1 没有 min-height:0，
 *       flex 子项默认 min-height:auto 不允许收缩到比内容矮 → overflow-y:auto 永不生效，
 *       导航内容直接撑爆侧栏，底部「设置」溢出屏幕外且无法滚动。
 * 修复：① .nav 加 min-height:0 + -webkit-overflow-scrolling:touch + overscroll-behavior:contain
 *       ② .app 视口高度补 100dvh（平板浏览器 100vh 含地址栏后方区域）
 * 断言：CSS 锚点精确匹配 + 三处版本标记 + SW 缓存名 + 设置页 notes 新条目（旧条不删）。
 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function has(s, sub, msg) {
  if (!s.includes(sub)) throw new Error(msg || ('缺少标记: ' + String(sub).slice(0, 80)));
}

console.log('\n=== v2.18.13 侧栏导航可滚动修复 ===');

t('.app 视口高度：100vh 保留 + 100dvh 兜底（平板动态视口）', () => {
  has(html, '.app{display:flex;height:100vh;height:100dvh;position:relative;z-index:1}',
      '.app 缺少 100dvh 兜底');
});

t('.nav 允许收缩：min-height:0 在 overflow-y:auto 同一规则内', () => {
  has(html, '.nav{flex:1;min-height:0;padding:8px 12px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}',
      '.nav 规则缺少 min-height:0 / 触屏滚动 / overscroll 隔离');
  // 确认旧规则已被替换（防止新旧并存）
  if (html.includes('.nav{flex:1;padding:8px 12px;overflow-y:auto}')) {
    throw new Error('旧 .nav 规则仍存在（未替换）');
  }
});

t('.nav 规则位于 .sidebar（column flex 容器）上下文中', () => {
  const si = html.indexOf('.sidebar{');
  const ni = html.indexOf('.nav{flex:1;min-height:0');
  if (si < 0 || ni < 0 || ni < si) throw new Error('.nav 规则未出现在 .sidebar 之后');
});

t('「设置」是导航最后一项（data-page="settings" 在 </nav> 前）', () => {
  const navEnd = html.indexOf('</nav>');
  const seg = html.slice(0, navEnd);
  const lastSettings = seg.lastIndexOf('data-page="settings"');
  const lastAnyNav = Math.max(...['dashboard','students','profiles','committee','dorm','seating','duty','attendance','grades','todo','worklogs','notices','credits','bank','publicity','honors','analytics']
    .map(k => seg.lastIndexOf('data-page="' + k + '"')));
  if (lastSettings < 0 || lastSettings < lastAnyNav) throw new Error('设置不是最后一项，修复的针对性不成立');
});

t('版本标记统一 v2.18.13', () => {
  has(html, '<div class="login-version">v2.18.13</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.13 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.13</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-v2.18.13'", 'SW');
});

t('设置页「近版更新速览」新增本版条目（旧条不删）', () => {
  has(html, '修复平板/矮窗口下侧栏导航「设置」显示不全且无法滑动', '缺 v2.18.13 notes 条目');
  has(html, '· 修复：往新建大类里添加原因后刷新整组消失', 'v2.18.9 旧条目被删');
  has(html, '· 座次表支持拖拽换座', 'v2.18.5 旧条目被删');
});

t('历史注释不被升版波及（v2.18.9 引入版注释保持原样）', () => {
  has(html, "catDelUndo('dirs', dir);   // v2.18.9 同步 revive 所在方向", 'v2.18.9 历史注释被改动');
  has(html, '// v2.18.9 隐式新建/使用大类与方向同样视为「重加」', 'v2.18.9 历史注释被改动');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
