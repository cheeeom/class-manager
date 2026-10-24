/* v3.6.5 回归测试：兑换商店商品卡片按价格升序
   契约：list 构建处（类别过滤后）追加 cost 升序 sort；排序在渲染路径上——
   改价保存 → renderBankPage 重渲染 → 顺序自动更新，无需额外触发。
   运行：node _v3605_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }

const SORT_EXPR = "var list = cbStoreItems().filter(function(it){ return !cbBankCat || it.cat === cbBankCat; })";
const CMP = "return (Number(a.cost) || 0) - (Number(b.cost) || 0);";

t('① 渲染列表按价格升序（类别过滤后追加 sort）', () => {
  has(html, SORT_EXPR, 'list 构建行');
  const i = html.indexOf(SORT_EXPR);
  const win = html.slice(i, i + 400);
  has(win, '.sort(function(a, b){ ' + CMP + ' })', '升序比较器');
});

t('② 排序逻辑仿真：乱序改价后升序、同价保持目录序', () => {
  const items = [{ k: 'a', cost: 70 }, { k: 'b', cost: 8 }, { k: 'c', cost: 15 }, { k: 'd', cost: 15 }, { k: 'e', cost: 40 }];
  const sorted = items.slice().sort(function(a, b){ return (Number(a.cost) || 0) - (Number(b.cost) || 0); });
  ok(JSON.stringify(sorted.map(x => x.k)) === JSON.stringify(['b', 'c', 'd', 'e', 'a']), '升序+同价稳定：' + sorted.map(x => x.k).join(','));
  // 改价：把 a 从 70 改到 3 → 应排最前
  items[0].cost = 3;
  const re = items.slice().sort(function(a, b){ return (Number(a.cost) || 0) - (Number(b.cost) || 0); });
  ok(re[0].k === 'a', '改价后重排（a 3 币应居首）');
});

t('③ 版本 v3.6.5 一致性 + 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1] && m[1] === 'v3.6.5', 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同为 v3.6.5');
  has(html, '商品卡片按价格升序（v3.6.5）', '速览当版条目');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
