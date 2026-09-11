/* v2.18.0 回归测试：净增五档结算 + 全站学分徽章分档 + 预警中心迁学生页 + 行内快捷按钮移除
   覆盖：cbMonthNetOf/cbMonthOfTs（当月净增口径）/ cbCreditBadge 徽章五档渲染 /
        学生管理页第 3 页签接线 / 学分银行页签瘦身 / cbPersist 同步钩子 / 快速操作与 adjustCredit 移除。
   运行：node _v2184_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + `不应包含 ${JSON.stringify(b)}`); }

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
function extractConst(name) {
  const single = html.match(new RegExp('const ' + name + ' = [^\\n]*;'));
  if (single) return eval('(' + single[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
  const multiArr = html.match(new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n\\];'));
  if (multiArr) return eval('(' + multiArr[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
  const multiObj = html.match(new RegExp('const ' + name + ' = \\{[\\s\\S]*?\\n\\};'));
  if (multiObj) return eval('(' + multiObj[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
  throw new Error('未找到常量 ' + name);
}

// —— cbCreditBadge / cbMonthNetOf 依赖（真实抽取，供 eval 包装函数运行期引用）——
const CB_ALERT_MIN = extractConst('CB_ALERT_MIN');
const CB_ALERT_TIERS = extractConst('CB_ALERT_TIERS');
const CB_LEVEL_COLORS = extractConst('CB_LEVEL_COLORS');
const cbTierOf = extractFn('cbTierOf');
const cbWalletKey = extractFn('cbWalletKey');
const cbMonthOfTs = extractFn('cbMonthOfTs');
const cbMonthNetOf = extractFn('cbMonthNetOf');
const cbCreditBadge = extractFn('cbCreditBadge');
const CB_NET_TIERS = extractConst('CB_NET_TIERS');

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.11（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.11</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.11 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.11')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 当月净增口径（cbMonthOfTs / cbMonthNetOf 纯函数）===');
t('CB_NET_TIERS 五档结构：t1..t5 升序、币递增、券单递进、t5 全目录动态', () => {
  eq(CB_NET_TIERS.length, 5);
  eq(CB_NET_TIERS.map(x => x.key).join(','), 't1,t2,t3,t4,t5');
  eq(CB_NET_TIERS.map(x => x.min).join(','), '10,20,30,50,70');
  const coins = CB_NET_TIERS.map(x => x.coin);
  eq(coins.every((c, i) => i === 0 || c > coins[i - 1]), true, '币应递增');
  eq(CB_NET_TIERS[0].coupons.join(','), 'lateFree');
  eq(CB_NET_TIERS[4].coupons, null);
});
t('cbMonthOfTs：时间戳 → YYYY-MM；坏值兜底当前月', () => {
  eq(cbMonthOfTs(new Date(2026, 0, 5).getTime()), '2026-01');
  eq(cbMonthOfTs(new Date(2026, 8, 9).getTime()), '2026-09');
  eq(cbMonthOfTs('bad'), cbMonthOfTs(undefined));
});
t('当月净增 = Σ 当月未撤销 ops；扣分计入、跨月不计、无时间戳不计', () => {
  const now = Date.now();
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
  const prevTs = new Date(prev.getFullYear(), prev.getMonth(), 15, 12).getTime();
  const thisM = cbMonthOfTs(now), prevM = cbMonthOfTs(prevTs);
  const ops = [
    { id: 1, studentId: 1, amount: 10, time: now },
    { id: 2, studentId: 1, amount: -3, time: now },          // 当月扣分：净额回落
    { id: 3, studentId: 1, amount: 5,  time: now, state: 'revoked' },  // 撤销的加分不计
    { id: 4, studentId: 1, amount: 50, time: prevTs },        // 上月：不计入当月
    { id: 5, studentId: 1, amount: 7,  time: undefined },     // 无时间戳：不计
    { id: 6, studentId: 2, amount: 20, time: now },           // 他人流水不算
    { id: 7, studentId: 1, amount: 30, time: prevTs }
  ];
  eq(cbMonthNetOf(1, thisM, ops), 7, '10 - 3 = 7（撤销/上月/无时间戳/他人不计）');
  eq(cbMonthNetOf(1, prevM, ops), 80, '上月净增 50 + 30');
  eq(cbMonthNetOf(2, thisM, ops), 20);
  eq(cbMonthNetOf(9, thisM, ops), 0, '无流水 0');
});
t('净增为负值也如实返回（负净增定档无奖励）', () => {
  const now = Date.now();
  const m = cbMonthOfTs(now);
  eq(cbMonthNetOf(1, m, [{ studentId: 1, amount: -8, time: now }]), -8);
});

console.log('\n=== 全站学分徽章 cbCreditBadge 五档（v2.18.0）===');
t('<60 深底白字沿用预警档色：黄/橙/红/深红 + 档位文案 + 「低于及格线」提示', () => {
  const b59 = cbCreditBadge(59);
  has(b59, 'background:#b7791f', '黄档色'); has(b59, '黄色预警'); has(b59, '59 分 · 黄色预警');
  has(b59, 'title="低于及格线 60 → 黄色预警"');
  const b45 = cbCreditBadge(45); has(b45, 'background:#c05621'); has(b45, '橙色预警');
  const b30 = cbCreditBadge(30); has(b30, 'background:#c53030'); has(b30, '红色预警');
  const b29 = cbCreditBadge(29); has(b29, 'background:#7b1113'); has(b29, '深红预警');
  const b0 = cbCreditBadge(0); has(b0, '深红预警');
  const bn = cbCreditBadge(-3); has(bn, '-3 分 · 深红预警', '负分兜底深红');
});
t('60-109 常规：浅底蓝灰、纯分值不加档位字章（不喧宾夺主）', () => {
  const b60 = cbCreditBadge(60);
  has(b60, '60 分</span>'); has(b60, 'rgba(80,120,180,0.12)');
  notHas(b60, '· 进取'); notHas(b60, '· 卓越'); notHas(b60, '巅峰'); notHas(b60, '预警');
  const b109 = cbCreditBadge(109); has(b109, '109 分</span>');
});
t('110-149 进取（琥珀橙浅底 + 字章）；150-199 卓越（金黄）；≥200 巅峰（红金渐变 + 👑）', () => {
  const b110 = cbCreditBadge(110); has(b110, '110 分 · 进取'); has(b110, 'rgba(240,147,43,0.18)');
  const b149 = cbCreditBadge(149); has(b149, '149 分 · 进取');
  const b150 = cbCreditBadge(150); has(b150, '150 分 · 卓越'); has(b150, 'rgba(240,195,50,0.22)');
  const b199 = cbCreditBadge(199); has(b199, '199 分 · 卓越');
  const b200 = cbCreditBadge(200); has(b200, '200 分 · 巅峰 👑'); has(b200, 'linear-gradient(135deg,#fbe3d0');
  const b205 = cbCreditBadge(205); has(b205, '巅峰 👑');
});
t('小数先四舍五入再定档；非数字兜底 0', () => {
  has(cbCreditBadge('120.6'), '121 分 · 进取');
  has(cbCreditBadge('99.4'), '99 分</span>');
  has(cbCreditBadge('abc'), '0 分 · 深红预警');
  has(cbCreditBadge(undefined), '0 分 · 深红预警');
});
t('徽章全面接入：学生表 / 详情面板 / 银行排行 / 公示榜行均走 cbCreditBadge', () => {
  has(html, '<td>${cbCreditBadge(Number(s.credit) || 0)}</td>', '学生表未接入');
  has(html, '${cbCreditBadge(Number(s.credit) || 0)}</span></div>', '详情面板/公示行未接入');
  has(html, "'<td style=\"padding:6px 8px\">' + cbCreditBadge(credit) + '</td>'", '银行排行未接入');
  const n = html.split('cbCreditBadge(').length - 1;
  if (n < 6) throw new Error('cbCreditBadge 调用点不足：' + n);   // v2.18.2 零扣分榜改展示天数后为 6
  notHas(html, 'score-badge', '旧 score-badge 徽章残留（应整体迁移到 cbCreditBadge）');
});
t('零扣分榜行不再挂学分徽章（v2.18.2 起右侧展示「未扣分天数」）', () => {
  const i = html.indexOf('function pubStaminaRow');
  const seg = html.slice(i, html.indexOf('function pubCard(', i));
  notHas(seg, 'cbCreditBadge', '榜行仍调用学分徽章');
  has(seg, ' 天</span>', '缺天数展示');
});

console.log('\n=== 预警中心迁至学生管理页（第 3 页签）===');
t('学生管理页有 🚨 预警中心页签 + tab-alerts 容器', () => {
  has(html, '<div class="tab" data-tab="alerts"', '缺预警页签');
  has(html, '🚨 预警中心</div>', '缺页签文案');
  has(html, 'id="tab-alerts" style="display:none"', '缺页签容器');
});
t('switchStudentTab 通用三页签映射；切到 alerts 即实时渲染预警中心', () => {
  has(html, "var map = { list: 'tab-list', import: 'tab-import', alerts: 'tab-alerts' };");
  has(html, "if(t === 'alerts') cbRenderStudentAlerts();");
});
t('cbRenderStudentAlerts 承担原银行预警页渲染：状态筛选 + 办结/通知动作 + 图例', () => {
  has(html, 'function cbRenderStudentAlerts(){', '缺渲染函数');
  has(html, 'var chips = [', '缺状态 chips');
  has(html, 'onclick="cbAlertStatusTo(', 'chips 缺切换绑定');
  has(html, "cbAlertStatusTo(\\'' + c.v", 'chips 未绑定档位变量');
  has(html, "function cbAlertStatusTo(s){ cbAlertStatus = s || ''; cbRenderStudentAlerts(); }", '状态切换未指向学生页渲染');
});
t('顶部 🚨 角标直达学生页预警页签（不再跳学分银行）', () => {
  has(html, 'id="cbAlertChip" onclick="goStudentAlerts()"', '角标未指向 goStudentAlerts');
  has(html, 'function goStudentAlerts(){', '缺直达函数');
  has(html, "navigateTo('students');", '未切到学生管理页');
  has(html, "switchStudentTab('alerts');", '未切预警页签');
  notHas(html, "cbAlertChip\" onclick=\"navigateTo('bank')", '仍残留跳银行');
});
t('学分银行页签瘦身：只剩 概览/商店/券包/流水 四页签，无 alerts 分支', () => {
  has(html, "{ k:'overview', t:'🏦 概览' }, { k:'store', t:'🛒 兑换商店' }, { k:'vouchers', t:'🎟 券包与核销' },");
  has(html, "{ k:'ledger', t:'🧾 币流水' }");
  notHas(html, "k:'alerts'", '银行页签仍含预警');
  notHas(html, "cbBankTab === 'alerts'", '银行渲染仍残留预警分支');
  has(html, '双轨账本 · 阶梯奖励 · 兑换商店（仅班主任可见）', '银行页副标题未瘦身');
});
t('cbPersist / cbAlertAct 钩子：学生页预警页签操作/云同步后即时刷新', () => {
  const cp = html.match(/function cbPersist\(\)\{[\s\S]*?\n\}/)[0];
  has(cp, "page-students", 'cbPersist 缺学生页判定');
  has(cp, "cbRenderStudentAlerts()", 'cbPersist 缺预警渲染');
  const act = html.match(/function cbAlertAct\(sid, aid, to\)\{[\s\S]*?\n\}/)[0];
  has(act, 'cbRenderStudentAlerts();', 'cbAlertAct 未即时刷新学生页预警');
});

console.log('\n=== 行内快速操作移除（v2.18.0 顺手项）===');
t('学生表不再有 快速操作 列 / 行内 ±按钮 / adjustCredit 函数 / quick-btn 样式', () => {
  notHas(html, '快速操作</th>', '表头仍残留');
  notHas(html, 'quick-btns', '按钮容器残留');
  notHas(html, 'quick-btn', '按钮样式/调用残留');
  notHas(html, 'function adjustCredit(', 'adjustCredit 未删除');
  notHas(html, 'adjustCredit(', 'adjustCredit 调用残留');
  notHas(html, 'onclick="adjustCredit', '行内按钮绑定残留');
});
t('空态 colspan 由 6 改 5（少了一列）；行尾只留 详情/删除 两键', () => {
  has(html, '<tr><td colspan="5"><div class="empty-state">', '空态 colspan 未同步');
  has(html, '<td>\n        <button class="action-btn" onclick="openDetailPanel(', '详情键仍在');
});
t('renderTable 学分单元格走徽章；学分页 creditLevel 五档下拉仍可用', () => {
  const rt = html.match(/function renderTable\(\)\{[\s\S]*?\n\}/)[0];
  notHas(rt, 'score-badge', 'renderTable 残留旧徽章');
});

console.log('\n=== 概览月度结算历史兼容（新五档快照 + 旧三档映射）===');
t('历史表五列头 + 旧快照按 lv1→进取/lv2→卓越/lv3→巅峰 兼容映射', () => {
  has(html, '<th style="padding:5px 7px;font-weight:500">进取10+</th>');
  has(html, '<th style="padding:5px 7px;font-weight:500">巅峰70+</th>');
  has(html, "var oldMap = { t1: 'lv1', t2: '', t3: '', t4: 'lv2', t5: 'lv3' };", '缺旧快照映射');
  has(html, 'if(h.net === 1) return h.counts[k] || 0;', '缺新快照分支');
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
