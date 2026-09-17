/* v2.20.4 回归测试：奖励资格线（总分 <100 的差异化政策）
   规则（老板拍板，写死 100 不可调）：
     总分 ≥100：月度阶梯奖励正常结算 / 加分发币 1:1 / 兑换商店开放
     总分  <100：当月净增不参与定档（不发月度奖励）/ 加分发币打 5 折 / 兑换商店关闭
   覆盖：
     ① cbRewardEligible —— 资格线判定边界（99 / 100）
     ② cbCoinOfAmount —— 单笔加分发币额（系数由「加分后总分」决定，1 分打 5 折 = 0.5 币）
     ③ cbCoinOfOp —— 单笔流水计币额；无 coin 字段时按 amount 兜底
        （历史流水的「回溯打折」不在这里做，由 v2.20.5 的 ensureOpCoin 负责，见 _v2205_test.js）
     ④ cbFmtCoin —— 0.5 币的显示格式
     ⑤ cbCoinMap —— 折扣 + 历史兼容 + 撤销排除 + 银行流水 的聚合
     ⑥ cbDoSettle —— 总分 <100 一律不发（币与券都不发）；blocked 只统计「净增达标被挡下」
     ⑦ cbRedeem —— 总分 <100 不可兑换（核心层拦截，绕过 UI 也拦得住）
     ⑧ 静态：常量/函数唯一、发币系数写入流水、UI 文案与商店门禁
   运行：node _v2204_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + `不应包含 ${JSON.stringify(b)}`); }

/* ---------- 抽取工具（按花括号配平，支持多行函数） ---------- */
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
function extractConstRaw(name) {
  const single = html.match(new RegExp('const ' + name + ' = [^\\n]*;'));
  if (single) return single[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '');
  const arr = html.match(new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n\\];'));
  if (arr) return arr[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '');
  throw new Error('未找到常量 ' + name);
}

/* ---------- 模块级常量（eval 抽出的函数按名闭包引用，须同名提供） ---------- */
const CB_REWARD_MIN = eval(extractConstRaw('CB_REWARD_MIN'));
const CB_COIN_DISCOUNT = eval(extractConstRaw('CB_COIN_DISCOUNT'));
const CB_NET_TIERS = eval('(' + extractConstRaw('CB_NET_TIERS') + ')');
const CB_ALERT_TIERS = eval('(' + extractConstRaw('CB_ALERT_TIERS') + ')');
const CB_ALERT_MIN = eval(extractConstRaw('CB_ALERT_MIN'));
const CB_STORE = eval('(' + extractConstRaw('CB_STORE') + ')');

var state = { className: '', students: [], operations: [], creditBank: null };
var toastLog = [];
function showToast(msg) { toastLog.push(String(msg)); }

const cbDefaultBank = extractFn('cbDefaultBank');
const cbBankSafe = extractFn('cbBankSafe');
const cbStoreItems = extractFn('cbStoreItems');
const cbStoreAll = extractFn('cbStoreAll');
const cbStoreItemByKey = extractFn('cbStoreItemByKey');
const cbWalletKey = extractFn('cbWalletKey');
const cbWallet = extractFn('cbWallet');
const cbVouchers = extractFn('cbVouchers');
const cbMonthKey = extractFn('cbMonthKey');
const cbMonthOfTs = extractFn('cbMonthOfTs');
const cbSname = extractFn('cbSname');
const cbPushLedger = extractFn('cbPushLedger');
const cbGiveVoucher = extractFn('cbGiveVoucher');
const cbSettleLv3Coupons = extractFn('cbSettleLv3Coupons');
const cbSettleTier = extractFn('cbSettleTier');
const cbMonthNetOf = extractFn('cbMonthNetOf');
const cbStoreItemCost = extractFn('cbStoreItemCost');
const cbStoreUsedCount = extractFn('cbStoreUsedCount');
const cbRewardEligible = extractFn('cbRewardEligible');
const cbCoinOfAmount = extractFn('cbCoinOfAmount');
const cbCoinOfOp = extractFn('cbCoinOfOp');
const cbFmtCoin = extractFn('cbFmtCoin');
const cbCoinMap = extractFn('cbCoinMap');
const cbCoinsOf = extractFn('cbCoinsOf');
const cbDoSettle = extractFn('cbDoSettle');
const cbRedeem = extractFn('cbRedeem');

let opId = 1;
function mkOp(sid, amount, coin, time) {
  const o = { id: opId++, studentId: sid, studentName: sid, amount: amount, reason: '测试', time: time || Date.now() };
  if (coin !== undefined) o.coin = coin;      // 不传 = 模拟 v2.20.4 之前的历史记录（无 coin 字段）
  return o;
}
function mkStudent(id, name, credit) { return { id: id, name: name, sid: '', credit: credit, creditBase: 0 }; }
function freshState(students, ops) {
  state = { className: '', students: students || [], operations: ops || [], creditBank: cbDefaultBank() };
  toastLog = [];
  return state;
}
const MONTH = cbMonthKey();

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('四处跟版 v2.20.6（登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME）', () => {
  has(html, '<div class="login-version">v2.20.6</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">v2.20.6 · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ v2.20.6</span>', '设置徽标未跟版');
  has(sw, "CACHE_NAME = 'class-manager-v2.20.6'", 'SW CACHE_NAME 未跟版');
});
t('速览标题跟 CACHE_NAME 同版本号，且本版要点已写入', () => {
  // 维护约定：更新速览【只保留最新一版、整体替换、不做追加】→ 只断言本版要点，历史条目会随换版消失
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
  has(html, 'id="settingsReleaseNotes"', 'notes 容器缺失');
  // v2.20.5 起改为「版本无关」断言：速览正文按约定【只保留最新一版、整版替换】，
  // 逐条钉当版要点会在下一次换版时必然过期（v2.20.3 → v2.20.4 已踩过一次）。
  // 这里只守「标题跟 CACHE_NAME 一致 + 容器在 + 正文非空」，正文内容由当版新测试负责。
  ok(/id="settingsReleaseNotes"[^>]*>[\s\S]{60,}<\/div>/.test(html), 'notes 正文疑似为空');
});

console.log('\n=== ① 资格线判定 cbRewardEligible ===');
t('常量：资格线写死 100，5 折系数 0.5', () => {
  eq(CB_REWARD_MIN, 100, 'CB_REWARD_MIN');
  eq(CB_COIN_DISCOUNT, 0.5, 'CB_COIN_DISCOUNT');
});
t('边界：99 不达标 / 100 达标', () => {
  eq(cbRewardEligible(99), false, '99 应不达标');
  eq(cbRewardEligible(100), true, '100 应达标');
  eq(cbRewardEligible(100.5), true, '100.5 应达标');
  eq(cbRewardEligible(101), true, '101 应达标');
});
t('异常输入不炸：0 / 负数 / undefined / null / 数字字符串', () => {
  eq(cbRewardEligible(0), false, '0');
  eq(cbRewardEligible(-5), false, '负数');
  eq(cbRewardEligible(undefined), false, 'undefined');
  eq(cbRewardEligible(null), false, 'null');
  eq(cbRewardEligible('120'), true, '数字字符串');
  eq(cbRewardEligible('abc'), false, '非数字字符串');
});

console.log('\n=== ② 单笔加分发币额 cbCoinOfAmount ===');
t('总分 ≥100：等额发币（1 分 = 1 币）', () => {
  eq(cbCoinOfAmount(5, 100), 5, '刚好 100');
  eq(cbCoinOfAmount(5, 100 + 0.5 - 0.5), 5, '100（浮点等价）');
  eq(cbCoinOfAmount(3, 140), 3, '远高于线');
  eq(cbCoinOfAmount(1, 100), 1, '1 分不走折扣');
});
t('总分 <100：打 5 折（1 分 = 0.5 币）', () => {
  eq(cbCoinOfAmount(1, 99), 0.5, '+1 分在 99 分应得 0.5 币');
  eq(cbCoinOfAmount(3, 99), 1.5, '+3 分在 99 分应得 1.5 币');
  eq(cbCoinOfAmount(5, 50), 2.5, '+5 分在 50 分应得 2.5 币');
  eq(cbCoinOfAmount(10, 0), 5, '+10 分在 0 分应得 5 币');
});
t('★ 5 折必须精确，不能四舍五入（否则最常见的 +1 等于没打折）', () => {
  eq(cbCoinOfAmount(1, 99) * 20, 10, '连续 20 次 +1 分应恰好 10 币（= 20 分的一半）');
  eq(cbCoinOfAmount(1, 99), 0.5, '+1 分不能变成 1 币');
});
t('非正数与非法输入一律 0（扣分不发币）', () => {
  eq(cbCoinOfAmount(0, 120), 0, '0 分');
  eq(cbCoinOfAmount(-3, 120), 0, '扣分');
  eq(cbCoinOfAmount(undefined, 120), 0, 'undefined');
  eq(cbCoinOfAmount('abc', 120), 0, '非数字');
});

console.log('\n=== ③ 单笔流水计币额 cbCoinOfOp（历史兼容） ===');
t('有 coin 字段：按 coin 计（加成后总分定死的系数）', () => {
  eq(cbCoinOfOp({ amount: 3, coin: 1.5 }), 1.5, '低分档 5 折');
  eq(cbCoinOfOp({ amount: 3, coin: 3 }), 3, '高分档 1:1');
});
t('★ 无 coin 字段时 cbCoinOfOp 按 amount 兜底（v2.20.5 起由 ensureOpCoin 回溯补写 coin）', () => {
  eq(cbCoinOfOp({ amount: 5 }), 5, '老记录应保持 1:1，不能被追认成 2.5');
  eq(cbCoinOfOp({ amount: 100 }), 100, '老记录大额同样不缩水');
});
t('撤销 / 扣分 / 空值 一律 0', () => {
  eq(cbCoinOfOp({ amount: 5, coin: 5, state: 'revoked' }), 0, '已撤销');
  eq(cbCoinOfOp({ amount: -3, coin: 0 }), 0, '扣分');
  eq(cbCoinOfOp(null), 0, 'null');
  eq(cbCoinOfOp(undefined), 0, 'undefined');
});
t('coin 显式为 0 时按 0 计（不会回落到 amount）', () => {
  eq(cbCoinOfOp({ amount: 5, coin: 0 }), 0, 'coin=0 应尊重 0');
});

console.log('\n=== ④ 币显示 cbFmtCoin ===');
t('整数不带小数点，0.5 保留 1 位', () => {
  eq(cbFmtCoin(3), '3', '整数');
  eq(cbFmtCoin(0), '0', '0');
  eq(cbFmtCoin(1.5), '1.5', '1.5');
  eq(cbFmtCoin(0.5), '0.5', '0.5');
  eq(cbFmtCoin(2.5), '2.5', '2.5');
  eq(cbFmtCoin(-1.5), '-1.5', '负数');
  eq(cbFmtCoin(undefined), '0', 'undefined');
  eq(cbFmtCoin(NaN), '0', 'NaN');
});

console.log('\n=== ⑤ 币余额聚合 cbCoinMap ===');
t('高分学生（≥100）加分按 1:1 入账', () => {
  const ops = [mkOp('s1', 10, 10), mkOp('s1', 5, 5)];
  eq(cbCoinMap(ops, [])['s1'], 15, '1:1');
});
t('低分学生（<100）加分按 0.5 入账', () => {
  const ops = [mkOp('s2', 10, 5), mkOp('s2', 1, 0.5)];
  eq(cbCoinMap(ops, [])['s2'], 5.5, '5 折合计');
});
t('★ 同一学生跨线前后混合：各笔按各自当时的系数，互不影响', () => {
  // 90 分时 +6（→96，仍 <100）→ 3 币；再 +6（→102，≥100）→ 6 币
  const ops = [mkOp('s3', 6, 3), mkOp('s3', 6, 6)];
  eq(cbCoinMap(ops, [])['s3'], 9, '3 + 6');
});
t('cbCoinMap 自身不做回溯（只认 op.coin，缺失则兜底 amount）；回溯由 ensureOpCoin 完成', () => {
  const ops = [mkOp('s4', 40)];
  eq(cbCoinMap(ops, [])['s4'], 40, '老记录 1:1');
});
t('已撤销的加分退出计币', () => {
  const a = mkOp('s5', 5, 5), b = mkOp('s5', 5, 5);
  b.state = 'revoked';
  eq(cbCoinMap([a, b], [])['s5'], 5, '只剩一笔');
});
t('银行流水（兑换扣 / 退还加）叠加在同一口径上', () => {
  const ops = [mkOp('s6', 10, 5)];
  const ledger = [{ sid: 's6', delta: -3 }, { sid: 's6', delta: 1 }];
  eq(cbCoinMap(ops, ledger)['s6'], 3, '5 - 3 + 1');
});
t('扣分流水不产生币，且不影响已得币', () => {
  const ops = [mkOp('s7', 5, 2.5), mkOp('s7', -8)];
  eq(cbCoinMap(ops, [])['s7'], 2.5, '扣分只扣分不动币');
});
t('cbCoinsOf 与 cbCoinMap 同源一致', () => {
  const ops = [mkOp('s8', 4, 2)];
  eq(cbCoinsOf('s8', ops, []), 2, '单人取出');
});

console.log('\n=== ⑥ 月度结算门禁 cbDoSettle ===');
t('★ 总分 <100：净增达标也不发（币与券都不发）', () => {
  freshState([mkStudent('a', '低分甲', 62)], [mkOp('a', 15)]);
  const n = cbDoSettle();
  eq(n, 0, '不应发放任何奖励');
  eq(state.creditBank.ledger.length, 0, '不应产生发币流水');
  eq(cbVouchers('a').length, 0, '不应发券');
});
t('★ 总分 ≥100：按净增档位正常发放（+15 → 进取 20 币 + 免迟到券）', () => {
  freshState([mkStudent('b', '高分乙', 105)], [mkOp('b', 15)]);
  const n = cbDoSettle();
  ok(n > 0, '应有奖励发放');
  eq(cbVouchers('b').length, 1, '进取档应发 1 张券');
  const coin = state.creditBank.ledger.reduce((a, e) => a + e.delta, 0);
  eq(coin, 20, '进取档应发 20 币');
});
t('刚过线（100 分整）就享受正常待遇', () => {
  freshState([mkStudent('c', '压线丙', 100)], [mkOp('c', 30)]);
  cbDoSettle();
  const coin = state.creditBank.ledger.reduce((a, e) => a + e.delta, 0);
  eq(coin, 45, '优秀档 45 币');
});
t('同一批里高分发放、低分被挡：互不干扰', () => {
  freshState([mkStudent('hi', '高分', 130), mkStudent('lo', '低分', 95)],
             [mkOp('hi', 12), mkOp('lo', 12)]);
  cbDoSettle();
  eq(cbVouchers('hi').length, 1, '高分应发券');
  eq(cbVouchers('lo').length, 0, '低分不应发券');
  eq(state.creditBank.ledger.filter(e => String(e.sid) === 'lo').length, 0, '低分不应有币流水');
});
t('blocked 只统计「净增达标却被资格线挡下」的人', () => {
  // 注意：按既有约定「有奖励才建档（settleHist）」，所以场景里必须有人获奖才读得到快照
  freshState([mkStudent('hi3', '高分获奖', 120), mkStudent('x', '净增够但低分', 80), mkStudent('y', '净增不够也低分', 80)],
             [mkOp('hi3', 12), mkOp('x', 12), mkOp('y', 3)]);
  cbDoSettle();
  const h = (state.creditBank.settleHist || [])[0] || {};
  eq(h.blocked, 1, 'x 被挡（净增 12 达标），y 不算（净增仅 3）');
  eq(h.month, MONTH, '快照月份');
});
t('净增 <10 与总分无关：本来就不发，也不算被挡', () => {
  freshState([mkStudent('z', '低分低净增', 70)], [mkOp('z', 5)]);
  const n = cbDoSettle();
  eq(n, 0, '净增不够不发');
  const h = (state.creditBank.settleHist || [])[0];
  eq(h, undefined, '无奖励不建档');
});
t('巅峰档（净增 ≥70 且总分 ≥100）发全目录券各 1 张', () => {
  freshState([mkStudent('k', '巅峰', 200)], [mkOp('k', 70)]);
  cbDoSettle();
  eq(cbVouchers('k').length, CB_STORE.length, '全目录券');
});
t('幂等：同月重复结算返回 0，不重复发放', () => {
  // +20 → 勤学档（30 币 + lateFree/dayMonitor/laborWaive 3 张券）
  freshState([mkStudent('p', '重复', 150)], [mkOp('p', 20)]);
  const first = cbDoSettle();
  ok(first > 0, '首次应发放');
  const after = cbVouchers('p').length;
  eq(after, 3, '勤学档应发 3 张券');
  const second = cbDoSettle();
  eq(second, 0, '二次应返回 0');
  eq(cbVouchers('p').length, after, '券不应重复发');
});
t('全部学生都被挡下时：一条奖励都不发，且不建档', () => {
  freshState([mkStudent('q', '低分1', 40), mkStudent('r', '低分2', 70)],
             [mkOp('q', 25), mkOp('r', 25)]);
  eq(cbDoSettle(), 0, '无人达标');
  eq(state.creditBank.ledger.length, 0, '零流水');
});

console.log('\n=== ⑦ 兑换门禁 cbRedeem ===');
t('★ 总分 <100：拒绝兑换 + 提示，且不扣币不发券', () => {
  freshState([mkStudent('lo2', '低分丁', 88)], [mkOp('lo2', 20, 10)]);
  const r = cbRedeem('lo2', 'lateFree');
  eq(r, null, '应拒绝');
  eq(cbVouchers('lo2').length, 0, '不应发券');
  eq(state.creditBank.ledger.length, 0, '不应产生扣币流水');
  ok(toastLog.some(m => m.indexOf('不可兑换') >= 0), '应提示不可兑换：' + JSON.stringify(toastLog));
});
t('总分 ≥100 且币够：正常兑换并扣币', () => {
  freshState([mkStudent('hi2', '高分戊', 120)], [mkOp('hi2', 20, 20)]);
  const r = cbRedeem('hi2', 'lateFree');   // 免迟到券 10 币
  ok(r, '应兑换成功');
  eq(cbVouchers('hi2').length, 1, '应发券');
  const spent = state.creditBank.ledger.reduce((a, e) => a + e.delta, 0);
  eq(spent, -10, '应扣 10 币');
});
t('门禁先于「币不足」判定（低分且币不足时提示的是资格线）', () => {
  freshState([mkStudent('lo3', '低分己', 50)], [mkOp('lo3', 2, 1)]);
  cbRedeem('lo3', 'movie');   // 50 币，余额仅 1 币
  ok(toastLog.some(m => m.indexOf('不可兑换') >= 0), '应优先提示资格线：' + JSON.stringify(toastLog));
  ok(!toastLog.some(m => m.indexOf('币余额不足') >= 0), '不应提示币不足');
});

console.log('\n=== ⑧ 静态断言：接线是否到位 ===');
t('新增 4 个纯函数各定义恰 1 处', () => {
  eq((html.match(/function cbRewardEligible\(/g) || []).length, 1, 'cbRewardEligible');
  eq((html.match(/function cbCoinOfAmount\(/g) || []).length, 1, 'cbCoinOfAmount');
  eq((html.match(/function cbCoinOfOp\(/g) || []).length, 1, 'cbCoinOfOp');
  eq((html.match(/function cbFmtCoin\(/g) || []).length, 1, 'cbFmtCoin');
});
t('常量各定义恰 1 处且写死', () => {
  eq((html.match(/const CB_REWARD_MIN = 100;/g) || []).length, 1, 'CB_REWARD_MIN');
  eq((html.match(/const CB_COIN_DISCOUNT = 0\.5;/g) || []).length, 1, 'CB_COIN_DISCOUNT');
});
t('★ 发币系数在写流水时按「加分后总分」定死，存入 op.coin', () => {
  const src = extractFn('applyCreditDelta').toString();
  has(src, 'coin: cbCoinOfAmount(amount, student.credit)', '缺 op.coin 写入');
  // student.credit 必须在写 op 之前已经加过本次 amount（即取的是「加分后」总分）
  const iAdd = src.indexOf('student.credit = (Number(student.credit) || 0) + amount');
  const iOp = src.indexOf('coin: cbCoinOfAmount');
  ok(iAdd >= 0 && iOp > iAdd, 'op.coin 必须取加分后的总分');
});
t('币余额派生改走 cbCoinOfOp（不再直接用 amount）', () => {
  const src = extractFn('cbCoinMap').toString();
  has(src, 'var c = cbCoinOfOp(o);', 'cbCoinMap 未走 cbCoinOfOp');
  notHas(src, 'c > 0 && o.studentId != null) add(cbWalletKey(o.studentId), amt)', '仍在直接用 amount');
});
t('档案汇总的 opCoin 也走 cbCoinOfOp', () => {
  const src = extractFn('cbBankProfileOf').toString();
  has(src, 'opCoin += cbCoinOfOp(o)', '档案 opCoin 未走 cbCoinOfOp');
  has(src, 'eligible: cbRewardEligible(credit)', '档案未返回 eligible');
});
t('★ cbDoSettle 门禁：先算净增，再按资格线拦下并计入 blocked', () => {
  const src = extractFn('cbDoSettle').toString();
  has(src, 'var net = cbMonthNetOf(s.id, month);', '缺净增计算');
  has(src, 'if(!cbRewardEligible(s.credit)){', '缺资格线门禁');
  has(src, 'if(net >= CB_NET_TIERS[0].min) stat.blocked++;', '缺 blocked 计数');
  has(src, 'vouchers: 0, blocked: 0 };', 'snapshot 缺 blocked 字段');
});
t('cbRedeem 核心层与 cbRedeemUI 双层门禁都在', () => {
  has(extractFn('cbRedeem').toString(), 'if(!cbRewardEligible(s.credit)){', '核心层缺门禁');
  has(extractFn('cbRedeemUI').toString(), 'if(s && !cbRewardEligible(s.credit)){', 'UI 层缺门禁');
});
t('商店卡片与详情弹窗的「可兑换」判定都并入资格', () => {
  has(html, 'var selElig = !!selS && cbRewardEligible(selS.credit);', '商店缺 selElig');
  has(html, 'var can = !!selS && selElig && selCoin >= cost && remain > 0;', '商店卡片判定未并入资格');
  has(html, 'var elig = !!s && cbRewardEligible(s.credit);', '详情弹窗缺 elig');
  has(html, 'var can = !!s && elig && coin >= cost && remain > 0;', '详情弹窗判定未并入资格');
});
t('结算确认弹窗与实际发放对「被挡下的人」口径一致', () => {
  const src = extractFn('cbDoSettleUI').toString();
  has(src, 'var qual = nets.filter', '缺合格名单');
  has(src, 'var blocked = nets.filter', '缺被挡名单');
  has(src, 'previewBlocked', '缺被挡名单文案');
  has(src, '奖励资格线', '确认弹窗未说明资格线');
});
t('教师可见的四处文案都写了资格线与 5 折', () => {
  has(html, '奖励资格线：总分 ≥', '概览卡缺资格线');
  has(html, '加分发币按 <b>5 折</b>计', '规则细则缺 5 折');
  has(html, '分才可兑换', '商店说明缺兑换门禁');
  // 页面副标题在源码里是拼接表达式（渲染后才显示「奖励线 100 分」），故按源码形态断言
  has(html, "奖励线 ' + CB_REWARD_MIN + ' 分", '页面副标题缺奖励线');
});
t('币的展示统一走 cbFmtCoin（0.5 币不会显示成 0.5000000001）', () => {
  has(html, "cbFmtCoin(p.coin)", '档案余额未格式化');
  has(html, "cbFmtCoin(totalCoin)", '全班总量未格式化');
  has(html, "cbFmtCoin(selCoin)", '商店余额未格式化');
  has(html, "cbFmtCoin(sumD)", '流水合计未格式化');
});
t('无残留：旧的裸变量直接拼进 HTML 的写法已清除', () => {
  notHas(html, "'#b7791f\">' + p.coin + '<span", '档案币旧写法残留');
  notHas(html, "' + totalCoin + ' <span", '全班总量旧写法残留');
  notHas(html, "font-size:15px\">' + selCoin + '</b>", '商店余额旧写法残留');
  notHas(html, "'<td style=\"padding:6px 8px\"><b>' + c + '</b> 币</td>'", '排行表旧写法残留');
});
t('历史注释里的 v2.20.3 仍在（本次只升活动标记，不改历史说明）', () => {
  ok((html.match(/v2\.20\.3/g) || []).length >= 10, '历史注释被误改');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
