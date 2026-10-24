/* v3.6.7 回归测试：劳动整改批量多选 + 选中姓名常显
   背景：老板报障「记劳动整改选学生后依旧没有姓名预览」+ 希望「批量选择」。
   根因=filterPunishStudents 的 onPick 只存 id，未填输入框（组件默认填名被 onPick 覆盖跳过）。
   实现：照学分批量多选模式（keepOpen + ✓/＋ 行标记 + chips 可移除）+ v3.6.6 铁律
   「有选中必显名」（输入框常显名单全选待替换、失焦空框补回）；组件加 getQuery
   覆盖口（名单预览文字不作搜索词）；confirmPunish 批量循环 + 完成即关弹窗。
   运行：node _v3607_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }

t('① 姓名预览修复：onPick 填名单 + 组件 getQuery 覆盖口', () => {
  has(html, 'function punishPreviewText()', '名单预览函数');
  const i = html.indexOf('function filterPunishStudents()');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  has(fn, "inp.value = punishPreviewText()", '选中后输入框填名单');
  has(fn, 'keepOpen: true', '批量连续点选');
  // 组件覆盖口（预览文字不作搜索词）
  has(html, 'var q = ((opts.getQuery ? opts.getQuery() : input.value) || \'\').trim().toLowerCase();', '组件 getQuery 覆盖口');
  has(fn, 'getQuery: function()', '劳动整改接入 getQuery');
});

t('② 多选契约：✓/＋ 行标记 + chips 可移除 + 失焦补回', () => {
  has(html, 'var _punishSelectedIds = [];', '多选数组');
  ok(!html.includes('_punishSelectedId ='), '单选旧变量应绝迹（含 null 重置）');
  has(html, 'function renderPunishSelectedChips()', 'chips 渲染');
  has(html, 'function removePunishStudent(id)', 'chip 移除');
  has(html, 'id="punishSelectedChips"', 'chips 容器');
  has(html, '（可多选批量记录）', 'label 提示');
  const h = html.indexOf('function hidePunishStudentList()');
  has(html.slice(h, h + 600), 'punishPreviewText()', '失焦空框补回名单');
});

t('③ confirmPunish 批量：循环建记录 + 完成关弹窗 + 空选拦截', () => {
  const i = html.indexOf('function confirmPunish()');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  has(fn, 'studs.forEach(function(s){', '批量循环');
  has(fn, "closeModal('punishModal')", '保存后关弹窗');
  has(fn, '已记录 \' + studs.length + \' 人劳动整改', '批量完成提示');
  ok(/if\(!_punishSelectedIds\.length\)\{ showToast\('请选择学生'/.test(fn), '空选拦截');
  has(fn, 'studentId: s.id', '逐生建记录');
  // openPunishModal 重置
  const o = html.indexOf('function openPunishModal()');
  const ofn = html.slice(o, html.indexOf('\nfunction ', o + 10));
  has(ofn, '_punishSelectedIds = [];', '开弹窗重置多选');
  has(ofn, 'renderPunishSelectedChips();', '开弹窗渲染 chips');
});

t('④ 版本一致性（动态跟版）+ 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（从 CACHE 反推，无需随版改）');
  has(html, '劳动整改批量多选（v3.6.7）', '速览历史条目（v3.6.7）仍在');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
