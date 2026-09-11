/* v2.18.12 回归测试：云同步推送失败「报错人话化 + 退避重试」。
   运行：node _v2191_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

function extractFn(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return eval('(' + buf.join('\n') + ')');
}
const friendlyPushError = extractFn('friendlyPushError');

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== friendlyPushError 报错人话化 ===');
t('GET SHA 401 → 提示重新配置 Token', () => {
  eq(friendlyPushError('GET SHA failed: 401'), 'GitHub Token 已失效或权限不足，请到设置页重新配置 Token');
});
t('GET SHA 403 → 提示重新配置 Token', () => {
  eq(friendlyPushError('GET SHA failed: 403'), 'GitHub Token 已失效或权限不足，请到设置页重新配置 Token');
});
t('PUT 422 → 并发更新，自动重试', () => {
  eq(friendlyPushError('PUT failed: 422 validation'), '云端数据有并发更新，将自动重试');
});
t('网络类错误 → 自动重试', () => {
  eq(friendlyPushError('Failed to fetch'), '网络连接失败，将自动重试');
  eq(friendlyPushError('NetworkError'), '网络连接失败，将自动重试');
});
t('口令相关错误原样保留（已人话）', () => {
  const m = '云端数据无法解密（口令与其他设备不一致？），已阻止推送以免覆盖';
  eq(friendlyPushError(m), m);
});
t('未知错误原样返回', () => {
  eq(friendlyPushError('some unknown error'), 'some unknown error');
});

console.log('\n=== 退避重试逻辑源码护栏 ===');
t('退避重试分支存在', () => {
  has(html, '退避重试第', '退避重试日志');
  has(html, '_pushRetryCount++', '重试计数自增');
  has(html, 'Math.min(30000, 3000 * Math.pow(2, _pushRetryCount - 1))', '指数退避延迟');
});
t('可恢复/不可恢复分类', () => {
  has(html, 'var recoverable = /网络|并发|重试/.test(msg) && !/口令|Token|加密/.test(msg)', '分类逻辑');
  has(html, 'PUSH_MAX_RETRY = 4', '重试上限');
});
t('成功时清零重试计数', () => {
  has(html, '_pushRetryCount = 0;\n        dbg', '成功回调清零');
});
t('friendlyPushError 被 catch 调用', () => {
  has(html, "var msg = friendlyPushError(e.message || '')", 'catch 里转译错误');
});
t('旧「裸报错」已移除', () => {
  const bad = html.indexOf("showToast('云端同步失败: ' + e.message.substring(0,80)");
  eq(bad, -1, '不得残留旧的裸 e.message 报错');
});

console.log('\n=== 版本 ===');
t('版本标记统一 v2.18.12', () => {
  has(html, '<div class="login-version">v2.18.12</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.12 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.12</span>', '设置徽标');
  has(fs.readFileSync('sw.js', 'utf8'), "CACHE_NAME = 'class-manager-v2.18.12'", 'SW');
});
t('近版更新速览含新条', () => {
  has(html, '云同步推送失败自动重试', 'notes 新条');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
