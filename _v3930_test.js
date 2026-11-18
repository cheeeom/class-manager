// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.30 回归：考试科目与满分
   ── 需求 ──
   新建考试默认沿用「上一次考试的科目数目与科目名称」，允许自定义增删改；
   满分默认 语文/数学 150、英语 100、其余各科 100，且新建时可逐科修改；
   改满分后，及格率/优秀率/分布图/成绩单/学生端分数条全部按真实满分折算。

   ── 本文件管什么 ──
   ① 纯函数口径（defaultFullOf / examMaxOf / 满分之和 / 及格线优秀线）
   ② 默认模板取「上一场」（按 日期+id 排序，不是数组最后一个元素）
   ③ 科目行 DOM 往返（渲染 → 抽回来 → 收集，保证默认值真落进输入框）
   ④ 收集器：去空 / 去重 / 满分兜底 / 超上限
   ⑤ 改名联动满分（未手改才跟随）、手改后锁定
   ⑥ 等第按百分比而不按绝对分
   ⑦ 源码口径守卫 + 跟版六处一致

   运行：node _v3930_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');
const cmgx = fs.readFileSync('cmgx.js', 'utf8').replace(/\r\n/g, '\n');
const mani = fs.readFileSync('manifest.json', 'utf8').replace(/\r\n/g, '\n');
const portal = fs.readFileSync('portal/index.html', 'utf8').replace(/\r\n/g, '\n');

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

const VM = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
if (!VM) throw new Error('无法从 sw.js 反推版本号');
const VER = VM[1];
const NUM = VER.slice(1);
console.log('  当前版本：' + VER);

function grab(name) {
  const sig = 'function ' + name + '(';
  const i = html.indexOf(sig);
  if (i < 0) throw new Error('找不到函数 ' + name);
  const j = html.indexOf('\n}', i);
  if (j < 0) throw new Error('切不出函数 ' + name);
  return html.slice(i, j + 2);
}
function slice(name) { return grab(name); }

/* ---------- 沙箱：只切纯函数 + 两个跟 DOM 打交道的渲染/收集 ---------- */
const FN = ['defaultFullOf', 'examMaxOf', 'examFullTotal', 'examPassLine', 'examGoodLine',
  'lastExamTemplate', 'examSubjectRowHtml', 'renderExamSubjectRows', 'addExamSubjectRow',
  'removeExamSubjectRow', 'onExamSubjNameInput', 'onExamFullInput', 'examSubjectRowsCollect',
  'rcGradeTier', 'escapeHtml'];
const src = FN.map(grab).join('\n\n');

const S = {};
function boxStub() {
  return {
    innerHTML: '',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    insertAdjacentHTML(pos, h) { this.innerHTML += h; }
  };
}
S.box = boxStub();
const doc = { getElementById(id) { return id === 'examSubjectRows' ? S.box : null; } };
const state = { exams: [] };
new Function('state', 'document', 'S', src + '\n' + FN.map(n => `S.${n} = ${n};`).join('\n'))(state, doc, S);

const two = (name, full) => ({
  querySelector(sel) {
    if (sel === '.exam-subj-name') return { value: name };
    if (sel === '.exam-subj-full') return { value: full };
    return null;
  }
});
function setRows(arr) {
  S.box = boxStub();
  S.box.querySelectorAll = () => arr;
}

/* ==================== ① 满分默认规则 ==================== */
t('① 默认满分：语文/数学 150，英语与其余各科 100', () => {
  eq(S.defaultFullOf('语文'), 150);
  eq(S.defaultFullOf('数学'), 150);
  eq(S.defaultFullOf('英语'), 100);
  eq(S.defaultFullOf('物理'), 100);
  eq(S.defaultFullOf('化学'), 100);
  eq(S.defaultFullOf('语文A'), 150, '带后缀的语文：');
  eq(S.defaultFullOf('数学(理)'), 150, '带括注的数学：');
  eq(S.defaultFullOf(''), 100, '空科目：');
  eq(S.defaultFullOf(undefined), 100, 'undefined：');
  eq(S.defaultFullOf(null), 100, 'null：');
});

t('② examMaxOf：显式设定优先，缺失按科目默认补齐', () => {
  const ex = { subjects: ['语文', '数学', '英语'], maxScores: { 语文: 150, 英语: 120 } };
  const m = S.examMaxOf(ex);
  eq(m['语文'], 150);
  eq(m['数学'], 150, '数学没显式设 ⇒ 走默认 150：');
  eq(m['英语'], 120, '英语手改 120 要生效：');
});

t('③ 老考试（无 maxScores）全按 100 —— 与旧行为逐字一致', () => {
  const m = S.examMaxOf({ subjects: ['语文', '数学', '英语'] });
  eq(m['语文'], 100, '没有 maxScores 时不该按新默认给 150：');
  eq(m['数学'], 100);
  eq(m['英语'], 100);
  eq(S.examFullTotal({ subjects: ['语文', '数学', '英语'] }), 300);
});

t('④ 非法满分一律兜底（0 / 负数 / 空串 / 非数字 / null 都不许漏成 0）', () => {
  ['0', -5, '', 'abc', null, NaN].forEach(v => {
    const m = S.examMaxOf({ subjects: ['语文'], maxScores: { 语文: v } });
    eq(m['语文'], 150, '非法值 ' + String(v) + ' 未兜底：');
  });
  eq(S.examMaxOf(null)['undefined'], undefined, 'null 考试不应崩：');
});

t('⑤ 满分之和 / 及格线 / 优秀线', () => {
  const exam = { subjects: ['语文', '数学', '英语'], maxScores: { 语文: 150, 数学: 150, 英语: 100 } };
  eq(S.examFullTotal(exam), 400, '150+150+100：');
  eq(S.examPassLine(exam), 240, '及格线 400×60%：');
  eq(S.examGoodLine(exam), 340, '优秀线 400×85%：');
  const old = { subjects: ['语文', '数学', '英语'] };
  eq(S.examFullTotal(old), 300);
  eq(S.examPassLine(old), 180, '老口径 3×60 保持：');
  eq(S.examGoodLine(old), 255, '老口径优秀线 255：');
  eq(S.examFullTotal({ subjects: [] }), 0, '空考试满分为 0：');
});

/* ==================== ② 默认模板 ==================== */
t('⑥ 没有任何考试 ⇒ 默认语数英（150/150/100）', () => {
  state.exams = [];
  const tpl = S.lastExamTemplate();
  eq(tpl.length, 3);
  eq(tpl[0].name + '/' + tpl[0].full, '语文/150');
  eq(tpl[1].name + '/' + tpl[1].full, '数学/150');
  eq(tpl[2].name + '/' + tpl[2].full, '英语/100');
});

t('⑦ 有考试 ⇒ 照抄上一场的科目与满分（含自定义满分）', () => {
  state.exams = [{
    id: 1, name: '月考一', date: '2026-10-10',
    subjects: ['语文', '数学', '英语', '物理'],
    maxScores: { 语文: 150, 数学: 150, 英语: 120, 物理: 100 }
  }];
  const tpl = S.lastExamTemplate();
  eq(tpl.length, 4, '科目数目要沿用：');
  eq(tpl.map(x => x.name).join(','), '语文,数学,英语,物理');
  eq(tpl.map(x => x.full).join(','), '150,150,120,100', '自定义满分也要沿用：');
});

t('⑧ 「上一场」按 日期+id 排序取最后一场，不是数组最后一个元素', () => {
  state.exams = [
    { id: 9, name: '期末', date: '2027-01-15', subjects: ['语文'], maxScores: {} },
    { id: 2, name: '月考一', date: '2026-10-10', subjects: ['数学', '物理'], maxScores: { 物理: 110 } }
  ];
  const tpl = S.lastExamTemplate();
  eq(tpl.length, 1, '应取日期最新的「期末」：');
  eq(tpl[0].name, '语文');
});

t('⑨ 上一场科目为空 ⇒ 回落到语数英默认（不能给出空模板）', () => {
  state.exams = [{ id: 3, name: '空考试', date: '2026-11-01', subjects: [] }];
  const tpl = S.lastExamTemplate();
  eq(tpl.length, 3, '空科目要兜底：');
  eq(tpl[0].name, '语文');
});

t('⑨·二 老考试（无 maxScores）当模板 ⇒ 按现行默认给满分（语文 150，不是 100）', () => {
  state.exams = [{ id: 4, name: '老月考', date: '2026-10-01', subjects: ['语文', '数学', '英语'] }];
  const tpl = S.lastExamTemplate();
  eq(tpl.map(x => x.full).join(','), '150,150,100',
    '模板代表「下一场」，老 100 制不许原样搬过来：');
  /* 但同一场老考试的统计口径必须仍是 100 制（两条路径不能混） */
  eq(S.examFullTotal(state.exams[0]), 300, '老考试统计满分还是 300：');
});

/* ==================== ③ 科目行渲染 ==================== */
t('⑩ 科目行 HTML：科目名 / 满分 / 三个钩子都在', () => {
  const h = S.examSubjectRowHtml({ name: '语文', full: 150 });
  has(h, 'class="exam-subj-name"');
  has(h, 'value="语文"');
  has(h, 'class="exam-subj-full"');
  has(h, 'value="150"');
  has(h, 'oninput="onExamSubjNameInput(this)"');
  has(h, 'oninput="onExamFullInput(this)"');
  has(h, 'onclick="removeExamSubjectRow(this)"');
  has(h, 'minmax(0,1fr)', '窄屏不许撑破：');
});

t('⑪ 科目名 XSS 转义（引号/尖括号不许裸奔）', () => {
  const h = S.examSubjectRowHtml({ name: '语"文<b>x</b>', full: 150 });
  notHas(h, '语"文', '引号未转义：');
  notHas(h, '<b>x</b>', '标签未转义：');
  has(h, '&quot;');
});

t('⑫ 满分非法时渲染也要给可用默认值（不许 value="NaN"）', () => {
  const h = S.examSubjectRowHtml({ name: '数学', full: 'abc' });
  has(h, 'value="150"', '数学应回落到 150：');
  notHas(h, 'NaN');
});

t('⑬ renderExamSubjectRows：行数 == 模板长度，值真的进了输入框', () => {
  S.box = boxStub();
  S.renderExamSubjectRows([{ name: '语文', full: 150 }, { name: '英语', full: 120 }]);
  const h = S.box.innerHTML;
  eq(countOf(h, /class="exam-subj-row"/g), 2, '行数：');
  has(h, 'value="语文"');
  has(h, 'value="150"');
  has(h, 'value="英语"');
  has(h, 'value="120"');
});

t('⑭ renderExamSubjectRows：空模板至少留一行，避免没处输入', () => {
  S.box = boxStub();
  S.renderExamSubjectRows([]);
  eq(countOf(S.box.innerHTML, /class="exam-subj-row"/g), 1);
  S.box = boxStub();
  S.renderExamSubjectRows(null);
  eq(countOf(S.box.innerHTML, /class="exam-subj-row"/g), 1);
});

t('⑮ addExamSubjectRow 追加一行（不清空已有行）', () => {
  S.box = boxStub();
  S.renderExamSubjectRows([{ name: '语文', full: 150 }]);
  S.addExamSubjectRow();
  eq(countOf(S.box.innerHTML, /class="exam-subj-row"/g), 2);
  has(S.box.innerHTML, 'value="语文"', '原有行被清了：');
});

t('⑯ 往返一致：渲染出来的默认值，抽回来等于模板（防「模板有值但框里空」）', () => {
  S.box = boxStub();
  const tpl = [{ name: '语文', full: 150 }, { name: '数学', full: 150 }, { name: '英语', full: 100 }];
  S.renderExamSubjectRows(tpl);
  const names = (S.box.innerHTML.match(/class="exam-subj-name" value="([^"]*)"/g) || [])
    .map(s => s.replace(/.*value="/, '').replace(/"$/, ''));
  const fulls = (S.box.innerHTML.match(/class="exam-subj-full" value="([^"]*)"/g) || [])
    .map(s => s.replace(/.*value="/, '').replace(/"$/, ''));
  eq(names.join(','), tpl.map(x => x.name).join(','));
  eq(fulls.join(','), tpl.map(x => String(x.full)).join(','));
});

/* ==================== ④ 收集器 ==================== */
t('⑰ 收集：空行丢掉、科目与满分成对', () => {
  setRows([two('语文', '150'), two('', '100'), two('数学', '150')]);
  const r = S.examSubjectRowsCollect();
  eq(r.subjects.join(','), '语文,数学');
  eq(r.maxScores['语文'], 150);
  eq(r.maxScores['数学'], 150);
  eq(r.dup.length, 0);
});

t('⑱ 收集：重名去重并报出来（不许静默丢弃）', () => {
  setRows([two('语文', '150'), two('语文', '120')]);
  const r = S.examSubjectRowsCollect();
  eq(r.subjects.length, 1);
  eq(r.dup.join(','), '语文');
  eq(r.maxScores['语文'], 150, '保留第一次出现的满分：');
});

t('⑲ 收集：满分空/非法按科目默认补，超 1000 单独标记', () => {
  setRows([two('语文', ''), two('英语', 'abc'), two('物理', '2000')]);
  const r = S.examSubjectRowsCollect();
  eq(r.maxScores['语文'], 150, '语文空满分 ⇒ 150：');
  eq(r.maxScores['英语'], 100, '英语非法 ⇒ 100：');
  eq(r.maxScores['物理'], 2000, '超限也先记下（由上层拦）：');
  eq(r.tooBig.join(','), '物理');
});

t('⑳ 收集：允许一位小数（如 120.5 分卷）', () => {
  setRows([two('英语', '120.5')]);
  eq(S.examSubjectRowsCollect().maxScores['英语'], 120.5);
});

t('㉑ 收集：框不在（DOM 缺失）时安全返回空结果，不抛异常', () => {
  const saved = S.box;
  S.box = null;
  const r = S.examSubjectRowsCollect();
  eq(r.subjects.length, 0);
  S.box = saved;
});

/* ==================== ⑤ 改名联动 ==================== */
function nameEl(val, fullEl) {
  return { value: val, closest: () => ({ querySelector: () => fullEl }) };
}
t('㉒ 改科目名：满分没手改过 ⇒ 跟着新科目默认走', () => {
  const full = { value: '100', getAttribute: () => null };
  S.onExamSubjNameInput(nameEl('数学', full));
  eq(full.value, '150', '改成数学应跳到 150：');
  S.onExamSubjNameInput(nameEl('英语', full));
  eq(full.value, '100', '改成英语应回到 100：');
});

t('㉓ 改科目名：满分手改过（data-touched=1）⇒ 不许覆盖老师填的数', () => {
  const full = { value: '120', getAttribute: k => (k === 'data-touched' ? '1' : null) };
  S.onExamSubjNameInput(nameEl('数学', full));
  eq(full.value, '120', '手改的 120 被覆盖了：');
});

t('㉔ 手改满分 ⇒ 打上 data-touched 标记', () => {
  const attrs = {};
  const el = { setAttribute(k, v) { attrs[k] = v; } };
  S.onExamFullInput(el);
  eq(attrs['data-touched'], '1');
});

/* ==================== ⑥ 等第按百分比 ==================== */
t('㉕ 等第：150 分制按比例判（130 优 / 113 良 / 100 及格 / 80 待及格）', () => {
  eq(S.rcGradeTier(130, 150).label, '优', '130/150=86.7%：');
  eq(S.rcGradeTier(113, 150).label, '良', '113/150=75.3%：');
  eq(S.rcGradeTier(100, 150).label, '及格', '100/150=66.7%：');
  eq(S.rcGradeTier(80, 150).label, '待及格', '80/150=53.3%：');
  eq(S.rcGradeTier(150, 150).label, '优');
});

t('㉖ 等第：不传满分按 100 算（老调用点行为不变）', () => {
  eq(S.rcGradeTier(90).label, '优');
  eq(S.rcGradeTier(76).label, '良');
  eq(S.rcGradeTier(60).label, '及格');
  eq(S.rcGradeTier(59).label, '待及格');
  eq(S.rcGradeTier(90, 0).label, '优', '满分 0 也要兜底成 100：');
  eq(S.rcGradeTier(90, 'abc').label, '优');
});

/* ==================== ⑦ 口径与跟版守卫 ==================== */
t('㉗ 成绩分析不再按「科数×60 / 科数×100」硬算', () => {
  notHas(html, 'r.total / exam.subjects.length >= 60', '及格判定还是老口径：');
  notHas(html, 'r.total / exam.subjects.length >= 85', '优秀判定还是老口径：');
  notHas(html, 'const maxPossible = exam.subjects.length * 100', '满分还是科数×100：');
  has(html, 'const maxPossible = examFullTotal(exam)');
  has(html, 'results.filter(r => r.total >= examPassLine(exam))');
  has(html, 'results.filter(r => r.total >= examGoodLine(exam))');
});

t('㉘ 各科均分条按「占本科满分比例」画（150 分制不会直接顶到 100%）', () => {
  has(html, 'const pctFull = s.avg / subFull * 100');
  has(html, 'const pass = scores.filter(s => s >= subFull * 0.6).length');
});

t('㉙ 导入后摘要弹窗的满分与及格线跟着走', () => {
  has(html, 'var maxScore = examFullTotal(exam)');
  has(html, 'var passLine = examPassLine(exam)');
  notHas(html, 'var maxScore = exam.subjects.length * 100');
  notHas(html, 'var passLine = exam.subjects.length * 60');
});

t('㉚ 个人成绩单：满分总和与逐科满分都进 reportCardData', () => {
  const fn = slice('reportCardData');
  has(fn, 'maxTotal: examFullTotal(exam)');
  has(fn, 'full: fullMap[sj] || 100');
  has(fn, 'var fullMap = examMaxOf(exam)');
  notHas(fn, 'maxTotal: subs.length * 100');
});

t('㉛ 成绩单弹窗逐科条宽按本科满分折算', () => {
  has(html, 'r.score / rFull * 100');
  has(html, 'r.avg / rFull * 100');
  has(html, 'rcGradeTier(r.score, r.full)');
});

t('㉜ 新建考试把 maxScores 写进 exam（缺了就白填）', () => {
  const fn = slice('confirmAddExam');
  has(fn, 'maxScores: picked.maxScores');
  has(fn, 'const picked = examSubjectRowsCollect()');
  has(fn, 'const exam = { id: state.nextExamId++, name, date, subjects, maxScores: picked.maxScores, scores: {} }');
});

t('㉝ 打开弹窗走「上一场」模板（不是写死语文,数学,英语）', () => {
  const fn = slice('openExamModal');
  has(fn, 'renderExamSubjectRows(lastExamTemplate())');
  notHas(fn, "'语文,数学,英语'");
  notHas(html, "getElementById('examSubjects')", '旧文本框还在被引用：');
});

t('㉞ 成绩页卡片显示满分', () => {
  has(html, '满分${examFullTotal(exam)}');
});

t('㉟ 学生端载荷带逐科满分，portal 条形按 f 折算', () => {
  has(html, 'f: examMaxOf(ex)');
  has(portal, 'var f = (cur.f && Number(cur.f[k]) > 0) ? Number(cur.f[k]) : 100');
  has(portal, 'nv / f * 100');
  has(portal, 'nv < f * 0.6');
});

t('㊱ 跟版六处同源：CACHE / 侧栏 / 图标 / cmgx / manifest', () => {
  has(sw, "CACHE_NAME = 'class-manager-" + VER + "'");
  has(html, '<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>');
  has(html, '<script src="./cmgx.js?v=' + NUM + '"></script>');
  has(html, '<link rel="apple-touch-icon" href="./icon_192.png?v=' + NUM + '">');
  has(html, '近版更新速览（' + VER + '）');
  has(cmgx, '（' + VER + '）');
  eq(countOf(mani, new RegExp('\\?v=' + NUM.replace(/\./g, '\\.'), 'g')), 3, 'manifest 三处：');
});

t('㊲ 历史注释与速览史实不许被跟版误改（v3.9.29 那几条还在）', () => {
  has(html, '<!-- v3.9.29 场次范围');
  has(html, '成绩页看得全、收得拢（v3.9.29）');
  has(html, 'var _pfScoreScope = \'term\';   // v3.9.29');
});

console.log('\n  结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail > 0) process.exit(1);
