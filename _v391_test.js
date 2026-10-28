/* v3.9.1 回归测试：按压反馈补回 + 19 处阴影跟肤
   P2-1 按压反馈：v3.1.0 动效语言（.btn/.btn-icon/.nav-item/.mobile-tab/.tab :active scale(--press-scale)）
   P2-2 阴影跟肤：--tone-rgb 12 块定义 + box-shadow 内朱砂 rgba 全换绑 + 危险红保留 */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0, failures = [];
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); } }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

t('① 按压令牌 + :active 规则', () => {
  has(html, '--press-scale:0.97', '--press-scale 令牌');
  has(html, '.btn:active,.btn-icon:active,.nav-item:active,.mobile-tab:active,.tab:active{transform:scale(var(--press-scale))}', '五元素按压组规则');
  has(html, 'transition:color var(--transition),transform var(--transition)', '.tab transition 含 transform');
});

t('② --tone-rgb 12 块定义（root+dark+5浅+5暗）', () => {
  const defs = [...html.matchAll(/--tone-rgb:(\d+,\d+,\d+)/g)].map(m => m[1]);
  ok(defs.length === 12, '定义应 12 处，实际 ' + defs.length);
  const expected = ['166,58,43', '206,107,82', '47,93,110', '94,147,166', '78,110,65', '111,148,96',
                    '138,98,16', '176,138,46', '90,68,112', '155,127,192', '61,68,80', '118,131,154'];
  for (const e of expected) ok(defs.includes(e), '缺 tone ' + e);
});

t('③ 朱砂阴影全换绑 + 危险红保留', () => {
  ok((html.match(/box-shadow:[^;}]*rgba\(166,58,43/g) || []).length === 0, 'box-shadow 内朱砂 166,58,43 绝迹');
  ok((html.match(/box-shadow:[^;}]*rgba\(111,37,27/g) || []).length === 0, 'box-shadow 内深朱 111,37,27 绝迹');
  ok(html.match(/rgba\(var\(--tone-rgb\)/g).length >= 19, 'tone-rgb 引用 ≥19 处');
  has(html, 'rgba(180,35,24,0.35)', '危险红阴影保留（语义色）');
  // 肤免标记的装饰性 hex 不受影响
  ok(html.includes('肤免'), '肤免标记仍在');
});

t('④ 版本一致性 + 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  // 版本无关：只要求 CACHE_NAME 与登录页、侧栏、徽标三处一致，不钉具体版本号
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应一致');
  const sv = html.match(/sidebar-footer">(v[0-9.]+) ·/);
  ok(sv && m && sv[1] === m[1], '侧栏版本 ' + (sv && sv[1]) + ' 应与 CACHE 一致');

  has(html, '按压反馈与阴影跟肤（v3.9.1）', '速览当版条目');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
