/* 2026-11-11 学号云合并契约回归（版本无关）
   背景：老板反馈「网页版学号早改好，过段时间又变回错的」，连出现三次。
   根因：改学号的入口（批量配学号 / 名单同步）不刷新 updatedAt，而 msStudents 是
         「整条学生记录」按 updatedAt 仲裁；只要云端那条因加分/改寝室/启动自愈而更新，
         本机改对的学号就被整对象覆盖回旧值。
   修法：学号单独带版本戳 sidAt + msStudents 字段级仲裁（pickStudentSid）。
   运行：node _sid_merge_test.js
   注意：本套件切的是 index.html 里真实的合并引擎段，任何断言都不依赖版本号。 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (String(a) !== String(b)) throw new Error('期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function has(code, needle, label) {
  if (code.indexOf(needle) < 0) throw new Error('缺少：' + (label || needle));
}

/* ---------- 沙箱：切出真实合并引擎（缺一个符号就落回 Node 全局，症状像源码 bug） ---------- */
global.DEFAULT_COMMITTEE = {};
global.state = {};
const STATE_SCHEMA = eval('(' + html.slice(html.indexOf('const STATE_SCHEMA'),
  html.indexOf('\n];', html.indexOf('const STATE_SCHEMA')) + 3)
  .replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
const MERGE_SEG = html.slice(html.indexOf('function msStudents'), html.indexOf('/* MERGE_ENGINE_END'));
eval(MERGE_SEG);
global.mergeTsMap = eval('(' + grab('function mergeTsMap(a, b)') + ')');
global.catTombReviveFilter = eval('(' + grab('function catTombReviveFilter(tomb, delAt, revived)') + ')');
const sortOpsNewestFirst = eval('(' + grab('function sortOpsNewestFirst(ops)') + ')');
const smartMergeData = eval('(' + grab('function smartMergeData(localData,remoteData)') + ')');
global.sortOpsNewestFirst = sortOpsNewestFirst;
global.cloneCatDeleted = eval('(' + grab('function cloneCatDeleted(t)') + ')');
global.catDelAdd = eval('(' + grab('function catDelAdd(list, key)') + ')');
global.applyCatTombstones = eval('(' + grab('function applyCatTombstones(cat, scores, tomb)') + ')');
global.flattenReasonCatalog = eval('(' + grab('function flattenReasonCatalog(cat)') + ')');
global.normSchedule = function(x){ return x; };
global.defaultSchedule = function(){ return {}; };
global.scheduleHasContent = function(){ return true; };

const stu = (id, sid, extra) => Object.assign({ id: id, sid: sid, name: '学生' + id, credit: 100 }, extra || {});
const wrap = list => ({ students: list });
const sidOf = (merged, id) => (merged.students.find(s => s.id === id) || {}).sid;

console.log('\n=== 学号字段级仲裁（回归主线） ===');

t('① 云端因加分 updatedAt 更新、但没改过学号 → 本机改正的学号不被顶回', () => {
  const local  = wrap([stu(7, '2602045')]);                                   // 刚改对，无任何时间戳
  const remote = wrap([stu(7, '2026045', { updatedAt: Date.now() - 3600e3 })]); // 云端旧值 + 较新 updatedAt
  eq(sidOf(smartMergeData(local, remote), 7), '2602045');
});

t('② 本机老数据连 createdAt 都没有（lt=0）→ 仍然守住本机学号', () => {
  const local  = wrap([stu(7, '2602045')]);
  const remote = wrap([stu(7, '2026045', { updatedAt: 1700000000000 })]);
  eq(sidOf(smartMergeData(local, remote), 7), '2602045');
});

t('③ 本机学号带 sidAt（改学号时写入）→ 即使云端整体更新，仍按 sidAt 裁决', () => {
  const now = Date.now();
  const local  = wrap([stu(7, '2602045', { sidAt: now })]);
  const remote = wrap([stu(7, '2026045', { updatedAt: now + 5000, sidAt: now - 60000 })]);
  eq(sidOf(smartMergeData(local, remote), 7), '2602045');
});

t('④ 云端学号带更新的 sidAt（另一台设备改的）→ 本机接受云端新学号', () => {
  const now = Date.now();
  const local  = wrap([stu(7, '2026045', { updatedAt: now, sidAt: now - 60000 })]);
  const remote = wrap([stu(7, '2602045', { sidAt: now })]);
  eq(sidOf(smartMergeData(local, remote), 7), '2602045');
});

t('⑤ 本机学号为空、云端有 → 补上云端学号（不丢数据）', () => {
  const local  = wrap([stu(7, '')]);
  const remote = wrap([stu(7, '2602045', { updatedAt: 1700000000000 })]);
  eq(sidOf(smartMergeData(local, remote), 7), '2602045');
});

t('⑥ 云端学号为空、本机有 → 不被清空', () => {
  const local  = wrap([stu(7, '2602045')]);
  const remote = wrap([stu(7, '', { updatedAt: 1700000000000 })]);
  eq(sidOf(smartMergeData(local, remote), 7), '2602045');
});

t('⑦ 合并只改学号，不顺手改动云端更"新"的学分（避免整对象换手的副作用）', () => {
  const now = Date.now();
  const local  = wrap([stu(7, '2602045', { credit: 80, creditVer: 1, sidAt: now })]);
  const remote = wrap([stu(7, '2026045', { credit: 120, creditVer: 9, updatedAt: now + 5000, sidAt: now - 60000 })]);
  const m = smartMergeData(local, remote);
  const s = m.students.find(x => x.id === 7);
  eq(s.sid, '2602045');
  eq(s.credit, 120);            // 学分仍按整体时间戳取云端（未被本机旧值覆盖）
});

t('⑧ 两台设备都改过学号 → 戳新者胜，旧值不复活', () => {
  const now = Date.now();
  const a = wrap([stu(7, '2602045', { sidAt: now - 10000 })]);
  const b = wrap([stu(7, '2602046', { sidAt: now })]);
  eq(sidOf(smartMergeData(a, b), 7), '2602046');
  eq(sidOf(smartMergeData(b, a), 7), '2602046');
});

t('⑨ 合并是幂等的：同一对数据合并两次结果一致', () => {
  const now = Date.now();
  const local  = wrap([stu(7, '2602045', { sidAt: now })]);
  const remote = wrap([stu(7, '2026045', { updatedAt: now + 1000 })]);
  const once  = smartMergeData(local, remote);
  const twice = smartMergeData(once, remote);
  eq(sidOf(twice, 7), '2602045');
});

t('⑩ 墓碑删除优先于学号仲裁：已删学生不因 sidAt 复活', () => {
  const now = Date.now();
  const local  = wrap([stu(7, '2602045', { sidAt: now })]);
  local.studentDeleted = { 7: now };
  const remote = wrap([stu(7, '2026045', { sidAt: now + 5000 })]);
  eq((smartMergeData(local, remote).students || []).length, 0);
});

console.log('\n=== 写入端一致性（静态）：改学号必须打版本戳 ===');

t('⑪ 批量配学号 applyBulkSids 写 sidAt', () => {
  const seg = html.slice(html.indexOf('function applyBulkSids'), html.indexOf('function applyBulkSids') + 1600);
  has(seg, 'sidAt = Date.now()', 'applyBulkSids 未写 sidAt');
});

t('⑫ 名单同步 plan.updates 写 sidAt', () => {
  has(html, 's.sidAt = Date.now()', '名单同步未写 sidAt');
});

t('⑬ 表格导入补学号写 sidAt', () => {
  has(html, 's2.sidAt = Date.now()', '表格导入未写 sidAt');
});

t('⑭ msStudents 两个分支都走 pickStudentSid（不能只改一处）', () => {
  const seg = html.slice(html.indexOf('function msStudents'), html.indexOf('function pickStudentSid'));
  const n = (seg.match(/pickStudentSid\(/g) || []).length;
  if (n < 2) throw new Error('pickStudentSid 只被调用 ' + n + ' 次，两个仲裁分支都要覆盖');
});

console.log('\n=== 长期收敛性：反复同步后学号是否还会自己漂移 ===');

t('⑯ 旧客户端（不认识 sidAt）反复推旧学号 50 轮 → 零漂移', () => {
  const T1 = 1790000000000;
  let local = wrap([stu(7, '2602047', { sidAt: T1, updatedAt: T1 - 5000 })]);
  for (let i = 1; i <= 50; i++) {
    /* 桌面版 v1.7.7 / 没刷新的标签页：整条没有 sidAt，updatedAt 每轮都变新（模拟连续加分） */
    const cloud = wrap([stu(7, '2026045', { updatedAt: T1 + i * 1000, credit: 100 + i })]);
    local = smartMergeData(local, cloud);
    const got = String(sidOf(local, 7));
    if (got !== '2602047') throw new Error('第 ' + i + ' 轮漂移成 ' + got);
  }
});

t('⑰ 全班 60 人 × 100 轮（每轮约 1/3 人加分、云端学号是错的）→ 全班学号零变动', () => {
  const T1 = 1790000000000, N = 60;
  const right = [], wrong = [];
  for (let i = 0; i < N; i++) {
    const sid = '2602' + String(i + 1).padStart(3, '0');
    right.push({ id: i + 1, sid: sid, name: '学生' + (i + 1), credit: 100, sidAt: T1, updatedAt: T1 });
    wrong.push({ id: i + 1, sid: (i === 46 ? '2026045' : sid), name: '学生' + (i + 1), credit: 100 });
  }
  let local = wrap(JSON.parse(JSON.stringify(right)));
  for (let r = 1; r <= 100; r++) {
    const cloud = wrap(JSON.parse(JSON.stringify(wrong)).map(s => {
      if (Math.random() < 0.34) { s.credit += 1; s.updatedAt = T1 + r * 1000; }
      return s;
    }));
    local = smartMergeData(local, cloud);
    for (let i = 0; i < N; i++) {
      const want = '2602' + String(i + 1).padStart(3, '0');
      const got = String(sidOf(local, i + 1));
      if (got !== want) throw new Error('第 ' + r + ' 轮，id=' + (i + 1) + ' 从 ' + want + ' 变成 ' + got);
    }
  }
});

t('⑱ 带新戳把学号改成空 → 必须生效（防止修成"永远改不掉"）', () => {
  const T1 = 1790000000000;
  const local  = wrap([stu(7, '2602047', { sidAt: T1, updatedAt: T1 })]);
  const remote = wrap([stu(7, '', { sidAt: T1 + 1000, updatedAt: T1 })]);
  eq(sidOf(smartMergeData(local, remote), 7), '');
});

t('⑲ students 仍在云同步白名单（cfs）且无字段清洗 → sidAt 能随包上传/下载', () => {
  const schema = eval('(' + html.slice(html.indexOf('const STATE_SCHEMA'),
    html.indexOf('\n];', html.indexOf('const STATE_SCHEMA')) + 3)
    .replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
  const f = schema.find(x => x.key === 'students');
  if (!f) throw new Error('STATE_SCHEMA 里找不到 students');
  if (!f.cfs) throw new Error('students 不在云同步白名单，sidAt 推不上云端');
  if (f.nosv) throw new Error('students 被标 nosv（不进本地快照），会丢 sidAt');
  /* 云负载是字段级整体搬运，不得对 students 内部字段做白名单裁剪 */
  const bp = html.slice(html.indexOf('function buildCloudPayload'), html.indexOf('function buildCloudPayload') + 900);
  if (/students[^\n]*\.map\(|students[^\n]*filter\(/.test(bp)) throw new Error('buildCloudPayload 对 students 做了内部裁剪，sidAt 可能被剥离');
});

t('⑮ 合并引擎段能独立编译（切片完整性）', () => {
  new Function(MERGE_SEG);
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
