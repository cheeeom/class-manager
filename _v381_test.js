/* v3.8.1 回归测试：兑换体验优化——3 天有效期 + 卡片加减 + 浮条可点 + 补印单张
   ① 兑换二维码有效期 10 分钟→3 天（两端常量同步、倒计时天级显示、文案更新）；
   ② 商品卡片已加购时直接显示 −/＋ 步进（币不足也能在卡片上减，不必进购物车）；
   ③ 底部浮条整条可点（含币不足时点开购物车核对）；
   ④ 补印单张：面板「🖨 补印单张」按姓名打印一张卡（导卡函数拆出 portalCardsHtml/openPortalPrint 复用）。
   运行：node _v381_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const portal = fs.readFileSync(__dirname + '/portal/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

t('① 有效期 3 天（两端同步 + 天级倒计时 + 文案）', () => {
  has(html, 'const PORTAL_REDEEM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;', '老师端 3 天');
  has(portal, 'var REDEEM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;', '学生端 3 天');
  notHas(portal, 'REDEEM_WINDOW_MS = 10 * 60 * 1000', '10 分钟残留');
  has(portal, "var d = Math.floor(left / 86400000);", '天级计算');
  has(portal, "(d + ' 天 ' + h + ' 小时')", '天+小时显示');
  has(portal, '生成后请在 3 天内出示', '清单文案');
  has(portal, '（3 天内有效 · 过期作废可重新生成）', '二维码页文案');
  has(html, '兑换码已过期（有效期 3 天）', '老师端过期文案');
});

t('② 商品卡片加减 + 浮条整条可点', () => {
  has(portal, '.cardqty', '卡片步进样式');
  has(portal, "onclick=\"chgQty(\\'' + esc(g.key) + '\\',-1)\"", '卡片 − 按钮');
  has(portal, "onclick=\"chgQty(\\'' + esc(g.key) + '\\',1)\"", '卡片 ＋ 按钮');
  has(portal, 'if(inCart > 0){', '已加购才显示步进');
  has(portal, '<div class="cartbar" id="cartbar" onclick="openCart()">', '浮条整条可点');
  // 每张卡恰好一个控件（步进或加购钮）
  ok(portal.includes("ctl = '<span class=\"cardqty\">") && portal.includes("ctl = '<button class=\"addbtn\""), '三态控件');
});

t('③ 补印单张（拆分复用 portalCardsHtml/openPortalPrint）', () => {
  has(html, 'function reprintPortalCard()', '补印函数');
  has(html, "onclick=\"reprintPortalCard()\">🖨 补印单张</button>' +", '面板按钮');
  has(html, 'function portalCardsHtml(studs)', '卡片 HTML 构造（可复用）');
  has(html, 'function openPortalPrint(html)', '打印窗口（唯一）');
  ok((html.match(/window\.open\('', '_blank'\)/g) || []).length === 1, 'window.open 应恰 1 处（openPortalPrint 内）');
  has(html, "showToast('有 ' + hits.length + ' 个同名学生", '重名拦截');
  has(html, '该生没有学号，请先在学生页补齐', '无学号拦截');
});

t('④ 版本一致性（动态跟版）+ 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（从 CACHE 反推）');
  has(html, '兑换体验优化（v3.8.1）', '速览历史条目（v3.8.1）仍在');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
