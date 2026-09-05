/* v2.10.0 回归测试：值日轮次制（公平轮转）+ 罚扫记录 + 组别制导出 + 饮水机顺序轮转
   从 index.html 抽取真实实现。运行：node _v2100_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + name);
  return eval('(' + m[0] + ')');
}
function extractSingleConst(name) {
  const m = html.match(new RegExp('const ' + name + ' = [^\\n]*;'));
  if (!m) throw new Error('未找到常量 ' + name);
  return eval('(' + m[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
}

const dutyDays = extractSingleConst('dutyDays');
const dutyAreas = extractSingleConst('dutyAreas');
const dutyAreaCounts = extractSingleConst('dutyAreaCounts');

const dutySlotsPerWeek = extractFn('dutySlotsPerWeek');
const dutyEnsureQueue = extractFn('dutyEnsureQueue');
const dutyNextFrom = extractFn('dutyNextFrom');
const dutyGenerateWeek = extractFn('dutyGenerateWeek');
const dutyEnsureWeeks = extractFn('dutyEnsureWeeks');
const dutyRoundProgress = extractFn('dutyRoundProgress');
const dutyRoundGroups = extractFn('dutyRoundGroups');
const punishStatusFor = extractFn('punishStatusFor');
const chunkNames = extractFn('chunkNames');
const autoWaterDuty = extractFn('autoWaterDuty');
const dutyClearFromWeek = extractFn('dutyClearFromWeek');
const localDateStr = extractFn('localDateStr');

// autoWaterDuty / dutyClearFromWeek 的外部符号桩
let toasts = [];
var state = {};
global.state = state;
const showToast = m => toasts.push(m);
const saveData = () => {};
const renderWaterDuty = () => {};
const renderDuty = () => {};
const renderDutyToday = () => {};
const renderDutyProgress = () => {};
const renderPunishments = () => {};
const confirmPunish = undefined;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

function mkStudents(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, sid: '2026' + String(i + 1).padStart(3, '0'), name: '学生' + (i + 1), credit: 100, tags: [] }));
}
function freshDuty(students) {
  const duty = { currentWeek: 0, schedule: [], waterDuty: [], waterUsedIds: [], waterRound: 1,
    queue: [], cursorId: null, round: 1, servedIds: [], roundLedger: [], lastGenWeek: -1, waterCursorId: null };
  dutyEnsureQueue(duty, students);
  duty.cursorId = duty.queue[0];
  return duty;
}

console.log('=== 1. 轮次引擎基础 ===');
t('每周槽位数 = 6天 × 8 = 48', () => eq(dutySlotsPerWeek(), 48));
t('队列按学号排序，游标指向队首', () => {
  const students = mkStudents(10).reverse(); // 乱序传入
  const duty = freshDuty(students);
  eq(duty.queue[0], 1);
  eq(duty.cursorId, 1);
});
t('dutyNextFrom：跳过已值日者，游标后移', () => {
  const q = [1, 2, 3];
  const served = { 1: true };
  const r = dutyNextFrom(q, served, 1);
  eq(r.id, 2);
  eq(r.nextCursorId, 3);
});
t('dutyNextFrom：全部已值日 → null', () => {
  eq(dutyNextFrom([1, 2], { 1: true, 2: true }, 1), null);
});
t('dutyNextFrom：游标指向已删除的学生也能兜底', () => {
  const r = dutyNextFrom([1, 2, 3], {}, 99);
  eq(r.id, 1);
});

console.log('=== 2. 公平性：轮内每人一次，全班轮完才进下一轮 ===');
t('56 人生成 2 周：第 1-56 槽每人恰好一次，57 槽起进第 2 轮', () => {
  const students = mkStudents(56);
  const duty = freshDuty(students);
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students));
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students));
  eq(duty.schedule.length, 96);
  const firstRound = duty.schedule.slice(0, 56).map(e => e.studentId).sort((a, b) => a - b);
  eq(JSON.stringify(firstRound), JSON.stringify(students.map(s => s.id)));
  // 第 57 槽起 = 第 2 轮，第一槽应为游标处学生（第 56 槽学生的下一位）
  eq(duty.round, 2);
  eq(duty.servedIds.length, 96 - 56);
});
t('轮内零重复（跨周检查）', () => {
  const students = mkStudents(20);
  const duty = freshDuty(students);
  for (let w = 0; w < 3; w++) duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students));
  // 用 ledger 重建轮边界：每 20 槽为一轮
  const ledger = duty.roundLedger.map(x => x.id);
  for (let r = 0; r * 20 + 20 <= ledger.length; r++) {
    const roundIds = ledger.slice(r * 20, r * 20 + 20).sort((a, b) => a - b);
    eq(JSON.stringify(roundIds), JSON.stringify(students.map(s => s.id)));
  }
});
t('人数变化自适应：删 2 人后，后续生成只含在班学生', () => {
  const students = mkStudents(10);
  const duty = freshDuty(students);
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students)); // 48 槽（含 9、10，生成在前）
  const alive = students.slice(0, 8); // 删掉 9、10 号
  dutyEnsureQueue(duty, alive);
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, alive));
  const week1Ids = duty.schedule.filter(e => e.week === 1).map(e => e.studentId);
  eq(week1Ids.includes(9), false);
  eq(week1Ids.includes(10), false);
  // 删除触发轮重启（全员已值日）→ 新一轮 8 槽恰好覆盖在班 8 人
  const ledger = duty.roundLedger.map(x => x.id);
  eq(ledger.length, 8);
  eq(JSON.stringify(ledger.slice().sort((a, b) => a - b)), JSON.stringify(alive.map(s => s.id)));
});
t('新增学生自动并入队列（按学号排序）', () => {
  const students = mkStudents(3);
  const duty = freshDuty(students);
  students.push({ id: 4, sid: '2026002a', name: '新同学', credit: 100, tags: [] });
  dutyEnsureQueue(duty, students);
  eq(duty.queue.length, 4);
  eq(duty.queue.includes(4), true);
});
t('进度计算正确', () => {
  const students = mkStudents(10);
  const duty = freshDuty(students);
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students));
  const p = dutyRoundProgress(duty, students);
  eq(p.served, 48 % 10);
  eq(p.total, 10);
});

console.log('=== 3. 组别制分组（导出/名单数据源） ===');
t('每 8 槽一组：教室=前4，公共区=后4；组号连续', () => {
  const students = mkStudents(16);
  const duty = freshDuty(students);
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students));
  const groups = dutyRoundGroups(duty, students);
  eq(groups.length, Math.ceil(duty.roundLedger.length / 8));
  eq(groups[0].group, 1);
  eq(groups[0].classroom.length, 4);
  eq(groups[0].area.length, 4);
  const g1 = groups[0].classroom.concat(groups[0].area);
  const g2 = groups[1].classroom.concat(groups[1].area);
  eq(new Set(g1).size, 8);               // 组内 8 人互不重复
  eq(new Set(g1.concat(g2)).size, 16);   // 两组是不同的 8 人（16 人一轮恰好 2 组）
});
t('学生退班后组内显示「已退班」', () => {
  const students = mkStudents(8);
  const duty = freshDuty(students);
  duty.schedule = duty.schedule.concat(dutyGenerateWeek(duty, students));
  const groups = dutyRoundGroups(duty, students.filter(s => s.id !== 1));
  eq(groups[0].classroom.concat(groups[0].area).includes('已退班'), true);
});
t('chunkNames：空 → 破折号；>2 人拆行', () => {
  eq(JSON.stringify(chunkNames([])), JSON.stringify(['—']));
  eq(chunkNames(['a','b','c']).length, 2);
});

console.log('=== 4. 罚扫状态推导 ===');
t('执行中：剩 N 天', () => {
  const p = { done: false, startDate: '2026-09-01', days: 3 };
  const st = punishStatusFor(p, '2026-09-02');
  eq(st.st, 'active');
  eq(st.left, 2);
});
t('最后一天：剩 1 天；次日 → 超期', () => {
  const p = { done: false, startDate: '2026-09-01', days: 3 };
  eq(punishStatusFor(p, '2026-09-03').st, 'active');
  eq(punishStatusFor(p, '2026-09-03').left, 1);
  eq(punishStatusFor(p, '2026-09-04').st, 'overdue');
  eq(punishStatusFor(p, '2026-09-04').left, 1);
  eq(punishStatusFor(p, '2026-09-06').left, 3);
});
t('未开始 / 已核销', () => {
  const p = { done: false, startDate: '2026-09-10', days: 3 };
  eq(punishStatusFor(p, '2026-09-05').st, 'upcoming');
  eq(punishStatusFor({ done: true, startDate: '2026-09-01', days: 3 }, '2026-09-04').st, 'done');
});

console.log('=== 5. 饮水机顺序轮转 ===');
t('顺序取人不重复：任意连续 M 槽（M=人数）内每人恰好一次', () => {
  const students = mkStudents(7);
  state.students = students;
  state.duty = freshDuty(students);
  state.duty.waterUsedIds = [];
  state.duty.waterRound = 1;
  const seen = [];
  for (let i = 0; i < 30; i++) {
    toasts = [];
    autoWaterDuty();
    seen.push(...state.duty.waterDuty);
  }
  eq(seen.length, 90);
  // 7 人一轮：任意连续 7 次取人覆盖全班且不重复（轮边界与 3 人/次不对齐也成立）
  for (let s = 0; s + 7 <= seen.length; s++) {
    const win = seen.slice(s, s + 7);
    eq(new Set(win).size, 7);
  }
  // 轮次推进：90 次取人 → 1 + ceil 轮
  eq(state.duty.waterRound >= 13, true);
});
t('饮水机与值日共用队列不冲突（waterCursor 独立）', () => {
  const students = mkStudents(10);
  state.students = students;
  state.duty = freshDuty(students);
  const dutyCursorBefore = state.duty.cursorId;
  autoWaterDuty();
  eq(state.duty.cursorId, dutyCursorBefore); // 值日游标不被水机推动
});

console.log('=== 6. 清空本周及后续（回退重排） ===');
t('清空后重新生成：本轮账本回退，学生不重复', () => {
  const students = mkStudents(12);
  global.confirm = () => true;
  state.students = students;
  state.duty = freshDuty(students);
  state.duty.schedule = state.duty.schedule.concat(dutyGenerateWeek(state.duty, students));
  state.duty.schedule = state.duty.schedule.concat(dutyGenerateWeek(state.duty, students));
  state.duty.currentWeek = 1;
  dutyClearFromWeek();
  eq(state.duty.schedule.filter(e => e.week >= 1).length, 48); // 已重新生成第 2 周
  eq(state.duty.schedule.filter(e => e.week === 0).length, 48); // 第 1 周原样保留
  const ledgerIds = state.duty.roundLedger.map(x => x.id);
  eq(ledgerIds.length, new Set(ledgerIds).size); // 本轮账本内无重复
});

console.log('\n' + (fail === 0 ? `✅ 全部通过（${pass} 项）` : `❌ ${fail} 项失败 / 共 ${pass + fail} 项`));
process.exit(fail === 0 ? 0 : 1);
