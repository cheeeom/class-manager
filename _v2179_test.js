/* v2.18.0 回归测试：月度阶梯奖励（当月净增五档 10/20/30/50/70）+ 兑换商店自定义目录
   覆盖：净增五档奖励（币+券）/ 商店目录 CRUD（改价·改限·上下架·删除）/ 类别筛选 / 姓名学号快速筛选 /
        奖励券当月有效自动失效（商店买的不过期）/ 目录随云同步 / 商品详情与编辑弹窗。
   运行：node _v2179_test.js */
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

// —— 模块级常量（eval 抽出的函数闭包按名引用）——
const CB_STORE = eval('(' + (html.match(/const CB_STORE = (\[[\s\S]*?\n\]);/) || [, '[]'])[1] + ')');
const CB_CATS = eval('(' + (html.match(/const CB_CATS = (\[[^\n]*\]);/) || [, '[]'])[1] + ')');
// v2.18.0 净增五档（旧三档 CB_SETTLE_COINS / CB_SETTLE_LV1/LV2_COUPONS 已移除）
const CB_NET_TIERS = eval('(' + (html.match(/const CB_NET_TIERS = (\[[\s\S]*?\n\]);/) || [, '[]'])[1] + ')');
const tierOf = function (k) { const t = CB_NET_TIERS.find(function (x) { return x.key === k; }); return t || { coin: 0, coupons: [] }; };
const CB_ALERT_MIN = 60;

var state = { className: '', classNameFull: '', students: [], operations: [], creditBank: null };
const cbDefaultBank = extractFn('cbDefaultBank');
const cbBankSafe = extractFn('cbBankSafe');
const cbWalletKey = extractFn('cbWalletKey');
const cbWallet = extractFn('cbWallet');
const cbVouchers = extractFn('cbVouchers');
const cbMonthKey = extractFn('cbMonthKey');
const cbSettleTier = extractFn('cbSettleTier');
const cbSettleLv3Coupons = extractFn('cbSettleLv3Coupons');
const cbStoreItems = extractFn('cbStoreItems');
const cbStoreAll = extractFn('cbStoreAll');
const cbStoreItemByKey = extractFn('cbStoreItemByKey');
const cbStoreCats = extractFn('cbStoreCats');
const cbSaveStoreItem = extractFn('cbSaveStoreItem');
const cbToggleStoreItem = extractFn('cbToggleStoreItem');
const cbDeleteStoreItem = extractFn('cbDeleteStoreItem');
const cbGiveVoucher = extractFn('cbGiveVoucher');
const cbExpireCoupons = extractFn('cbExpireCoupons');
const cbCoinMap = extractFn('cbCoinMap');
const cbSname = extractFn('cbSname');
const cbPushLedger = extractFn('cbPushLedger');
const cbNormalizeShape = extractFn('cbNormalizeShape');
const cbMergeBanks = extractFn('cbMergeBanks');
const cbStoreUsedCount = extractFn('cbStoreUsedCount');
const cbStoreItemCost = extractFn('cbStoreItemCost');
// toast 桩（被抽取函数内部会调）
function showToast() {}
// 当前月的前一个月（构造"上月"券用）
function prevMonthKey() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function freshState(students, ops) {
  return { className: '', classNameFull: '', students: students || [], operations: ops || [], creditBank: cbDefaultBank() };
}

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.3（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.3</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.3 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.3')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== v2.18.0 净增五档奖励规则（老板口径：当月净增 ≥10 起奖 / ≥70 封顶）===');
t('常量就位：CB_NET_TIERS 五档币/券单递进 + 6 类预设目录 + 类别表', () => {
  eq(CB_NET_TIERS.length, 5, '应为五档');
  const coins = CB_NET_TIERS.map(x => x.coin);
  ok(coins.every(c => c > 0) && coins.every((c, i) => i === 0 || c > coins[i - 1]), '五档币应递增：' + JSON.stringify(coins));
  eq(CB_NET_TIERS[0].coupons.length, 1, 't1 起步 1 券');
  ok(CB_NET_TIERS.slice(0, 4).every((x, i) => i === 0 || x.coupons.length > CB_NET_TIERS[i - 1].coupons.length), '券单应逐档递进');
  eq(CB_NET_TIERS[4].coupons, null, 't5 全目录动态取');
  eq(CB_STORE.length, 6, '预设 6 券');
  eq(CB_CATS.length, 6, '6 个类别');
  CB_STORE.forEach(it => { ok(it.cat && it.detail, '预设券缺 cat/detail：' + it.key); });
});
t('净增 <10（含 0 与负）无奖励：不发币不发券（只看当月净增，与总分/预警区无关）', () => {
  [0, 5, 9, -3, -60].forEach(net => {
    const tt = cbSettleTier(net);
    eq(tt.key, 'none', net + ' 应为无奖励');
    eq(tt.coin, 0); eq((tt.coupons || []).length, 0);
  });
});
t('10/20/30/50/70 门槛命中：刚好踩线即进档', () => {
  eq(cbSettleTier(10).key, 't1'); eq(cbSettleTier(20).key, 't2'); eq(cbSettleTier(30).key, 't3');
  eq(cbSettleTier(50).key, 't4'); eq(cbSettleTier(70).key, 't5');
  eq(cbSettleTier(9.9).key, 'none'); eq(cbSettleTier(19.9).key, 't1');
  eq(cbSettleTier(29.9).key, 't2'); eq(cbSettleTier(49.9).key, 't3'); eq(cbSettleTier(69.9).key, 't4');
  eq(cbSettleTier(500).key, 't5', '70 以上封顶仍是 t5');
  eq(cbSettleTier(500).coin, tierOf('t5').coin, '封顶不再加码');
});
t('t5 封顶券单 = 当前上架目录全量（动态，不含已下架）', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const all = cbStoreItems().map(it => it.key);
  eq(cbSettleLv3Coupons().join(','), all.join(','));
  cbToggleStoreItem('movie');
  const after = cbStoreItems().map(it => it.key);
  ok(after.indexOf('movie') < 0, '下架后应移出上架目录');
  eq(cbSettleLv3Coupons().join(','), after.join(','), '下架商品不再随 t5 发放');
  cbToggleStoreItem('movie');
});

console.log('\n=== 商店目录 CRUD（可改价 / 可下架 / 可增删）===');
t('首次进入自动种入预设 6 券（builtin + on），并只返回上架项', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const items = cbStoreItems();
  eq(items.length, 6);
  eq(items.filter(i => i.builtin === true).length, 6);
  eq(items.filter(i => i.on !== false).length, 6);
  eq(cbStoreAll().length, 6);
  ok(cbStoreItemByKey('lateFree') !== null);
  eq(cbStoreItemByKey('nope'), null);
});
t('改价 / 改限购 / 改描述：编辑命中即覆盖，key 与 builtin 不变', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  cbSaveStoreItem({ key: 'lateFree', name: '免迟到券（改名）', cost: 66, limit: 3, desc: '新简介', detail: '新详情', cat: '特权' });
  const it = cbStoreItemByKey('lateFree');
  eq(it.name, '免迟到券（改名）'); eq(it.cost, 66); eq(it.limit, 3);
  eq(it.desc, '新简介'); eq(it.detail, '新详情');
  eq(it.builtin, true, '改过仍是预设项（保留 builtin 标记）');
  eq(cbStoreAll().length, 6, '编辑不新增条目');
});
t('新增自定义商品：key 自增不撞号，builtin:false，可删除', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const a = cbSaveStoreItem({ name: '奶茶一杯', icon: '🧋', cat: '餐饮', cost: 12, limit: 2, desc: 'd', detail: 'x' });
  ok(/^c\d+$/.test(a.key), '自定义 key 应为 c+自增数字，实际 ' + a.key);
  eq(a.builtin, false); eq(a.on, true);
  const b = cbSaveStoreItem({ name: '免写作文一次', cat: '学习', cost: 88, limit: 1 });
  eq(b.key, 'c' + (Number(a.key.slice(1)) + 1), '自增不撞号');
  eq(cbStoreAll().length, 8);
  eq(cbDeleteStoreItem(a.key), true);
  eq(cbStoreAll().length, 7); eq(cbStoreItemByKey(a.key), null);
  eq(cbDeleteStoreItem(a.key), false, '重复删除返回 false');
});
t('上下架：下架后不出现在商店、不可兑换；再上架恢复', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  eq(cbToggleStoreItem('lunch').on, false);
  eq(cbStoreItems().length, 5, '下架一项');
  eq(cbStoreItemByKey('lunch').on, false);
  cbToggleStoreItem('lunch');
  eq(cbStoreItems().length, 6, '上架恢复');
});
t('已发出的券自带名称/图标/价快照：删商品后历史券仍可核销显示', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const v = cbGiveVoucher(1, 'seatMate', 'redeem', cbMonthKey(), 8, '商店兑换');
  ok(v, '发券成功');
  eq(v.name, cbStoreItemByKey('seatMate').name);
  cbDeleteStoreItem('seatMate');
  eq(cbStoreItemByKey('seatMate'), null, '目录已移除');
  const vv = cbVouchers(1)[0];
  eq(vv.name, v.name, '券名快照不受影响');
  eq(vv.icon, v.icon, '券图标快照不受影响');
  eq(vv.status, 'unused', '仍可核销');
});
t('cbRedeem 拒绝已下架商品（on === false）', () => {
  const fn = html.match(/function cbRedeem\(sid, key\)\{[\s\S]*?\n\}/)[0];
  has(fn, "if(it.on === false){ showToast(it.name + ' 已下架，暂不可兑换', 'warning'); return null; }", '缺下架拦截');
  has(fn, 'cbStoreItemByKey(key)', '应按实时目录取商品');
});
t('类别筛选：cbStoreCats 返回目录中出现过的类别（去重）', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const cats = cbStoreCats();
  ok(cats.indexOf('特权') >= 0 && cats.indexOf('餐饮') >= 0 && cats.indexOf('娱乐') >= 0, '预设三类应在');
  eq(cats.length, new Set(cats).size, '类别去重');
  cbSaveStoreItem({ name: '新类别商品', cat: '奇思妙想', cost: 1, limit: 1 });
  ok(cbStoreCats().indexOf('奇思妙想') >= 0, '自定义类别应出现在筛选里');
});

console.log('\n=== 奖励券当月有效（店买券不过期）===');
t('cbExpireCoupons：上月 settle 未用券 → expired（留痕不退币）；redeem 券永不过期', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const pm = prevMonthKey();
  cbGiveVoucher(1, 'lateFree', 'settle', pm, 0, '上月奖励');
  cbGiveVoucher(1, 'lunch', 'redeem', pm, 30, '上月花币买');
  eq(cbExpireCoupons(), 1, '只过期 1 张（白送券）');
  const vs = cbVouchers(1);
  const settleV = vs.find(v => v.source === 'settle');
  const redeemV = vs.find(v => v.source === 'redeem');
  eq(settleV.status, 'expired');
  ok(settleV.expiredAt > 0, '过期留痕 expiredAt');
  eq(redeemV.status, 'unused', '花币买的券不过期');
  eq(cbExpireCoupons(), 0, '幂等：再扫不重复计数');
});
t('cbExpireCoupons：已核销/已退还的券不动；当月券不动', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const pm = prevMonthKey();
  const a = cbGiveVoucher(1, 'lateFree', 'settle', pm, 0, '');
  const b = cbGiveVoucher(1, 'lunch', 'settle', pm, 0, '');
  cbVouchers(1).find(v => v.id === a.id).status = 'used';
  cbVouchers(1).find(v => v.id === b.id).status = 'refunded';
  eq(cbExpireCoupons(), 0, '非 unused 不处理');
  const c = cbGiveVoucher(1, 'movie', 'settle', cbMonthKey(), 0, '');
  eq(c.status, 'unused');
  eq(cbExpireCoupons(), 0, '当月券不过期');
});
t('cbExpireCoupons 挂载：loadData 末尾 + saveData 顶部', () => {
  const ld = html.match(/function loadData\(\)\{[\s\S]*?\n\}/)[0];
  has(ld, 'cbExpireCoupons()', 'loadData 未挂过期扫描');
  const sd = html.match(/function saveData\(\)\{[\s\S]*?autoPushToCloud\(\);[\s\S]*?\n\}/)[0];
  has(sd, 'cbExpireCoupons();', 'saveData 未挂过期扫描');
});

console.log('\n=== 目录随云同步（五处链路）===');
t('state 默认含 store:{ items:[], nextItemId:1 }', () => {
  has(html, 'store:{ items:[], nextItemId:1 }', 'state 默认缺商店目录');
});
t('saveData 手写清单 / CLOUD_SYNC_FIELDS 白名单含 creditBank（store 随 bank 整体同步）', () => {
  const sd = html.match(/function saveData\(\)\{[\s\S]*?autoPushToCloud\(\);[\s\S]*?\n\}/)[0];
  has(sd, 'creditBank: state.creditBank');
  const m = html.match(/CLOUD_SYNC_FIELDS = \[([\s\S]*?)\];/)[1];
  has(m, "'creditBank'");
});
t('cbMergeBanks 合并 store.items：按 key 并集，同 key 取 upd 大者；nextItemId 取大', () => {
  const L = { wallets: {}, ledger: [], alerts: [], nextLedgerId: 1, nextAlertId: 1, nextVoucherId: 1,
              lastSettleMonth: '', store: { items: [{ key: 'lateFree', name: '本地名', cost: 10, upd: 100 },
                                                    { key: 'c9', name: '本地独有', cost: 5, upd: 100 }], nextItemId: 10 } };
  const R = { wallets: {}, ledger: [], alerts: [], nextLedgerId: 1, nextAlertId: 1, nextVoucherId: 1,
              lastSettleMonth: '', store: { items: [{ key: 'lateFree', name: '远端新名', cost: 20, upd: 200 },
                                                    { key: 'c8', name: '远端独有', cost: 7, upd: 200 }], nextItemId: 8 } };
  const m = cbMergeBanks(L, R);
  const keys = m.store.items.map(i => i.key).sort();
  eq(keys.join(','), 'c8,c9,lateFree', '并集');
  const lf = m.store.items.find(i => i.key === 'lateFree');
  eq(lf.name, '远端新名', 'upd 大者胜'); eq(lf.cost, 20);
  eq(m.store.nextItemId, 10, '计数器取大');
  eq(L.store.items.length, 2, '输入不被修改（纯函数）');
  eq(R.store.items.length, 2);
});
t('cbMergeBanks 缺 store 字段也安全（旧数据升级）', () => {
  const m = cbMergeBanks({ wallets: {}, ledger: [], alerts: [] }, { wallets: {}, ledger: [], alerts: [] });
  ok(m.store && Array.isArray(m.store.items), '应补齐 store');
});

console.log('\n=== 商店 UI：类别筛选 / 姓名学号快速筛选 / 详情与编辑弹窗 ===');
t('商店页渲染：类别 chips + 搜索框 + 商品卡（整卡看详情、✎ 编辑、兑换按钮不冒泡）', () => {
  const store = html.match(/cbBankTab === 'store'[\s\S]*?\n  \} else if\(cbBankTab === 'vouchers'\)/)[0];
  has(store, 'cbBankCatTo(', '缺类别切换');
  has(store, 'id="cbStoreSearch"', '缺学生搜索框');
  has(store, 'oninput="cbStoreSearchInput(this.value)"', '缺输入即匹配');
  has(store, 'onkeydown="cbStoreSearchKey(event)"', '缺回车选中');
  has(store, 'id="cbStoreMatch"', '缺匹配下拉容器');
  has(store, 'cbOpenItemDetail(', '缺整卡详情');
  has(store, 'event.stopPropagation();cbRedeemUI(', '兑换按钮应阻止冒泡');
  has(store, 'event.stopPropagation();cbOpenItemEditor(', '编辑按钮应阻止冒泡');
  has(store, 'cbOpenItemEditor(', '缺新增/编辑商品入口');
  has(store, 'cbStoreItems().filter(function(it){ return !cbBankCat || it.cat === cbBankCat; })', '缺类别过滤');
});
t('cbStoreSidPick / cbBankCatTo / cbStorePickSid / cbStoreSearchInput / cbStoreSearchKey 均已定义', () => {
  ['cbStoreSidPick', 'cbBankCatTo', 'cbStorePickSid', 'cbStoreSearchInput', 'cbStoreSearchKey',
   'cbOpenItemDetail', 'cbOpenItemEditor', 'cbSaveItemForm', 'cbToggleItemUI', 'cbDeleteItemUI',
   'initBankTabIndicator'].forEach(fn => {
    ok(new RegExp('function ' + fn + '\\s*\\(').test(html), '未定义 ' + fn);
  });
});
t('cbBankCat 变量已声明（否则类别筛选 ReferenceError）', () => {
  ok(/var cbBankCat = '';/.test(html), '缺 var cbBankCat');
});
t('cbStoreSearchInput 支持姓名 / 学号 / id 三种匹配（最多 8 条）', () => {
  const fn = html.match(/function cbStoreSearchInput\(q\)\{[\s\S]*?\n\}/)[0];
  has(fn, "(s.name || '').indexOf(q) >= 0", '缺姓名匹配');
  has(fn, 'String(s.sid == null ? \'\' : s.sid).indexOf(q) >= 0', '缺学号匹配');
  has(fn, 'String(s.id) === q', '缺 id 精确匹配');
  has(fn, '.slice(0, 8)', '缺 8 条上限');
});
t('商品详情弹窗 #cbItemDetailModal：含头部关闭键 + #cbItemDetailBody + #cbItemDetailBtn', () => {
  const m = html.match(/<div class="modal-overlay" id="cbItemDetailModal">[\s\S]*?\n<\/div>\n\n<!--/);
  ok(m, '未找到 cbItemDetailModal');
  has(m[0], 'id="cbItemDetailBody"');
  has(m[0], 'id="cbItemDetailBtn"');
  has(m[0], 'button class="modal-close"', '缺圆关闭键（v2.17.18 弹窗头部规范）');
});
t('商品编辑弹窗 #cbItemEditorModal：表单字段齐 + 删除/上下架/保存', () => {
  const m = html.match(/<div class="modal-overlay" id="cbItemEditorModal">[\s\S]*?\n<\/div>\n\n<!--/);
  ok(m, '未找到 cbItemEditorModal');
  ['cbItemEditTitle', 'cbItemEditKey', 'cbItemEditName', 'cbItemEditIcon', 'cbItemEditCost',
   'cbItemEditLimit', 'cbItemEditDesc', 'cbItemEditDetail', 'cbItemEditCat',
   'cbItemEditDel', 'cbItemEditToggle'].forEach(id => has(m[0], 'id="' + id + '"', '缺字段 ' + id));
  has(m[0], 'cbSaveItemForm()', '缺保存按钮');
});
t('.cb-chip 胶囊样式就位（默认/选中/匹配下拉）', () => {
  has(html, '.cb-chip{', '缺 .cb-chip 样式');
  has(html, '.cb-chip.on{', '缺选中态样式');
  has(html, '.cb-match{', '缺匹配行样式');
});
t('cbOpenItemEditor：预设券不可删（只可改可下架），自定义可删，删除键绑定 key', () => {
  const fn = html.match(/function cbOpenItemEditor\(key\)\{[\s\S]*?\n\}/)[0];
  has(fn, "(it && !it.builtin) ? '' : 'none'", '预设券应隐藏删除键');
  has(fn, 'del.onclick = function(){ cbDeleteItemUI(key); };', '删除键未绑定 key');
  has(fn, "tg.textContent = (it && it.on === false) ? '上架该商品' : '下架（商店不再显示）';", '缺上下架文案');
  has(fn, 'CB_CATS', '类别下拉应取预设类别表');
});
t('cbVoucherChip 签名与调用一致（券包 chip 曾只收 1 参导致错渲染）', () => {
  has(html, 'function cbVoucherChip(sid, v){', '定义应为 (sid, v)');
  const call = html.match(/cbVoucherChip\([^)]*\)/g) || [];
  ok(call.every(c => /cbVoucherChip\([^,)]+,/.test(c)), '调用点应传两个参数：' + call.join(' | '));
});
t('商店说明文案已更新：店买券不过期 / 月奖券当月有效', () => {
  has(html, '商店买的券不过期', '缺店买券说明');
  has(html, '月度奖励白送的券当月有效', '缺月奖券说明');
});
t('结算说明与确认框已改为净增五档口径（+10 起奖 / +70 封顶 / 净增<10 无奖励）', () => {
  has(html, '按「当月净增」+10 起奖、+70 五档封顶', '缺结算卡副标题');
  has(html, '净增 &lt;10（含 0 / 负）：无奖励', '概览缺无奖励说明');
  has(html, '净增 <10（含 0 / 负）：无奖励', '结算确认框缺无奖励说明');
  has(html, '奖励券当月有效，跨月自动失效', '缺跨月失效说明');
  if (html.indexOf('110 分起奖、200 分封顶') >= 0) throw new Error('旧三档文案残留');
});

console.log('\n=== 币与兑换基础（回归防 regressions）===');
t('cbStoreItemCost：无折扣 = 原价；9 折月 = 原价×0.9 取整', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const it = cbStoreItemByKey('movie');   // 50 币
  eq(cbStoreItemCost(1, it), 50);
  cbWallet(1).discountMonth = cbMonthKey();
  eq(cbStoreItemCost(1, it), 45, '50×0.9=45');
  eq(cbStoreItemCost(1, cbStoreItemByKey('seatMate')), 7, '8×0.9=7.2→7');
});
t('cbStoreUsedCount 只算当月 redeem 未退还券', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }]);
  const m = cbMonthKey();
  cbGiveVoucher(1, 'lunch', 'redeem', m, 30, '');
  eq(cbStoreUsedCount(1, 'lunch', m), 1);
  cbGiveVoucher(1, 'lunch', 'settle', m, 0, '');
  eq(cbStoreUsedCount(1, 'lunch', m), 1, '白送券不计入限购');
  cbVouchers(1)[0].status = 'refunded';
  eq(cbStoreUsedCount(1, 'lunch', m), 0, '已退还释放额度');
});
t('币派生不受净增改档影响：Σ有效加分 + Σ银行流水', () => {
  state = freshState([{ id: 1, name: '甲', credit: 100 }], [{ id: 1, studentId: 1, amount: 10 }, { id: 2, studentId: 1, amount: -4 }]);
  cbPushLedger('settle', 1, tierOf('t5').coin, '巅峰奖', '');
  eq(cbCoinMap(state.operations, state.creditBank.ledger)['1'], 10 + tierOf('t5').coin);
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
