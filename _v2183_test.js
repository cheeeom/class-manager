/* v2.17.30 回归测试：设置页底部新增「关于本系统」（开发作者 chee + 版本徽标 + 近版更新速览）
   运行：node _v2183_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.2（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.2</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.2 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.2')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 设置页「关于本系统」区块 ===');
t('区块存在于设置页最底部（跨电脑指南之后）', () => {
  const iGuide = html.indexOf('📋 跨电脑使用指南');
  const iAbout = html.indexOf('id="settingsAbout"');
  ok(iGuide > 0 && iAbout > iGuide, 'settingsAbout 应在跨电脑使用指南之后（guide=' + iGuide + ' about=' + iAbout + '）');
  const iClose = html.indexOf('</div>', html.indexOf('settingsReleaseNotes'));
  ok(iAbout > 0, '缺 settingsAbout');
});
t('开发作者 = chee', () => {
  has(html, '开发作者：<b style="color:var(--primary)">chee</b>', '缺作者署名');
});
t('版本徽标与全局版本一致（v2.18.2，随升版自动跟版）', () => {
  has(html, '🏷️ v2.18.2</span>', '设置页版本徽标未跟版');
});
t('近版更新速览内容齐（v2.18.2 本期五条：零扣分榜天数排名 / 预警迁学生页 / 彩徽章 / 快捷按钮移除 / 座次直排+chee标注）', () => {
  has(html, 'id="settingsReleaseNotes"', '缺 notes 容器');
  has(html, '近版更新速览', '缺标题');
  has(html, '零扣分榜改为按「未扣分天数」排名', '缺零扣分榜说明');
  has(html, '预警中心迁至「学生管理', '缺预警迁移说明');
  has(html, '学分全站彩色徽章', '缺徽章说明');
  has(html, '行内 +1/+5/-1/-5', '缺快捷按钮移除说明');
  has(html, '点座位卡片即可安排 / 更换学生', '缺座次说明');
  has(html, '登录页标注开发者 chee', '缺登录页作者说明');
});
t('区块风格沿用 settings-section / 主色徽标（样式一致性冒烟）', () => {
  const seg = html.slice(html.indexOf('id="settingsAbout"') - 200, html.indexOf('id="settingsReleaseNotes"') + 400);
  has(seg, 'settings-section', '未沿用 settings-section');
  has(seg, 'rgba(166,58,43', '未用主题主色');
});

console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
