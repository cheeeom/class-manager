// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.29 回归：成绩管理三件套
   ── ① 60 人只看到 50 人 ──
   根因：renderGrades 里 `results.slice(0, 50)` 硬截断——排行榜第 51 名起直接不渲染。
   ── ② 场次卡片可折叠 + 顶部场次筛选 ──
   新增 _gradeRange（all/year/term，默认 term）、filterExamsByRange、toggleExamCard；
   首张展开、其余折叠，用户点过则记住。
   ── ③ 学生档案「学业」卡 ──
   新增 examRankOf / scoreExamsOfStudent / pfScoreRowsHtml，逐场列出各科、总分与班级排名。

   运行：node _v3929_test.js */
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
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + '不应出现 ' + JSON.stringify(b)); }
function countOf(a, re) { return (String(a).match(re) || []).length; }
function ymd(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- 版本号（从 CACHE_NAME 反推，跟版零改动） ---------- */
const VM = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
if (!VM) throw new Error('无法从 sw.js 反推版本号');
const VER = VM[1];
const NUM = VER.slice(1);
console.log('  当前版本：' + VER);

/* ---------- 从 index.html 里切出真函数 ---------- */
function grab(name) {
  const sig = 'function ' + name + '(';
  const i = html.indexOf(sig);
  if (i < 0) throw new Error('找不到函数 ' + name);
  const j = html.indexOf('\n}', i);
  if (j < 0) throw new Error('切不出函数 ' + name);
  return html.slice(i, j + 2);
}

/* 假 DOM：只够 renderGrades 用（它只 getElementById('examList')）。
   注意必须「只建一次沙箱」——每次 new Function 都会把 _gradeRange/_gradeCollapsed 重置，
   setter 也会被指向新闭包，测出来的是假绿。所以这里用可变 doc 代理复用同一个闭包。 */
let curDoc = { getElementById: function () { return null; } };
const docProxy = { getElementById: function (id) { return curDoc.getElementById(id); } };
function makeDoc() {
  const box = { innerHTML: '' };
  return { box: box, doc: { getElementById: function (id) { return id === 'examList' ? box : null; } } };
}
function renderInto() { const d = makeDoc(); curDoc = d.doc; S.render(); return d.box.innerHTML; }

const state = { students: [], exams: [], semester: { name: '', startAt: 0 } };
const S = {};
const ctx = [
  'var _gradeRange = "term";',
  'var _gradeCollapsed = {};',
  'var _pfScoreScope = "term";',
  grab('escapeHtml'),
  grab('defaultFullOf'),     // v3.9.30 renderGrades 卡片显示「满分X」，沙箱要补齐新增依赖
  grab('examMaxOf'),
  grab('examFullTotal'),
  grab('examPassLine'),
  grab('examGoodLine'),
  grab('examDateTs'),
  grab('gradeTermStartTs'),
  grab('gradeYearStartTs'),
  grab('filterExamsByRange'),
  grab('examRankOf'),
  grab('scoreExamsOfStudent'),
  grab('pfScoreRowsHtml'),
  grab('renderGrades'),
  'S.setRange=function(v){_gradeRange=v;};',
  'S.getRange=function(){return _gradeRange;};',
  'S.resetCollapsed=function(){_gradeCollapsed={};};',
  'S.markCollapsed=function(id,v){_gradeCollapsed[id]=v;};',
  'S.setScoreScope=function(v){_pfScoreScope=v;};',
  'S.ts=examDateTs; S.filter=filterExamsByRange; S.rank=examRankOf;',
  'S.examsOf=scoreExamsOfStudent; S.scoreRows=pfScoreRowsHtml; S.render=renderGrades;',
  'S.termStart=gradeTermStartTs; S.yearStart=gradeYearStartTs;'
].join('\n');
new Function('S', 'state', 'document', 'pfSemesterStartTs', ctx)(
  S, state, docProxy, function () { return new Date(new Date().getFullYear(), 8, 1).getTime(); }
);

/* ==================== 一、版本连级一致性 ==================== */
t('① 版本四处同源（CACHE_NAME / index 的 cmgx 引用 / manifest / cmgx 头注释）', function () {
  has(sw, 'class-manager-' + VER, 'sw CACHE_NAME 不符');
  has(html, './cmgx.js?v=' + NUM, 'index 里 cmgx 引用未跟版');
  has(cmgx, '（' + VER + '）', 'cmgx 头注释未跟版');
  ok(mani.indexOf('?v=' + NUM) >= 0, 'manifest 未跟版');
});

t('② apple-touch-icon 与 sw 图标清单带同一版本串', function () {
  has(html, 'icon_192.png?v=' + NUM, 'apple-touch-icon 未跟版');
  has(sw, 'icon_192.png?v=' + NUM, 'sw 图标清单未跟版');
});

/* ==================== 二、60 人被截成 50 人 ==================== */
t('③ 结构：截断彻底移除（不再有 slice(0, 50)）', function () {
  notHas(html, 'results.slice(0, 50)', '仍残留 50 条截断');
  notHas(html, 'results.slice(0,50)', '仍残留 50 条截断');
  const fn = (html.match(/function renderGrades\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'renderGrades 切片失败');
  has(fn, 'results.map((r, idx)', '未改为全量渲染');
});

t('④ 行为（关键）：60 人全部渲染，第 51–60 名不许消失', function () {
  state.students = [];
  for (let i = 1; i <= 60; i++) state.students.push({ id: i, name: '学生' + i, sid: 'S' + i });
  const scores = {};
  // 成绩递减：学生1 总分最高，学生60 最低 —— 正好把 51–60 名排在最后
  state.students.forEach(function (s) { scores[s.id] = { 语文: 100 - s.id, 数学: 100 - s.id }; });
  state.exams = [{ id: 1, name: '期中考试', date: '2026-11-10', subjects: ['语文', '数学'], scores: scores }];
  state.semester = { name: '2026 秋', startAt: new Date(2026, 8, 1).getTime() };
  S.setRange('all');
  S.resetCollapsed();
  const out = renderInto();
  eq(countOf(out, /<tr>/g), 61, '表格行数（60 人 + 表头）：');
  has(out, '学生60', '第 60 名学生没渲染出来——截断没修干净');
  has(out, '学生51', '第 51 名学生没渲染出来');
  has(out, '学生50', '第 50 名学生不见了');
});

/* ==================== 三、卡片折叠 ==================== */
t('⑤ 行为：首张展开、其余折叠（60 行的表不铺满屏幕）', function () {
  state.students = [{ id: 1, name: '张三' }];
  state.exams = [
    { id: 11, name: '期中', date: '2026-11-10', subjects: ['语文'], scores: { 1: { 语文: 90 } } },
    { id: 12, name: '月考', date: '2026-10-10', subjects: ['语文'], scores: { 1: { 语文: 80 } } },
    { id: 13, name: '周测', date: '2026-09-10', subjects: ['语文'], scores: { 1: { 语文: 70 } } }
  ];
  state.semester = { name: '2026 秋', startAt: new Date(2026, 8, 1).getTime() };
  S.setRange('all');
  S.resetCollapsed();
  const out = renderInto();
  eq(countOf(out, /exam-card collapsed/g), 2, '后两张应默认折叠：');
  has(out, 'class="exam-card" id="examCard-11"', '首张应默认展开');
  has(out, 'class="exam-card collapsed" id="examCard-12"', '第二张应折叠');
  eq(countOf(out, /class="exam-body"/g), 3, '每张都要有可折叠的 body 容器：');
  eq(countOf(out, /onclick="toggleExamCard\(event, /g), 3, '每张 header 都要能点：');
  has(out, 'class="exam-chev"', '缺折叠指示箭头');
});

t('⑥ 行为：用户点过之后，折叠状态优先于「首张展开」默认值', function () {
  S.resetCollapsed();
  S.markCollapsed(11, true);    // 用户把第一张也折叠了
  const out = renderInto();
  has(out, 'class="exam-card collapsed" id="examCard-11"', '用户折叠的第一张被强行展开了');
});

/* ==================== 四、场次筛选（所有 / 本学年 / 本学期） ==================== */
t('⑦ 行为：examDateTs 按本地时区解析（new Date("YYYY-MM-DD") 会按 UTC 倒退 8 小时）', function () {
  eq(S.ts({ date: '2026-09-01' }), new Date(2026, 8, 1).getTime(), '本地 9/1 零点：');
  eq(S.ts({ date: '2026/9/1' }), new Date(2026, 8, 1).getTime(), '斜杠分隔也要认：');
  eq(S.ts({ date: '' }), 0, '空日期：');
  eq(S.ts({}), 0, '无日期字段：');
});

t('⑧ 行为：all 返回全部（含顺序不变）', function () {
  const list = [{ id: 1, date: '2024-03-01' }, { id: 2, date: '2026-11-01' }];
  const r = S.filter(list, 'all');
  eq(r.length, 2, '数量：');
  eq(r[0].id, 1, '顺序应保持：');
});

t('⑨ 行为：term 只留本学期 —— 且优先用设置里手工填的开学日期', function () {
  state.semester = { name: '2026 秋', startAt: new Date(2026, 8, 5).getTime() };   // 手工填 9/5
  const list = [
    { id: 1, date: '2026-09-01' },   // 手工设置的 9/5 之前 ⇒ 应被排除
    { id: 2, date: '2026-09-04' },   // 同上
    { id: 3, date: '2026-09-05' },   // 边界当天 ⇒ 应保留
    { id: 4, date: '2026-11-02' },   // 明确在本学期
    { id: 5, date: '2026-06-20' }    // 上学期
  ];
  const r = S.filter(list, 'term').map(function (e) { return e.id; });
  eq(r.join(','), '3,4', '本学期应为边界当天及之后：');
});

t('⑩ 行为：year 只留本学年（9/1 起算，跨年 1–8 月算上一学年）', function () {
  const ys = S.yearStart();
  const d = new Date(ys);
  eq(d.getMonth(), 8, '学年起点应在 9 月：');
  eq(d.getDate(), 1, '学年起点应在 1 号：');
  // 用学年起点动态造样本，避免明年跑挂了
  const list = [
    { id: 1, date: ymd(ys - 86400000) },   // 学年开始前一天
    { id: 2, date: ymd(ys) },              // 学年第一天
    { id: 3, date: ymd(ys + 40 * 86400000) }
  ];
  const r = S.filter(list, 'year').map(function (e) { return e.id; });
  ok(r.indexOf(1) < 0, '上一学年的最后一天不应出现在本学年里');
  ok(r.indexOf(2) >= 0 && r.indexOf(3) >= 0, '本学年的两场都该在');
});

t('⑪ 反向：无日期的考试任何档都保留（宁可提示补日期，也不能让它凭空消失）', function () {
  const list = [{ id: 1, date: '', name: '忘了填日期的' }, { id: 2, date: '2020-01-01' }];
  ['term', 'year', 'all'].forEach(function (rg) {
    const ids = S.filter(list, rg).map(function (e) { return e.id; });
    ok(ids.indexOf(1) >= 0, rg + ' 档把无日期的考试筛掉了');
  });
  eq(S.filter(list, 'term').length, 1, 'term 应只剩无日期那一场：');
});

t('⑫ 结构：顶部分段控件三档齐全，默认选中本学期', function () {
  has(html, 'id="gradeRangeSeg"', '缺分段控件容器');
  has(html, 'data-range="all" onclick="setGradeRange(\'all\')"', '缺「所有」档');
  has(html, 'data-range="year" onclick="setGradeRange(\'year\')"', '缺「本学年」档');
  has(html, 'data-range="term" class="on" onclick="setGradeRange(\'term\')"', '缺「本学期」档或默认未选中');
  has(html, "var _gradeRange = 'term';", '默认范围不是本学期');
});

/* ==================== 五、学生档案「学业」卡 ==================== */
t('⑬ 行为：班级排名按总分降序，并列取最优名次', function () {
  state.students = [
    { id: 1, name: '甲' }, { id: 2, name: '乙' }, { id: 3, name: '丙' }, { id: 4, name: '丁' }
  ];
  const exam = {
    id: 1, subjects: ['语文', '数学'],
    scores: { 1: { 语文: 90, 数学: 90 }, 2: { 语文: 80, 数学: 80 }, 3: { 语文: 0, 数学: 160 }, 4: { 语文: 70, 数学: 70 } }
    // 总分：甲180 丙160 乙160 丁140 —— 乙丙并列第 2
  };
  eq(S.rank(exam, 1).rank, 1, '第一名：');
  eq(S.rank(exam, 1).total, 180, '甲总分：');
  eq(S.rank(exam, 1).count, 4, '参与人数：');
  eq(S.rank(exam, 3).rank, 2, '并列应取最优名次（丙 160 与乙同分）：');
  eq(S.rank(exam, 2).rank, 2, '并列应取最优名次（乙）：');
  eq(S.rank(exam, 4).rank, 4, '丁应为第 4：');
});

t('⑭ 反向：没参加这场考试的学生，排名返回 null（不臆造名次）', function () {
  const exam = { id: 2, subjects: ['语文'], scores: { 1: { 语文: 90 } } };
  eq(S.rank(exam, 99), null, '未参加者：');
});

t('⑮ 行为：只取有成绩的场次，按日期新→旧', function () {
  state.exams = [
    { id: 1, name: '旧', date: '2026-09-10', subjects: ['语文'], scores: { 1: { 语文: 80 } } },
    { id: 2, name: '新', date: '2026-11-10', subjects: ['语文'], scores: { 1: { 语文: 90 } } },
    { id: 3, name: '他班', date: '2026-10-10', subjects: ['语文'], scores: { 999: { 语文: 88 } } }   // 本人没成绩
  ];
  const list = S.examsOf(1, 'all');
  eq(list.length, 2, '只应有本人有成绩的两场：');
  eq(list[0].name, '新', '最新的排最前：');
  eq(list[1].name, '旧', '旧的在后：');
});

t('⑯ 行为：学业卡渲染出分数、总分与班级排名', function () {
  state.students = [{ id: 1, name: '张三' }, { id: 2, name: '李四' }];
  state.exams = [{
    id: 5, name: '期中考试', date: '2026-11-10', subjects: ['语文', '数学'],
    scores: { 1: { 语文: 92, 数学: 88 }, 2: { 语文: 80, 数学: 70 } }
  }];
  S.setScoreScope('all');
  const out = S.scoreRows({ id: 1, name: '张三' });
  has(out, '期中考试', '缺考试名');
  has(out, '2026-11-10', '缺日期');
  has(out, '语文', '缺科目名');
  has(out, '<b>92</b>', '缺语文分数');
  has(out, '<b>88</b>', '缺数学分数');
  has(out, '总分 180', '总分算错（92+88）：');
  has(out, '班级第 1/2', '排名不对：');
});

t('⑰ 反向：该生一场都没考时给空态，而不是空白一块', function () {
  S.setScoreScope('all');
  const out = S.scoreRows({ id: 777, name: '没考过' });
  has(out, 'pf-empty', '缺空态容器');
  has(out, '暂无考试成绩', '缺空态文案');
});

t('⑱ 安全：考试名里的尖括号被转义（学业卡也走 escapeHtml）', function () {
  state.students = [{ id: 1, name: '张三' }];
  state.exams = [{ id: 6, name: '<img src=x onerror=alert(1)>', date: '2026-11-10', subjects: ['语文'], scores: { 1: { 语文: 90 } } }];
  S.setScoreScope('all');
  const out = S.scoreRows({ id: 1, name: '张三' });
  notHas(out, '<img src=x', '考试名未转义');
  has(out, '&lt;img', '未被转义成实体');
});

t('⑲ 结构：档案页学业卡接线齐全（可折叠 / 范围切换 / 容器）', function () {
  has(html, "pfSectionToggle('pfScoreBody','pfScoreChev')", '缺折叠接线');
  has(html, 'id="pfScoreBody"', '缺卡片容器');
  has(html, "onclick=\"setPfScoreScope('term')\"", '缺「本学期」切换');
  has(html, "onclick=\"setPfScoreScope('all')\"", '缺「全部」切换');
  has(html, '${pfScoreRowsHtml(s)}', '未渲染成绩行');
});

t('⑳ 反向：折叠按钮不会吞掉导出/删除按钮的点击', function () {
  const fn = (html.match(/function toggleExamCard\(ev, id\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'toggleExamCard 切片失败');
  has(fn, "ev.target.closest('button')", '缺「点到按钮就不折叠」的守卫');
});

t('㉑ 空态：筛选后一场都没有时给出可点的「查看所有考试」', function () {
  state.students = [{ id: 1, name: '张三' }];
  state.exams = [{ id: 1, name: '很久以前', date: '2019-01-01', subjects: ['语文'], scores: { 1: { 语文: 90 } } }];
  state.semester = { name: '2026 秋', startAt: new Date(2026, 8, 1).getTime() };
  S.setRange('term');
  S.resetCollapsed();
  const out = renderInto();
  has(out, '本学期暂无考试记录', '缺空态文案');
  has(out, "setGradeRange('all')", '空态缺「查看所有」出口');
});

t('㉒ 反向：无学期设置时 term 回退到按月推断，绝不返回 0（否则全被筛空）', function () {
  state.semester = { name: '', startAt: 0 };
  const ts = S.termStart();
  ok(ts > 0, 'term 起点不该是 0');
  const d = new Date(ts);
  ok(d.getMonth() === 8 || d.getMonth() === 1, '回退起点应落在 9/1 或 2/1：' + d.getMonth());
});

console.log('\n---');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
