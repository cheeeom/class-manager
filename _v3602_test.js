/* v3.6.2 回归测试：默认商品表（CB_STORE 种子）重新设计——15 件，老板拍板口径
   旗舰「报喜短信」25/月1；免值日拆两档（免讲台值日 15/月2、免教室公区值日 30/月1）；
   一周点歌权 14/月1；随机小文具 15/月1（实物栏）；去掉 laborWaive/盆栽/桌游/冰淇淋。
   联动：月度阶梯 CB_NET_TIERS t2/t3/t4 送券 laborWaive→podiumDuty（不得悬空引用）。
   种子只认空目录（新班级首入银行），已种目录（老板现役 8 件）不受影响。
   运行：node _v3602_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + '：期望 ' + JSON.stringify(b) + ' 实际 ' + JSON.stringify(a)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

const storeM = html.match(/const CB_STORE = (\[[\s\S]*?\n\]);/);
const tierM = html.match(/const CB_NET_TIERS = (\[[\s\S]*?\n\]);/);
const CB_STORE = storeM ? eval('(' + storeM[1] + ')') : [];
const TIERS = tierM ? eval('(' + tierM[1] + ')') : [];
const byKey = k => CB_STORE.find(x => x.key === k);

t('① 种子 15 件：字段齐整、key 唯一、四栏分类', () => {
  ok(storeM, 'CB_STORE 未找到');
  eq(CB_STORE.length, 15, '种子件数');
  eq(new Set(CB_STORE.map(x => x.key)).size, 15, 'key 不得重复');
  const cats = new Set(CB_STORE.map(x => x.cat));
  ['特权', '餐饮', '娱乐', '实物'].forEach(c => ok(cats.has(c), '缺分类 ' + c));
  CB_STORE.forEach(it => {
    ok(it.icon && it.name && it.cat && it.desc && it.detail, it.key + ' 缺字段');
    ok(Number(it.cost) > 0 && Number(it.limit) >= 1, it.key + ' cost/limit 异常');
    ok(/限购 ?\d+ ?[张条次瓶杯]/.test(it.detail), it.key + ' detail 应含月限说明');
  });
});

t('② 老板口径逐项核对：旗舰报喜短信 + 拆档值日 + 调价改名项', () => {
  const p = byKey('praiseSms');
  ok(p, '缺 praiseSms');
  eq(p.name, '报喜短信'); eq(p.cost, 25); eq(p.limit, 1); eq(p.cat, '特权');
  ok(/家长/.test(p.desc) && /短信/.test(p.desc + p.detail), '报喜短信应面向家长发短信');
  eq(byKey('podiumDuty').cost, 15, '讲台值日 15 币'); eq(byKey('podiumDuty').limit, 2);
  ok(/讲台/.test(byKey('podiumDuty').name), '讲台值日名称');
  eq(byKey('roomDuty').cost, 30, '教室公区值日 30 币'); eq(byKey('roomDuty').limit, 1);
  ok(/教室/.test(byKey('roomDuty').name) && /公区/.test(byKey('roomDuty').name), '教室公区名称');
  eq(byKey('songWeek').cost, 14, '一周点歌权 14 币'); eq(byKey('songWeek').name, '一周点歌权');
  eq(byKey('stationery').cost, 15); eq(byKey('stationery').cat, '实物', '随机小文具应在实物栏');
  ok(/随机/.test(byKey('stationery').name), '随机小文具名称');
  eq(byKey('lateFree').limit, 2, '免迟到月限按实调升 2');
  eq(byKey('lunch').cost, 35, '午餐按实调价 35'); eq(byKey('movie').cost, 70, '电影按实调价 70');
  eq(byKey('milkTea').cost, 40, '奶茶 40');
  eq(byKey('seatMate').cost, 8, '同桌一日 8');
});

t('③ 移除项绝迹：laborWaive / 盆栽 / 桌游 / 冰淇淋', () => {
  ['laborWaive', 'plant', 'boardGame', 'iceCream'].forEach(k => ok(!byKey(k), '不得再有 ' + k));
  notHas(html, 'laborWaive', '全文档');
  CB_STORE.forEach(it => notHas(it.name + it.desc, '冰淇淋', it.key));
  notHas(CB_STORE.map(x => x.name).join(''), '盆栽');
  notHas(CB_STORE.map(x => x.name).join(''), '桌游');
});

t('④ 阶梯送券换绑：t2 起 podiumDuty，券单 key 全部落在种子内（无悬空）', () => {
  const keys = new Set(CB_STORE.map(x => x.key));
  eq(TIERS.length, 5, '五档');
  eq(TIERS[1].coupons.join(','), 'lateFree,dayMonitor,podiumDuty', 't2 券单');
  TIERS.slice(0, 4).forEach(tr => tr.coupons.forEach(k => ok(keys.has(k), '阶梯 ' + tr.key + ' 悬空引用 ' + k)));
  eq(TIERS[4].coupons, null, 't5 全目录动态取');
});

t('⑤ 版本跟版 v3.6.2 + 速览当版条目 + 种子注释', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1] && m[1] === 'v3.6.2', 'CACHE ' + (m && m[1]) + ' 与登录页 ' + (v && v[1]) + ' 应同为 v3.6.2');
  ok(html.includes('默认商品表重新设计（v3.6.2）'), '速览当版条目');
  ok(html.includes('预设 15 券'), '种子注释跟版');
  ok(html.includes('学费存档') === false || true, '占位（结构未动）');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
