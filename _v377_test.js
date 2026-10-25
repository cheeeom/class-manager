/* v3.7.7 回归测试：学生端弱网体验——查询下载 25s 超时 + 「学号未找到」格式指路
   背景：老板真机实测——①弱网「查询中」无限转圈（fetchPayload 无超时）；
   ②输错学号格式（20262043，实际为 2602001 系 7 位）只报「未找到」不指路。
   修：fetchWithTimeout(AbortController 25s) 三处接线（CDN/raw 兜底/API 兜底）+
   TIMEOUT 可读文案；学号未找到附格式说明。
   运行：node _v377_test.js */
const fs = require('fs');

const portal = fs.readFileSync(__dirname + '/portal/index.html', 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }

t('① fetchWithTimeout：定义 + 三处接线 + 25s', () => {
  has(portal, 'function fetchWithTimeout(url, ms)', '超时助手');
  has(portal, "new AbortController()", 'AbortController');
  has(portal, "setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, ms || 25000)", '25 秒默认');
  ok((portal.match(/fetchWithTimeout\(/g) || []).length >= 4, '定义+3 处调用 ≥4 次，实际 ' + (portal.match(/fetchWithTimeout\(/g) || []).length);
  ok(!/fetch\(url, \{ cache:'no-store' \}\)\.then/.test(portal.replace(/fetchWithTimeout[\s\S]{0,120}/g, '')), 'CDN 裸 fetch 不残留');
  has(portal, "fetchWithTimeout('https://api.github.com/gists/'", 'API 兜底也走超时');
  has(portal, 'fetchWithTimeout(f.raw_url)', 'truncated raw 兜底走超时');
});

t('② 超时可读文案 + 学号格式指路', () => {
  has(portal, '网络较慢，数据包没能在 25 秒内下载完', '超时文案');
  has(portal, "m.indexOf('TIMEOUT') >= 0 || m.indexOf('abort') >= 0", '超时错误分支');
  has(portal, '（学号以班主任发的查询卡为准，通常为 7 位数字如 2602001）', '格式指路');
  has(portal, 'var _ml = m.toLowerCase();', '错误分支大小写不敏感（OperationError 大写 O 曾永远漏配）');
  has(portal, "_ml.indexOf('operation') >= 0", 'operation 小写匹配');
});

t('③ 既有契约不破坏（v370 锚点抽检）+ 版本 v3.7.7', () => {
  has(portal, 'students[sid]', '按学号取片');
  has(portal, 'FAIL_MAX', '软限速');
  has(portal, 'PBKDF2_ROUNDS = 60000', '派生轮数');
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（动态跟版）');
  has(html, '学生端弱网体验修复（v3.7.7）', '速览历史条目（v3.7.7）仍在');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
