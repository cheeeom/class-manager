/* v2.20.5 回归测试：学分币明细改名 + 「🔍 查找」 + 历史加分回溯打折 + 余额下限 0
   老板三连诉求：
     ① 「币流水」窗口改名「学分币明细」           → 页签/卡片文案 + 旧文案零残留
     ② 输完名字没有「查找」按钮、下方也不显示明细 → cbLedgerFind + cbCoinDetailOf（加分发币并入明细）
     ③ 改成 100 分以下五折后，老加分没同步打折    → cbRecomputeOpCoins / ensureOpCoin 回溯重算
   覆盖：
     ① cbRecomputeOpCoins —— 按「加分当时的总分」重算 op.coin
        · creditBase=40 → +10（当时 50 分，5 折 = 5 币）→ +70（当时 120 分，1:1 = 70 币）→ +2（122 分 = 2 币）
        · 幂等（重跑 0 改动）· 传入乱序无关 · 同刻按 id 升序 · 撤销不计
        · 扣分流水跳过（不写 coin、不计入笔数）· 缺 creditBase 不动值
     ② ensureOpCoin —— 全班聚合 + 幂等 + 孤儿流水不报错
     ③ cbCoinMap / cbBankProfileOf —— 余额下限 0（coin 夹到 0，rawCoin 保留真值）
     ④ cbCoinDetailOf —— 加分发币 + 银行收支 合并、时间倒序、5 折备注
     ⑤ cbLedgerFind —— 精确学号 → 精确 ID → 精确姓名 → 唯一模糊 → 多人候选 → 无命中
     ⑥ 静态接线 —— 文案 / 查找按钮 / loadData 钩子 / 四处跟版 / SW CACHE_NAME
   运行：node _v2205_test.js */
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
function near(a, b, msg) { if (Math.abs(Number(a) - Number(b)) > 1e-9) throw new Error((msg || '') + `期望 ≈${b}，实际 ${a}`); }

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
const CB_ALERT_TIERS = eval('(' + extractConstRaw('CB_ALERT_TIERS') + ')');
const CB_ALERT_MIN = eval(extractConstRaw('CB_ALERT_MIN'));
const CB_STORE = eval('(' + extractConstRaw('CB_STORE') + ')');

/* ---------- 宿主环境替身 ---------- */
var state = { className: '', students: [], operations: [], creditBank: null, nextOpId: 1 };
var toastLog = [];
function showToast(msg, type) { toastLog.push({ msg: String(msg), type: type || '' }); }
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
var cbLedgerSid = '';
var cbLedgerType = '';
var renderCount = 0;
function renderBankPage() { renderCount++; }
var domEls = {};
function setEl(id, v) {
  domEls[id] = { id: id, value: v == null ? '' : String(v), style: {}, innerHTML: '', __focus: 0,
                 focus: function () { domEls[id].__focus++; },
                 querySelector: function () { return null; } };
  return domEls[id];
}
global.document = { getElementById: function (id) { return domEls[id] || null; } };
function lastToast() { return toastLog.length ? toastLog[toastLog.length - 1] : { msg: '', type: '' }; }

/* ---------- 被测函数 ---------- */
const cbDefaultBank = extractFn('cbDefaultBank');
const cbBankSafe = extractFn('cbBankSafe');
const cbWalletKey = extractFn('cbWalletKey');
const cbWallet = extractFn('cbWallet');
const cbVouchers = extractFn('cbVouchers');
const cbSname = extractFn('cbSname');
const cbRewardEligible = extractFn('cbRewardEligible');
const cbCoinOfAmount = extractFn('cbCoinOfAmount');
const cbCoinOfOp = extractFn('cbCoinOfOp');
const cbFmtCoin = extractFn('cbFmtCoin');
const cbRecomputeOpCoins = extractFn('cbRecomputeOpCoins');
const ensureOpCoin = extractFn('ensureOpCoin');
const cbCoinMap = extractFn('cbCoinMap');
const cbCoinsOf = extractFn('cbCoinsOf');
const cbTierOf = extractFn('cbTierOf');
const cbEsc = extractFn('cbEsc');
const cbLedgerTypeName = extractFn('cbLedgerTypeName');
const cbCoinDetailOf = extractFn('cbCoinDetailOf');
const cbBankProfileOf = extractFn('cbBankProfileOf');
const cbLedgerSearchInput = extractFn('cbLedgerSearchInput');
const cbLedgerFind = extractFn('cbLedgerFind');

/* ---------- 造数据 ---------- */
function mkStu(id, name, credit, base, sid) {
  return { id: id, name: name, sid: sid == null ? '' : sid, credit: credit, creditBase: base };
}
function mkOp(id, sid, name, amount, time, coin) {
  const o = { id: id, studentId: sid, studentName: name, amount: amount, reason: '测试加分', time: time };
  if (coin !== undefined) o.coin = coin;   // 不传 = 模拟 v2.20.4 之前的历史记录（无 coin 字段）
  return o;
}
function freshState(students, ops, ledger) {
  state = { className: '', students: students || [], operations: ops || [], creditBank: cbDefaultBank(), nextOpId: 1 };
  if (ledger) state.creditBank.ledger = ledger;
  toastLog = []; renderCount = 0; domEls = {};
  cbLedgerSid = ''; cbLedgerType = '';
  return state;
}

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('四处跟版均为 v2.20.6（登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME）', () => {
  has(html, '<div class="login-version">v2.20.6</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">v2.20.6 · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ v2.20.6</span>', '设置徽标未跟版');
  has(sw, "const CACHE_NAME = 'class-manager-v2.20.6';", 'SW 未跟版');
});
t('近版更新速览标题为 v2.20.6', () => {
  has(html, '近版更新速览（v2.20.6）', '速览标题未跟版');
});
t('旧活动标记 v2.20.4 已无残留', () => {
  notHas(html, '<div class="login-version">v2.20.4</div>', '登录页仍有旧版号');
  notHas(html, '<div class="sidebar-footer">v2.20.4 · 班主任工作台</div>', '侧栏仍有旧版号');
  notHas(html, '🏷️ v2.20.4</span>', '设置徽标仍有旧版号');
  notHas(html, '近版更新速览（v2.20.4）', '速览标题仍有旧版号');
  notHas(sw, 'class-manager-v2.20.4', 'SW 仍有旧 CACHE_NAME');
});
t('index.html 无 data-page-node-id 注入', () => {
  eq((html.match(/data-page-node-id/g) || []).length, 0, '存在外部进程注入的垃圾属性');
});
t('两个新函数在源码中各自只有一处定义', () => {
  eq((html.match(/function cbRecomputeOpCoins\(/g) || []).length, 1, 'cbRecomputeOpCoins 定义数异常');
  eq((html.match(/function ensureOpCoin\(/g) || []).length, 1, 'ensureOpCoin 定义数异常');
  eq((html.match(/function cbCoinDetailOf\(/g) || []).length, 1, 'cbCoinDetailOf 定义数异常');
  eq((html.match(/function cbLedgerFind\(/g) || []).length, 1, 'cbLedgerFind 定义数异常');
});

console.log('=== ① cbRecomputeOpCoins：历史加分按「当时总分」回溯打折 ===');
t('扣分后再加分：每笔都按「加分当时的总分」定系数', () => {
  // creditBase=120；t1 扣 70 → 当时 50 分；t2 加 10 → 当时 60 分（5 折）；t3 加 70 → 当时 130 分（1:1）
  const s = mkStu('s1', '张三', 130, 120);
  const ops = [mkOp(1, 's1', '张三', -70, 1000),
               mkOp(2, 's1', '张三', 10, 2000),
               mkOp(3, 's1', '张三', 70, 3000)];
  const n = cbRecomputeOpCoins(s, ops);
  eq(n, 2, '改动笔数 = 两笔有效加分（扣分不计入）');
  eq(ops[0].coin, undefined, '扣分不发币、也不写 coin（否则会把提示语的笔数灌水）');
  near(ops[1].coin, 5, '当时 60 分 → 10 分只发 5 币');
  eq(ops[2].coin, 70, '当时 130 分 → 1:1 发 70 币');
});
t('历史无 coin 字段的老加分：5 折后被回溯补齐（老板报的 bug）', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const ops = [mkOp(1, 's1', '张三', 10, 1000),   // 当时 50 分 → 5 币（旧口径按 1:1 记 10 币）
               mkOp(2, 's1', '张三', 70, 2000),   // 当时 120 分 → 70 币
               mkOp(3, 's1', '张三', 2, 3000)];   // 当时 122 分 → 2 币
  const before = cbCoinsOf('s1', ops, []);        // 迁移前：无 coin → cbCoinOfOp 兜底 1:1
  eq(before, 82, '迁移前按 1:1 兜底，正是「没同步打折」的表现');
  const n = cbRecomputeOpCoins(s, ops);
  eq(n, 3, '三笔全部重写');
  near(ops[0].coin, 5, '未满 100 分的老加分被补成 5 折');
  eq(ops[1].coin, 70, '已满 100 分保持 1:1');
  eq(ops[2].coin, 2, '已满 100 分保持 1:1');
  eq(cbCoinsOf('s1', ops, []), 77, '打折后总币 77（= 5 + 70 + 2）');
});
t('幂等：重跑一次不再产生改动', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const ops = [mkOp(1, 's1', '张三', 10, 1000), mkOp(2, 's1', '张三', 70, 2000), mkOp(3, 's1', '张三', 2, 3000)];
  eq(cbRecomputeOpCoins(s, ops), 3, '首跑 3 笔');
  eq(cbRecomputeOpCoins(s, ops), 0, '再跑 0 笔（幂等）');
  eq(cbRecomputeOpCoins(s, ops), 0, '第三跑仍 0 笔');
  near(ops[0].coin, 5, '值未被反复改写');
});
t('入参乱序不影响结果（内部按 time 升序重排）', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const asc = [mkOp(1, 's1', '张三', 10, 1000), mkOp(2, 's1', '张三', 70, 2000), mkOp(3, 's1', '张三', 2, 3000)];
  const desc = [mkOp(3, 's1', '张三', 2, 3000), mkOp(1, 's1', '张三', 10, 1000), mkOp(2, 's1', '张三', 70, 2000)];
  cbRecomputeOpCoins(s, asc); cbRecomputeOpCoins(s, desc);
  near(asc[0].coin, 5); eq(asc[1].coin, 70); eq(asc[2].coin, 2);
  eq(desc[0].coin, 2); near(desc[1].coin, 5); eq(desc[2].coin, 70);
  eq(asc[0].coin, desc[1].coin, '两位数组算出的同一笔结果一致（+10 那笔）');
});
t('同一时间戳按 id 升序（= 真实写入序）', () => {
  const s = mkStu('s1', '张三', 110, 0);
  const ops = [mkOp(1, 's1', '张三', 90, 5000), mkOp(2, 's1', '张三', 20, 5000)];
  cbRecomputeOpCoins(s, ops);
  near(ops[0].coin, 45, '先写的那笔当时只有 90 分 → 5 折');
  eq(ops[1].coin, 20, '后写的那笔累计到 110 分 → 1:1');
  const rev = [mkOp(1, 's1', '张三', 90, 5000), mkOp(2, 's1', '张三', 20, 5000)];
  rev.reverse();
  cbRecomputeOpCoins(s, rev);
  near(rev[1].coin, 45, '数组倒序传入仍按 id 升序计算');
  eq(rev[0].coin, 20);
});
t('已撤销的流水：不发币、也不进累计', () => {
  const s = mkStu('s1', '张三', 110, 90);
  const revoked = mkOp(1, 's1', '张三', -50, 1000); revoked.state = 'revoked';
  const valid = mkOp(2, 's1', '张三', 20, 2000);
  const n = cbRecomputeOpCoins(s, [revoked, valid]);
  eq(n, 1, '只重算有效那笔');
  eq(revoked.coin, undefined, '撤销流水不动原值（无 coin）');
  eq(valid.coin, 20, '撤销的 -50 不计入累计（否则会误判为 5 折 = 10 币）');
});
t('缺 creditBase：返回 0，原值纹丝不动（绝不瞎猜）', () => {
  const s = { id: 's1', name: '张三', credit: 50 };      // 老数据尚未 ensureCreditBase
  const ops = [mkOp(1, 's1', '张三', 10, 1000)];
  eq(cbRecomputeOpCoins(s, ops), 0, '不动值');
  eq(ops[0].coin, undefined, '无 coin 字段仍保持无');
  const s2 = { id: 's2', name: '李四', credit: 50, creditBase: NaN };
  const ops2 = [mkOp(2, 's2', '李四', 10, 1000, 10)];
  eq(cbRecomputeOpCoins(s2, ops2), 0, 'creditBase 非有限值同样不动');
  eq(ops2[0].coin, 10, '原 coin 保持');
  const s3 = { id: 's3', name: '王五', credit: 50, creditBase: '50' };
  eq(cbRecomputeOpCoins(s3, [mkOp(3, 's3', '王五', 10, 1000)]), 0, '字符串 creditBase 不算数（要 Number）');
});
t('只动本生流水，别生的原值不受影响', () => {
  const a = mkStu('s1', '张三', 122, 40);
  const b = mkStu('s2', '李四', 200, 200);
  const ops = [mkOp(1, 's1', '张三', 10, 1000), mkOp(2, 's2', '李四', 30, 1000, 30)];
  eq(cbRecomputeOpCoins(a, ops), 1, '只改张三那笔');
  eq(ops[1].coin, 30, '李四原值不动');
});
t('入参为空 / 学生为空：安全返回 0', () => {
  eq(cbRecomputeOpCoins(null, []), 0, 'student 为 null');
  eq(cbRecomputeOpCoins(mkStu('s1', '张三', 10, 10), null), 0, 'ops 为 null');
  eq(cbRecomputeOpCoins(mkStu('s1', '张三', 10, 10), []), 0, 'ops 为空数组');
});
t('金额比较用 Number（字符串 amount 也能算）', () => {
  const s = mkStu('s1', '张三', 60, 50);
  const ops = [mkOp(1, 's1', '张三', '10', 1000)];
  eq(cbRecomputeOpCoins(s, ops), 1, '字符串金额应被识别为改动');
  near(ops[0].coin, 5, '当时 60 分 → 5 折');
});

console.log('=== ② ensureOpCoin：全班聚合 + 幂等 ===');
t('一次覆盖全班，跨生累计改动笔数', () => {
  const a = mkStu('s1', '张三', 122, 40);
  const b = mkStu('s2', '李四', 130, 120);
  const ops = [mkOp(1, 's1', '张三', 10, 1000), mkOp(2, 's1', '张三', 70, 2000), mkOp(3, 's1', '张三', 2, 3000),
               mkOp(4, 's2', '李四', -70, 1000), mkOp(5, 's2', '李四', 10, 2000), mkOp(6, 's2', '李四', 70, 3000)];
  freshState([a, b], ops);
  eq(ensureOpCoin(state.students, state.operations), 5, '张三 3 笔 + 李四 2 笔（扣分各 1 笔不计入）');
  eq(ensureOpCoin(state.students, state.operations), 0, '重跑为 0');
});
t('孤儿流水（学生已删）不报错、不被改', () => {
  const a = mkStu('s1', '张三', 122, 40);
  const ops = [mkOp(1, 's1', '张三', 10, 1000), mkOp(2, 'ghost', '已删学生', 99, 1000)];
  freshState([a], ops);
  eq(ensureOpCoin(state.students, state.operations), 1, '只处理在册学生');
  eq(ops[1].coin, undefined, '孤儿流水保持原值');
});
t('空入参安全', () => {
  eq(ensureOpCoin([], []), 0, '空数组');
  eq(ensureOpCoin(null, null), 0, 'null');
});

console.log('=== ③ 余额下限 0 ===');
t('cbCoinMap：账面为负时夹到 0', () => {
  const ops = [mkOp(1, 's1', '张三', 10, 1000, 2)];
  const ledger = [{ id: 1, sid: 's1', sname: '张三', time: 2000, type: 'redeem', delta: -5, item: '免作业券' }];
  const m = cbCoinMap(ops, ledger);
  eq(m['s1'], 0, '2 + (-5) = -3 → 显示 0');
  eq(cbCoinsOf('s1', ops, ledger), 0, 'cbCoinsOf 同口径');
});
t('cbCoinMap：正余额不受影响', () => {
  const ops = [mkOp(1, 's1', '张三', 10, 1000, 10)];
  const ledger = [{ id: 1, sid: 's1', sname: '张三', time: 2000, type: 'redeem', delta: -5, item: '免作业券' }];
  eq(cbCoinMap(ops, ledger)['s1'], 5, '10 - 5 = 5');
});
t('cbCoinMap：恰好 0 与未出现的学号', () => {
  const ops = [mkOp(1, 's1', '张三', 10, 1000, 5)];
  const ledger = [{ id: 1, sid: 's1', sname: '张三', time: 2000, type: 'redeem', delta: -5, item: 'x' }];
  eq(cbCoinMap(ops, ledger)['s1'], 0, '恰好 0');
  eq(cbCoinsOf('s9', ops, ledger), 0, '未出现的学号 → 0');
});
t('cbBankProfileOf：coin 夹 0，rawCoin 保留真实负账', () => {
  const s = mkStu('s1', '张三', 80, 80);
  const ops = [mkOp(1, 's1', '张三', 10, 1000, 2)];
  const ledger = [{ id: 1, sid: 's1', sname: '张三', time: 2000, type: 'redeem', delta: -5, item: '免作业券' }];
  freshState([s], ops, ledger);
  const p = cbBankProfileOf('s1');
  eq(p.coin, 0, '对外显示 0');
  eq(p.rawCoin, -3, 'rawCoin 如实保留 -3（不抹账）');
  eq(p.opCoin, 2, '加分发币 2');
  eq(p.lgCoin, -5, '银行收支 -5');
  eq(p.eligible, false, '80 分未达奖励线');
});

console.log('=== ④ cbCoinDetailOf：加分发币 + 银行收支 合并明细 ===');
t('两类记录合并、按时间倒序', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const ops = [mkOp(7, 's1', '张三', 10, 1000)];
  const ledger = [{ id: 1, sid: 's1', sname: '张三', time: 2000, type: 'redeem', delta: -5, item: '免作业券' }];
  freshState([s], ops, ledger);
  const list = cbCoinDetailOf('s1', state.operations, state.creditBank.ledger);
  eq(list.length, 2, '两条');
  eq(list[0].kind, 'bank', '时间最新的银行收支排第一');
  eq(list[1].kind, 'earn', '早的加分排第二');
});
t('earn 行带 学分变动 + 5 折备注', () => {
  const s = mkStu('s1', '张三', 60, 50);
  const ops = [mkOp(7, 's1', '张三', 10, 1000, 5)];
  freshState([s], ops, []);
  const e = cbCoinDetailOf('s1', state.operations, [])[0];
  eq(e.kind, 'earn', 'kind');
  eq(e.type, 'earn', 'type');
  eq(e.credit, 10, '学分变动 +10');
  eq(e.coin, 5, '币变动 +5');
  eq(e.item, '测试加分', '项目取 reason');
  has(e.note, '5 折', '5 折备注');
  has(e.note, '总分 <' + CB_REWARD_MIN, '备注写明奖励线');
});
t('达标加分的备注为空（不误导老师）', () => {
  const s = mkStu('s1', '张三', 200, 190);
  const ops = [mkOp(7, 's1', '张三', 10, 1000, 10)];
  freshState([s], ops, []);
  const e = cbCoinDetailOf('s1', state.operations, [])[0];
  eq(e.coin, 10, '1:1');
  eq(e.note, '', '无备注');
});
t('撤销的加分不出现在明细里', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const rev = mkOp(1, 's1', '张三', 10, 1000, 5); rev.state = 'revoked';
  const ok1 = mkOp(2, 's1', '张三', 70, 2000, 70);
  freshState([s], [rev, ok1], []);
  const list = cbCoinDetailOf('s1', state.operations, []);
  eq(list.length, 1, '只剩一笔');
  eq(list[0].oid, 2, '是有效那笔');
});
t('只含该生记录（别生与零/负加分被过滤）', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const ops = [mkOp(1, 's1', '张三', 10, 1000, 5),
               mkOp(2, 's1', '张三', -3, 1500),          // 扣分：不发币 → 不进明细
               mkOp(3, 's2', '李四', 50, 1600, 50)];     // 别生
  freshState([s], ops, []);
  const list = cbCoinDetailOf('s1', state.operations, []);
  eq(list.length, 1, '只有张三那笔加分');
  eq(list[0].oid, 1, '是 id=1 那笔');
});
t('银行行的 item 兜底：没有 item 时用类型名', () => {
  const s = mkStu('s1', '张三', 122, 40);
  const ledger = [{ id: 1, sid: 's1', sname: '张三', time: 2000, type: 'settle', delta: 3 }];
  freshState([s], [], ledger);
  const row = cbCoinDetailOf('s1', [], state.creditBank.ledger)[0];
  eq(row.kind, 'bank', 'kind');
  eq(row.coin, 3, '币变动');
  eq(row.item, cbLedgerTypeName('settle'), 'item 兜底为类型名');
});

console.log('=== ⑤ cbLedgerFind：输入姓名 → 点查找 → 定位 + 展示明细 ===');
const STU3 = [mkStu('11', '张三', 122, 40, '2026001'),
              mkStu('12', '张三四', 200, 200, '2026002'),
              mkStu('13', '李四', 500, 500, '')];
t('精确姓名命中 → 选中该生并重渲染', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '李四'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '13', '已选中李四');
  eq(renderCount, 1, '触发一次重渲染');
  has(lastToast().msg, '李四', '提示带姓名');
  has(lastToast().msg, '学分币明细', '提示文案');
});
t('精确学号优先于同名', () => {
  const studs = [mkStu('11', '张三', 122, 40, ''), mkStu('12', '张三', 200, 200, '2026002')];
  freshState(studs, []);
  setEl('cbLedgerSearch', '2026002'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '12', '按学号命中第二个张三');
});
t('精确 ID 命中', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '12'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '12', '按 id 命中');
});
t('唯一模糊命中（输入片段）', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '李'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '13', '唯一含「李」的是李四');
});
t('多人匹配 → 展开候选、不替老师选', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '张'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '', '未擅自选中');
  eq(renderCount, 0, '不重渲染');
  const box = domEls['cbLedgerMatch'];
  eq(box.style.display, '', '候选框已展开');
  has(box.innerHTML, '张三', '含候选一');
  has(box.innerHTML, '张三四', '含候选二');
  has(lastToast().msg, '2 名匹配', '提示候选数');
});
t('无命中 → 只提示、不改选中', () => {
  freshState(STU3, []);
  cbLedgerSid = '13'; cbLedgerType = 'redeem';
  setEl('cbLedgerSearch', '王五'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '13', '原选中保持不变');
  eq(cbLedgerType, 'redeem', '原筛选保持不变');
  eq(renderCount, 0, '不重渲染');
  has(lastToast().msg, '没有找到', '提示未命中');
  eq(domEls['cbLedgerMatch'].style.display, 'none', '候选框收起');
});
t('空输入 → 提示并聚焦输入框', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '   '); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '', '无选中');
  eq(renderCount, 0, '不重渲染');
  has(lastToast().msg, '请先输入', '提示空输入');
  ok(domEls['cbLedgerSearch'].__focus >= 1, '输入框被聚焦');
});
t('命中后清空类型筛选（否则会「查到了却看不到」）', () => {
  freshState(STU3, []);
  cbLedgerType = 'earn';
  setEl('cbLedgerSearch', '李四'); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '13', '选中');
  eq(cbLedgerType, '', '类型筛选被清空');
});
t('首尾空格被裁掉（老师容易多打一个空格）', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '  李四 '); setEl('cbLedgerMatch', '');
  cbLedgerFind();
  eq(cbLedgerSid, '13', '裁空格后命中');
});
t('查找前先收起候选框', () => {
  freshState(STU3, []);
  setEl('cbLedgerSearch', '李四');
  const box = setEl('cbLedgerMatch', 'x'); box.style.display = '';
  cbLedgerFind();
  eq(box.style.display, 'none', '已收起');
  eq(box.innerHTML, '', '已清空');
});

console.log('=== ⑥ 静态接线 ===');
t('页签与卡片文案改为「学分币明细」，旧文案零残留', () => {
  has(html, "{ k:'ledger', t:'💰 学分币明细' }", '页签文案未改');
  has(html, '<b style="font-size:14px">💰 学分币明细</b>', '卡片标题未改');
  notHas(html, "t:'🧾 币流水'", '旧页签文案仍有残留');
});
t('查找按钮接在 cbLedgerFind 上', () => {
  has(html, 'onclick="cbLedgerFind()"', '缺查找按钮');
  has(html, '🔍 查找', '缺按钮文案');
  has(html, 'title="按输入框内容查找学生并显示其学分币明细"', '缺按钮说明');
});
t('搜索框既有「输入即弹候选」也有「回车触发查找」', () => {
  has(html, 'id="cbLedgerSearch"', '缺输入框 id');
  has(html, 'oninput="cbLedgerSearchInput(this.value)"', '缺实时候选');
  has(html, 'onkeydown="cbLedgerSearchKey(event)"', '缺回车处理');
  has(html, 'id="cbLedgerMatch"', '缺候选容器');
});
t('明细数据源 = 选中学生取 cbCoinDetailOf，未选中取全班银行流水', () => {
  has(html, 'cbCoinDetailOf(selStu.id, state.operations, allLedger)', '未用合并明细');
  has(html, "kind: 'bank'", '未选中时仍走银行流水');
});
t('类型下拉含「加分发币」', () => {
  has(html, "var map = { earn:'加分发币'", 'cbLedgerTypeName 缺 earn');
  has(html, "var typeSel = ['', 'earn', 'redeem', 'refund', 'settle', 'adjust']", '类型下拉缺 earn');
});
t('明细表区分「学分变动」与「币变动」两列', () => {
  has(html, '学分变动</th>', '缺学分变动列');
  has(html, '币变动</th>', '缺币变动列');
});
t('汇总卡：当前学分币 / 加分发币 / 银行收支 / 当前总分 / 奖励线', () => {
  has(html, '当前学分币', '缺币余额');
  has(html, '加分发币', '缺加分发币小计');
  has(html, '银行收支', '缺银行收支小计');
  has(html, '当前总分', '缺当前总分');
  has(html, '已达奖励线', '缺达标态');
  has(html, '加分发币 5 折 · 兑换未开放', '缺未达标态');
});
t('负账面提示「余额按 0 计」', () => {
  has(html, '余额按 0 计', '缺口径提示');
});
t('口径说明写明「回溯重算」与「余额最低按 0 计」', () => {
  has(html, '回溯重算', '未说明历史已回溯');
  has(html, '余额最低按 0 计', '未说明下限');
  has(html, '加分当时的总分', '未说明系数基准');
});
t('loadData 挂上 ensureOpCoin 且只在有改动时提示', () => {
  has(html, 'var coinFixN = ensureOpCoin(state.students, state.operations);', 'loadData 未调 ensureOpCoin');
  has(html, 'if(driftN > 0 || needBase || coinFixN > 0){', '未纳入「有改动才存盘」判定');
  has(html, 'if(coinFixN > 0 && !window.__opCoinFixToastShown){', '未做一次性提示去重');
  has(html, '重算 ', '缺重算提示文案');
});
t('旧「1:1 兜底」注释已改为「迁移后不再是长期行为」', () => {
  has(html, '尚未跑到迁移', 'cbCoinOfOp 注释未更新');
  has(html, 'v2.20.5 起加载时会由 ensureOpCoin', '未指向迁移函数');
});
t('回溯重算跳过扣分流水（不写 coin、不计入回迁笔数）', () => {
  has(html, 'if((Number(o.amount) || 0) <= 0) continue;', '缺扣分跳过守卫');
  has(html, '扣分不发币：不写 coin，也不计入回迁笔数', '缺少守卫说明');
});
t('设计说明补了 ⑦ 号条目（记录这次的历史遗留）', () => {
  has(html, '⑦ v2.20.5 补 ⑥ 的历史遗留', '缺设计说明');
});
t('近版速览块逐版整体替换后仍非空（v2.20.6 起不再钉当版条目）', () => {
  // 项目约定：速览正文【只保留最新一版、逐版整体替换】。钉住当版条目必然在下一版失效
  // （v2.20.3→v2.20.4、v2.20.5→v2.20.6 各踩过一次），故改成断言不随版本流失的不变量：
  // 容器在 + 正文够长 + 标题跟 sw.js 的 CACHE_NAME 一致。当版正文内容由当版新测试负责。
  const m = html.match(/<div id="settingsReleaseNotes"[^>]*>[\s\S]*?<\/div>/);
  if (!m) throw new Error('缺速览块');
  const plain = m[0].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  if (plain.length < 60) throw new Error('速览块为空或过短：' + plain.length);
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
});
t('cbLedgerTypeTo 仍是 select 的唯一入口', () => {
  has(html, 'onchange="cbLedgerTypeTo(this.value)"', 'onchange 绑丢失');
  eq((html.match(/function cbLedgerTypeTo\(/g) || []).length, 1, 'cbLedgerTypeTo 定义数异常');
});
t('清除筛选入口仍在', () => {
  has(html, 'onclick="cbLedgerSidClear()"', '缺清除筛选按钮');
  has(html, '✕ 清除筛选', '缺清除筛选文案');
});
t('合计行格式未被破坏（兼容既有断言）', () => {
  has(html, ">共 ' + led.length + ' 条'", '合计行格式变了');
});
t('学分银行页头仍标注奖励线', () => {
  has(html, '🏦 学分银行', '缺页头');
  has(html, '奖励线 ' + "' + CB_REWARD_MIN + '" + ' 分', '缺奖励线标注');
});
t('cbBankProfileOf 的「银行收支明细」分块仍在（兼容既有断言）', () => {
  has(html, '🧾 银行收支明细', '档案弹窗分块丢失');
});

console.log('');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
