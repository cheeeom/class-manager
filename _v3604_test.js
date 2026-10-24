/* v3.6.4 回归测试：「补齐默认商品」按钮——老班级一键补入默认表缺失项
   契约：cbStoreSeedMissing 按 key 判缺（改名/下架算在店）；cbStoreSeedFill 直写
   store.items 保留种子 key + builtin:true（不走 cbSaveStoreItem 的 c+自增，防阶梯错号）；
   按钮仅在有缺失时渲染；确认弹窗逐件列明。
   运行：node _v3604_test.js */
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

const storeM = html.match(/const CB_STORE = (\[[\s\S]*?\n\]);/);
const CB_STORE = storeM ? eval('(' + storeM[1] + ')') : [];

// 与实现同构的差集纯逻辑（cbStoreSeedMissing 的核心语义）
function missingOf(shopKeys) {
  const have = new Set(shopKeys);
  return CB_STORE.filter(it => !have.has(it.key));
}

t('① 函数与按钮接线', () => {
  has(html, 'function cbStoreSeedMissing()', 'cbStoreSeedMissing');
  has(html, 'function cbStoreSeedFill()', 'cbStoreSeedFill');
  has(html, 'onclick="cbStoreSeedFill()"', '按钮 onclick');
  has(html, '📥 补齐默认商品', '按钮文案');
  has(html, 'cbStoreSeedMissing().length ?', '按钮仅在有缺失时渲染');
});

t('② 补入走直写路径：保留种子 key、builtin:true（不走 c+自增新建）', () => {
  has(html, 'b.store.items.push({ key: it.key', '直写 push 且 key 用种子 key');
  has(html, 'builtin: true, on: true, upd: now', '补入项 builtin/on');
  // cbStoreSeedFill 内不得出现 cbSaveStoreItem 调用（会把 key 改成 c+自增、builtin:false）；切片以下一个函数定义为界
  const fs0 = html.indexOf('function cbStoreSeedFill()');
  const fn = html.slice(fs0, html.indexOf('\nfunction ', fs0 + 10));
  ok(fn.length > 200, '函数体切片异常');
  ok(!/cbSaveStoreItem\(/.test(fn), '补齐不得走 cbSaveStoreItem（c+自增会与阶梯送券错号）');
});

t('③ 确认弹窗与完成反馈逐件列明', () => {
  const fn = html.slice(html.indexOf('function cbStoreSeedFill()'), html.indexOf('function cbStoreSeedFill()') + 1600);
  has(fn, 'confirm(', '原生确认弹窗（同结算惯例）');
  has(fn, '已有的商品、价格、上下架状态一律不动', '不动已有项的说明');
  has(fn, '已补齐', '完成 toast');
  has(fn, 'cbPersist()', '落盘');
  has(fn, 'renderBankPage()', '补完重渲染');
  has(fn, '默认商品已齐', '零缺失时的提示分支');
});

t('④ 差集语义：按 key 判缺（老板现役店仿真）', () => {
  // 老板现役 8 件（含已从默认表移除的 laborWaive 与一个自定义 c9）
  const bossShop = ['lateFree', 'lunch', 'dayMonitor', 'movie', 'laborWaive', 'seatMate', 'milkTea', 'c9'];
  const miss = missingOf(bossShop);
  ok(miss.length === CB_STORE.length - 6, '应缺 ' + (CB_STORE.length - 6) + ' 件（在店 6 件），实际 ' + miss.length);
  ok(miss.some(x => x.key === 'praiseSms'), '报喜短信应在补齐清单');
  ok(!miss.some(x => x.key === 'laborWaive'), '老 key（已移出默认表）不在补齐清单');
  // 全齐 → 0；下架/改名不改判缺（按 key）
  ok(missingOf(CB_STORE.map(x => x.key)).length === 0, '全齐时零缺失');
  ok(missingOf(['lateFree']).length === CB_STORE.length - 1, '只有一个在店时缺其余全部');
});

t('⑤ 版本一致性（动态跟版）+ 速览条目 + 默认表未动', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（版本从 CACHE 反推，无需随版改）');
  has(html, '补齐默认商品（v3.6.4）', '速览历史条目（v3.6.4）仍在');
  ok(CB_STORE.length === 15, 'CB_STORE 保持 15 件');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
