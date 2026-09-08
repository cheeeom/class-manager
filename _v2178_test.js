/* v2.17.23 回归测试：学分银行（双轨账本/月度阶梯结算/兑换商店/阶梯预警/教师专属页）
   覆盖：数据五处链路 + 币派生口径 + 结算定档 + 券去重/合并 + 预警建档升级自动办结 + UI 接入。
   运行：node _v2178_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

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

// —— 模块级常量依赖（eval 抽出的函数闭包按名引用，须以同名 const 提供）——
const _storeM = html.match(/const CB_STORE = (\[[\s\S]*?\n\]);/);
const CB_STORE = _storeM ? eval('(' + _storeM[1] + ')') : [];
const _settleM = html.match(/const CB_SETTLE_EXCELLENT_COUPONS = (\[[^\n]*\]);/);
const CB_SETTLE_EXCELLENT_COUPONS = _settleM ? eval('(' + _settleM[1] + ')') : [];
const _tierM = html.match(/const CB_ALERT_TIERS = (\[[\s\S]*?\n\]);/);
const CB_ALERT_TIERS = _tierM ? eval('(' + _tierM[1] + ')') : [];
const CB_ALERT_MIN = 60;

var state = { className: '', classNameFull: '', students: [], operations: [], creditBank: null };
const cbDefaultBank = extractFn('cbDefaultBank');
const cbNormalizeShape = extractFn('cbNormalizeShape');
const cbBankSafe = extractFn('cbBankSafe');
const cbWalletKey = extractFn('cbWalletKey');
const cbWallet = extractFn('cbWallet');
const cbVouchers = extractFn('cbVouchers');
const cbMonthKey = extractFn('cbMonthKey');
const cbSettleTier = extractFn('cbSettleTier');
const cbTierOf = extractFn('cbTierOf');
const cbTierSeverity = extractFn('cbTierSeverity');
const cbCoinMap = extractFn('cbCoinMap');
const cbMergeBanks = extractFn('cbMergeBanks');
const cbGiveVoucher = extractFn('cbGiveVoucher');
const cbDoSettle = extractFn('cbDoSettle');
const cbScanAlerts = extractFn('cbScanAlerts');
const cbPendingAlertCount = extractFn('cbPendingAlertCount');
function freshState(students, ops) {
  return { className: '', classNameFull: '', students: students || [], operations: ops || [], creditBank: cbDefaultBank() };
}

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.17.23（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.17\.23</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.17\.23 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.17.23')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 数据五处链路 ===');
t('state 默认含 creditBank（settings/wallets/ledger/nextLedgerId/alerts/nextVoucherId/lastSettleMonth）', () => {
  const def = html.match(/creditBank: \{ settings:\{ autoCoin:true, alertEnabled:true \}, wallets:\{\}, ledger:\[\], nextLedgerId:1,[\s\S]*?createdAt:0 \},  \/\/ v2\.17\.23 学分银行/);
  if (!def) throw new Error('state 默认缺 creditBank 结构');
  ['settings', 'wallets', 'ledger', 'nextLedgerId', 'alerts', 'nextAlertId', 'nextVoucherId', 'lastSettleMonth', 'createdAt'].forEach(k => has(def[0], k));
});
t('loadData 读取 d.creditBank 并 cbNormalizeShape / cbBankSafe 补齐', () => {
  const ld = html.match(/function loadData\(\)\{[\s\S]*?\n\}/)[0];
  has(ld, 'if(d.creditBank) state.creditBank = cbNormalizeShape(d.creditBank);');
  has(ld, 'cbBankSafe();');
  has(ld, 'if(cbScanAlerts() > 0) saveData();', '启动预警扫描缺失');
});
t('saveData 手写清单含 creditBank', () => {
  const sd = html.match(/function saveData\(\)\{[\s\S]*?autoPushToCloud\(\);[\s\S]*?\n\}/)[0];
  has(sd, 'creditBank: state.creditBank');
  has(sd, 'cbScanAlerts();', '落盘前预警扫描缺失');
});
t('CLOUD_SYNC_FIELDS 白名单含 creditBank', () => {
  const m = html.match(/CLOUD_SYNC_FIELDS = \[([\s\S]*?)\];/)[1];
  has(m, "'creditBank'");
});
t('smartMergeData 接入 cbMergeBanks 合并（任一侧存在才合并）', () => {
  const sm = html.match(/function smartMergeData\([\s\S]*?\n\}/)[0];
  has(sm, 'if(localData.creditBank || remoteData.creditBank){');
  has(sm, 'merged.creditBank = cbMergeBanks(');
});
t('clearData 清空数据时重置 creditBank（品牌配置类保留）', () => {
  const cd = html.match(/function clearData\(\)\{[\s\S]*?pushWipeToCloud\(\);[\s\S]*?\n\}/)[0];
  has(cd, 'state.creditBank = cbDefaultBank();');
});

console.log('\n=== 教师专属入口与 UI 接入 ===');
t('侧栏 + 移动抽屉有 page=bank；COMMITTEE_PAGES 不含 bank（班委自动隐藏 + navigateTo 拦截）', () => {
  has(html, '<div class="nav-item" data-page="bank"');
  has(html, '<div class="more-item" data-page="bank"');
  if (html.match(/COMMITTEE_PAGES = \[([\s\S]*?)\]/)[1].indexOf('bank') >= 0) throw new Error('bank 不应在班委白名单');
  const nt = html.match(/function navigateTo\(page\)\{[\s\S]*?COMMITTEE_PAGES\.indexOf\(page\) < 0\)\{[\s\S]*?return;[\s\S]*?\n\}/);
  if (!nt) throw new Error('navigateTo 拦截缺失');
});
t('pageTitles 含 bank=学分银行；navigateTo 分支 + renderBankPage 教师守卫 + i-bank 图标 + 顶栏预警角标', () => {
  has(html, "bank:'学分银行'");
  has(html, "if(page==='bank') renderBankPage();");
  const rp = html.match(/function renderBankPage\(\)\{[\s\S]*?window\.__cmRole === 'committee'[\s\S]*?navigateTo\('dashboard'\)[\s\S]*?\n\}/);
  if (!rp) throw new Error('renderBankPage 班委守卫缺失');
  has(html, 'symbol id="i-bank"');
  has(html, 'id="cbAlertChip"');
});
t('refreshCreditViews 挂学分银行页与预警角标；renderAll 挂角标刷新', () => {
  has(html, "var bank = document.getElementById('page-bank');", 'refreshCreditViews 缺 bank 页');
  has(html, 'safe(window.updateCbAlertChip);');
  const ra = html.match(/function renderAll\(\)\{[\s\S]*?updateExportBadge\(\);[\s\S]*?\n\}/)[0];
  has(ra, 'updateCbAlertChip();');
});
t('学分银行核心函数与商店目录/预警档位常量就位', () => {
  ['function cbRedeem(', 'function cbRefundVoucher(', 'function cbUseVoucher(', 'function cbAlertMark(',
   'function cbAlertDraft(', 'function cbMergeBanks(', 'function cbCoinMap(', 'function cbScanAlerts(',
   'function cbDoSettle(', 'function renderBankPage('].forEach(f => has(html, f));
  eq(CB_STORE.length, 6);
  eq(CB_ALERT_TIERS.length, 4);
});

console.log('\n=== 币派生口径（cbCoinMap 纯函数） ===');
t('币 = Σ有效加分流水 + Σ银行流水：扣分不计、撤销不计、银行收支叠加', () => {
  const ops = [
    { id: 1, studentId: 1, amount: 5 },
    { id: 2, studentId: 1, amount: -2 },          // 扣分不进币
    { id: 3, studentId: 1, amount: 3, state: 'revoked' },  // 撤销的加分不进币
    { id: 4, studentId: 2, amount: 8 }
  ];
  const ledger = [
    { id: 1, sid: 1, delta: -10 },   // 兑换扣币
    { id: 2, sid: 1, delta: 10 },    // 退还退币
    { id: 3, sid: 3, delta: 20 }
  ];
  const m = cbCoinMap(ops, ledger);
  eq(m['1'], 5, '学生1（5-10+10）');
  eq(m['2'], 8, '学生2');
  eq(m['3'], 20, '学生3');
});
t('撤销加分后币自动回退（流水退出有效集即派生消失）', () => {
  const ops = [
    { id: 1, studentId: 1, amount: 5 },
    { id: 2, studentId: 1, amount: 3, state: 'revoked' }
  ];
  eq(cbCoinMap(ops, [])['1'], 5);
});

console.log('\n=== 月度结算定档与发放（cbSettleTier / cbDoSettle） ===');
t('cbSettleTier 分档边界：≥110 卓越 / 100-109 优秀 / 90-99 良好 / 60-89 常规 / <60 预警区', () => {
  eq(cbSettleTier(115).key, 'excellent'); eq(cbSettleTier(110).key, 'excellent');
  eq(cbSettleTier(109).key, 'good'); eq(cbSettleTier(100).key, 'good');
  eq(cbSettleTier(99).key, 'fair'); eq(cbSettleTier(90).key, 'fair');
  eq(cbSettleTier(89).key, 'regular'); eq(cbSettleTier(60).key, 'regular');
  eq(cbSettleTier(59).key, 'low'); eq(cbSettleTier(0).key, 'low');
});
t('结算本月：卓越3券 / 优秀班长券 / 良好9折 / 常规与预警区无；同月防重复', () => {
  state = freshState([
    { id: 1, name: '甲', credit: 115 },
    { id: 2, name: '乙', credit: 105 },
    { id: 3, name: '丙', credit: 95 },
    { id: 4, name: '丁', credit: 70 },
    { id: 5, name: '戊', credit: 55 }
  ]);
  const month = cbMonthKey();
  const n = cbDoSettle();
  eq(n, 5, '发放条数（卓越3+优秀1+良好1）');
  const v1 = cbVouchers(1).filter(v => v.status !== 'refunded');
  eq(v1.length, 3, '卓越券数');
  eq(v1.map(v => v.key).sort().join(','), 'lateFree,lunch,movie', '三券齐备');
  eq(v1.every(v => v.source === 'settle' && v.month === month && v.status === 'unused'), true);
  const v2 = cbVouchers(2);
  eq(v2.length, 1); eq(v2[0].key, 'dayMonitor'); eq(v2[0].source, 'settle');
  eq(cbVouchers(3).length, 0, '良好不发券');
  eq(cbWallet(3).discountMonth, month, '良好 9 折月');
  eq(cbVouchers(4).length, 0); eq(cbWallet(4).discountMonth, '', '常规无折扣');
  eq(cbVouchers(5).length, 0);
  eq(state.creditBank.lastSettleMonth, month);
  eq(cbDoSettle(), 0, '同月重复结算返回 0');
  eq(cbVouchers(1).length, 3, '重复结算不重发');
});
t('cbGiveVoucher 同人同券同源同月去重（防重发）', () => {
  state = freshState([{ id: 7, name: '庚', credit: 100 }]);
  const month = cbMonthKey();
  eq(cbGiveVoucher(7, 'lateFree', 'redeem', month, 10, '') !== null, true);
  eq(cbGiveVoucher(7, 'lateFree', 'redeem', month, 10, ''), null, '重复兑换应返回 null');
  eq(cbVouchers(7).length, 1);
});

console.log('\n=== 预警扫描（cbScanAlerts） ===');
t('档位命中：≥60 无 / 59-50 黄 / 49-40 橙 / 39-30 红 / <30 深红', () => {
  eq(cbTierOf(70), null); eq(cbTierOf(60), null);
  eq(cbTierOf(59).level, 'yellow'); eq(cbTierOf(50).level, 'yellow');
  eq(cbTierOf(49).level, 'orange'); eq(cbTierOf(40).level, 'orange');
  eq(cbTierOf(39).level, 'red'); eq(cbTierOf(30).level, 'red');
  eq(cbTierOf(29).level, 'dark'); eq(cbTierOf(0).level, 'dark');
});
t('建档幂等：同档只一条；恶化才升级叠加；同月不降级补录', () => {
  state = freshState([{ id: 1, name: '甲', credit: 55 }]);
  eq(cbScanAlerts(), 1, '首次建档');
  eq(cbScanAlerts(), 0, '再扫不重复');
  eq(state.creditBank.alerts.length, 1);
  eq(state.creditBank.alerts[0].level, 'yellow');
  eq(cbPendingAlertCount(), 1);
  state.students[0].credit = 45;
  eq(cbScanAlerts(), 1, '恶化→橙色升级叠加');
  eq(state.creditBank.alerts.length, 2);
  state.students[0].credit = 58;   // 回升但未回正常区
  eq(cbScanAlerts(), 0, '同月不降级补录');
  eq(state.creditBank.alerts.length, 2);
});
t('回升 ≥60 自动办结全部未决预警（留痕 resolvedAt）', () => {
  state.students[0].credit = 75;
  const chg = cbScanAlerts();
  eq(chg, 2, '两笔未决一起办结');
  eq(state.creditBank.alerts.every(a => a.status === 'resolved' && a.resolvedAt > 0), true);
  eq(cbPendingAlertCount(), 0);
  eq(cbScanAlerts(), 0);
});

console.log('\n=== 云合并（cbMergeBanks） ===');
t('券包：同券 id 取 usedAt/time 更新者，其余并集；折扣月取大', () => {
  const month = cbMonthKey();
  const l = cbDefaultBank();
  l.wallets['1'] = {
    pendingItems: [
      { id: 1, key: 'lateFree', name: '免迟到券', source: 'redeem', month, cost: 10, status: 'unused', time: 100, usedAt: 0 },
      { id: 2, key: 'lunch', name: '与班主任共进午餐', source: 'redeem', month, cost: 30, status: 'unused', time: 100, usedAt: 0 }
    ],
    discountMonth: ''
  };
  l.nextVoucherId = 3;
  const r = cbDefaultBank();
  r.wallets['1'] = {
    pendingItems: [
      { id: 1, key: 'lateFree', name: '免迟到券', source: 'redeem', month, cost: 10, status: 'used', time: 100, usedAt: 999 },
      { id: 3, key: 'movie', name: '晚自习电影点播', source: 'settle', month, cost: 0, status: 'unused', time: 300, usedAt: 0 }
    ],
    discountMonth: month
  };
  r.nextVoucherId = 4;
  const m = cbMergeBanks(l, r);
  const items = m.wallets['1'].pendingItems;
  eq(items.length, 3, '并集 3 张');
  const late = items.find(v => v.id === 1);
  eq(late.status, 'used', '同 id 取更新者（已核销）');
  eq(late.usedAt, 999);
  eq(m.wallets['1'].discountMonth, month, '折扣月取大');
  eq(m.nextVoucherId, 4);
});
t('流水按 id 去重取 time 大者并倒序；预警并集；lastSettleMonth/计数器取大', () => {
  const l = cbDefaultBank();
  l.ledger = [{ id: 1, sid: '1', delta: -10, time: 100 }, { id: 2, sid: '2', delta: 5, time: 50 }];
  l.nextLedgerId = 3;
  l.alerts = [{ id: 1, sid: '1', level: 'yellow', status: 'pending', time: 100, resolvedAt: 0 }];
  l.nextAlertId = 2;
  l.lastSettleMonth = '2026-09';
  const r = cbDefaultBank();
  r.ledger = [{ id: 1, sid: '1', delta: -20, time: 200 }, { id: 3, sid: '3', delta: 30, time: 80 }];
  r.nextLedgerId = 4;
  r.alerts = [{ id: 2, sid: '2', level: 'red', status: 'pending', time: 300, resolvedAt: 0 }];
  r.nextAlertId = 3;
  r.lastSettleMonth = '2026-10';
  const m = cbMergeBanks(l, r);
  eq(m.ledger.length, 3, '流水并集 3 条');
  eq(m.ledger.find(e => e.id === 1).delta, -20, '同 id 取 time 大者');
  eq(m.ledger[0].id, 1, '倒序：time 大者在前');
  eq(m.alerts.length, 2);
  eq(m.nextLedgerId, 4); eq(m.nextAlertId, 3);
  eq(m.lastSettleMonth, '2026-10');
});

console.log('\n=== 模块边界 ===');
t('renderBankPage/updateCbAlertChip 挂到 window 调用（refresh 体系 safe() 可调用）', () => {
  has(html, 'safe(window.renderBankPage);');
  has(html, 'safe(window.updateCbAlertChip);');
});
t('applyCreditDelta 双轨注释（加分自动等额发币由流水派生，无额外记账）', () => {
  const ac = html.match(/function applyCreditDelta\([\s\S]*?\n\}/)[0];
  has(ac, 'v2.17.23 学分银行双轨');
  has(ac, '无需额外记账');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
