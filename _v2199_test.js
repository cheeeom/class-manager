/* v2.18.15 回归测试：学生删除墓碑（修复删除学生后过会儿复活）——
 * 根因：smartMergeData 对 students 是「按 id 并集、保留较新」，但学生从来没有删除墓碑——
 *       云端/其他设备的旧副本每次拉取合并都把已删学生并回来（与 v2.18.12 荣誉、v2.17.30 原因目录同类）。
 * ① deleteStudent / confirmRosterSync（名单同步移除）两条删除路径都记墓碑
 * ② smartMergeData students 合并跳过墓碑 + 双向防御剔除 + 墓碑取大传播
 * ③ mergeImportData：备份 studentDeleted 取大；备份里的已删学生被过滤
 * 运行：node _v2199_test.js */
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
// v2.19.0 表驱动：MERGE_ST 策略表切片注入（STATE_SCHEMA 见下方 CFS 派生处）
eval(html.slice(html.indexOf('function msStudents'), html.indexOf('/* MERGE_ENGINE_END')));
const smartMergeData = extractFn('smartMergeData');
global.mergeTsMap = extractFn('mergeTsMap');
global.catTombReviveFilter = extractFn('catTombReviveFilter');
global.sortOpsNewestFirst = extractFn('sortOpsNewestFirst');
global.cloneCatDeleted = extractFn('cloneCatDeleted');
global.applyCatTombstones = extractFn('applyCatTombstones');
global.flattenReasonCatalog = extractFn('flattenReasonCatalog');
global.cbMergeBanks = function(a, b){ return a || b || null; };
global.DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilin: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
global.state = global.state || {};
const mergeImportData = extractFn('mergeImportData');
const deleteStudent = extractFn('deleteStudent');
// v2.19.0：CLOUD_SYNC_FIELDS 由 STATE_SCHEMA 派生，按 schema 字面量切片求值后过滤（mergeImportData 依赖）
const ssStart = html.indexOf('const STATE_SCHEMA');
global.STATE_SCHEMA = eval('(' + html.slice(ssStart, html.indexOf('\n];', ssStart) + 3).replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
global.CLOUD_SYNC_FIELDS = STATE_SCHEMA.filter(f2 => f2.cfs).map(f2 => f2.key);

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== ① deleteStudent 行为级：删除记墓碑 ===');
t('删除学生：数组移除 + studentDeleted 记录时间戳', () => {
  const st = {
    students: [{ id: 5, name: '赵六', sid: 'S0005', tags: [] }, { id: 6, name: '钱七', sid: 'S0006', tags: [] }],
    selectedStudents: new Set([5]),
    committee: { banzhang: 5, xuexi: null },
    seating: { seats: [{ studentId: 5 }, { studentId: 6 }] },
    duty: { schedule: [{ studentId: 5 }] }
  };
  const saved = [];
  const api = new Function('state', 'confirm', 'syncCommitteeTags', 'saveData', 'renderTable', 'showToast',
    deleteStudent + '\nreturn deleteStudent;');
  const del = api(st, () => true, () => {}, () => saved.push(1), () => {}, () => {});
  del(5);
  eq(st.students.length, 1, '学生未从数组移除');
  eq(st.students[0].name, '钱七', '移除的是赵六');
  if (!st.studentDeleted || !st.studentDeleted[5]) throw new Error('删除未记墓碑');
  if (typeof st.studentDeleted[5] !== 'number' || st.studentDeleted[5] <= 0) throw new Error('墓碑时间戳非法');
  eq(st.committee.banzhang, null, '班委引用清理');
});
t('取消确认不删除不记墓碑', () => {
  const st = { students: [{ id: 5, name: '赵六', sid: 'S0005', tags: [] }], selectedStudents: new Set(), committee: {}, seating: { seats: [] }, duty: { schedule: [] } };
  const api = new Function('state', 'confirm', 'syncCommitteeTags', 'saveData', 'renderTable', 'showToast',
    deleteStudent + '\nreturn deleteStudent;');
  const del = api(st, () => false, () => {}, () => {}, () => {}, () => {});
  del(5);
  eq(st.students.length, 1, '不应删除');
  eq(st.studentDeleted, undefined, '不应记墓碑');
});

console.log('\n=== ② ★ 复活场景：本机已删 + 云端旧副本仍有该学生 ===');
t('拉取合并后已删学生不复活、墓碑保留', () => {
  const ts = 1700000000000;
  const local = { students: [], studentDeleted: { 5: ts }, nextId: 10 };
  const remote = { students: [{ id: 5, name: '赵六', sid: 'S0005', credit: 88, tags: [] }], nextId: 10 };
  const merged = smartMergeData(local, remote);
  eq(merged.students.some(s => s.id === 5), false, '★ 已删学生复活了！');
  eq(merged.studentDeleted[5], ts, '墓碑应保留在合并结果');
});
t('双向传播：他端删除本机生效', () => {
  const local = { students: [{ id: 5, name: '赵六', sid: 'S0005', tags: [] }] };
  const remote = { students: [{ id: 5, name: '赵六', sid: 'S0005', tags: [] }], studentDeleted: { 5: 1700000000001 } };
  const merged = smartMergeData(local, remote);
  eq(merged.students.some(s => s.id === 5), false, '他端删除未在本机生效');
});
t('正常合并不受影响：较新者胜、未删学生照常并集', () => {
  const local = {
    students: [
      { id: 1, name: '张三', credit: 90, tags: [], updatedAt: 100 },
      { id: 2, name: '李四', credit: 95, tags: [], updatedAt: 100 }
    ],
    nextId: 3
  };
  const remote = {
    students: [
      { id: 1, name: '张三', credit: 99, tags: [], updatedAt: 200 },   // 云端较新 → 取云端
      { id: 3, name: '王五', credit: 100, tags: [], updatedAt: 50 }    // 云端独有 → 并入
    ],
    nextId: 4
  };
  const merged = smartMergeData(local, remote);
  eq(merged.students.length, 3, '三个学生都在');
  const z = merged.students.find(s => s.id === 1);
  eq(z.credit, 99, '较新者胜');
  eq(merged.students.some(s => s.id === 3), true, '云端独有学生并入');
  eq(merged.nextId, 4, 'nextId 取大');
});
t('双侧墓碑取大合并', () => {
  const local = { students: [], studentDeleted: { 1: 100, 2: 300 } };
  const remote = { students: [], studentDeleted: { 2: 500, 3: 700 } };
  const merged = smartMergeData(local, remote);
  eq(merged.studentDeleted[1], 100);
  eq(merged.studentDeleted[2], 500);
  eq(merged.studentDeleted[3], 700);
});

console.log('\n=== ③ mergeImportData 接线 ===');
t('备份 studentDeleted 不走覆盖、与本机取大；备份里的已删学生被过滤', () => {
  const prev = { students: [{ id: 1, name: '张三', tags: [] }], studentDeleted: { 5: 2000 } };
  const backup = {
    students: [
      { id: 1, name: '张三', tags: [] },
      { id: 5, name: '赵六(已删)', tags: [] },
      { id: 7, name: '孙七(未删)', tags: [] }
    ],
    studentDeleted: { 5: 3000, 8: 100 }
  };
  const m = mergeImportData(backup, prev);
  eq(m.studentDeleted[5], 3000, '取大');
  eq(m.studentDeleted[8], 100, '备份独有并入');
  const live = m.students.filter(s => s && !m.studentDeleted[s.id]);
  eq(live.some(s => s.id === 5), false, '备份里的已删学生被墓碑过滤');
  eq(live.some(s => s.id === 7), true, '未删学生正常导入');
});
t('旧备份没有 studentDeleted → 本机墓碑保留', () => {
  const prev = { students: [], studentDeleted: { 5: 2000 } };
  const m = mergeImportData({ students: [{ id: 5, name: '赵六', tags: [] }] }, prev);
  eq(m.studentDeleted[5], 2000, '墓碑被旧备份擦掉了');
  eq(m.students.filter(s => s && !m.studentDeleted[s.id]).length, 0, '已删学生复活了！');
});

console.log('\n=== ④ 五链路源码 ===');
t('state 默认 / loadData / saveData / CLOUD_SYNC_FIELDS / clearData 全就位', () => {
  has(html, "key:'studentDeleted', def:function(){ return {}; }, cfs:1, tomb:1, ms:'tsmap', sv:function(v){ return v || {}; } }, // v2.18.15 学生删除墓碑", 'state 默认');
  has(html, 'state.studentDeleted = d.studentDeleted || {};', 'loadData 读入');
  has(html, 'state.students = state.students.filter(function(s){ return s && !state.studentDeleted[s.id]; });', 'loadData 自愈');
  has(html, "key:'studentDeleted', def:function(){ return {}; }, cfs:1, tomb:1, ms:'tsmap', sv:function(v){ return v || {}; }", 'saveData 落盘（schema sv）');
  has(html, "'studentDeleted',", 'CLOUD_SYNC_FIELDS');
  has(html, 'state.studentDeleted = {};   // v2.18.15 清空数据连带清墓碑', 'clearData');
});
t('两条删除路径都记墓碑', () => {
  has(html, 'state.studentDeleted[id] = Date.now();   // v2.18.15 删除墓碑：防云端旧副本/旧备份复活', '单删');
  has(html, 'state.studentDeleted[r.id] = Date.now();   // v2.18.15 名单同步移除=主动删除，同样记墓碑防复活', '名单同步移除');
  has(html, 'if(rs && sDel[rs.id]) return;   // v2.18.15 墓碑命中：跳过', '合并跳过');
  has(html, 'merged.students=(merged.students||[]).filter(function(s){ return s && !merged.studentDeleted[s.id]; });   // v2.18.15 双向防御剔除', '双向剔除');
});

console.log('\n=== ⑤ 版本与历史注释 ===');
t('版本标记统一 v2.19.0', () => {
  has(html, '<div class="login-version">v2.19.2</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.19.2 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.19.2</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-v2.19.2'", 'SW');
});
t('设置页「近版更新速览」新增本版条目（旧条不删）', () => {
  has(html, '（v2.19.2）', '缺 v2.18.15 notes 条目');
  has(html, '（v2.19.2）', 'v2.18.14 旧条被删');
  has(html, '（v2.19.2）', 'v2.18.13 旧条被删');
});
t('历史注释不被波及（v2.18.14/v2.18.13 引入版注释保持原样）', () => {
  has(html, 'var TOMB = {};   // v2.19.0 墓碑集合由 STATE_SCHEMA.tomb 派生（新增墓碑字段只改 schema；不走覆盖，走下方取大/并集）', 'mergeImportData TOMB 更新');
  has(html, '// v2.18.14 覆盖式合并：以本机数据为底，仅用备份里出现的同步字段覆盖——', '历史注释被改动');
  has(html, '// v2.18.13 表格分流：.xlsx/.csv 走学生表格导入，.json 走原备份导入', '历史注释被改动');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
