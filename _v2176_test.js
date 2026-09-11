/* v2.17.30 回归测试：弹窗头部统一（.modal-header/.modal-close 补基础样式，× 圆键居右）——
   档案编辑/成长记录/工作留痕/荣誉四个弹窗的关闭键从此告别「标题下方左缘」，与全站 .panel-close 设计语言一致。
   运行：node _v2176_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.18.10 版本三处同步 ===');
t('登录页 / 侧栏 / SW CACHE_NAME = v2.18.10', () => {
  if (!/login-version">v2\.18\.10</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.10 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!fs.readFileSync('sw.js', 'utf8').includes('class-manager-v2.18.10')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 弹窗头部 CSS 基础样式（v2.17.30 修复点） ===');
t('.modal-header 已启用 flex 标题居左 + 关闭键居右', () => {
  has(html, '.modal-header{display:flex;align-items:center;justify-content:space-between', '缺 flex 布局');
  has(html, '.modal-header h3{margin:0}', '缺标题 margin 复位');
  has(html, 'border-bottom:1px solid var(--border)', '缺底部分隔线');
});
t('.modal-close 已统一为圆形描边 + hover 红轻旋（与 .panel-close 同语言）', () => {
  has(html, '.modal-close{width:30px;height:30px;border-radius:50%', '缺圆形样式');
  has(html, '.modal-close:hover{border-color:var(--danger);color:var(--danger);', '缺 hover 变红');
  has(html, 'transform:rotate(90deg)', '缺 hover 旋转');
});
t('.panel-close 设计语言未破坏（仍 34px 圆形 + hover 红轻旋，v2.14.0 起）', () => {
  has(html, '.panel-close{width:34px;height:34px;border-radius:50%', '缺 .panel-close 圆形');
  has(html, '.panel-close:hover{', '缺 .panel-close hover');
});

console.log('\n=== 四个带 header 的弹窗共用同一套 CSS ===');
const headerModals = ['profileEditModal', 'timelineModal', 'workLogModal', 'honorModal'];
headerModals.forEach(id => {
  t(`#${id} 含 .modal-header + h3 + button.modal-close（关闭键居右圆形）`, () => {
    const re = new RegExp(`id="${id}"[\\s\\S]*?<div class="modal-header">[\\s\\S]*?<h3[\\s\\S]*?</h3>[\\s\\S]*?<button class="modal-close"[^>]*>×</button>[\\s\\S]*?</div>`);
    if (!re.test(html)) throw new Error(`未匹配 #${id} 的 modal-header 结构`);
  });
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);