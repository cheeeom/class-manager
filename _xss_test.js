/* XSS 加固回归测试（v2.8.1）
   从 index.html 抽取真实的 escapeHtml / escapeAttr 实现，
   锁死"属性上下文注入"修复——防止将来有人把实现改回 textContent→innerHTML 的旧写法。
   运行：node _xss_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// 抽取函数定义（函数声明块）
function extractFn(name) {
  const re = new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + name);
  return eval('(' + m[0] + ')');
}
const escapeHtml = extractFn('escapeHtml');
const escapeAttr = extractFn('escapeAttr');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== escapeHtml（v2.8.1 属性上下文加固） ===');

t('普通文本原样保留', () => eq(escapeHtml('张三'), '张三'));

t('尖括号被转义', () => {
  eq(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

t('双引号被转义（属性上下文关键）', () => {
  eq(escapeHtml('a"onmouseover="alert(1)'), 'a&quot;onmouseover=&quot;alert(1)');
});

t('单引号被转义（单引号属性上下文关键）', () => {
  eq(escapeHtml("x'onclick='alert(1)"), 'x&#39;onclick=&#39;alert(1)');
});

t('& 先转义，不二次转义', () => {
  // &amp; 进来应变成 &amp;amp;（& 最先替换），而不是把已有实体原样吞掉再转义出错误结果
  eq(escapeHtml('&amp;'), '&amp;amp;');
  eq(escapeHtml('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
});

t('姓名带标签不构成注入', () => {
  const name = '张<script>alert(1)</script>';
  const out = escapeHtml(name);
  if (/<script/i.test(out)) throw new Error('输出仍含 <script');
  eq(out, '张&lt;script&gt;alert(1)&lt;/script&gt;');
});

t('null / undefined 安全返回空串', () => {
  eq(escapeHtml(null), '');
  eq(escapeHtml(undefined), '');
});

t('数字正常转换', () => eq(escapeHtml(12), '12'));

console.log('=== escapeAttr（受限属性白名单） ===');

t('安全字符保留', () => {
  eq(escapeAttr('tag-a_1 中文'), 'tag-a_1 中文');
});

t('危险字符全部丢弃', () => {
  // 剥离后只剩无害字母数字：a"><script>… → a + script + alert1 + script
  eq(escapeAttr('a"><script>alert(1)</script>'), 'ascriptalert1script');
  eq(escapeAttr("x'y"), 'xy');
});

t('null / undefined 安全返回空串', () => {
  eq(escapeAttr(null), '');
  eq(escapeAttr(undefined), '');
});

console.log('=== onclick 字面量注入修复（结构断言） ===');

t('removeStudentTag / toggleStudentTag 按索引调用，不再拼标签字面量', () => {
  if (/removeStudentTag\(\$\{id\},'/.test(html)) throw new Error('removeStudentTag 仍在拼字符串字面量');
  if (/toggleStudentTag\(\$\{id\},'/.test(html)) throw new Error('toggleStudentTag 仍在拼字符串字面量');
  if (!/function removeStudentTag\(id, tagIdx\)/.test(html)) throw new Error('removeStudentTag 未改为 tagIdx 签名');
  if (!/function toggleStudentTag\(id, tagIdx\)/.test(html)) throw new Error('toggleStudentTag 未改为 tagIdx 签名');
});

t('toast 用 textContent 渲染，不再 innerHTML 拼消息', () => {
  const m = html.match(/function showToast[\s\S]*?\n}/);
  if (!m) throw new Error('未找到 showToast');
  if (/t\.innerHTML\s*=/.test(m[0])) throw new Error('showToast 仍使用 innerHTML 拼接');
  if (!/textContent\s*=\s*msg/.test(m[0])) throw new Error('showToast 未对 msg 用 textContent');
});

t('导入预览不再把 JSON 拼进 onclick', () => {
  if (/confirmImport\(\$\{JSON\.stringify/.test(html)) throw new Error('导入确认仍把数据拼进 onclick');
  if (!/let _importPreview/.test(html)) throw new Error('缺少 _importPreview 暂存变量');
});

console.log('========================================');
console.log(` 通过 ${pass} 项，失败 ${fail} 项`);
console.log('========================================');
process.exit(fail ? 1 : 0);
