/* v3.9.7 回归测试：请假页「在假优先 + 卡片筛选 + 已销假折叠」+ 请假数据分析聚合口径
   老板口径：
     · 默认只显示在假的三类（未销假 / 已续假 / 已超时）
     · 边框色：未超时=绿、已续假=紫、已超时=红
     · 已销假默认折叠；点上方的卡片，下面的列表自动按那一档筛选
     · 新增「请假分析」，口径必须与列表数得出来的数字一致

   手法：把 index.html 里的真实函数切出来塞进 new Function 沙箱**真跑**，
   不只看源码字符串（改个变量名就假绿的测试等于没写）。
   ⚠️ 沙箱宿主清单（漏一个就 ReferenceError，症状像产品 bug）：
      state / document / window / countUp / renderDashPresence /
      escapeHtml / calcLeaveDuration / lvShortDate / lvDurNum / localDateStr */

const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const cmgx = fs.readFileSync(__dirname + '/cmgx.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); } }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }
function sliceFrom(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('切片锚点找不到：' + a + ' / ' + b);
  return html.slice(i, j);
}
function fnBody(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到函数 ' + name);
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
}

/* ---------- 源码切片：请假状态层 + 卡片 + 渲染 ---------- */
const LV_CORE = sliceFrom("var leaveFilter = 'inleave';", 'function lvIsOverdue(');
const LV_STATE = sliceFrom('function lvIsOverdue(', 'var LV_FILTER_TIP = {');
const LV_MAPS = sliceFrom('var LV_FILTER_TIP = {', '/* 单张请假卡');
const LV_CARD = sliceFrom('function lvCardHtml(', '/* ==================== v2.21.0 课堂点名');
const LV_AGG = sliceFrom('function lvYmd(', '/* ==================== v2.21.0 课堂点名');   // 注：取到 lvAggregate 结束

const DEPS = [
  'localDateStr', 'escapeHtml', 'calcLeaveDuration', 'lvShortDate', 'lvDurNum'
].map(fnBody).join('\n');

/* 聚合函数单独切（它排在 renderAttendance 之后、课堂点名之前） */
const AGG_ONLY = LV_AGG.slice(LV_AGG.indexOf('function lvYmd('));

const LEAVE_TYPES = { sick: '病假', personal: '事假', official: '公假' };

function makeFakeDate(iso, hh) {
  const base = new Date(iso + 'T' + String(hh == null ? 10 : hh).padStart(2, '0') + ':00:00');
  return class FakeDate extends Date {
    constructor(...args) { if (args.length === 0) super(base.getTime()); else super(...args); }
    static now() { return base.getTime(); }
  };
}

/* 建沙箱：真跑 renderAttendance / lvCardHtml / 状态派生 / 聚合 */
function sandbox(opts) {
  opts = opts || {};
  const els = {};
  const doc = {
    getElementById(id) { return els[id] || (els[id] = { id, innerHTML: '', textContent: '', style: {} }); },
    querySelectorAll() { return []; }
  };
  const st = {
    students: opts.students || [{ id: 1, name: '陈一' }, { id: 2, name: '李二' }, { id: 3, name: '王三' }],
    leaves: opts.leaves || []
  };
  const win = { __cmRole: opts.role || null };
  const src = [
    'var state = arguments[0], document = arguments[1], window = arguments[2],',
    '    countUp = arguments[3], renderDashPresence = arguments[4],',
    '    LEAVE_TYPES = arguments[5], Date = arguments[6];',
    DEPS,
    LV_CORE, LV_STATE, LV_MAPS, LV_CARD,
    'return { renderAttendance: renderAttendance, lvCardHtml: lvCardHtml, lvStateOf: lvStateOf,',
    '         lvIsOverdue: lvIsOverdue, lvMatchFilter: lvMatchFilter, lvCountAll: lvCountAll,',
    '         setLeaveFilter: setLeaveFilter, toggleLeaveArchive: toggleLeaveArchive,',
    '         getFilter: function(){ return leaveFilter; },',
    '         getArchive: function(){ return leaveArchiveOpen; } };'
  ].join('\n');
  const Factory = new Function(src);
  const api = Factory(st, doc, win, function (el, n) { el.textContent = n; }, function () {},
    LEAVE_TYPES, opts.FakeDate || Date);
  return { api, st, els, doc };
}

/* 聚合沙箱（只需要 lvYmd + lvAggregate + 状态派生 + 依赖） */
function aggSandbox(leaves, students, FakeDate) {
  const src = [
    'var Date = arguments[0], LEAVE_TYPES = arguments[1];',
    DEPS,
    LV_CORE, LV_STATE,
    AGG_ONLY,
    'return { lvAggregate: lvAggregate, lvStateOf: lvStateOf };'
  ].join('\n');
  const f = new Function(src);
  return f(FakeDate || Date, LEAVE_TYPES);
}

const TODAY = (function () {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();
function shiftDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* 造数据：一条在假未到期 / 一条续假中 / 一条超时 / 一条已销假 */
function mkLeaves() {
  return [
    { id: 1, studentId: 1, type: 'sick', startDate: shiftDate(-1), startPeriod: 'day', endDate: shiftDate(2), endPeriod: 'day', duration: 3, reason: '发烧', status: 'pending', createdAt: new Date().toISOString(), history: [] },
    { id: 2, studentId: 2, type: 'personal', startDate: shiftDate(-2), startPeriod: 'day', endDate: shiftDate(1), endPeriod: 'day', duration: 3, reason: '家里有事', status: 'extended', createdAt: new Date().toISOString(), history: [] },
    { id: 3, studentId: 3, type: 'official', startDate: shiftDate(-9), startPeriod: 'day', endDate: shiftDate(-5), endPeriod: 'day', duration: 4, reason: '技能比赛', status: 'pending', createdAt: new Date().toISOString(), history: [] },
    { id: 4, studentId: 1, type: 'sick', startDate: shiftDate(-30), startPeriod: 'day', endDate: shiftDate(-28), endPeriod: 'day', duration: 2, reason: '感冒', status: 'returned', returnDate: shiftDate(-27), createdAt: new Date().toISOString(), history: [] }
  ];
}

console.log('=== ① 状态派生（已超时是派生态，不许写进 l.status）===');

t('pending 且未到期 → fresh', () => {
  const s = sandbox({ leaves: mkLeaves() });
  eq(s.api.lvStateOf(mkLeaves()[0]), 'fresh');
});
t('extended 且未到期 → extended', () => {
  const s = sandbox({ leaves: mkLeaves() });
  eq(s.api.lvStateOf(mkLeaves()[1]), 'extended');
});
t('过了结束日仍未销假 → overdue', () => {
  const s = sandbox({ leaves: mkLeaves() });
  eq(s.api.lvStateOf(mkLeaves()[2]), 'overdue');
});
t('returned 优先于超时判定（已销假的历史单不能变红）', () => {
  const s = sandbox({ leaves: mkLeaves() });
  eq(s.api.lvStateOf({ status: 'returned', endDate: '2020-01-01' }), 'returned');
});
t('同日「上午结束」的假：中午 12 点后算超时', () => {
  const FD = makeFakeDate(TODAY, 13);
  const s = sandbox({ leaves: mkLeaves(), FakeDate: FD });
  eq(s.api.lvStateOf({ status: 'pending', endDate: TODAY, endPeriod: 'am' }), 'overdue');
});
t('同日「上午结束」的假：上午 10 点还不算超时', () => {
  const FD = makeFakeDate(TODAY, 10);
  const s = sandbox({ leaves: mkLeaves(), FakeDate: FD });
  eq(s.api.lvStateOf({ status: 'pending', endDate: TODAY, endPeriod: 'am' }), 'fresh');
});
t('同日「下午/全天结束」的假：当天不算超时（到 24:00 才结束）', () => {
  const FD = makeFakeDate(TODAY, 20);
  const s = sandbox({ leaves: mkLeaves(), FakeDate: FD });
  eq(s.api.lvStateOf({ status: 'pending', endDate: TODAY, endPeriod: 'pm' }), 'fresh');
  eq(s.api.lvStateOf({ status: 'pending', endDate: TODAY, endPeriod: 'day' }), 'fresh');
});
t('源码：超时是派生 —— l.status 只在 pending/extended/returned 三值上被写入', () => {
  notHas(html, "status = 'overdue'", '绝不能把 overdue 写进 l.status');
  notHas(html, 'status:"overdue"', '同上');
});

console.log('\n=== ② 五档筛选矩阵 ===');

t('inleave = 在假合计（未销假 + 已续假 + 已超时，不含已销假）', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const L = mkLeaves();
  eq(s.api.lvMatchFilter(L[0], 'inleave'), true);
  eq(s.api.lvMatchFilter(L[1], 'inleave'), true);
  eq(s.api.lvMatchFilter(L[2], 'inleave'), true);
  eq(s.api.lvMatchFilter(L[3], 'inleave'), false, '已销假不进在假档');
});
t('fresh / extended / overdue 各只命中自己那一档', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const L = mkLeaves();
  eq(s.api.lvMatchFilter(L[0], 'fresh'), true);
  eq(s.api.lvMatchFilter(L[1], 'fresh'), false);
  eq(s.api.lvMatchFilter(L[1], 'extended'), true);
  eq(s.api.lvMatchFilter(L[2], 'extended'), false);
  eq(s.api.lvMatchFilter(L[2], 'overdue'), true);
  eq(s.api.lvMatchFilter(L[0], 'overdue'), false);
});
t('returned 档只命中已销假', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const L = mkLeaves();
  eq(s.api.lvMatchFilter(L[3], 'returned'), true);
  eq(s.api.lvMatchFilter(L[0], 'returned'), false);
});
t('lvCountAll 五档计数（inleave 是派生合计，不是第四次遍历）', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const c = s.api.lvCountAll();
  eq(c.fresh, 1); eq(c.extended, 1); eq(c.overdue, 1); eq(c.returned, 1);
  eq(c.inleave, 3);
});
t('非法筛选值被忽略（不把列表刷成空白）', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.setLeaveFilter('nonsense');
  eq(s.api.getFilter(), 'inleave');
});

console.log('\n=== ③ 卡片色条与徽章 ===');

t('未超时 → lv-live（绿）', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const h = s.api.lvCardHtml(mkLeaves()[0], false);
  has(h, 'lv-live');
  notHas(h, 'lv-overdue');
});
t('已续假 → lv-extended（紫）', () => {
  const s = sandbox({ leaves: mkLeaves() });
  has(s.api.lvCardHtml(mkLeaves()[1], false), 'lv-extended');
});
t('已超时 → lv-overdue（红）+ 徽章改「已超时」+ 超时天数提示', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const h = s.api.lvCardHtml(mkLeaves()[2], false);
  has(h, 'lv-overdue');
  has(h, 'leave-badge overdue');
  has(h, '已超时');
  has(h, 'leave-overdue-tip');
});
t('已销假 → lv-returned，且不再出现续假/销假按钮', () => {
  const s = sandbox({ leaves: mkLeaves() });
  const h = s.api.lvCardHtml(mkLeaves()[3], false);
  has(h, 'lv-returned');
  notHas(h, 'onclick="returnLeave(');
});
t('CSS 源序：lv-* 必须写在 .status-pending / .status-extended 之后（同特异度靠源序）', () => {
  const ip = html.indexOf('.leave-card.status-pending{border-left-color:var(--orange)}');
  const ie = html.indexOf('.leave-card.status-extended{border-left-color:var(--purple)}');
  const il = html.indexOf('.leave-card.lv-live{border-left-color:var(--success)}');
  ok(ip > 0 && ie > 0 && il > 0, '三条规则都要在');
  ok(il > ip && il > ie, 'lv-live 必须晚于 status-* 两条规则，否则改色不生效');
});

console.log('\n=== ④ 默认视图：只在假 + 已销假折叠 ===');

t('默认筛在假：已销假的学生不出现在卡片区', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  const h = s.els.leaveList.innerHTML;
  has(h, 'lv-live'); has(h, 'lv-extended'); has(h, 'lv-overdue');
  /* 第四条（陈一 的感冒，已销假）与第一条同学生，靠 badge 判：默认视图里不该有「已销假」徽章卡 */
  notHas(h, 'leave-badge returned', '默认视图不该渲染已销假卡');
  eq((h.match(/class="leave-card /g) || []).length, 3, '默认应只画 3 张卡');
});
t('默认视图底部有归档条，且写着「默认折叠」', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  const h = s.els.leaveList.innerHTML;
  has(h, 'class="leave-archive', '归档条要在');
  has(h, '已销假 <b>1</b> 条');
  has(h, '默认折叠，点一下展开');
  eq(s.api.getArchive(), false, '默认必须是折叠态');
});
t('展开归档才铺开已销假卡，并改文案为「点一下收起」', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  s.api.toggleLeaveArchive();
  const h = s.els.leaveList.innerHTML;
  has(h, '点一下收起');
  has(h, 'leave-badge returned');
  eq((h.match(/class="leave-card /g) || []).length, 4, '展开后 4 张卡');
});
t('点「已销假」卡：只剩归档卡，并且不再重复出现归档条', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  s.api.setLeaveFilter('returned');
  const h = s.els.leaveList.innerHTML;
  eq((h.match(/class="leave-card /g) || []).length, 1);
  has(h, 'leave-badge returned');
  notHas(h, 'class="leave-archive', '已切到已销假档就不该再有归档条');
});
t('点「已超时」卡：只剩红卡', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  s.api.setLeaveFilter('overdue');
  const h = s.els.leaveList.innerHTML;
  eq((h.match(/class="leave-card /g) || []).length, 1);
  has(h, 'lv-overdue');
  notHas(h, 'lv-live');
});
t('某一档为空时给空态提示，不是一片空白', () => {
  const s = sandbox({ leaves: [mkLeaves()[0]] });
  s.api.setLeaveFilter('overdue');
  has(s.els.leaveList.innerHTML, 'lv-empty-filter');
});
t('顶部统计：leavePending 是「在假合计」，leaveTotal 是本月条数', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  eq(String(s.els.leavePending.textContent), '3');
  eq(String(s.els.leaveFresh.textContent), '1');
  eq(String(s.els.leaveExtended.textContent), '1');
  eq(String(s.els.leaveOverdue.textContent), '1');
  eq(String(s.els.leaveReturned.textContent), '1');
});
t('列表小标题写明「正在看哪一档」+ 在假分项', () => {
  const s = sandbox({ leaves: mkLeaves() });
  s.api.renderAttendance();
  const h = s.els.leaveListHint.innerHTML;
  has(h, '在假合计');
  has(h, '未销假 1');
  has(h, '已续假 1');
  has(h, '已超时 1');
});

console.log('\n=== ⑤ 请假数据分析聚合口径 ===');

function aggLeaves() {
  return [
    /* 病假 2 条（含 1 条超时）、事假 1 条、公假 1 条、已销假 1 条病假 */
    { id: 1, studentId: 1, type: 'sick', startDate: '2026-03-02', startPeriod: 'day', endDate: '2026-03-03', endPeriod: 'day', duration: 2, status: 'pending' },
    { id: 2, studentId: 2, type: 'sick', startDate: '2026-03-04', startPeriod: 'am', endDate: '2026-03-04', endPeriod: 'am', duration: 0.5, status: 'pending' },
    { id: 3, studentId: 2, type: 'personal', startDate: '2026-04-06', startPeriod: 'pm', endDate: '2026-04-06', endPeriod: 'day', duration: 1, status: 'extended' },
    { id: 4, studentId: 3, type: 'official', startDate: '2026-04-07', startPeriod: 'day', endDate: '2026-04-10', endPeriod: 'day', duration: 4, status: 'returned', returnDate: '2026-04-10' },
    { id: 5, studentId: 3, type: 'sick', startDate: '2026-04-08', startPeriod: 'day', endDate: '2026-04-08', endPeriod: 'day', duration: 1, status: 'returned', returnDate: '2026-04-08' }
  ];
}

t('总次数 / 总天数 / 涉及人数', () => {
  const a = aggSandbox(aggLeaves(), [{ id: 1, name: '陈一' }, { id: 2, name: '李二' }, { id: 3, name: '王三' }]).lvAggregate(aggLeaves(), [{ id: 1, name: '陈一' }, { id: 2, name: '李二' }, { id: 3, name: '王三' }]);
  eq(a.total, 5);
  eq(a.days, 8.5);
  eq(a.people, 3);
  eq(Math.round(a.avgDur * 10) / 10, 1.7);
});
t('病/事/公 三类计数与占比', () => {
  const stus = [{ id: 1, name: '陈一' }, { id: 2, name: '李二' }, { id: 3, name: '王三' }];
  const a = aggSandbox(aggLeaves(), stus).lvAggregate(aggLeaves(), stus);
  const m = {}; a.byType.forEach(x => m[x.key] = x);
  eq(m.sick.count, 3); eq(m.personal.count, 1); eq(m.official.count, 1);
  eq(m.sick.pct, 60);
  eq(m.personal.pct, 20);
});
t('星期分布按「开始日期」归类（周一位序 = 周一…周日）', () => {
  const stus = [];
  const a = aggSandbox(aggLeaves(), stus).lvAggregate(aggLeaves(), stus);
  eq(a.byWeekday.length, 7);
  eq(a.byWeekday[0].label, '周一');
  eq(a.byWeekday[6].label, '周日');
  const sum = a.byWeekday.reduce((s, w) => s + w.count, 0);
  eq(sum, 5, '星期分布按全部记录归类（不受「近 6 个月」窗口限制）');
});
t('近 6 个月按月归并，且月份键是 YYYY-MM（不吃 UTC 掉一天）', () => {
  const a = aggSandbox().lvAggregate(aggLeaves(), []);
  eq(a.byMonth.length, 6);
  a.byMonth.forEach(m => ok(/^\d{4}-\d{2}$/.test(m.key), '月份键格式错：' + m.key));
});
t('时长分档：半天 / 1 天 / 2-3 天 / 4-7 天 / 7 天以上', () => {
  const a = aggSandbox().lvAggregate(aggLeaves(), []);
  eq(a.byDur[0].count, 1);   // 0.5
  eq(a.byDur[1].count, 2);   // 1 天 ×2
  eq(a.byDur[2].count, 1);   // 2 天
  eq(a.byDur[3].count, 1);   // 4 天
  eq(a.byDur[4].count, 0);
});
t('起始时段：上午/下午/全天三桶', () => {
  const a = aggSandbox().lvAggregate(aggLeaves(), []);
  eq(a.byPeriod[0].count, 1);
  eq(a.byPeriod[1].count, 1);
  eq(a.byPeriod[2].count, 3);
});
t('超时名单 + 次数排行 + 最长 5 次', () => {
  const stus = [{ id: 1, name: '陈一' }, { id: 2, name: '李二' }, { id: 3, name: '王三' }];
  const a = aggSandbox().lvAggregate(aggLeaves(), stus);
  ok(a.overdueList.length >= 1, '过去日期的在假单必须进超时名单');
  eq(a.top[0].name, '王三', '次数最多（2 次）应排第一');
  eq(a.top[0].count, 2);
  eq(a.longest[0].days, 4);
});
t('空数据不炸：各项归零且数组仍在', () => {
  const a = aggSandbox().lvAggregate([], []);
  eq(a.total, 0); eq(a.days, 0); eq(a.people, 0);
  eq(a.byType.length, 3);
  eq(a.byWeekday.length, 7);
  eq(a.top.length, 0);
});
t('未知类型归到「其它」而不是静默丢弃', () => {
  const a = aggSandbox().lvAggregate([{ id: 9, studentId: 1, type: 'weird', startDate: '2026-04-01', duration: 1, status: 'pending' }], []);
  eq(a.total, 1);
  const other = a.byType.filter(x => x.key === 'other')[0];
  ok(other && other.count === 1, '其它类应承接未知类型');
});
t('🔴 聚合函数与列表同一判据：超时口径调 lvStateOf，不许自己再写一套', () => {
  const seg = LV_AGG.slice(LV_AGG.indexOf('function lvAggregate('));
  has(seg, 'lvStateOf(l)', '聚合必须复用 lvStateOf');
  notHas(seg, "l.status === 'pending'", '不许自己判 pending');
});

console.log('\n=== ⑥ 页签与图标（cmgx 注入，桌面端零影响）===');

t('index.html 里没有写死第三个页签（否则桌面版会出现点不动的空页签）', () => {
  notHas(html, 'id="tab-leave"', 'index.html 不该写死请假页签');
  notHas(html, 'analyticsLeavePanel"', 'index.html 不该写死请假面板');
});
t('cmgx 注入页签 + 面板 + 走 switchAnalyticsTab', () => {
  has(cmgx, "t.id = 'tab-leave'");
  has(cmgx, "p.id = 'analyticsLeavePanel'");
  has(cmgx, "switchAnalyticsTab('leave')");
  has(cmgx, "use href=\"#i-chart-cal\"");
});
t('cmgx 用的是网页版 lvAggregate（口径单源）', () => {
  has(cmgx, 'typeof lvAggregate === \'function\'');
  has(cmgx, 'lvAggregate(st.leaves || [], st.students || [])');
});
t('两个老页签的 emoji 已换成 SVG 图标', () => {
  notHas(html, '>📊 学分分析<');
  notHas(html, '>📝 成绩分析<');
  has(html, 'id="tab-credit" onclick="switchAnalyticsTab(\'credit\')"><svg class="ic"><use href="#i-chart-bars"/></svg>学分分析');
  has(html, 'id="tab-grade" onclick="switchAnalyticsTab(\'grade\')"><svg class="ic"><use href="#i-chart-doc"/></svg>成绩分析');
});
t('三个新图标都在 sprite 里，且是 24px viewBox 描边风格（与侧栏同套）', () => {
  ['i-chart-bars', 'i-chart-doc', 'i-chart-cal'].forEach(id => {
    has(html, '<symbol id="' + id + '" viewBox="0 0 24 24">');
  });
});
t('切页签时底层先摆正 credit/grade 面板，才能轮到请假面板', () => {
  const seg = cmgx.slice(cmgx.indexOf('function cmWrapLvTab()'));
  const iPrev = seg.indexOf('prev.apply(this, arguments)');
  const iShow = seg.indexOf("lp.style.display = (tab === 'leave')");
  ok(iPrev > 0 && iShow > 0 && iPrev < iShow, '必须先调用底层 switchAnalyticsTab');
});
t('换肤/亮暗时若停在请假页签，要整块重绘（图表色是运行时读变量的）', () => {
  has(cmgx, "var lvTab = document.getElementById('tab-leave');");
  has(cmgx, 'if (lvTab && lvTab.classList.contains(\'active\')) { try { cmLvRender(); }');
});

console.log('\n========================================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('失败项：'); failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
