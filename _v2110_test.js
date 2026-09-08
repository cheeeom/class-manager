/* v2.11.0 回归测试：学生排序（序号默认/学分切换）+ 名单同步（rosterParse/rosterBuildPlan）
   从 index.html 抽取真实实现。运行：node _v2110_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + name);
  return m[0];
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

/* ---- 共享 with-作用域：函数在 with 内重建，互相调用/读写都落在同一 scope 上 ---- */
const ui = {};
function el(id) {
  if (!ui[id]) ui[id] = { value: '', textContent: '', innerHTML: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } };
  return ui[id];
}
const scope = {
  sortMode: 'index', sortDir: 'desc',
  state: { students: [], selectedStudents: new Set(), reasons: [], nextId: 100, committee: {}, seating: { seats: [] }, duty: { schedule: [] }, punishments: [], operations: [], nextOpId: 1 },
  document: { getElementById: (id) => el(id) },
  toasts: [], showToast(m) { this.toasts.push(m); },
  saveData() {}, renderReasonSelects() {}, renderStudents() {},
  escapeHtml: s => String(s), escapeAttr: s => String(s), getTagClass: () => '',
  genSid: () => '2026999', syncCommitteeTags() {},
  confirm: () => true,
};
scope.renderTable = function (...a) { return run('renderTable', ...a); };
scope.updateSortUi = function (...a) { return run('updateSortUi', ...a); };

function run(name, ...args) {
  const src = extractFn(name);
  with (scope) { return eval('(' + src + ')')(...args); }
}
function get(k) { return scope[k]; }
function set(k, v) { scope[k] = v; }

console.log('\n=== v2.11.0 回归：学生排序 ===');
const mk = (sid, name, credit) => ({ id: parseInt(sid.slice(4), 10), sid, name, credit, tags: [] });
scope.state.students = [mk('2026003', '丙', 30), mk('2026001', '甲', 10), mk('2026002', '乙', 20)];

t('默认（index 模式）表格按序号升序：甲→乙→丙', () => {
  set('sortMode', 'index');
  run('renderTable');
  const body = el('studentTableBody').innerHTML;
  const idx = ['甲', '乙', '丙'].map(n => body.indexOf(n));
  eq(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), true);
});
t('学分模式降序：丙(30)→乙(20)→甲(10)', () => {
  set('sortMode', 'credit'); set('sortDir', 'desc');
  run('renderTable');
  const body = el('studentTableBody').innerHTML;
  const idx = ['丙', '乙', '甲'].map(n => body.indexOf(n));
  eq(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), true);
});
t('toggleSort: index → credit(desc)，按钮/图标联动', () => {
  set('sortMode', 'index'); set('sortDir', 'desc');
  run('toggleSort');
  eq(get('sortMode'), 'credit'); eq(get('sortDir'), 'desc');
  eq(el('sortBtn').textContent, '按学分 ↓');
  eq(el('sortIcon').textContent, '↓');
});
t('toggleSort v2.17.4 三态：credit(desc) → credit(asc)，按钮/图标联动', () => {
  run('toggleSort');
  eq(get('sortMode'), 'credit'); eq(get('sortDir'), 'asc');
  eq(el('sortBtn').textContent, '按学分 ↑');
  eq(el('sortIcon').textContent, '↑');
});
t('toggleSort v2.17.4 三态：credit(asc) → index（恢复序号）', () => {
  run('toggleSort');
  eq(get('sortMode'), 'index');
  eq(el('sortBtn').textContent, '按序号 ↑');
  eq(el('sortIcon').textContent, '⇅');
});
t('v2.17.4 三态闭环：再点回 credit(desc)', () => {
  run('toggleSort');
  eq(get('sortMode'), 'credit'); eq(get('sortDir'), 'desc');
});
t('v2.17.4 学分升序按数值排：字符串学分也正确（10/20/30/60）', () => {
  set('sortMode', 'credit'); set('sortDir', 'asc');
  scope.state.students = [
    { id: 1, sid: '2026003', name: '丙', credit: 30, tags: [] },
    { id: 2, sid: '2026001', name: '甲', credit: 10, tags: [] },
    { id: 3, sid: '2026002', name: '乙', credit: '20', tags: [] },   // 字符串学分（导入残留）
    { id: 4, sid: '2026004', name: '丁', credit: 60, tags: [] }
  ];
  run('renderTable');
  const body = el('studentTableBody').innerHTML;
  const idx = ['甲', '乙', '丙', '丁'].map(n => body.indexOf(n));
  eq(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), true);
});
t('updateSortUi: credit 模式给学分列头加 sorted 高亮，index 移除', () => {
  set('sortMode', 'credit'); run('updateSortUi');
  eq(el('creditTh').classList.contains('sorted'), true);
  set('sortMode', 'index'); run('updateSortUi');
  eq(el('creditTh').classList.contains('sorted'), false);
});

console.log('\n=== v2.11.0 回归：名单解析 rosterParse ===');
t('「1 白伊雯」空格分隔', () => {
  const r = run('rosterParse', '1 白伊雯');
  eq(r.length, 1); eq(r[0].no, 1); eq(r[0].raw, '白伊雯');
});
t('「2，陈静雯」全角逗号', () => {
  const r = run('rosterParse', '2，陈静雯');
  eq(r[0].no, 2); eq(r[0].raw, '陈静雯');
});
t('「3、陈欣怡」顿号 / 「4,程芷琪」半角逗号 / Tab 分隔', () => {
  const r = run('rosterParse', '3、陈欣怡\n4,程芷琪\n5\t代红');
  eq(r.map(x => x.raw).join(','), '陈欣怡,程芷琪,代红');
  eq(r[2].no, 5);
});
t('纯姓名行 no=null；行尾数字备注不混入姓名', () => {
  const r = run('rosterParse', '白伊雯\n代红,6');
  eq(r[0].no, null); eq(r[0].raw, '白伊雯');
  eq(r[1].no, null); eq(r[1].raw, '代红');
});
t('空行过滤', () => {
  eq(run('rosterParse', '1 甲\n\n  \n2 乙').length, 2);
});

console.log('\n=== v2.11.0 回归：同步计划 rosterBuildPlan ===');
// 场景：现有 4 人（含累计学分/标签），新名单 5 人 → 3 保留（1 人学号更新）、2 新增、1 移除
const existing = [
  { id: 1, sid: '2026001', name: '白伊雯', credit: 35, tags: ['302寝室'] },
  { id: 2, sid: '2026002', name: '陈静雯', credit: 20, tags: [] },
  { id: 3, sid: '2026007', name: '夏惠莉', credit: 12, tags: ['走读'] },
  { id: 4, sid: '2026005', name: '陈欣怡', credit: 8, tags: [] },
];
const entries = run('rosterParse', '1 白伊雯\n2 陈静雯\n3 陈欣怡\n4 新同学\n5 王五');

t('移除名单：不在新名单中的学生被识别（含学分）', () => {
  const p = run('rosterBuildPlan', entries, existing);
  eq(p.removes.length, 1);
  eq(p.removes[0].name, '夏惠莉'); eq(p.removes[0].credit, 12);
});
t('新增名单：名单有班级没有 → 新增并带目标学号（新同学 004、王五 005）', () => {
  const p = run('rosterBuildPlan', entries, existing);
  eq(p.adds.length, 2);
  eq(p.adds[0].name, '新同学'); eq(p.adds[0].sid, '2026004');
  eq(p.adds[1].name, '王五'); eq(p.adds[1].sid, '2026005');
});
t('学号更新：白伊雯 2026001 不变、陈欣怡 2026005→2026003、陈静雯 2026002 不变', () => {
  const p = run('rosterBuildPlan', entries, existing);
  eq(p.updates.length, 1);
  eq(p.updates[0].name, '陈欣怡'); eq(p.updates[0].oldSid, '2026005'); eq(p.updates[0].newSid, '2026003');
});
t('同名带备注：班级「刘梓萱」与名单「刘梓萱（白驿）」按基础名匹配', () => {
  const ex = [{ id: 9, sid: '2026026', name: '刘梓萱', credit: 5, tags: [] }];
  const p = run('rosterBuildPlan', run('rosterParse', '26 刘梓萱（白驿）'), ex);
  eq(p.adds.length, 0); eq(p.conflicts.length, 0); eq(p.removes.length, 0);
  eq(p.updates.length, 0);
});
t('班级同名人数 = 名单条数 → 顺序一一配对（消化重复导入/同名两人）', () => {
  const ex = [
    { id: 9, sid: '2026026', name: '刘梓萱', credit: 5, tags: [] },
    { id: 10, sid: '2026027', name: '刘梓萱', credit: 3, tags: [] },
  ];
  const p = run('rosterBuildPlan', run('rosterParse', '26 刘梓萱（白驿）\n27 刘梓萱（东青）'), ex);
  eq(p.conflicts.length, 0); eq(p.adds.length, 0); eq(p.removes.length, 0);
  eq(p.updates.length, 0);   // 学号恰好已对上
});
t('同名组偏多：0 分无标签副本自动剔除（保正身），剩余按顺序配对', () => {
  const ex = [
    { id: 9, sid: '2026026', name: '刘梓萱', credit: 5, tags: [] },
    { id: 10, sid: '2026027', name: '刘梓萱', credit: 3, tags: [] },
    { id: 11, sid: '2026028', name: '26 刘梓萱（白驿）', credit: 0, tags: [] },  // 重复导入副本
    { id: 12, sid: '2026029', name: '27 刘梓萱（东青）', credit: 0, tags: [] },
  ];
  const p = run('rosterBuildPlan', run('rosterParse', '26 刘梓萱（白驿）\n27 刘梓萱（东青）'), ex);
  eq(p.conflicts.length, 0); eq(p.adds.length, 0);
  eq(p.removes.length, 2);            // 两个 0 分副本自动清理
  eq(p.removes.map(r => r.id).sort((a,b)=>a-b).join(','), '11,12');
  eq(p.updates.length, 0);            // 正身学号恰好已对
});
t('同名组偏多且多出者有学分/标签（疑似真人）→ 整组 conflict 不误删', () => {
  const ex = [
    { id: 9, sid: '2026026', name: '刘梓萱', credit: 5, tags: [] },
    { id: 10, sid: '2026027', name: '刘梓萱', credit: 3, tags: [] },
    { id: 11, sid: '2026028', name: '刘梓萱', credit: 1, tags: [] },   // 有分，不敢自动删
  ];
  const p = run('rosterBuildPlan', run('rosterParse', '26 刘梓萱（白驿）\n27 刘梓萱（东青）'), ex);
  eq(p.conflicts.length, 2);
  eq(p.removes.length, 0); eq(p.adds.length, 0); eq(p.updates.length, 0);
});
t('修复重复导入：副本带序号前缀（如「1 白伊雯」）被识别；与原有重复的副本移除、孤立的副本收编改名', () => {
  const ex = [
    { id: 1, sid: '2026001', name: '白伊雯', credit: 35, tags: ['302寝室'] },
    { id: 2, sid: '2026002', name: '陈静雯', credit: 20, tags: [] },
    { id: 90, sid: '2026001', name: '1 白伊雯', credit: 0, tags: [] },   // 与原有重复 → 移除
    { id: 91, sid: '2026002', name: '2，陈静雯', credit: 0, tags: [] },  // 与原有重复 → 移除
    { id: 92, sid: '2026099', name: '59 朱洪林', credit: 0, tags: [] },  // 原班无此人 → 收编（改名+改学号）
  ];
  const p = run('rosterBuildPlan', run('rosterParse', '1 白伊雯\n2 陈静雯\n59 朱洪林'), ex);
  eq(p.adds.length, 0); eq(p.conflicts.length, 0);
  eq(p.removes.length, 2);            // 重复的两个副本移除
  eq(p.removes.map(r => r.id).sort((a,b)=>a-b).join(','), '90,91');
  eq(p.renames.length, 1);            // 孤立副本收编改名
  eq(p.renames[0].id, 92); eq(p.renames[0].newName, '朱洪林');
  eq(p.updates.length, 1);            // 同时修正学号 2026099 → 2026059
  eq(p.updates[0].newSid, '2026059');
});
t('脏名清洗：匹配到的学生名字带序号前缀 → 计入 renames 改为名单名', () => {
  const ex = [{ id: 5, sid: '2026059', name: '59 朱洪林', credit: 0, tags: [] }];
  const p = run('rosterBuildPlan', run('rosterParse', '59 朱洪林'), ex);
  eq(p.renames.length, 1);
  eq(p.renames[0].id, 5); eq(p.renames[0].newName, '朱洪林');
  eq(p.removes.length, 0); eq(p.adds.length, 0); eq(p.conflicts.length, 0);
});
t('精确同名优先于规范名（班级存的就是带备注全名）', () => {
  const ex = [
    { id: 9, sid: '2026026', name: '刘梓萱（白驿）', credit: 5, tags: [] },
    { id: 10, sid: '2026027', name: '刘梓萱', credit: 3, tags: [] },
  ];
  const p = run('rosterBuildPlan', run('rosterParse', '26 刘梓萱（白驿）'), ex);
  eq(p.updates.length, 0); eq(p.adds.length, 0); eq(p.conflicts.length, 0);
  eq(p.removes.length, 1); eq(p.removes[0].id, 10);
});
t('名单已一致 → 全空计划', () => {
  const ex = [{ id: 1, sid: '2026001', name: '白伊雯', credit: 9, tags: [] }];
  const p = run('rosterBuildPlan', run('rosterParse', '1 白伊雯'), ex);
  eq(p.adds.length + p.removes.length + p.updates.length + p.conflicts.length + p.renames.length, 0);
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
