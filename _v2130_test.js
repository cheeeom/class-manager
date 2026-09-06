/* v2.13.0 回归测试：班委模式（免密入口 + 白名单裁剪 + 越权拦截）
   运行：node _v2130_test.js */
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

console.log('\n=== 班委白名单与边界 ===');
t('白名单：7 个协作页（v2.16.0 起含学分公示）', () => {
  const m = html.match(/const COMMITTEE_PAGES = (\[[^\]]*\])/);
  eq(JSON.stringify(eval(m[1])), JSON.stringify(['dashboard','credits','publicity','duty','seating','todo','honors']));
});
t('敏感页面全部不在白名单（档案/成绩/请假/通知/设置/寝室/班委/工作留痕/数据分析）', () => {
  const m = html.match(/const COMMITTEE_PAGES = (\[[^\]]*\])/);
  const pages = eval(m[1]);
  ['students','profiles','committee','dorm','attendance','grades','worklogs','notices','analytics','settings']
    .forEach(p => { if (pages.includes(p)) throw new Error('敏感页泄露进白名单: ' + p); });
});
t('登录页有免密班委入口按钮', () => {
  eq(/onclick="enterCommitteeMode\(\)"/.test(html), true);
});
t('enterCommitteeMode：不继承主账号登录态（移除 SESSION_KEY）', () => {
  const fn = html.match(/function enterCommitteeMode\(\)\{[\s\S]*?\n\}/)[0];
  if (!fn.includes("sessionStorage.removeItem(SESSION_KEY)")) throw new Error('未隔离主账号登录态');
});
t('navigateTo 第一行即白名单拦截', () => {
  const fn = html.match(/function navigateTo\(page\)\{[\s\S]*?\n\}/)[0];
  const head = fn.slice(0, fn.indexOf('{', fn.indexOf('(page)') ) + 1 + 400);
  if (!/window\.__cmRole === 'committee' && COMMITTEE_PAGES\.indexOf\(page\) < 0/.test(fn.slice(0, 500)))
    throw new Error('navigateTo 未在入口处拦截');
});
t('导出/导入/添加学生三函数均有班委拦截（防止全量数据落文件）', () => {
  [['function exportData(){', '班委模式无权导出'],
   ['function importData(){', '班委模式无权导入'],
   ['function openAddStudentModal(){', '班委模式无权修改学生名单']].forEach(([f, msg]) => {
    const i = html.indexOf(f);
    const seg = html.slice(i, i + 400);
    if (!seg.includes('__cmRole')) throw new Error(f + ' 缺少角色拦截');
    if (!seg.includes(msg)) throw new Error(f + ' 缺少提示');
  });
});
t('applyCommitteeRestrictions 覆盖导航三套入口 + 顶栏三按钮', () => {
  const fn = html.match(/function applyCommitteeRestrictions\(\)\{[\s\S]*?\n\}/)[0];
  ['.nav-item, .mobile-tab, .more-item', 'topExportBtn', 'topImportBtn', 'topAddStudentBtn', 'cm-badge', 'cmExitBtn']
    .forEach(s => { if (!fn.includes(s)) throw new Error('缺少: ' + s); });
});
t('init 区支持班委模式刷新恢复（不显示登录 keypad）', () => {
  const init = html.match(/\/\/ 登录拦截[\s\S]*?renderPwdDots\(\);\n  \}\n\} else \{/);
  if (!init || !init[0].includes('isCommitteeMode()')) throw new Error('init 未处理班委模式');
});
t('清空数据在设置页（白名单外），班委不可达', () => {
  const settingsNav = html.match(/<div class="nav-item" data-page="settings">[\s\S]*?<\/div>/)[0];
  eq(settingsNav.includes('设置'), true);
  const m = html.match(/const COMMITTEE_PAGES = (\[[^\]]*\])/);
  eq(eval(m[1]).includes('settings'), false);
});
t('值日/学分操作逻辑未被角色限制（班委可正常操作）', () => {
  const duty = html.match(/function renderDuty\(\)\{[\s\S]*?\n\}/);
  eq(!!duty, true);
  if (/function quickCredit\(amount\)\{[\s\S]{0,200}__cmRole/.test(html)) throw new Error('学分操作不应被拦截');
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
