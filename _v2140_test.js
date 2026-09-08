/* v2.14.0 回归测试：学分批量多选 / 劳动整改（搬水+自定义天数）/ 初始学分统一100 / 面板关闭键
   运行：node _v2140_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== 初始学分统一 100 ===');
const m = html.match(/const INITIAL_CREDIT = (\d+);[\s\S]*?function normalizeInitialCredits\(students, operations\)\{[\s\S]*?\n\}/);
t('INITIAL_CREDIT = 100 且迁移函数存在', () => { eq(m[1], '100'); });
global.INITIAL_CREDIT = 100;
const normSrc = m[0].slice(m[0].indexOf('function normalizeInitialCredits'));
const liveOpsM = html.match(/function liveOps\(ops\)\{[\s\S]*?\n\}/);
const liveOps = eval('(' + liveOpsM[0] + ')');   // v2.17.9
const normalizeInitialCredits = eval('(' + normSrc + ')');
t('0 分且无流水 → 修复为 100', () => {
  const students = [{ id: 1, credit: 0 }, { id: 2, credit: 0 }, { id: 3, credit: 95 }];
  const n = normalizeInitialCredits(students, []);
  eq(n, 2); eq(students[0].credit, 100); eq(students[1].credit, 100); eq(students[2].credit, 95);
});
t('有过流水的 0 分学生（真扣到 0）保持不动', () => {
  const students = [{ id: 1, credit: 0 }, { id: 2, credit: 100 }];
  const ops = [{ studentId: 1, amount: -3 }];
  const n = normalizeInitialCredits(students, ops);
  eq(n, 0); eq(students[0].credit, 0);
});
t('loadData 尾部调用迁移并持久化（幂等修复）', () => {
  const fn = html.match(/function loadData\(\)\{[\s\S]*?\n\}/)[0];
  if (!fn.includes('normalizeInitialCredits(state.students, state.operations)')) throw new Error('loadData 未调用迁移');
  if (!fn.includes('saveData()')) throw new Error('修复结果未持久化');
});
t('四个新增入口默认 100：添加弹窗HTML/弹窗JS/批量导入/名单同步', () => {
  eq(/id="addStudentCredit" value="100"/.test(html), true);
  eq(/addStudentCredit'\)\.value = '100';/.test(html), true);
  eq(/const credit = parseInt\(parts\[2\]\) \|\| INITIAL_CREDIT;/.test(html), true);
  eq(/credit: INITIAL_CREDIT, tags: \[\], profile: \{\}/.test(html), true);
});

console.log('\n=== 学分批量多选 ===');
t('多选集合 + 全选/清空/单个移除 + chips 渲染齐备', () => {
  ['var _creditSelectedIds = new Set()',
   'function selectCreditStudent(sid, name){',
   'function removeCreditStudent(id)', 'function clearCreditStudents()',
   'function selectAllCreditStudents()', 'function renderCreditSelectedChips()',
   'id="creditSelectedChips"'].forEach(s => {
    if (!html.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('quickCredit/customCreditApply 走批量 applyCreditBulk', () => {
  const q = html.match(/function quickCredit\(amount\)\{[\s\S]*?\n\}/)[0];
  const c = html.match(/function customCreditApply\(\)\{[\s\S]*?\n\}/)[0];
  eq(q.includes('applyCreditBulk'), true);
  eq(c.includes('applyCreditBulk'), true);
  eq(q.includes('_creditSelectedId) || 0'), false);   // 旧单选逻辑已移除
});
t('applyCreditBulk：一次流水一批、统一保存渲染提示', () => {
  const fn = html.match(/function applyCreditBulk\(ids, amount, reason\)\{[\s\S]*?\n\}/)[0];
  // v2.15.0：流水写入下沉到统一入口 applyCreditDelta（含 nextOpId++），此处只校验编排
  ['applyCreditDelta(student, amount, reason, { time: ts })', 'saveData()', 'refreshCreditViews()', 'showToast'].forEach(s => {
    if (!fn.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('v2.17.5 操作成功后自动清空备选名单（免手动点清空）+ 复位搜索框', () => {
  const fn = html.match(/function applyCreditBulk\(ids, amount, reason\)\{[\s\S]*?\n\}/)[0];
  ['_creditSelectedIds.clear()', 'renderCreditSelectedChips()', "getElementById('creditStudentInput')", "getElementById('creditStudentDropdown')"].forEach(s => {
    if (!fn.includes(s)) throw new Error('缺少自动清空: ' + s);
  });
});
t('下拉多选交互：点选后保持展开，已选打 ✓', () => {
  const fn = html.match(/function filterCreditStudents\(\)\{[\s\S]*?\n\}/)[0];
  if (!fn.includes('_creditSelectedIds.has(s.id)')) throw new Error('无已选高亮');
  if (!fn.includes('filterCreditStudents();')) throw new Error('点选后未刷新列表');
});

console.log('\n=== 劳动整改（原罚扫） ===');
t('UI 文案全部替换为「劳动整改」，「罚扫」仅存于注释', () => {
  const lines = html.split('\n').map((l, i) => ({ no: i + 1, text: l }));
  const hits = lines.filter(l => l.text.includes('罚扫'));
  hits.forEach(l => {
    const t2 = l.text.trim();
    const isComment = t2.startsWith('<!--') || t2.startsWith('/*') || t2.startsWith('*') || t2.startsWith('//');
    if (!isComment) throw new Error('第 ' + l.no + ' 行有用户可见「罚扫」: ' + t2.slice(0, 80));
  });
  eq(hits.length >= 1, true);   // 注释保留作为历史脉络
});
t('劳动类型三种：教室/公共区/搬水劳动', () => {
  const sel = html.match(/<select id="punishArea"[\s\S]*?<\/select>/)[0];
  ['教室', '公共区', '搬水劳动'].forEach(a => { if (!sel.includes(a)) throw new Error('缺类型: ' + a); });
});
t('默认天数：教室 7 / 公共区 7 / 搬水 1，区域切换联动', () => {
  const m2 = html.match(/const PUNISH_AREA_DEFAULT_DAYS = (\{[^\}]*\})/);
  eq(JSON.stringify(eval('(' + m2[1] + ')')), JSON.stringify({ '教室': 7, '公共区': 7, '搬水劳动': 1 }));
  eq(/function onPunishAreaChange\(\)\{[\s\S]*?PUNISH_AREA_DEFAULT_DAYS/.test(html), true);
  eq(/onchange="onPunishAreaChange\(\)"/.test(html), true);
});
t('整改天数为自定义数字输入（1-30），openPunishModal 默认 7', () => {
  eq(/id="punishDays" value="7" min="1" max="30"/.test(html), true);
  eq(/punishDays'\)\.value = String\(PUNISH_AREA_DEFAULT_DAYS\['教室'\]\)/.test(html), true);
  const cp = html.match(/function confirmPunish\(\)\{[\s\S]*?\n\}/)[0];
  if (!cp.includes('days > 30')) throw new Error('天数上限 30 未校验');
});
t('流水原因前缀更新为「劳动整改·」，兼容旧记录不变（punishStatusFor 未动）', () => {
  eq(/'劳动整改·' \+ area/.test(html), true);
  eq(/function punishStatusFor\(p, today\)\{[\s\S]*?\n\}/.test(html), true);
});

console.log('\n=== 详情面板关闭键美化 ===');
t('panel-close 圆形样式 + hover 变红旋转，已替换旧 btn-icon ✕', () => {
  eq(/\.panel-close\{width:34px;height:34px;border-radius:50%/.test(html), true);
  eq(/\.panel-close:hover\{[\s\S]*?rotate\(90deg\)/.test(html), true);
  eq(/<button class="panel-close" onclick="closeDetailPanel\(\)"/.test(html), true);
  const header = html.match(/<div class="side-panel-header">[\s\S]*?<\/div>\s*<\/div>/);
  eq(header[0].includes('btn-icon'), false);
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
