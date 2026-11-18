// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.27 回归：①删掉的考试被云同步搬回来 ②成绩导入挑模板 / xlsx 直接读失败
   ── 问题一 ──
   症状：成绩管理删掉一场考试，刷新或换设备后又出现。
   根因：msExams 原本是**纯并集**（本地为底、云端有就塞进来），本地删了、云端副本还在
        ⇒ 合并时 `!emap[re.id]` 成立 ⇒ 又被加回来。
        请假(v3.0.0)/荣誉(v2.18.12)/学生(v2.18.15) 三张表都有墓碑，唯独 exams 漏了。
   修法：新增 examDeleted 墓碑 + msExams 双侧剔除（照 msLeaves 同款写法，因 schema 里
        墓碑字段排在 exams 之后，故 msExams 内部自己 mergeTsMap 一次）。

   ── 问题二 ──
   症状：导入成绩必须严格照模板，Excel 文件直接失败。
   根因：入口 accept 含 .xlsx，但 importGrades 用 readAsText —— zip 二进制当文本读必是乱码；
        且列位置写死 cells[0]=学号、cells[1]=姓名、第2列起算科目；科目名取表头原文。
   修法：复用 v2.18.13 的零依赖 xlsx/csv 解析 + 表头识别（matchScoreSubject /
        detectScoreCols / locateScoreHeaderRow / parseScoreGrid）。

   运行：node _v3927_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');
const cmgx = fs.readFileSync('cmgx.js', 'utf8').replace(/\r\n/g, '\n');
const mani = fs.readFileSync('manifest.json', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '— ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + '期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }

/* ---------- 版本号（从 CACHE_NAME 反推，跟版零改动） ---------- */
const VM = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
if (!VM) throw new Error('无法从 sw.js 反推版本号');
const VER = VM[1];              // v3.9.27
const NUM = VER.slice(1);       // 3.9.27

console.log('  当前版本：' + VER);

/* ==================== 一、考试删除墓碑 ==================== */

t('① examDeleted 墓碑字段已进 STATE_SCHEMA（cfs + tomb + tsmap）', function () {
  has(html, "{ key:'examDeleted', def:function(){ return {}; }, cfs:1, tomb:1, ms:'tsmap'",
      'schema 缺少 examDeleted 行');
});

t('② schema 的 tomb:1 能被 TOMB 派生集合识别（ve 由 STATE_SCHEMA.tomb 驱动）', function () {
  has(html, "STATE_SCHEMA.forEach(function(f){ if(f.tomb) TOMB[f.key] = 1; });",
      'TOMB 派生逻辑被改动');
});

t('③ deleteExam 写墓碑再过滤', function () {
  const fn = (html.match(/function deleteExam\(id\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'deleteExam 切片失败');
  has(fn, 'state.examDeleted[id] = Date.now();', 'deleteExam 未写墓碑');
  has(fn, 'if(!state.examDeleted) state.examDeleted = {};', '未做旧数据兜底初始化');
  ok(fn.indexOf('filter') > fn.indexOf('examDeleted[id]'), '应先写墓碑再 filter');
});

t('④ confirmAddExam 同 id 重建时撤销墓碑（防重置数据后 id 回绕被误删）', function () {
  const fn = (html.match(/function confirmAddExam\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'confirmAddExam 切片失败');
  has(fn, 'if(state.examDeleted && state.examDeleted[exam.id]) delete state.examDeleted[exam.id];',
      '缺少同 id 清墓碑');
});

/* ---- 行为级：把真实 mergeTsMap + msExams 切出来跑 ---- */
const srcMerge = (html.match(/function mergeTsMap\(a, b\)\{[\s\S]*?\n\}/) || [])[0];
const srcMsExams = (html.match(/function msExams\(merged,localData,remoteData\)\{[\s\S]*?\n\}/) || [])[0];
if (!srcMerge || !srcMsExams) throw new Error('mergeTsMap / msExams 切片失败（锚点被改动？）');
const S = {};
new Function('S', srcMerge + '\n' + srcMsExams + '\nS.merge=mergeTsMap; S.ms=msExams;')(S);

const clone = o => JSON.parse(JSON.stringify(o));

t('⑤ 行为：本地删了考试2，云端还有 ⇒ 不复活', function () {
  const local = { exams: [{ id: 1, name: '期中' }], examDeleted: { 2: 111 } };
  const remote = { exams: [{ id: 1, name: '期中' }, { id: 2, name: '月考' }], examDeleted: {} };
  const merged = clone(local);
  S.ms(merged, local, remote);
  eq(merged.exams.length, 1, '删掉的考试复活了：');
  eq(merged.exams[0].id, 1);
});

t('⑥ 行为：另一台设备删了（云端墓碑）⇒ 本机也删掉', function () {
  const local = { exams: [{ id: 1 }, { id: 2 }], examDeleted: {} };
  const remote = { exams: [{ id: 1 }], examDeleted: { 2: 999 } };
  const merged = clone(local);
  S.ms(merged, local, remote);
  eq(merged.exams.length, 1, '云端墓碑未传播：');
  eq(merged.exams[0].id, 1);
});

t('⑦ 行为：两边各删一个 ⇒ 两个都不在', function () {
  const local = { exams: [{ id: 1 }], examDeleted: { 2: 100 } };
  const remote = { exams: [{ id: 1 }, { id: 3 }], examDeleted: { 3: 200 } };
  const merged = clone(local);
  S.ms(merged, local, remote);
  eq(merged.exams.length, 1, '墓碑未并集：');
  eq(merged.exams[0].id, 1);
});

t('⑧ 行为（反向，防修成锁死）：无墓碑时云端新增考试仍要并进来', function () {
  const local = { exams: [{ id: 1 }], examDeleted: {} };
  const remote = { exams: [{ id: 1 }, { id: 2, name: '新考试' }], examDeleted: {} };
  const merged = clone(local);
  S.ms(merged, local, remote);
  eq(merged.exams.length, 2, '云端新考试被吞了：');
  ok(merged.exams.some(e => e.id === 2), '缺 id=2');
});

t('⑨ 行为（反向）：云端为空时本地不可被清空', function () {
  const local = { exams: [{ id: 1 }, { id: 2 }], examDeleted: {} };
  const remote = { exams: [], examDeleted: {} };
  const merged = clone(local);
  S.ms(merged, local, remote);
  eq(merged.exams.length, 2, '本地考试被云空表清空了：');
});

t('⑩ 行为：墓碑容错（examDeleted 缺失 / 为 null）', function () {
  const merged = {};
  S.ms(merged, { exams: [{ id: 1 }] }, { exams: [{ id: 2 }] });
  eq((merged.exams || []).length, 2, '无墓碑字段时并集应正常：');
  ok(merged.examDeleted && typeof merged.examDeleted === 'object', 'examDeleted 应被规范化成对象');
});

/* ==================== 二、成绩导入自动识别表头 ==================== */

t('⑪ 导入入口改用 readAsArrayBuffer（xlsx 是二进制，readAsText 必乱码）', function () {
  const fn = (html.match(/function importGrades\(input\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'importGrades 切片失败');
  has(fn, 'reader.readAsArrayBuffer(file);', '仍按文本读');
  ok(!/readAsText\s*\(/.test(fn), 'importGrades 内仍调用 readAsText(');
});

t('⑫ 四个识别函数存在', function () {
  has(html, 'function matchScoreSubject(header, subjects){', '缺 matchScoreSubject');
  has(html, 'function detectScoreCols(headers, subjects){', '缺 detectScoreCols');
  has(html, 'function locateScoreHeaderRow(grid, subjects){', '缺 locateScoreHeaderRow');
  has(html, 'function parseScoreGrid(u8, fileName){', '缺 parseScoreGrid');
});

t('⑬ 复用既有 xlsx 解析（不与学生导入各写一套）', function () {
  const fn = (html.match(/function parseScoreGrid\(u8, fileName\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'parseScoreGrid 切片失败');
  has(fn, 'readXlsxGrid(u8)', '未复用 readXlsxGrid');
  has(fn, 'parseCSVGrid(', '未复用 parseCSVGrid');
  has(fn, 'decodeTableText(u8)', '未复用 decodeTableText（GBK 回退）');
});

t('⑭ 导入不再把列表头原样当科目名（走 detectScoreCols / matchScoreSubject）', function () {
  const fn = (html.match(/function importGrades\(input\)\{[\s\S]*?\n\}/) || [])[0];
  // v3.9.28 起科目识别搬到 scoreExamCandidates（要拿每场考试的 subjects 逐一比对），
  // importGrades 只负责把表头交过去 ⇒ 锚点从「函数内直接 detectScoreCols」升级成这两处同强度断言
  has(fn, 'openGradeExamPick(scoreExamCandidates(headers)', '未交给「按考试匹配科目」的通道');
  const cf = (html.match(/function scoreExamCandidates\(headers\)\{[\s\S]*?\n\}/) || [])[0];
  ok(cf, 'scoreExamCandidates 切片失败');
  has(cf, 'detectScoreCols(headers, subs)', '未做科目列识别');
});

t('⑮ 科目对不上时给出可读提示（列出各场考试的科目）', function () {
  // v3.9.28 起「没认出科目」不再是 toast 报错，而是弹窗里逐场标注 ⇒ 断言跟着搬到渲染层
  const rf = (html.match(/function renderGradeExamPick\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(rf, 'renderGradeExamPick 切片失败');
  has(rf, '科目对不上', '缺「科目对不上」提示');
  has(rf, "join('/')", '未列出各场考试的科目名');
  const pf = (html.match(/function openGradeExamPick\(([\s\S]*?)\n\}/) || [])[0];
  has(pf, '请核对考试科目或表头写法', '缺「全都不匹配」时的引导文案');
});

t('⑯ 行为：表头归一 + 科目宽松匹配', function () {
  const sb = {};
  const srcNorm = (html.match(/function normHeader\(h\)\{[^\n]*\}/) || [])[0];
  const srcMatch = (html.match(/function matchScoreSubject\(header, subjects\)\{[\s\S]*?\n\}/) || [])[0];
  ok(srcNorm && srcMatch, 'normHeader / matchScoreSubject 切片失败');
  new Function('sb', srcNorm + '\n' + srcMatch + '\nsb.m=matchScoreSubject;')(sb);
  const SUBJ = ['语文', '数学', '英语'];
  eq(sb.m('语文', SUBJ), '语文', '纯科目名：');
  eq(sb.m('语文成绩', SUBJ), '语文', '带「成绩」后缀：');
  eq(sb.m('语文(150)', SUBJ), '语文', '带满分括号：');
  eq(sb.m('语文（150分）', SUBJ), '语文', '全角括号+分：');
  eq(sb.m('数学 成绩', SUBJ), '数学', '空格+后缀：');
  eq(sb.m('物理', SUBJ), '', '不在考试科目内应返回空：');
  eq(sb.m('备注', SUBJ), '', '无关列应返回空：');
  eq(sb.m('', SUBJ), '', '空表头：');
});

t('⑰ 行为：列角色识别（姓名/学号任意位置，序号列不误判）', function () {
  const sb = {};
  const srcNorm = (html.match(/function normHeader\(h\)\{[^\n]*\}/) || [])[0];
  const srcMatch = (html.match(/function matchScoreSubject\(header, subjects\)\{[\s\S]*?\n\}/) || [])[0];
  const srcDetect = (html.match(/function detectScoreCols\(headers, subjects\)\{[\s\S]*?\n\}/) || [])[0];
  ok(srcDetect, 'detectScoreCols 切片失败');
  new Function('sb', srcNorm + '\n' + srcMatch + '\n' + srcDetect + '\nsb.d=detectScoreCols;')(sb);

  // 模板顺序：学号,姓名,科目
  var c1 = sb.d(['学号', '姓名', '语文', '数学', '英语'], ['语文', '数学', '英语']);
  eq(c1.sid, 0, '学号列：'); eq(c1.name, 1, '姓名列：'); eq(c1.subjectCols.length, 3, '科目列数：');

  // 带序号 + 「学生姓名」+ 带后缀的科目
  var c2 = sb.d(['序号', '学生姓名', '语文成绩', '数学(150)', '英语', '备注'], ['语文', '数学', '英语']);
  eq(c2.sid, -1, '「序号」不该被当学号：');
  eq(c2.name, 1, '学生姓名列：');
  eq(c2.subjectCols.length, 3, '科目列数：');
  eq(c2.subjectCols[0].col, 2, '语文列位：');
  eq(c2.subjectCols[0].subj, '语文', '语文归一：');

  // 姓名在最后一列的怪表
  var c3 = sb.d(['语文', '数学', '姓名'], ['语文', '数学']);
  eq(c3.name, 2, '姓名在末列：');
  eq(c3.subjectCols.length, 2, '科目列数：');
});

t('⑱ 行为：表头上方有标题行时能定位到真表头', function () {
  const sb = {};
  const srcNorm = (html.match(/function normHeader\(h\)\{[^\n]*\}/) || [])[0];
  const srcMatch = (html.match(/function matchScoreSubject\(header, subjects\)\{[\s\S]*?\n\}/) || [])[0];
  const srcDetect = (html.match(/function detectScoreCols\(headers, subjects\)\{[\s\S]*?\n\}/) || [])[0];
  const srcLoc = (html.match(/function locateScoreHeaderRow\(grid, subjects\)\{[\s\S]*?\n\}/) || [])[0];
  ok(srcLoc, 'locateScoreHeaderRow 切片失败');
  new Function('sb', srcNorm + '\n' + srcMatch + '\n' + srcDetect + '\n' + srcLoc + '\nsb.l=locateScoreHeaderRow;')(sb);
  const grid = [
    ['26幼2班 期中考试成绩表', '', '', ''],
    ['', '', '', ''],
    ['学号', '姓名', '语文', '数学'],
    ['2602001', '张三', '90', '88']
  ];
  eq(sb.l(grid, ['语文', '数学']), 2, '应定位到第3行（index 2）：');
});

/* ==================== 三、跟版一致性（14 处） ==================== */

t('⑲ index.html 四个展示位都是当版', function () {
  has(html, '<div class="login-version">' + VER + '</div>', '登录页版本号');
  has(html, VER + ' · 班主任工作台', '侧栏页脚');
  has(html, VER + '</span>', '速览 🏷️ 徽章');
  has(html, '速览（' + VER + '）', '速览标题');
});

t('⑳ 查询串与缓存名同步（index 2 + sw 3 + manifest 3）', function () {
  const q = '?v=' + NUM;
  const cnt = s => (s.match(new RegExp('\\?v=' + NUM.replace(/\./g, '\\.'), 'g')) || []).length;
  ok(cnt(html) >= 2, 'index.html 的 ?v= 少于 2 处，实际 ' + cnt(html));
  eq(cnt(sw), 3, 'sw.js 的 ?v= 应为 3 处：');
  eq(cnt(mani), 3, 'manifest.json 的 ?v= 应为 3 处：');
  has(sw, "CACHE_NAME = 'class-manager-" + VER + "'", 'CACHE_NAME');
  has(cmgx, '（' + VER + '）', 'cmgx.js 首行头注释');
  ok(html.indexOf(q) >= 0, 'index.html 缺 ' + q);
});

t('㉑ 速览只留当版，v3.9.27 旧条目已清理', function () {
  if (html.includes('删掉的考试不再自己回来（v3.9.27）')) throw new Error('v3.9.32 起速览只留当版，历史条目应已清理：删掉的考试不再自己回来（v3.9.27）');   // 史实：条目文本永远停在出这个功能的版本，不跟当版号走
  if (html.includes('成绩导入认表头，不再挑模板（v3.9.27）')) throw new Error('v3.9.32 起速览只留当版，历史条目应已清理：成绩导入认表头，不再挑模板（v3.9.27）');   // 史实：同上，不跟当版号走
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
