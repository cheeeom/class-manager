/* v2.17.29 回归测试：学分银行二期 —— 学生银行档案 / 月度结算统计 / 流水·预警筛选
   覆盖：settleHist 快照（结算写入/同月去重/云合并按月取新）+ 学生档案聚合助手 + 档案弹窗/筛选 UI 接入。
   运行：node _v2180_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
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
// 模块级常量
const CB_SETTLE_COINS = eval('(' + (html.match(/const CB_SETTLE_COINS = (\{[^\n]*\});/) || [, '{}'])[1] + ')');
const CB_ALERT_MIN = 60;
const CB_STORE = eval('(' + (html.match(/const CB_STORE = (\[[\s\S]*?\n\]);/) || [, '[]'])[1] + ')');
const CB_ALERT_TIERS = eval('(' + (html.match(/const CB_ALERT_TIERS = (\[[\s\S]*?\n\]);/) || [, '[]'])[1] + ')');
const CB_LEVEL_COLORS = eval('(' + (html.match(/const CB_LEVEL_COLORS = (\{[^\n]*\});/) || [, '{}'])[1] + ')');
const CB_SETTLE_LV1_COUPONS = eval('(' + (html.match(/const CB_SETTLE_LV1_COUPONS = (\[[^\n]*\]);/) || [, '[]'])[1] + ')');
const CB_SETTLE_LV2_COUPONS = eval('(' + (html.match(/const CB_SETTLE_LV2_COUPONS = (\[[^\n]*\]);/) || [, '[]'])[1] + ')');

var state = { className: '', classNameFull: '', students: [], operations: [], creditBank: null };
const cbDefaultBank = extractFn('cbDefaultBank');
const cbBankSafe = extractFn('cbBankSafe');
const cbNormalizeShape = extractFn('cbNormalizeShape');
const cbMergeBanks = extractFn('cbMergeBanks');
const cbWalletKey = extractFn('cbWalletKey');
const cbWallet = extractFn('cbWallet');
const cbVouchers = extractFn('cbVouchers');
const cbMonthKey = extractFn('cbMonthKey');
const cbStoreItems = extractFn('cbStoreItems');
const cbStoreAll = extractFn('cbStoreAll');
const cbStoreItemByKey = extractFn('cbStoreItemByKey');
const cbSettleTier = extractFn('cbSettleTier');
const cbSettleLv3Coupons = extractFn('cbSettleLv3Coupons');
const cbGiveVoucher = extractFn('cbGiveVoucher');
const cbSname = extractFn('cbSname');
const cbPushLedger = extractFn('cbPushLedger');
const cbDoSettle = extractFn('cbDoSettle');
const cbBankProfileOf = extractFn('cbBankProfileOf');
const cbTierOf = extractFn('cbTierOf');
const cbLedgerTypeName = extractFn('cbLedgerTypeName');
function showToast() {}
function freshState(students, ops) {
  return { className: '', classNameFull: '', students: students || [], operations: ops || [], creditBank: cbDefaultBank() };
}

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.17.29（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.17\.29</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.17\.29 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.17.29')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== settleHist 数据层（月度结算统计快照）===');
t('state 默认 / cbDefaultBank / cbBankSafe 兜底 均含 settleHist:[]', () => {
  has(html, 'settleHist: [],  // v2.17.29 月度结算统计快照', 'state 默认缺 settleHist');
  ok(Array.isArray(cbDefaultBank().settleHist), 'cbDefaultBank 缺 settleHist');
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  state.creditBank.settleHist = undefined;      // 模拟老数据
  state.creditBank = cbBankSafe();
  ok(Array.isArray(state.creditBank.settleHist), 'cbBankSafe 未兜底补齐');
});
t('cbNormalizeShape 保留老数据 settleHist', () => {
  const n = cbNormalizeShape({ settleHist: [{ month: '2026-08', at: 1 }] });
  eq(n.settleHist.length, 1);
});
t('cbDoSettle 写快照：各档人数/实发币/发券 + 同月不重复建档', () => {
  state = freshState([
    { id: 1, name: '甲', credit: 230 },   // lv3：币 + 全目录券
    { id: 2, name: '乙', credit: 170 },   // lv2：币 + 3 券
    { id: 3, name: '丙', credit: 120 },   // lv1：币 + 1 券
    { id: 4, name: '丁', credit: 100 },   // 常规区
    { id: 5, name: '戊', credit: 42 }     // 预警区
  ]);
  const month = cbMonthKey();
  cbDoSettle();
  const hist = state.creditBank.settleHist;
  eq(hist.length, 1, '建档一条');
  const h = hist[0];
  eq(h.month, month);
  eq(h.counts.lv3, 1); eq(h.counts.lv2, 1); eq(h.counts.lv1, 1);
  eq(h.coins.lv3, CB_SETTLE_COINS.lv3, 'lv3 实发币 = 1 人 × 档额');
  eq(h.coins.lv2, CB_SETTLE_COINS.lv2);
  eq(h.coins.lv1, CB_SETTLE_COINS.lv1);
  ok(h.at > 0);
  cbDoSettle();
  eq(state.creditBank.settleHist.length, 1, '同月重复结算不追加建档');
});
t('cbMergeBanks 合并 settleHist：按月并集、同月取 at 大者、倒序', () => {
  const mk = hist => ({ wallets: {}, ledger: [], alerts: [], nextLedgerId: 1, nextAlertId: 1,
                        nextVoucherId: 1, lastSettleMonth: '', store: { items: [], nextItemId: 1 }, settleHist: hist });
  const L = mk([{ month: '2026-08', at: 100, counts: { lv1: 1, lv2: 0, lv3: 0 } },
                { month: '2026-07', at: 50, counts: { lv1: 0, lv2: 1, lv3: 0 } }]);
  const R = mk([{ month: '2026-08', at: 200, counts: { lv1: 2, lv2: 0, lv3: 0 } },   // 同月，取新
                { month: '2026-09', at: 300, counts: { lv1: 0, lv2: 0, lv3: 1 } }]);
  const m = cbMergeBanks(L, R);
  const byMonth = {};
  m.settleHist.forEach(h => byMonth[h.month] = h);
  eq(Object.keys(byMonth).sort().join(','), '2026-07,2026-08,2026-09');
  eq(byMonth['2026-08'].at, 200, '同月 at 大者胜');
  eq(m.settleHist[0].month, '2026-09', '最新月份在前');
  eq(m.settleHist[2].month, '2026-07');
  eq(L.settleHist.length, 2, '输入不被修改');
});

console.log('\n=== 学生银行档案聚合（cbBankProfileOf）===');
t('档案聚合：币 = 有效加分 + 银行收支 分解正确', () => {
  state = freshState([{ id: 1, name: '张一', sid: '1', credit: 120 }],
    [{ id: 10, studentId: 1, amount: 8, reason: 'x' }, { id: 11, studentId: 1, amount: -3 }, { id: 12, studentId: 1, amount: 5, state: 'revoked' }]);
  cbPushLedger('redeem', 1, -4, '买券', '');
  cbPushLedger('settle', 1, 20, '进取奖', '');
  const p = cbBankProfileOf(1);
  eq(p.sid, '1'); eq(p.name, '张一');
  eq(p.opCoin, 8, '撤销的不计');
  eq(p.lgCoin, 16, '-4+20');
  eq(p.coin, 24, '8+16');
  eq(p.credit, 120);
  eq(p.tier, null, '120 ≥60 无预警档');
  const p2 = cbBankProfileOf(1);
  eq(p2.sid, '1');
  eq(p.ledger.length, 2);
});
t('档案聚合：券按状态计数 + 预警记录按生过滤', () => {
  state = freshState([{ id: 1, name: '甲', credit: 90 }, { id: 2, name: '乙', credit: 55 }]);
  const m = cbMonthKey();
  const a = cbGiveVoucher(1, 'lateFree', 'redeem', m, 10, '');
  cbGiveVoucher(1, 'lunch', 'settle', m, 0, '');
  const c = cbGiveVoucher(2, 'movie', 'redeem', m, 50, '');
  cbVouchers(1).find(v => v.id === a.id).status = 'used';
  cbVouchers(2).find(v => v.id === c.id).status = 'expired';
  const p1 = cbBankProfileOf(1);
  eq(p1.vStat.used, 1); eq(p1.vStat.unused, 1); eq(p1.vouchers.length, 2);
  const p2 = cbBankProfileOf(2);
  eq(p2.vStat.expired, 1); eq(p2.vouchers.length, 1);
  ok(cbBankProfileOf('nobody').s == null, '不存在学生返回 s=null');
});
t('cbTierOf / cbLedgerTypeName 供档案复用未破坏', () => {
  eq(cbTierOf(55).level, 'yellow');
  eq(cbLedgerTypeName('redeem'), '商店兑换');
  eq(cbLedgerTypeName('adjust'), '手动调整');
});

console.log('\n=== UI 接入（档案入口 + 筛选器 + 弹窗）===');
t('UI 状态变量齐：cbProfileSid/cbLedgerSid/cbLedgerType/cbAlertStatus', () => {
  ['var cbProfileSid', 'var cbLedgerSid', 'var cbLedgerType', 'var cbAlertStatus'].forEach(v => has(html, v, '缺 ' + v));
});
t('概览排行行可点开档案（onclick=cbOpenBankProfile + 📊 提示）', () => {
  has(html, `onclick="cbOpenBankProfile(' + s.id + ')" title="查看 ' + cbEsc(s.name) + ' 的银行档案"`, '排行行缺档案入口');
  has(html, 'rankHint', '排行卡缺档案提示变量');
  has(html, '点任意一行查看该生完整银行档案');
});
t('券包页卡片 + 商店页均有 📊 档案按钮', () => {
  has(html, `cbOpenBankProfile(' + s.id + ')">📊 档案</button>`, '券包页缺档案按钮');
  has(html, `cbOpenBankProfile(' + cbStoreSid + ')"`, '商店页缺档案按钮');
});
t('档案弹窗 #cbBankProfileModal：标题/主体/刷新 齐', () => {
  const m = html.match(/<div class="modal-overlay" id="cbBankProfileModal">[\s\S]*?\n<\/div>\n\n<!--/);
  ok(m, '未找到档案弹窗');
  has(m[0], 'id="cbBankProfileTitle"'); has(m[0], 'id="cbBankProfileBody"');
  has(m[0], 'cbProfileRefresh()', '缺刷新按钮'); has(m[0], 'modal-close');
});
t('cbOpenBankProfile 渲染五段：头部/状态卡/收支/券包/预警', () => {
  const fn = html.match(/function cbOpenBankProfile\(sid\)\{[\s\S]*?\n\}/)[0];
  ['银行收支明细', '券包（', '预警记录（', 'statChips', '= 加分发币'].forEach(s => has(fn, s, '缺段 ' + s));
  has(fn, 'cbVoucherChip(p.sid, v)', '券应复用 cbVoucherChip 快照渲染');
});
t('cbPersist 刷新档案弹窗（操作后自动更新）', () => {
  const fn = html.match(/function cbPersist\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, "cbBankProfileModal", '缺弹窗刷新钩子');
  has(fn, 'cbOpenBankProfile(cbProfileSid)');
});
t('概览渲染含「📅 月度结算历史」卡', () => {
  has(html, '📅 月度结算历史（v2.17.29 起记录）');
  has(html, 'h.vouchers || 0', '缺发券统计');
});
t('流水页筛选条：搜索框/类型下拉/清除/合计', () => {
  has(html, 'id="cbLedgerSearch"', '缺流水学生搜索');
  has(html, 'cbLedgerSearchInput(', '缺输入匹配');
  has(html, 'cbLedgerTypeTo(this.value)', '缺类型筛选绑定');
  has(html, 'cbLedgerSidClear()', '缺清除筛选按钮');
  has(html, '共 \' + led.length + \' 条', '缺计数');
});
t('流水筛选逻辑：按学生 + 按类型双条件过滤', () => {
  has(html, "if(cbLedgerSid && String(e.sid) !== cbLedgerSid) return false;", '缺学生过滤');
  has(html, "if(cbLedgerType && e.type !== cbLedgerType) return false;", '缺类型过滤');
});
t('预警页状态筛选 chips（全部/待处理/已通知/已办结 + 计数）', () => {
  has(html, 'cbAlertStatusTo(', '缺状态切换');
  has(html, "{ v: '', l: '全部', n: allAlerts.length }", '缺全部');
  has(html, "v: 'resolved', l: '○ 已办结'", '缺已办结');
  has(html, '!cbAlertStatus || a.status === cbAlertStatus', '缺状态过滤');
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
