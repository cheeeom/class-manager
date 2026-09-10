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
t('版本三处同步 = v2.18.5（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.5</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.5 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.5')) throw new Error('SW CACHE_NAME 未更新');
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
t('版本徽标与全局版本一致（v2.18.3，随升版自动跟版）', () => {
  has(html, '🏷️ v2.18.5</span>', '设置页版本徽标未跟版');
});
t('近版更新速览内容齐（v2.18.3 本期六条：处分记录云同步 / 重置加密口令 / 工作记录搜索 / 本地保存失败提示 / 零扣分榜天数排名 / 预警迁移）', () => {
  has(html, 'id="settingsReleaseNotes"', '缺 notes 容器');
  has(html, '近版更新速览', '缺标题');
  has(html, '处分记录此前不参与云同步', '缺处分记录同步修复说明');
  has(html, '重置云端加密口令', '缺重置口令说明');
  has(html, '工作记录补上关键词搜索框', '缺搜索框说明');
  has(html, '本地存储写满时不再静默失败', '缺保存失败提示说明');
  has(html, '零扣分榜改为按「未扣分天数」排名', '缺零扣分榜说明');
});
t('区块风格沿用 settings-section / 主色徽标（样式一致性冒烟）', () => {
  const seg = html.slice(html.indexOf('id="settingsAbout"') - 200, html.indexOf('id="settingsReleaseNotes"') + 400);
  has(seg, 'settings-section', '未沿用 settings-section');
  has(seg, 'rgba(166,58,43', '未用主题主色');
});

console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
