// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.31 回归：已建考试可编辑（增删科目 / 改科目名 / 改满分 / 改名称日期）
   ── 老板原话 ──
   「加个编辑科目/满分按钮 要允许已建立的考试可以编辑 比如增加删除学科 修改满分等等
     免得考试科目有问题只能删除整场考试重新来」

   ── 本文件钉什么 ──
   ① 改名迁移：语文→语文A，分数跟着搬，旧键删掉；链式改名不错乱；目标已有值不覆盖
   ② 删科目：原始分数保留（孤儿），但不再参与「算不算参考」——否则一科没录的学生被算进来拉低班均
   ③ 打开编辑：字段预填正确、行带 data-orig、标题/按钮切成「编辑考试 / 保存」
   ④ 保存：写回 subjects / maxScores / 名称日期，删科目前弹确认
   ⑤ 关弹窗清 _examEditId（否则下次「新增」会变成改上一场）
   ⑥ 老考试预填满分仍是 100，不许「一进编辑就把历史口径换成 150」

   运行：node _v3931_test.js */
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
const slice = grab;

/* ==================== 一、改名迁移（纯函数行为） ==================== */
const S = {};
{
  const src = [
    grab('defaultFullOf'), grab('examMaxOf'), grab('examFullTotal'),
    grab('applyScoreKeyRename'), grab('hasAnySubjectScore')
  ].join('\n\n');
  new Function('S', src + '\n'
    + 'S.defaultFullOf=defaultFullOf;S.examMaxOf=examMaxOf;S.examFullTotal=examFullTotal;'
    + 'S.rename=applyScoreKeyRename;S.hasScore=hasAnySubjectScore;')(S);
}

const clone = o => JSON.parse(JSON.stringify(o));
function mkExam() {
  return {
    id: 7, name: '期中考试', date: '2026-11-10',
    subjects: ['语文', '数学', '英语'],
    maxScores: { 语文: 150, 数学: 150, 英语: 100 },
    scores: {
      1: { 语文: 130, 数学: 140, 英语: 90 },
      2: { 语文: 110, 数学: 100, 英语: 80 },
      3: { 数学: 60 }
    }
  };
}

t('① 改名迁移：语文→语文A，分数全搬过去、旧键删掉', () => {
  const ex = mkExam();
  const n = S.rename(ex, [{ from: '语文', to: '语文A' }]);
  eq(n, 2, '迁移条数（两名学生）：');
  eq(ex.scores[1]['语文A'], 130, '1 号的语文分要搬过去：');
  eq(ex.scores[2]['语文A'], 110);
  eq(ex.scores[1]['语文'], undefined, '旧键必须删：');
  eq(Object.keys(ex.scores[1]).sort().join(','), '数学,英语,语文A');
});

t('② 没有该科分数的学生不受影响（不许凭空造 0 分键）', () => {
  const ex = mkExam();
  S.rename(ex, [{ from: '语文', to: '语文A' }]);
  eq(ex.scores[3]['语文A'], undefined, '3 号没语文分，不该被造出语文A：');
  eq(Object.keys(ex.scores[3]).join(','), '数学');
});

t('③ 链式改名 A→B、B→C 不许串味（两阶段搬运）', () => {
  const ex = { id: 1, subjects: ['A', 'B'], scores: { 1: { A: 11, B: 22 } } };
  S.rename(ex, [{ from: 'A', to: 'B2' }, { from: 'B', to: 'C' }]);
  eq(ex.scores[1]['B2'], 11);
  eq(ex.scores[1]['C'], 22);
  eq(ex.scores[1]['A'], undefined);
  eq(ex.scores[1]['B'], undefined);
});

t('④ 目标键已有值时不覆盖（保住学生原本那科的分）', () => {
  const ex = { id: 1, subjects: ['语文', '英语'], scores: { 1: { 语文: 130, 英语: 95 } } };
  S.rename(ex, [{ from: '语文', to: '英语' }]);
  eq(ex.scores[1]['英语'], 95, '英语原值被冲掉了：');
  eq(ex.scores[1]['语文'], undefined, '旧键仍要删：');
});

t('⑤ 空 pairs / 无 scores 都安全返回 0', () => {
  const ex = mkExam();
  eq(S.rename(ex, []), 0);
  eq(S.rename({ id: 1 }, [{ from: 'a', to: 'b' }]), 0);
  eq(S.rename(null, [{ from: 'a', to: 'b' }]), 0);
});

/* ==================== 二、删科目后的「算不算参考」 ==================== */
t('⑥ 孤儿分数不算参考（删掉科目后，只有那科有分的学生不许进排名）', () => {
  const ex = { subjects: ['数学'], maxScores: { 数学: 100 }, scores: { 1: { 语文: 99 } } };
  eq(S.hasScore(ex, ex.scores[1]), false, '只有被删科目有分 ⇒ 不算参考：');
  eq(S.hasScore(ex, { 数学: 0 }), true, '0 分是有效分，必须算参考：');
});

t('⑦ 参考判据：本场科目内至少一科有数值（空串/null/非数字都不算）', () => {
  const ex = { subjects: ['语文', '数学'] };
  eq(S.hasScore(ex, {}), false);
  eq(S.hasScore(ex, null), false);
  eq(S.hasScore(ex, { 语文: '' }), false, '空串不算：');
  eq(S.hasScore(ex, { 语文: null }), false, 'null 不算：');
  eq(S.hasScore(ex, { 语文: 'abc' }), false, '非数字不算：');
  eq(S.hasScore(ex, { 语文: '0' }), true, '字符串 0 要算：');
  eq(S.hasScore(ex, { 数学: 59 }), true);
});

t('⑧ 源码守卫：六处「有键即参考」已全部换掉', () => {
  notHas(html, 'Object.keys(r.scores).length > 0', '还有地方按「有键」判参考：');
  notHas(html, 'Object.keys(sc).length > 0', '还有地方按「有键」判参考：');
  eq(countOf(html, /hasAnySubjectScore\(/g) >= 6, true, '统一判据没铺开：');
});

/* ==================== 三、打开编辑弹窗（真跑） ==================== */
function boxStub() {
  return { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; }, insertAdjacentHTML(p, h) { this.innerHTML += h; } };
}
const els = {
  examName: { value: '' },
  examDate: { value: '' },
  examModalTitle: { textContent: '' },
  examModalAction: { textContent: '' },
  examModalHint: { style: { display: 'none' } },
  examSubjectRows: boxStub()
};
const doc = { getElementById(id) { return els[id] || null; } };
const state = { exams: [mkExam()], students: [] };
let modalOpened = 0, toastMsg = '';
const S2 = {};
const src2 = [
  grab('defaultFullOf'), grab('examMaxOf'), grab('examFullTotal'), grab('lastExamTemplate'),
  grab('examSubjectRowHtml'), grab('renderExamSubjectRows'), grab('escapeHtml'),
  grab('setExamModalMode'), grab('openExamEditModal'), grab('openExamModal'), grab('closeExamModal')
].join('\n\n');
new Function('S', 'state', 'document', 'openModal', 'closeModal', 'showToast', 'localDateStr',
  'var _examEditId = null;\n' + src2 + '\n'
  + 'S.setMode=setExamModalMode;S.edit=openExamEditModal;S.open=openExamModal;S.close=closeExamModal;'
  + 'S.getEditId=function(){return _examEditId;};S.clearEdit=function(){_examEditId=null;};'
)(S2, state, doc, () => { modalOpened++; }, () => {}, m => { toastMsg = m; }, () => '2026-11-18');

t('⑨ 打开编辑：名称/日期预填、标题切成「编辑考试」、按钮切成「保存」', () => {
  S2.edit(7);
  eq(els.examName.value, '期中考试');
  eq(els.examDate.value, '2026-11-10');
  eq(els.examModalTitle.textContent, '编辑考试');
  eq(els.examModalAction.textContent, '保存');
  eq(els.examModalHint.style.display, 'block', '编辑时要给出「改名/删科/改满分」的说明：');
  eq(modalOpened, 1);
  eq(S2.getEditId(), 7, '编辑态 id 没记上：');
});

t('⑩ 打开编辑：科目行带 data-orig（改名迁移靠它认源）', () => {
  S2.edit(7);
  const h = els.examSubjectRows.innerHTML;
  eq(countOf(h, /class="exam-subj-row"/g), 3, '三科三行：');
  has(h, 'data-orig="语文"');
  has(h, 'data-orig="数学"');
  has(h, 'data-orig="英语"');
});

t('⑪ 编辑态预填的满分 = 这场考试的真实口径（150/150/100，不是全 100）', () => {
  S2.edit(7);
  const h = els.examSubjectRows.innerHTML;
  has(h, 'value="150"');
  has(h, 'value="100"');
  has(h, 'value="语文"');
});

t('⑫ 老考试（无 maxScores）进编辑 ⇒ 预填仍是 100（不许偷偷改成 150）', () => {
  state.exams = [{ id: 8, name: '老月考', date: '2026-09-20', subjects: ['语文', '数学'], scores: {} }];
  S2.edit(8);
  const h = els.examSubjectRows.innerHTML;
  eq(countOf(h, /value="150"/g), 0, '老考试不该冒出 150：');
  eq(countOf(h, /value="100"/g), 2, '两科都是 100：');
  state.exams = [mkExam()];
});

t('⑬ 新增模式会清掉编辑态，且标题/按钮复位', () => {
  S2.edit(7);
  S2.open();
  eq(S2.getEditId(), null, '新增后还挂着编辑 id，会改到上一场：');
  eq(els.examModalTitle.textContent, '新增考试');
  eq(els.examModalAction.textContent, '创建');
  eq(els.examModalHint.style.display, 'none');
});

t('⑭ 关闭弹窗也清编辑态（取消编辑后再点新增不会误改）', () => {
  S2.edit(7);
  S2.close();
  eq(S2.getEditId(), null);
});

t('⑮ 找不到的考试 id ⇒ 提示 + 不进入编辑态', () => {
  toastMsg = '';
  S2.edit(999);
  eq(toastMsg.indexOf('找不到') >= 0, true, '应给出提示：');
  eq(S2.getEditId(), null);
});

/* ==================== 四、保存（真跑 saveExamEdit） ==================== */
function runSave(exam, picked, confirmAnswer) {
  const st = { exams: [exam], students: [] };
  const Sx = {};
  let saved = 0, rendered = 0, closed = 0, toast = '', asked = '';
  const src = [
    grab('defaultFullOf'), grab('examMaxOf'), grab('examFullTotal'),
    grab('applyScoreKeyRename'), grab('saveExamEdit')
  ].join('\n\n');
  new Function('S', 'state', 'saveData', 'renderGrades', 'closeExamModal', 'showToast', 'confirm',
    src + '\nS.save=saveExamEdit;'
  )(Sx,
    st,
    () => { saved++; },
    () => { rendered++; },
    () => { closed++; },
    m => { toast = m; },
    q => { asked = q; return !!confirmAnswer; });
  Sx.save(exam.id, '改名后的考试', '2026-12-01', picked);
  return { exam, st, saved, rendered, closed, toast, asked };
}
function picked(rows) {
  const subjects = rows.map(r => r.name);
  const maxScores = {};
  rows.forEach(r => { maxScores[r.name] = r.full; });
  return { subjects, maxScores, dup: [], tooBig: [], rows };
}

t('⑯ 保存：改科目名（语文→语文A）+ 删英语 + 加物理 三件事一次做完', () => {
  const ex = mkExam();
  const r = runSave(ex, picked([
    { name: '语文A', full: 150, orig: '语文' },
    { name: '数学', full: 150, orig: '数学' },
    { name: '物理', full: 100, orig: '' }
  ]), true);
  eq(r.exam.subjects.join(','), '语文A,数学,物理', '科目集合：');
  eq(r.exam.maxScores['物理'], 100, '新科目满分：');
  eq(r.exam.scores[1]['语文A'], 130, '改名后分数要跟过来：');
  eq(r.exam.scores[1]['语文'], undefined, '旧键要删：');
  eq(r.exam.scores[1]['英语'], 90, '被删科目的原始分数要保留（只是不参与总分）：');
  eq(r.exam.name, '改名后的考试');
  eq(r.exam.date, '2026-12-01');
  eq(r.saved, 1); eq(r.rendered, 1); eq(r.closed, 1);
  has(r.toast, '迁移 2 条改名分数');
});

t('⑰ 保存：删掉有成绩的科目要先弹确认；说「不」就一个字都不改', () => {
  const ex = mkExam();
  const before = clone(ex);
  const r = runSave(ex, picked([
    { name: '语文', full: 150, orig: '语文' },
    { name: '数学', full: 150, orig: '数学' }
  ]), false);
  has(r.asked, '英语', '确认框要点名是哪一科：');
  eq(JSON.stringify(r.exam), JSON.stringify(before), '拒绝后数据必须原样：');
  eq(r.saved, 0, '拒绝后不许落盘：');
});

t('⑱ 保存：删掉「没任何分数」的科目不打扰老师（不该弹确认）', () => {
  const ex = mkExam();
  ex.scores = {};
  const r = runSave(ex, picked([
    { name: '语文', full: 150, orig: '语文' }
  ]), false);
  eq(r.asked, '', '空科目删除不该弹确认：');
  eq(r.exam.subjects.join(','), '语文');
  eq(r.saved, 1);
});

t('⑲ 保存：改满分写进 maxScores，满分和随之重算（含老考试被升级为有 maxScores）', () => {
  const ex = { id: 9, name: '老考试', date: '2026-09-01', subjects: ['语文', '英语'], scores: {} };
  const r = runSave(ex, picked([
    { name: '语文', full: 150, orig: '语文' },
    { name: '英语', full: 120, orig: '英语' }
  ]), true);
  eq(r.exam.maxScores['语文'], 150);
  eq(r.exam.maxScores['英语'], 120);
  eq(S.examFullTotal(r.exam), 270, '满分和应为 270：');
});

t('⑳ 保存：科目一个不剩属于上层拦截（collect 空 ⇒ confirmAddExam 早退），这里只验 subjects 写入不炸', () => {
  const ex = mkExam();
  const r = runSave(ex, picked([]), true);
  eq(r.exam.subjects.length, 0);
  eq(r.exam.maxScores && Object.keys(r.exam.maxScores).length, 0);
});

/* ==================== 五、接线与跟版 ==================== */
t('㉑ 成绩卡片有编辑入口，且不会连带折叠（closest(button) 守卫仍在）', () => {
  has(html, 'onclick="openExamEditModal(${exam.id})"');
  has(html, 'title="编辑科目与满分"');
  const fn = slice('toggleExamCard');
  has(fn, "ev.target.closest('button')", '折叠守卫被写没了：');
});

t('㉒ 弹窗有标题/按钮/提示三个 id，且编辑态说明文字讲清三件事', () => {
  has(html, 'id="examModalTitle"');
  has(html, 'id="examModalAction"');
  has(html, 'id="examModalHint"');
  has(html, '改科目名会保留该科已录分数');
  has(html, '删掉科目后原始分数仍保留');
  has(html, '改了满分，及格率/优秀率等按新满分重算');
});

t('㉓ confirmAddExam 按编辑态分流，且新增路径仍保留清墓碑那一句', () => {
  const fn = slice('confirmAddExam');
  has(fn, 'if(_examEditId !== null){ saveExamEdit(_examEditId, name, date, picked); return; }');
  has(fn, 'if(state.examDeleted && state.examDeleted[exam.id]) delete state.examDeleted[exam.id];');
  ok(fn.indexOf('_examEditId !== null') < fn.indexOf('state.exams.push(exam)'),
    '分流必须排在 push 之前（否则会多建一场）：');
});

t('㉔ saveExamEdit 的写入顺序：先算改名对/删科清单，再迁移，最后写字段', () => {
  const fn = slice('saveExamEdit');
  ok(fn.indexOf('applyScoreKeyRename') < fn.indexOf('exam.subjects = newSubs'),
    '应先迁移分数再改 subjects：');
  has(fn, 'exam.maxScores = {}');
  has(fn, 'newSubs.forEach(function(sj){ exam.maxScores[sj] = picked.maxScores[sj]; })');
  has(fn, 'droppedWithScores.length && !confirm(');
});

t('㉕ 跟版六处同源', () => {
  has(sw, "CACHE_NAME = 'class-manager-" + VER + "'");
  has(html, '<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>');
  has(html, '<script src="./cmgx.js?v=' + NUM + '"></script>');
  has(html, '<link rel="apple-touch-icon" href="./icon_192.png?v=' + NUM + '">');
  has(html, '近版更新速览（' + VER + '）');
  has(cmgx, '（' + VER + '）');
  eq(countOf(mani, new RegExp('\\?v=' + NUM.replace(/\./g, '\\.'), 'g')), 3, 'manifest 三处：');
});

t('㉖ 历史注释不被跟版误改', () => {
  has(html, 'v3.9.30 科目与满分');
  has(html, '考试科目与满分可继承可改（v3.9.30）');
});

console.log('\n  结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail > 0) process.exit(1);
