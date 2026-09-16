/* v2.20.3 回归测试：预警中心修漏报 + 实时档位看板 / 竖版公示图「全班总榜 + 顶部重排」/ 下线紧凑图
   覆盖：
     ① cbScanAlerts —— 「自动办结」不再抑制再回落（真实漏报已修），老师手动办结/删除仍抑制
     ② cbTierBoard / cbTierMembers —— 实时档位看板（按当前学分，与预警工单解耦）
     ③ cbMonthFlow / cbVolatileStudents —— 「扣完又加回」的毛额口径
     ④ pubAssignRanks —— 同分并列同名次（competition ranking）
     ⑤ pubPosterCols / pubPosterHeight / pubFitFont —— 竖版海报高度自适应与文本自适应
     ⑥ drawPubPoster —— 全班 50 人竖版绘制冒烟（全员姓名/学分都在图上）
     ⑦ 静态版式：顶部重排、导出图不含进步榜、紧凑图已彻底下线
   运行：node _v2203_test.js */
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
const CB_ALERT_TIERS = eval('(' + extractConstRaw('CB_ALERT_TIERS') + ')');
const CB_ALERT_MIN = eval(extractConstRaw('CB_ALERT_MIN'));
const CB_VOLATILE_SUB = eval(extractConstRaw('CB_VOLATILE_SUB'));
const PUB_POSTER_HEAD = eval(html.match(/var PUB_POSTER_HEAD = (\d+);/)[1]);
const PUB_POSTER_LIST_TOP = eval(html.match(/var PUB_POSTER_LIST_TOP = (\d+);/)[1]);
const PUB_POSTER_ROW = eval(html.match(/var PUB_POSTER_ROW = (\d+);/)[1]);
const PUB_POSTER_FOOT = eval(html.match(/var PUB_POSTER_FOOT = (\d+);/)[1]);

var state = { className: '', students: [], operations: [], creditBank: null };
global.loadPubSetting = () => undefined;   // pubDisplayName 的隐私开关：缺省 full

const cbDefaultBank = extractFn('cbDefaultBank');
const cbBankSafe = extractFn('cbBankSafe');
const cbWalletKey = extractFn('cbWalletKey');
const cbMonthKey = extractFn('cbMonthKey');
const cbMonthOfTs = extractFn('cbMonthOfTs');
const cbTierOf = extractFn('cbTierOf');
const cbTierSeverity = extractFn('cbTierSeverity');
const cbScanAlerts = extractFn('cbScanAlerts');
const cbPendingAlertCount = extractFn('cbPendingAlertCount');
const cbTierBoard = extractFn('cbTierBoard');
const cbTierMembers = extractFn('cbTierMembers');
const cbMonthFlow = extractFn('cbMonthFlow');
const cbVolatileStudents = extractFn('cbVolatileStudents');
const pubAssignRanks = extractFn('pubAssignRanks');
const pubPosterCols = extractFn('pubPosterCols');
const pubPosterHeight = extractFn('pubPosterHeight');
const pubFitFont = extractFn('pubFitFont');
const pubDisplayName = extractFn('pubDisplayName');
const pubRangeCaption = extractFn('pubRangeCaption');
const rr = extractFn('rr');
const drawPubPoster = extractFn('drawPubPoster');

function freshState(students) {
  return { className: '', students: students || [], operations: [], creditBank: cbDefaultBank() };
}

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('四处跟版 v2.20.5（登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME）', () => {
  has(html, '<div class="login-version">v2.20.5</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">v2.20.5 · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ v2.20.5</span>', '设置徽标未跟版');
  has(sw, "CACHE_NAME = 'class-manager-v2.20.5'", 'SW CACHE_NAME 未跟版');
});
t('速览标题与 CACHE_NAME 同版本号（容器在 + 标题自动跟版）', () => {
  // 维护约定（index.html「settingsAbout」上方注释）：更新速览【只保留最新一版、整体替换、不做追加】。
  // 因此断言「本版三大要点还躺在速览里」必然随换版过期（v2.20.4 已整体替换）。
  // 改为验证设计意图：容器在 + 标题跟着 CACHE_NAME 同版本号（自动跟版，不会再次过期）；
  // 本版三大功能本身由本文件后面的代码级断言（cbTierBoard / pubAssignRanks / compact 已下线）守住。
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, 'id="settingsReleaseNotes"', 'notes 容器缺失');
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
});

console.log('\n=== ★ cbScanAlerts：回升后再回落必须重新报警（本版核心修复） ===');
t('★ 62 → 52（黄预警）→ 65（回升自动办结）→ 52（再回落，必须重新建档）', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 62 }]);
  eq(cbScanAlerts(), 0, '62 分属正常区，不应建档');
  state.students[0].credit = 52;
  eq(cbScanAlerts(), 1, '掉到 52 应建 1 条黄色预警');
  eq(cbPendingAlertCount(), 1);
  state.students[0].credit = 65;                       // 学生自己加回 13 分
  eq(cbScanAlerts(), 1, '回升应自动办结 1 条');
  const a0 = state.creditBank.alerts[0];
  eq(a0.status, 'resolved', '应办结');
  eq(a0.autoResolved, true, '应打 autoResolved 标记');
  eq(cbPendingAlertCount(), 0);
  state.students[0].credit = 52;                       // 再次掉回预警区
  eq(cbScanAlerts(), 1, '★ 再回落必须重新建档（修复前此处为 0 = 真实漏报）');
  eq(cbPendingAlertCount(), 1, '应回到 1 条待处理');
  const a1 = state.creditBank.alerts[1];
  eq(a1.level, 'yellow', '档位应仍为黄色');
  eq(a1.relapse, 1, '应记录为本月第 1 次回落');
  has(a1.note, '回升后再次回落', 'note 应标注回落');
});
t('多轮回升-回落：第 N 次回落计数递增、每次都有新工单', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 52 }]);
  cbScanAlerts();                                      // 第 1 条（黄）
  state.students[0].credit = 70; cbScanAlerts();       // 回升
  state.students[0].credit = 52; eq(cbScanAlerts(), 1, '第 2 次回落应建档');
  state.students[0].credit = 70; cbScanAlerts();       // 再回升
  state.students[0].credit = 52; eq(cbScanAlerts(), 1, '第 3 次回落应建档');
  const list = state.creditBank.alerts;
  eq(list.length, 3, '共 3 条工单');
  eq(list[1].relapse, 1);
  eq(list[2].relapse, 2, '第 3 条应记第 2 次回落');
  eq(cbPendingAlertCount(), 1, '只应有 1 条未决');
});
t('老师手动办结：同月同档不得复活（不误报）', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  eq(cbScanAlerts(), 1, '首次建档');
  const a = state.creditBank.alerts[0];
  a.status = 'resolved'; a.resolvedAt = Date.now();     // 模拟 cbAlertMark 人工办结：不打 autoResolved
  eq(cbScanAlerts(), 0, '人工办结后同档不得复活');
  eq(state.creditBank.alerts.length, 1, '不应新建');
});
t('删除即墓碑：同月同档不再重建', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  const a = state.creditBank.alerts[0];
  a.status = 'deleted'; a.deletedAt = Date.now();
  eq(cbScanAlerts(), 0, '删除后不得重建');
  eq(state.creditBank.alerts.length, 1);
});
t('人工办结后恶化升级仍会叠加新工单', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  state.creditBank.alerts[0].status = 'resolved';       // 人工办结（黄）
  state.students[0].credit = 30;                        // 恶化到红色档
  eq(cbScanAlerts(), 1, '恶化应新建');
  eq(state.creditBank.alerts[1].level, 'red');
});
t('回升后再次回落且档位更重：档位与次数都记对', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 52 }]);
  cbScanAlerts();                                       // 黄
  state.students[0].credit = 70; cbScanAlerts();        // 回升办结
  state.students[0].credit = 45; cbScanAlerts();        // 再回落 → 橙色
  const last = state.creditBank.alerts[state.creditBank.alerts.length - 1];
  eq(last.level, 'orange');
  eq(last.relapse, 1);
  eq(cbPendingAlertCount(), 1);
});
t('幂等：不动学分时重复扫描不产生任何变更', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 52 }]);
  cbScanAlerts();
  eq(cbScanAlerts(), 0, '再扫不重复');
  eq(cbScanAlerts(), 0, '三扫不重复');
  eq(state.creditBank.alerts.length, 1);
});
t('预警开关关闭时扫描不产生任何记录', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 30 }]);
  state.creditBank.settings.alertEnabled = false;
  eq(cbScanAlerts(), 0);
  eq(state.creditBank.alerts.length, 0);
});

console.log('\n=== 实时档位看板纯函数（cbTierBoard / cbTierMembers） ===');
const boardStu = [
  { id: 1, sid: 'A1', name: '正常甲', credit: 88 },
  { id: 2, sid: 'A2', name: '黄乙', credit: 55 },
  { id: 3, sid: 'A3', name: '黄丙', credit: 50 },
  { id: 4, sid: 'A4', name: '橙丁', credit: 45 },
  { id: 5, sid: 'A5', name: '红戊', credit: 35 },
  { id: 6, sid: 'A6', name: '深己', credit: 10 },
  { id: 7, sid: 'A7', name: '边界60', credit: 60 }
];
t('cbTierBoard：正常 / 黄 / 橙 / 红 / 深红 计数（60 分算正常）', () => {
  const b = cbTierBoard(boardStu);
  eq(b.total, 7); eq(b.normal, 2); eq(b.yellow, 2); eq(b.orange, 1); eq(b.red, 1); eq(b.dark, 1);
});
t('cbTierBoard：空 / null 安全，不抛异常', () => {
  eq(cbTierBoard([]).total, 0);
  eq(cbTierBoard(null).total, 0);
  eq(cbTierBoard(undefined).normal, 0);
});
t('cbTierBoard：学分非数字按 0 处理（落深红档）', () => {
  const b = cbTierBoard([{ id: 1, sid: 'X', name: 'x', credit: 'abc' }]);
  eq(b.dark, 1); eq(b.normal, 0);
});
t('cbTierMembers：指定档位，学分升序（越危险越靠前）', () => {
  const y = cbTierMembers(boardStu, 'yellow');
  eq(y.length, 2); eq(y[0].sid, 'A3'); eq(y[1].sid, 'A2');    // 50 在 55 之前
});
t("cbTierMembers：'' = 全部预警档；'normal' = 正常区；未知档 = 空", () => {
  eq(cbTierMembers(boardStu, '').length, 5);
  eq(cbTierMembers(boardStu, 'normal').length, 2);
  eq(cbTierMembers(boardStu, 'nope').length, 0);
});
t('cbTierMembers：同分按学号（顺序可复现）', () => {
  const s = [{ id: 1, sid: 'B', name: '乙', credit: 50 }, { id: 2, sid: 'A', name: '甲', credit: 50 }];
  const r = cbTierMembers(s, 'yellow');
  eq(r[0].sid, 'A'); eq(r[1].sid, 'B');
});
t('cbTierMembers：不修改入参顺序', () => {
  const s = [{ id: 1, sid: 'B', name: '乙', credit: 50 }, { id: 2, sid: 'A', name: '甲', credit: 50 }];
  cbTierMembers(s, 'yellow');
  eq(s[0].sid, 'B', '入参数组不应被就地排序');
});

console.log('\n=== 「扣完又加回」毛额口径（cbMonthFlow / cbVolatileStudents） ===');
const MK = cbMonthKey();
const NOW = Date.now();
t('cbMonthFlow：净额 0 但毛额 30/30、波动 6 次（撤销流水与无时间戳不计）', () => {
  const ops = [
    { studentId: 1, amount: -10, time: NOW }, { studentId: 1, amount: 10, time: NOW },
    { studentId: 1, amount: -10, time: NOW }, { studentId: 1, amount: 10, time: NOW },
    { studentId: 1, amount: -10, time: NOW }, { studentId: 1, amount: 10, time: NOW },
    { studentId: 1, amount: 5, time: NOW, state: 'revoked' },
    { studentId: 1, amount: 7, time: null }
  ];
  const f = cbMonthFlow(1, MK, ops);
  eq(f.sub, 30); eq(f.add, 30); eq(f.net, 0);
  eq(f.subs, 3); eq(f.adds, 3); eq(f.swings, 6);
});
t('cbMonthFlow：跨月流水不计入本月', () => {
  const last = new Date(); last.setMonth(last.getMonth() - 1);
  const f = cbMonthFlow(1, MK, [{ studentId: 1, amount: -9, time: last.getTime() }]);
  eq(f.sub, 0); eq(f.swings, 0);
});
t('cbMonthFlow：只算本人（他生流水不计）', () => {
  const f = cbMonthFlow(1, MK, [{ studentId: 2, amount: -9, time: NOW }]);
  eq(f.sub, 0);
});
t('cbMonthFlow：缺省 ops 时读 state.operations；空态返回全 0', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 100 }]);
  state.operations = [{ studentId: '1', amount: -8, time: NOW }];
  eq(cbMonthFlow(1, MK).sub, 8);
  eq(cbMonthFlow(999, MK).swings, 0);
});
t('cbVolatileStudents：只收「账面正常但扣分毛额 ≥20」的，预警区学生不重复列', () => {
  state = freshState([
    { id: 1, sid: 'S1', name: '波动甲', credit: 100 },
    { id: 2, sid: 'S2', name: '安稳乙', credit: 100 },
    { id: 3, sid: 'S3', name: '波动丙', credit: 100 },
    { id: 4, sid: 'S4', name: '预警丁', credit: 45 }
  ]);
  const ops = [];
  for (let i = 0; i < 3; i++) { ops.push({ studentId: 1, amount: -10, time: NOW }); ops.push({ studentId: 1, amount: 10, time: NOW }); }
  for (let i = 0; i < 5; i++) { ops.push({ studentId: 3, amount: -5, time: NOW }); ops.push({ studentId: 3, amount: 5, time: NOW }); }
  ops.push({ studentId: 4, amount: -40, time: NOW });    // 丁已在预警区 → 不列
  const v = cbVolatileStudents(state.students, ops, MK);
  eq(v.length, 2, '只应有 2 人（甲 30 / 丙 25）');
  eq(v[0].s.sid, 'S1'); eq(v[1].s.sid, 'S3');            // 按毛额降序
  eq(v[0].flow.sub, 30);
  eq(v.every(x => x.flow.net >= 0), true, '净额都应为 0（扣完又加回）');
});
t('cbVolatileStudents：阈值可覆盖（传 26 只剩毛额 30 者）', () => {
  const ops = [];
  for (let i = 0; i < 3; i++) { ops.push({ studentId: 1, amount: -10, time: NOW }); ops.push({ studentId: 1, amount: 10, time: NOW }); }
  for (let i = 0; i < 5; i++) { ops.push({ studentId: 3, amount: -5, time: NOW }); ops.push({ studentId: 3, amount: 5, time: NOW }); }
  state = freshState([
    { id: 1, sid: 'S1', name: '甲', credit: 100 },
    { id: 3, sid: 'S3', name: '丙', credit: 100 }
  ]);
  eq(cbVolatileStudents(state.students, ops, MK, 26).length, 1);
  eq(cbVolatileStudents(state.students, ops, MK, 0).length, 2, '阈值非法应回落默认 20');
});
t('cbVolatileStudents：无流水 → 空名单', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 100 }]);
  eq(cbVolatileStudents(state.students, [], MK).length, 0);
});
t('常量自洽：CB_VOLATILE_SUB 为合法正数、CB_ALERT_MIN 与档位相符', () => {
  ok(typeof CB_VOLATILE_SUB === 'number' && CB_VOLATILE_SUB > 0, '阈值应 > 0');
  eq(CB_ALERT_MIN, 60);
  eq(CB_ALERT_TIERS.length, 4);
});

console.log('\n=== 全班排名：同分并列同名次（competition ranking） ===');
t('pubAssignRanks：100,100,98,97,97,97 → 名次 1,1,3,4,4,4（跳号）', () => {
  const rows = [100, 100, 98, 97, 97, 97].map((c, i) => ({ sid: 'S' + i, credit: c }));
  const r = pubAssignRanks(rows);
  eq(r.map(x => x.rank).join(','), '1,1,3,4,4,4');
  eq(r.map(x => x.tie).join(','), '2,2,1,3,3,3');
});
t('pubAssignRanks：全员同分 → 全部并列第 1', () => {
  const rows = [100, 100, 100].map((c, i) => ({ sid: 'A' + i, credit: c }));
  const r = pubAssignRanks(rows);
  eq(r.every(x => x.rank === 1 && x.tie === 3), true);
});
t('pubAssignRanks：空 / null 安全；单元素 = 第 1', () => {
  eq(pubAssignRanks([]).length, 0);
  eq(pubAssignRanks(null).length, 0);
  eq(pubAssignRanks(undefined).length, 0);
  eq(pubAssignRanks([{ credit: 88 }])[0].rank, 1);
});
t('pubAssignRanks：分数字符串按数值比较（不按字典序）', () => {
  const r = pubAssignRanks([{ credit: '100' }, { credit: 100 }, { credit: '99' }]);
  eq(r.map(x => x.rank).join(','), '1,1,3');
});
t('pubAssignRanks：不修改入参对象（只读包裹）', () => {
  const rows = [{ credit: 100 }, { credit: 90 }];
  const r = pubAssignRanks(rows);
  eq(rows[0].rank, undefined, '不应写回原对象');
  eq(r[0].row, rows[0], '应保留原对象引用');
});

console.log('\n=== 竖版海报高度与文本自适应 ===');
t('pubPosterCols：≤80 人两栏，>80 人三栏', () => {
  eq(pubPosterCols(0), 2); eq(pubPosterCols(50), 2); eq(pubPosterCols(80), 2);
  eq(pubPosterCols(81), 3); eq(pubPosterCols(120), 3);
  eq(pubPosterCols('abc'), 2, '非数字应回落两栏');
});
t('pubPosterHeight：50 人 = 522 + 25×54 + 118 = 1990（两栏）', () => {
  const all = Array.from({ length: 50 }, (_, i) => ({ sid: 'S' + i, credit: 100 - i }));
  const h = pubPosterHeight({ all: all });
  eq(h, PUB_POSTER_LIST_TOP + 25 * PUB_POSTER_ROW + PUB_POSTER_FOOT);
  eq(h, 1990);
});
t('pubPosterHeight：60 人两栏 30 行，超过旧竖版 1920 自动变高', () => {
  const all = Array.from({ length: 60 }, (_, i) => ({ sid: 'S' + i, credit: 100 }));
  const h = pubPosterHeight({ all: all });
  eq(h, PUB_POSTER_LIST_TOP + 30 * PUB_POSTER_ROW + PUB_POSTER_FOOT);
  ok(h > 1920, '60 人高度应超过旧竖版 1920，实际 ' + h);
});
t('pubPosterHeight：空数据 / null 不塌成 0（至少 1 行）', () => {
  const min = PUB_POSTER_LIST_TOP + PUB_POSTER_ROW + PUB_POSTER_FOOT;
  eq(pubPosterHeight({}), min);
  eq(pubPosterHeight(null), min);
  eq(pubPosterHeight({ all: [] }), min);
});
t('pubPosterHeight：90 人走三栏（30 行），比两栏（45 行）短', () => {
  const all = Array.from({ length: 90 }, (_, i) => ({ sid: 'S' + i, credit: 100 }));
  eq(pubPosterHeight({ all: all }), PUB_POSTER_LIST_TOP + 30 * PUB_POSTER_ROW + PUB_POSTER_FOOT);
});
t('pubFitFont：不超宽时保持原始字号', () => {
  const mk = w => ({ font: '', measureText: () => ({ width: w }) });
  eq(pubFitFont(mk(60), '某班', 800, 58, 'bold'), 58);
});
t('pubFitFont：超宽时缩字号且不低于 18px 下限', () => {
  const mk = w => ({ font: '', measureText: () => ({ width: w }) });
  const narrow = pubFitFont(mk(9999), '很长很长很长的一个班级名称', 200, 58, 'bold');
  ok(narrow >= 18, '不应低于 18px，实际 ' + narrow);
  ok(narrow < 58, '应缩小，实际 ' + narrow);
});
t('pubFitFont：空文本 / null 安全', () => {
  const mk = w => ({ font: '', measureText: () => ({ width: w }) });
  eq(pubFitFont(mk(1), '', 100, 20, ''), 20);
  eq(pubFitFont(mk(1), null, 100, 20, ''), 20);
});

console.log('\n=== 绘制冒烟：全班 50 人竖版海报 ===');
function mockTextCtx() {
  const seen = [];
  return new Proxy({}, {
    get(_, k) {
      if (k === 'measureText') return s => ({ width: String(s == null ? '' : s).length * 14 });
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'fillText') return s => { seen.push(String(s)); };
      if (k === 'seen') return seen;
      return () => {};
    },
    set() { return true; }
  });
}
t('50 人海报：可执行不抛异常，且 50 名学生姓名与学分全部画上', () => {
  const ctx = mockTextCtx();
  const all = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sid: 'S' + (100 + i), name: '学生' + (i + 1), credit: 100 - i }));
  const data = { count: 50, all: all };
  state = { className: '高二(3)班', classMotto: '笃学慎思', classAvatar: null };
  drawPubPoster(ctx, 1080, pubPosterHeight(data), data, 'month', null);
  const j = ctx.seen.join('|');
  has(j, '学分总榜', '未画总榜标题');
  has(j, '2026年9月学分公示', '未画周期标题（pubRangeCaption 去空格 + 学分公示）');
  has(j, '高二(3)班', '未画班级名');
  has(j, '笃学慎思', '未画班训');
  let missName = 0, missCredit = 0;
  all.forEach(r => {
    if (ctx.seen.indexOf(r.name) < 0) missName++;
    if (ctx.seen.indexOf(String(r.credit)) < 0) missCredit++;
  });
  eq(missName, 0, '漏画学生姓名数应为 0，实际 ' + missName);
  eq(missCredit, 0, '漏画学分数应为 0，实际 ' + missCredit);
});
t('海报绘制：无头像时退化为 🏫 占位，不抛异常', () => {
  const ctx = mockTextCtx();
  state = { className: '一班', classMotto: '', classAvatar: null };
  drawPubPoster(ctx, 1080, 1200, { count: 3, all: [{ sid: 'A', name: '甲', credit: 100 }] }, 'month', null);
  ok(ctx.seen.indexOf('🏫') >= 0, '未画占位头像');
});
t('海报绘制：空名单给「暂无学生数据」而非空白', () => {
  const ctx = mockTextCtx();
  state = { className: '一班', classMotto: '', classAvatar: null };
  drawPubPoster(ctx, 1080, 800, { count: 0, all: [] }, 'month', null);
  ok(ctx.seen.indexOf('暂无学生数据') >= 0, '空名单应有兜底文案');
});
t('海报绘制：data.all 缺失也不抛异常（防御）', () => {
  const ctx = mockTextCtx();
  state = { className: '一班', classMotto: '', classAvatar: null };
  drawPubPoster(ctx, 1080, 800, { count: 0 }, 'month', null);
  ok(ctx.seen.length > 0, '应仍画出顶部栏目');
});
t('海报绘制：画布偏矮（H 小于内容高）也不抛异常', () => {
  const ctx = mockTextCtx();
  state = { className: '一班', classMotto: '格言', classAvatar: null };
  const all = Array.from({ length: 40 }, (_, i) => ({ sid: 'S' + i, name: 'n' + i, credit: 100 }));
  drawPubPoster(ctx, 1080, 500, { count: 40, all: all }, 'week', null);
  ok(ctx.seen.length > 0);
});

console.log('\n=== 静态：竖版公示图版式与导出内容 ===');
t('导出正文改全班总榜：渲染 data.all 全员、不再只画 data.top', () => {
  const src = html.match(/function drawPubPoster\(ctx[\s\S]*?\n\}/)[0];
  has(src, 'var all = (data && data.all) || [];', '未取全量名单');
  has(src, 'pubAssignRanks(all)', '未对全量名单排名');
  notHas(src, 'data.top', '仍残留 Top10 榜');
});
t('导出路径不再包含进步榜 / 个人流水', () => {
  const src = html.match(/function drawPubPoster\(ctx[\s\S]*?\n\}/)[0] +
              html.match(/function exportPublicityPoster\(mode\)[\s\S]*?\n\}/)[0];
  notHas(src, '进步榜', '导出路径仍含进步榜');
  notHas(src, 'data.prog', '导出路径仍读 prog 榜');
  notHas(src, 'ledger', '导出路径不应涉及个人流水');
});
t('顶部重排：头像钉左上角 + 班名/班训/周期标题三段共用同一中轴', () => {
  const src = html.match(/function drawPubPoster\(ctx[\s\S]*?\n\}/)[0];
  has(src, 'var avX = 80, avY = 170, avR = 50;', '头像未钉左上角');
  has(src, 'var CX = W / 2;', '未取画布中轴');
  eq(src.indexOf("ctx.textAlign = 'left'; ctx.fillText(state.className"), -1, '班级名不应再左对齐绘制');
  const centered = (src.match(/ctx\.fillText\((clsName|motto|capTitle), CX,/g) || []).length;
  eq(centered, 3, '班名/班训/周期标题应都居中画在 CX，实际 ' + centered);
});
t('周期标题文案：pubRangeCaption 去空格 + 「学分公示」', () => {
  has(html, "var capTitle = pubRangeCaption(range).replace(/\\s+/g, '') + '学分公示';", '缺周期标题文案');
});
t('并列名次不误判金银铜：仅「前三名且独占」才填色', () => {
  const src = html.match(/function drawPubPoster\(ctx[\s\S]*?\n\}/)[0];
  has(src, 'var solo = item.rank <= 3 && item.tie === 1;', '并列判定缺失');
  has(src, '名次圈空心 = 并列', '缺并列图例说明');
});
t('导出高度随人数：走 pubPosterHeight，不再写死 1920/1350', () => {
  const src = html.match(/function exportPublicityPoster\(mode\)[\s\S]*?\n\}/)[0];
  has(src, 'var H = pubPosterHeight(data);', '未用自适应高度');
  notHas(src, '1350', '仍残留紧凑高度');
  notHas(src, '1920', '仍残留写死竖版高度');
});
t('computePublicityData 暴露全量排序名单 all（供海报列举全员）', () => {
  const src = html.match(/function computePublicityData\(students, operations, rangeKind, nowDate\)\{[\s\S]*?\n\}/)[0];
  has(src, 'all:  rows.slice().sort(creditSort),', '缺 all 字段');
});
t('紧凑图已彻底下线：入口 / 分支 / 按钮全无', () => {
  notHas(html, "exportPublicityPoster('compact')", '紧凑图入口残留');
  notHas(html, "mode === 'compact'", 'compact 分支残留');
  notHas(html, '紧凑图</button>', '紧凑图按钮残留');
  has(html, "onclick=\"exportPublicityPoster('portrait')\"", '竖版入口缺失');
});

console.log('\n=== 静态：预警中心实时看板接线 ===');
t('实时看板已接入预警中心（点击切档 / 波动观察 / 本期毛额）', () => {
  has(html, '📊 实时档位看板', '缺看板块');
  has(html, 'onclick="cbTierFilterTo(', '缺档位点击绑定');
  has(html, 'function cbTierFilterTo(k){', '缺切换函数');
  has(html, '波动观察', '缺波动观察入口');
  has(html, 'var cbTierFilter', '缺筛选状态变量');
});
t('看板按当前学分实时统计，预警卡挂本期毛额', () => {
  const src = html.match(/function cbRenderStudentAlerts\(\)\{[\s\S]*?\n\}/)[0];
  has(src, 'cbTierBoard(state.students)', '看板未按实时学分统计');
  has(src, 'cbVolatileStudents(state.students, state.operations', '看板未算波动名单');
  has(src, 'cbMonthFlow(a.sid, a.month, state.operations)', '预警卡未挂本期毛额');
  notHas(src, 'mouseenter', '看板不应引入悬停监听');
  notHas(src, 'mouseover', '看板不应引入悬停监听');
});
t('自动办结打 autoResolved 标记，历史仲裁排除之（漏报修复的源码落点）', () => {
  const src = html.match(/function cbScanAlerts\(\)\{[\s\S]*?\n\}/)[0];
  has(src, 'a.autoResolved = true;', '缺 autoResolved 标记');
  has(src, "if(a.status === 'resolved' && a.autoResolved){ autoCnt++; return; }", '历史仲裁未排除自动办结');
  has(src, 'relapse: autoCnt', '未记录回落次数');
});
t('预警状态筛选与既有契约保持不变（原用例仍有效）', () => {
  has(html, "function cbAlertStatusTo(s){ cbAlertStatus = s || ''; cbRenderStudentAlerts(); }");
  has(html, 'var cbAlertStatus = ', '缺状态变量');
  has(html, 'onclick="cbAlertStatusTo(', 'chips 缺切换绑定');
  has(html, "!cbAlertStatus || a.status === cbAlertStatus", '缺状态过滤');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
