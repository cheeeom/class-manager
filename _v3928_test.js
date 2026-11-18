// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.28 回归：导入成绩先选考试（不再默认塞进「最近一场」）+ 顺手修好导入后的成绩摘要弹窗
   ── 主问题 ──
   症状：多场考试并存（期中/月考/周测）时，导入的成绩不知道落进了哪一场。
   根因：importGrades 里写死 `const exam = state.exams[state.exams.length-1]`——永远塞最后一场，
        且科目匹配依赖该场 subjects，所以不能只在开头加个下拉框了事。
   修法：拆成「解析 → 选考试 → 写入」三段；新增 locateGridHeaderRow（不依赖科目定位表头）、
        scoreExamCandidates（每场考试能对上几科 ⇒ 排序 + 默认选中）、applyScoreImport（可测的
        写入器），配一个弹窗让用户确认。
   ── 附带 bug ──
   examAutoAnalysis 里两处调用了不存在的 esc()（全文件零声明）⇒ 导入成功后本应弹出的成绩
   摘要会抛 ReferenceError 而根本不出现。改为 escapeHtml()。

   运行：node _v3928_test.js */
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

/* ---------- 版本号（从 CACHE_NAME 反推，跟版零改动） ---------- */
const VM = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
if (!VM) throw new Error('无法从 sw.js 反推版本号');
const VER = VM[1];
const NUM = VER.slice(1);

console.log('  当前版本：' + VER);

/* ==================== 一、版本连级一致性 ==================== */
t('① 版本四处同源（CACHE_NAME / index 的 cmgx 引用 / manifest / cmgx 头注释）', function () {
  has(sw, "class-manager-" + VER, 'sw CACHE_NAME 不符');
  has(html, './cmgx.js?v=' + NUM, 'index 里 cmgx 引用未跟版');
  has(cmgx, '（' + VER + '）', 'cmgx 头注释未跟版');
  ok(mani.indexOf('?v=' + NUM) >= 0, 'manifest 未跟版');
});

t('② apple-touch-icon 带同一版本串（addAll 全成全败，URL 不一致会预缓存落空）', function () {
  has(html, 'icon_192.png?v=' + NUM, 'apple-touch-icon 未跟版');
  has(sw, "icon_192.png?v=" + NUM, 'sw 图标清单未跟版');
});

/* ==================== 二、结构层：不再写死「最后一场」 ==================== */
t('③ importGrades 不再把目标考死成最后一场', function () {
  const fn = (html.match(/function importGrades\(input\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'importGrades 切片失败');
  notHas(fn, 'state.exams[state.exams.length-1]', '仍写死最后一场');
  notHas(fn, 'state.exams.length - 1', '仍写死最后一场');
  has(fn, 'openGradeExamPick(', '解析完未交给选择弹窗');
  has(fn, 'locateGridHeaderRow(grid)', '未用「不依赖科目」的表头定位');
});

t('④ 选考试弹窗结构齐全（容器 / 列表 / 确认按钮 / 提示行）', function () {
  has(html, 'id="gradeExamPickModal"', '缺弹窗容器');
  has(html, 'id="gradeExamPickList"', '缺列表容器');
  has(html, 'id="gradeExamPickOk"', '缺确认按钮');
  has(html, 'id="gradeExamPickHint"', '缺提示行');
  has(html, 'onclick="gradeExamPickConfirm()"', '确认按钮未接线');
});

t('⑤ 对不上的考试不可选（置灰项点击直接 return，防止误导入）', function () {
  const fn = (html.match(/function gradeExamPickSelect\(i\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'gradeExamPickSelect 切片失败');
  has(fn, '.hit.length) return', '未拦截「科目对不上」的项');
  const rf = (html.match(/function renderGradeExamPick\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(rf, 'renderGradeExamPick 切片失败');
  has(rf, "(cannot ? ' off' : '')", '缺置灰态');
  has(rf, '科目对不上', '缺置灰说明文案');
});

t('⑥ 反向（防修成锁死）：无命中时确认按钮禁用，不能凭默认值硬导', function () {
  const rf = (html.match(/function renderGradeExamPick\(\)\{[\s\S]*?\n\}/) || [])[0];
  has(rf, 'okBtn.disabled = (d.si < 0)', '全都没命中时应禁用确认按钮');
  const cf = (html.match(/function gradeExamPickConfirm\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(cf, 'gradeExamPickConfirm 切片失败');
  has(cf, 'if(!d || d.si < 0) return;', '未做「没选就不写」守卫');
});

/* ---- 行为级：把真实函数切出来跑 ---- */
const srcNorm   = (html.match(/^function normHeader\(h\)\{.*$/m) || [])[0];
const srcMatch  = (html.match(/function matchScoreSubject\(header, subjects\)\{[\s\S]*?\n\}/) || [])[0];
const srcDetect = (html.match(/function detectScoreCols\(headers, subjects\)\{[\s\S]*?\n\}/) || [])[0];
const srcLocate = (html.match(/function locateGridHeaderRow\(grid\)\{[\s\S]*?\n\}/) || [])[0];
const srcCands  = (html.match(/function scoreExamCandidates\(headers\)\{[\s\S]*?\n\}/) || [])[0];
const srcApply  = (html.match(/function applyScoreImport\(exam, cols, rows, students\)\{[\s\S]*?\n\}/) || [])[0];
if (!srcNorm || !srcMatch || !srcDetect || !srcLocate || !srcCands || !srcApply)
  throw new Error('函数切片失败（锚点被改动？）：' +
    [srcNorm, srcMatch, srcDetect, srcLocate, srcCands, srcApply].map(x => x ? 'ok' : 'MISS').join(','));

const S = {};
const state = { exams: [] };
new Function('S', 'state',
  [srcNorm, srcMatch, srcDetect, srcLocate, srcCands, srcApply].join('\n') + '\n' +
  'S.detect=detectScoreCols; S.locateGrid=locateGridHeaderRow;' +
  'S.cands=scoreExamCandidates; S.apply=applyScoreImport;'
)(S, state);

t('⑦ 行为：表头定位能跳过上方标题行（不依赖科目）', function () {
  const grid = [
    ['26幼2班 期中考试成绩表'],
    ['考试时间：2026-11-10'],
    ['序号', '学号', '姓名', '语文', '数学', '英语'],
    ['1', '2026001', '张三', '90', '88', '92']
  ];
  eq(S.locateGrid([['只一行标题']]), 0, '全无姓名/学号时应兜底第 1 行：');
  eq(S.locateGrid(grid), 2, '没跳过标题行：');
  eq(S.locateGrid([['姓名', '语文'], ['李四', '80']]), 0, '首行即表头时应返回 0：');
});

t('⑧ 行为：每场考试算「能对上几科」，并按匹配率排序', function () {
  state.exams = [
    { id: 1, name: '月考',   subjects: ['语文', '英语', '历史'] },   // 历史对不上 ⇒ 2/3
    { id: 2, name: '期中',   subjects: ['语文', '数学', '英语'] }    // 3/3
  ];
  const c = S.cands(['学号', '姓名', '语文', '数学', '英语']);
  eq(c.length, 2, '候选数：');
  eq(c[0].exam.name, '期中', '匹配率高的应排第一：');
  eq(c[0].hit.length, 3, '期中命中科数：');
  eq(c[1].exam.name, '月考', '匹配率低的排第二：');
  eq(c[1].hit.length, 2, '月考命中科数：');
  eq(c[1].miss.join(','), '历史', '未命中清单：');
});

t('⑨ 行为（关键）：选第二场就只写第二场，第一场一个字节都不许动', function () {
  const examA = { id: 1, name: '期中', subjects: ['语文', '数学'], scores: {} };   // 2/2
  const examB = { id: 2, name: '月考', subjects: ['语文', '历史'], scores: {} };   // 1/2（无历史列）
  state.exams = [examA, examB];
  const c = S.cands(['姓名', '语文', '数学']);
  eq(c[0].exam.name, '期中', '满配的应排第一：');
  eq(c[1].exam.name, '月考', '欠配的应排第二：');
  const target = c[1];
  const stu = [{ id: 10, name: '张三' }];
  const res = S.apply(target.exam, target.cols, [['张三', '90', '80']], stu);
  eq(res.imported, 1, '应写入 1 人：');
  eq(Object.keys(examA.scores).length, 0, '第一场被误写了：');
  eq(examB.scores[10].语文, 90, '语文分数未落到选中的那场：');
  ok(examB.scores[10].数学 === undefined, '月考没有数学，不应凭空多出数学：');
});

t('⑨·b 行为：匹配率相同时取更近一场（id 大）——这正是「默认值可预期」的依据', function () {
  const a = { id: 7, name: '旧的',  subjects: ['语文'], scores: {} };
  const b = { id: 8, name: '新的',  subjects: ['语文'], scores: {} };
  state.exams = [a, b];
  const c = S.cands(['姓名', '语文']);
  eq(c[0].exam.id, 8, '同分应取更近一场：');
});

t('⑩ 行为：合并写入——已有的其他科目不被清掉', function () {
  const exam = { id: 3, name: '期末', subjects: ['语文', '数学'], scores: { 20: { 数学: 66 } } };
  state.exams = [exam];
  const hit = S.cands(['姓名', '语文', '数学'])[0];
  S.apply(hit.exam, hit.cols, [['李四', '95', '']], [{ id: 20, name: '李四' }]);
  eq(exam.scores[20].语文, 95, '新科目未写入：');
  eq(exam.scores[20].数学, 66, '原科目被冲掉了：');
});

t('⑪ 行为（反向）：对不上本班学生的行只计入跳过，不凭空造学生', function () {
  const exam = { id: 4, name: '周测', subjects: ['语文'], scores: {} };
  state.exams = [exam];
  const hit = S.cands(['姓名', '语文'])[0];
  const res = S.apply(hit.exam, hit.cols, [['查无此人', '90'], ['王五', '70']], [{ id: 30, name: '王五' }]);
  eq(res.imported, 1, '导入数：');
  eq(res.skipped, 1, '跳过数：');
  eq(Object.keys(exam.scores).length, 1, '不该为陌生人建记录：');
});

t('⑫ 行为（反向，防修成锁死）：一场都命中 0 科时，用户仍能看到全部考试而不是空白', function () {
  state.exams = [{ id: 9, name: '无关考试', subjects: ['物理'] }];
  const c = S.cands(['姓名', '语文']);
  eq(c.length, 1, '候选不应被过滤掉：');
  eq(c[0].hit.length, 0, '不应误判命中：');
});

/* ==================== 三、渲染输出（假 DOM 跑真实渲染函数） ==================== */
const srcEscape = (html.match(/function escapeHtml\(s\)\{[\s\S]*?\n\}/) || [])[0];
const srcRender = (html.match(/function renderGradeExamPick\(\)\{[\s\S]*?\n\}/) || [])[0];
if (!srcEscape || !srcRender) throw new Error('escapeHtml / renderGradeExamPick 切片失败');

function renderToString(pick) {
  const els = { gradeExamPickList: { innerHTML: '' }, gradeExamPickOk: { disabled: true } };
  const doc = { getElementById: id => els[id] || null };
  const R = {};
  new Function('S', 'document',
    srcEscape + '\n' + srcRender + '\n' +
    'var _gradePick = null;\n' +
    'S.set=function(d){ _gradePick = d; }; S.render=renderGradeExamPick;'
  )(R, doc);
  R.set(pick);
  R.render();
  return { html: els.gradeExamPickList.innerHTML, disabled: els.gradeExamPickOk.disabled };
}

t('⑱ 渲染输出：三场考试都在、标签按命中数生成、默认选中第一场', function () {
  state.exams = [
    { id: 3, name: '第一次月考', date: '2026-10-12', subjects: ['语文', '数学', '英语'], scores: { 1: {}, 2: {} } },
    { id: 4, name: '期中考试',   date: '2026-11-08', subjects: ['语文', '数学', '英语', '历史'], scores: {} },
    { id: 5, name: '物理周测',   date: '2026-11-15', subjects: ['物理'], scores: {} }
  ];
  const c = S.cands(['序号', '学号', '姓名', '语文成绩', '数学(150)', '英语']);
  const out = renderToString({ cands: c, rows: [], headers: [], headerRow: 2, fileName: 'x.xlsx', si: 0 });
  has(out.html, '第一次月考', '第一场缺失');
  has(out.html, '期中考试', '第二场缺失');
  has(out.html, '物理周测', '第三场缺失');
  has(out.html, '3/3 科', '满配标签未生成');
  has(out.html, '3/4 科', '欠配标签未生成');
  has(out.html, '对不上：历史', '未标出缺哪一科');
  has(out.html, '科目对不上', '全不匹配的场次未标注');
  has(out.html, '已有 2 人成绩', '未显示已有成绩人数');
  eq(out.disabled, false, '有默认选中时确认按钮应可用：');
  // 第一项带 .on（选中态），第三项带 .off（置灰）
  ok(/class="ge-pick on"/.test(out.html), '默认选中态缺失');
  ok(/class="ge-pick off"/.test(out.html), '置灰态缺失');
});

t('⑲ 渲染输出（边界）：全部对不上时确认按钮禁用，且每项都置灰', function () {
  state.exams = [{ id: 9, name: '只考物理', date: '2026-11-01', subjects: ['物理'], scores: {} }];
  const c = S.cands(['姓名', '语文']);
  const out = renderToString({ cands: c, rows: [], headers: [], headerRow: 0, fileName: 'x.csv', si: -1 });
  eq(out.disabled, true, '全不匹配时确认按钮应禁用：');
  notHas(out.html, 'class="ge-pick on"', '不该有选中项');
  has(out.html, '科目对不上', '缺置灰标注');
});

t('⑳ 渲染输出：考试名带尖括号不会破坏结构（XSS 兜底）', function () {
  state.exams = [{ id: 11, name: '<img src=x>期中', date: '', subjects: ['语文'], scores: {} }];
  const c = S.cands(['姓名', '语文']);
  const out = renderToString({ cands: c, rows: [], headers: [], headerRow: 0, fileName: 'x.csv', si: 0 });
  notHas(out.html, '<img src=x>', '考试名未转义');
  has(out.html, '&lt;img', '应转义成实体');
});

/* ==================== 四、附带修复：esc 未定义 ==================== */
t('⑬ 成绩摘要弹窗不再调用不存在的 esc()', function () {
  notHas(html, 'esc(exam.name)', '残留未定义的 esc 调用');
  notHas(html, 'esc(a.name)', '残留未定义的 esc 调用');
  has(html, 'escapeHtml(exam.name)', '未改用 escapeHtml');
  has(html, 'escapeHtml(a.name)', '未改用 escapeHtml');
});

t('⑭ 全文件不存在孤立的 esc( 调用（防止以后再有人克隆这段写法）', function () {
  const hits = [...html.matchAll(/(^|[^\w.$])esc\s*\(/g)].filter(m => !/escapeHtml|escapeAttr/.test(html.slice(m.index, m.index + 12)));
  eq(hits.length, 0, '仍有未定义的 esc( 调用，数量：');
});

/* ==================== 四、速览与文案 ==================== */
t('⑮ 速览标题已跟版，旧条目已清理', function () {
  has(html, '近版更新速览（' + VER + '）', '速览标题未跟版');
  if (html.includes('导入成绩先选考试')) throw new Error('v3.9.32 起速览只留当版，历史条目应已清理：导入成绩先选考试');
});

t('⑯ 历史条目已按当版收敛清理（v3.9.32 契约）', function () {
  if (html.includes('删掉的考试不再自己回来（v3.9.27）')) throw new Error('v3.9.32 起速览只留当版，历史条目应已清理：删掉的考试不再自己回来（v3.9.27）');
  if (html.includes('成绩导入认表头，不再挑模板（v3.9.27）')) throw new Error('v3.9.32 起速览只留当版，历史条目应已清理：成绩导入认表头，不再挑模板（v3.9.27）');
});

t('⑰ 导入入口仍收 xlsx（accept 未回退）', function () {
  has(html, 'accept=".xlsx,.xls,.csv"', 'accept 被改动');
  has(html, 'reader.readAsArrayBuffer(file)', '又退回当文本读了');
});

console.log('\n  ────────────────');
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) process.exitCode = 1;
