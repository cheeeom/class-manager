/* v2.20.0 回归测试：全员 inline 事件处理函数存在性检查。
   背景：v2.19.3 曾因「导出行引用不存在的函数 → 脚本中段死亡」导致整片按钮无声失效。
   本套件扫描 index.html 全部 onclick/oninput/onchange/onblur 处理器，
   断言其引用的每个函数都在主脚本中声明——堵死「按钮无声死亡」整类事故。
   运行：node _v21203_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}

// 全局内建白名单（非本应用函数）
const BUILTIN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new',
  'document', 'window', 'event', 'this', 'Math', 'String', 'Number', 'Date', 'JSON', 'Object', 'Array',
  'Boolean', 'Promise', 'confirm', 'alert', 'setTimeout', 'setInterval', 'parseFloat', 'parseInt',
  'fetch', 'URL', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'btoa', 'atob', 'history',
  'navigator', 'location', 'localStorage', 'sessionStorage', 'console', 'crypto']);

console.log('=== 静态检查 ===');
t('index.html 版本号已升至 v2.20.7', () => { if (!/v2\.20\.5/.test(html)) throw new Error('未找到 v2.20.7'); });
t('sw.js CACHE_NAME 已跟版 v2.20.3', () => { if (!/class-manager-v2\.20\.7/.test(fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n'))) throw new Error('CACHE_NAME 未跟版'); });
t('学分周报功能已挂载', () => {
  if (html.indexOf('function exportWeeklyReport') < 0) throw new Error('缺少 exportWeeklyReport');
  if (html.indexOf('function drawWeeklyPoster') < 0) throw new Error('缺少 drawWeeklyPoster');
  if (html.indexOf('exportWeeklyReport()') < 0) throw new Error('周报按钮未挂接');
});
t('数据体检卡已接入寝室管理', () => {
  if (html.indexOf('function dormDataIssues') < 0) throw new Error('缺少 dormDataIssues');
  if (html.indexOf('dorm-check') < 0) throw new Error('缺少体检卡样式/渲染');
});

console.log('=== onclick/oninput/onchange/onblur 函数存在性 ===');
// 提取所有内联处理器文本（含 JS 字符串里的 onclick=\" 转义形态）
const handlers = [];
const re = /on(?:click|input|change|blur)\s*=\s*(?:"([^"]*)"|\\?")/g;
let m;
while ((m = re.exec(html))) {
  const raw = m[1] != null ? m[1] : html.slice(m.index + m[0].length, html.indexOf('"', m.index + m[0].length));
  handlers.push({ at: m.index, body: raw });
}
// 从每个处理器提取被调用的标识符
const called = new Map();   // name -> 首次出现位置
handlers.forEach(h => {
  const reId = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  let mm;
  while ((mm = reId.exec(h.body))) {
    const name = mm[1];
    if (!BUILTIN.has(name) && !called.has(name)) called.set(name, h.at);
  }
});
// 主脚本声明集合
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</' + 'script>', scriptStart);
const scriptJs = html.slice(scriptStart + 8, scriptEnd);
const declared = new Set();
const reDecl = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
let md;
while ((md = reDecl.exec(scriptJs))) declared.add(md[1]);
// 全局内建兜底（主脚本里即便没有 function 声明也合法的名字）
const safeGlobal = new Set(['confirm', 'alert', 'setTimeout', 'parseFloat', 'parseInt']);

t('内联处理器引用的函数全部已声明（' + called.size + ' 个）', () => {
  const missing = [];
  called.forEach((at, name) => {
    if (!declared.has(name) && !safeGlobal.has(name)) missing.push(name + ' @char' + at);
  });
  if (missing.length) throw new Error('未声明: ' + missing.join(', '));
});

t('应用按钮的 customCreditApply 已声明（历史事故回归）', () => {
  if (!declared.has('customCreditApply')) throw new Error('customCreditApply 未声明');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 500).unref();
