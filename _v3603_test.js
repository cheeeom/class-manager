/* v3.6.3 回归测试：阶梯送券「实时目录 → 种子表」双查兜底
   背景：v3.6.2 阶梯送券 laborWaive→podiumDuty 换绑后，目录里没有新种子商品的
   老班级（如老板现役 8 件店）出现两个症状：①阶梯文案露出英文 key；
   ②cbGiveVoucher 反查目录落空 return null——勤学/优秀/卓越档结算静默漏发一张券。
   修法：cbStoreSeedOf/cbStoreNameOf 双查，三处接线（结算确认弹窗/概览阶梯表/发券快照）。
   运行：node _v3603_test.js */
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
const tierM = html.match(/const CB_NET_TIERS = (\[[\s\S]*?\n\]);/);
const CB_STORE = storeM ? eval('(' + storeM[1] + ')') : [];
const TIERS = tierM ? eval('(' + tierM[1] + ')') : [];
const seedKeys = new Set(CB_STORE.map(x => x.key));

t('① 兜底函数存在且实现为双查（目录 → 种子）', () => {
  has(html, 'function cbStoreSeedOf(key)', 'cbStoreSeedOf');
  has(html, 'function cbStoreNameOf(key)', 'cbStoreNameOf');
  has(html, 'cbStoreItemByKey(key) || cbStoreSeedOf(key)', 'cbStoreNameOf 双查实现');
});

t('② 三处接线：结算弹窗 / 概览阶梯表 / 发券快照', () => {
  has(html, 't.coupons.map(cbStoreNameOf).join(\' / \')', '两处券名渲染（confirm 与概览同构）');
  ok(html.split('map(cbStoreNameOf)').length - 1 >= 2, 'cbStoreNameOf 应至少接线 2 处渲染，实际 ' + (html.split('map(cbStoreNameOf)').length - 1));
  has(html, 'var it = cbStoreItemByKey(key) || cbStoreSeedOf(key);', '发券快照兜底');
  has(html, '阶梯送券不落空', '接线注释');
});

t('③ 阶梯券 key 全部能落到中文名（无 key 泄露路径）', () => {
  ok(TIERS.length === 5, '五档');
  TIERS.slice(0, 4).forEach(tr => (tr.coupons || []).forEach(k => {
    ok(seedKeys.has(k), '阶梯 ' + tr.key + ' 的 ' + k + ' 不在种子表');
    const name = (CB_STORE.find(x => x.key === k) || {}).name || '';
    ok(/[\u4e00-\u9fff]/.test(name), k + ' 种子名应为中文：' + name);
  }));
  // 旧 key 悬空引用不得回潮
  ok(!html.includes("'laborWaive'"), 'laborWaive 不得回潮');
});

t('④ 老目录场景仿真：种子表能兜出阶梯全部券名与图标', () => {
  // 老板现役店 8 件（无 podiumDuty）：cbStoreSeedOf('podiumDuty') 应得完整商品
  const p = CB_STORE.find(x => x.key === 'podiumDuty');
  ok(p && p.name === '免讲台值日券' && p.cost === 15 && p.icon, 'podiumDuty 种子完整');
  const oldShopKeys = ['lateFree', 'lunch', 'dayMonitor', 'movie', 'laborWaive', 'seatMate', 'milkTea', 'hwLong'];
  TIERS.slice(0, 4).forEach(tr => (tr.coupons || []).forEach(k => {
    const fallback = CB_STORE.find(x => x.key === k);
    ok(fallback && fallback.icon, '即使目录没有 ' + k + '，种子兜底须含 icon（发券快照用）');
  }));
});

t('⑤ 版本跟版 v3.6.3 + 速览条目 + CB_STORE 未动', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1] && m[1] === 'v3.6.3', 'CACHE ' + (m && m[1]) + ' 与登录页 ' + (v && v[1]) + ' 应同为 v3.6.3');
  has(html, '阶梯送券兜底（v3.6.3）', '速览当版条目');
  ok(CB_STORE.length === 15, 'CB_STORE 应保持 15 件（本版未动表），实际 ' + CB_STORE.length);
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
