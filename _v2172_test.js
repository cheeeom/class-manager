/* v2.17.2 回归测试：学生快速选择器（任命班委等三入口，输入姓名即选）
   运行：node _v2172_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}
const escapeHtml = s => String(s == null ? '' : s);
const students = [
  { id: 1, sid: 'A01', name: '王小明', credit: 96 },
  { id: 2, sid: 'A02', name: '罗雪', credit: 60 },
  { id: 3, sid: 'A03', name: '王小红', credit: 88 },
  { id: 4, sid: 'B07', name: '余长青', credit: 55 }
];

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（选择器改造无语法错误）', () => {
  let n = 0;
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => { new Function(m[1]); n++; });
  if (!n) throw new Error('未找到主脚本块');
});

console.log('\n=== v2.18.7 版本三处同步 ===');
t('登录页 / 侧栏 / SW CACHE_NAME = v2.18.7', () => {
  if (!/login-version">v2\.18\.7</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.7 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!fs.readFileSync('sw.js', 'utf8').includes('class-manager-v2.18.7')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== v2.17.30 热修：内联事件 this 陷阱 ===');
t('onStudentSearchInput 不再依赖 this，改为按 id 取输入框', () => {
  const fn = grab('function onStudentSearchInput()');
  if (fn.includes('this.value')) throw new Error('仍用 this.value');
  if (!fn.includes("getElementById('studentSearchInput')")) throw new Error('未按 id 取值');
});
t('onStudentSearchKeydown 同样按 id 取输入框', () => {
  const fn = grab('function onStudentSearchKeydown(e)');
  if (fn.includes('this.value')) throw new Error('仍用 this.value');
  if (!fn.includes("getElementById('studentSearchInput')")) throw new Error('未按 id 取值');
});

console.log('\n=== 过滤纯函数 matchStudentsByName ===');
const matchStudentsByName = eval('(' + grab('function matchStudentsByName(pool, q)') + ')');
t('空词返回全量副本（不改原数组）', () => {
  const out = matchStudentsByName(students, '');
  eq(out.length, students.length);
  eq(students.length, 4);
});
t('按姓名子串过滤（王 → 2 人）', () => {
  eq(matchStudentsByName(students, '王').map(s => s.name).join(','), '王小明,王小红');
});
t('按姓名完整匹配（罗雪 → 1 人）', () => {
  eq(matchStudentsByName(students, '罗雪').length, 1);
  eq(matchStudentsByName(students, '罗雪')[0].name, '罗雪');
});
t('按学号过滤且忽略大小写（b07 → 余长青）', () => {
  const out = matchStudentsByName(students, 'b07');
  eq(out.length, 1);
  eq(out[0].name, '余长青');
});
t('空白/前后空格容忍，无匹配返回空数组', () => {
  eq(matchStudentsByName(students, '   ').length, 4);
  eq(matchStudentsByName(students, ' 张三 ').length, 0);
});

console.log('\n=== 弹窗渲染（stub DOM） ===');
// 让 renderStudentMatchList 能在无浏览器环境跑：stub 容器 + 全局候选池
const matchList = { innerHTML: '' };
global.document = { getElementById: id => (id === 'studentMatchList' ? matchList : null) };
global._studentPickerPool = students;
global._studentPickerMark = null;
const renderStudentMatchList = eval('(' + grab('function renderStudentMatchList(q)') + ')');
t('空词渲染全体，行内含姓名与「选择 ›」', () => {
  renderStudentMatchList('');
  if (!matchList.innerHTML.includes('王小明')) throw new Error('缺王小明');
  if (!matchList.innerHTML.includes('余长青')) throw new Error('缺余长青');
  if (!matchList.innerHTML.includes('选择 ›')) throw new Error('缺行尾提示');
  if (!matchList.innerHTML.includes('A01')) throw new Error('缺学号');
});
t('输入过滤后只剩匹配行（罗 → 罗雪 1 行）', () => {
  renderStudentMatchList('罗');
  if (matchList.innerHTML.includes('王小明') || matchList.innerHTML.includes('余长青')) throw new Error('混入无关学生');
  if (!matchList.innerHTML.includes('罗雪')) throw new Error('丢匹配学生');
  const rows = (matchList.innerHTML.match(/class="ss-row"/g) || []).length;
  eq(rows, 1);
});
t('无匹配显示空态提示', () => {
  renderStudentMatchList('zzz');
  if (!matchList.innerHTML.includes('没有匹配')) throw new Error('缺空态文案');
});
t('现任标注：_studentPickerMark 命中行带 ss-mark', () => {
  global._studentPickerMark = 1;
  renderStudentMatchList('');
  global._studentPickerMark = null;
  const row = matchList.innerHTML.match(/class="ss-row"[^]*?<\/div>/)[0];
  if (!row.includes('ss-mark')) throw new Error('现任行缺 ss-mark');
});
t('行点击绑定 pickStudent(数字 id)，不拼接裸姓名（防注入）', () => {
  renderStudentMatchList('');
  if (!matchList.innerHTML.includes('onclick="pickStudent(1)"')) throw new Error('点击绑定缺失');
  if (/<option[^>]*>王小明/.test(matchList.innerHTML)) throw new Error('不应出现旧的 option 直拼');
});
t('v2.17.30 真实事件路径冒烟：输入框值=王 → 名单过滤为 2 行（this 陷阱修复）', () => {
  // 复刻浏览器真实路径：onStudentSearchInput 内部按 id 取输入框值再渲染，不依赖 this
  const inputEl = { value: '王' };
  const prevDoc = global.document, prevPool = global._studentPickerPool;
  global.document = { getElementById: id => (id === 'studentSearchInput' ? inputEl : (id === 'studentMatchList' ? matchList : null)) };
  global._studentPickerPool = students;
  global._studentPickerMark = null;
  const onStudentSearchInput = eval('(' + grab('function onStudentSearchInput()') + ')');
  onStudentSearchInput();
  global.document = prevDoc; global._studentPickerPool = prevPool;
  const rows = (matchList.innerHTML.match(/class="ss-row"/g) || []).length;
  eq(rows, 2);   // 王小明 / 王小红
  if (matchList.innerHTML.includes('罗雪')) throw new Error('混入无关学生');
});

console.log('\n=== 接线与旧 UI 下线 ===');
['refreshStudentPicker', 'pickStudent', 'onStudentSearchInput', 'onStudentSearchKeydown', 'renderStudentMatchList', 'openCommitteeSelect'].forEach(fn => {
  t('函数已定义：' + fn, () => {
    if (!new RegExp('function ' + fn + '\\(').test(html)) throw new Error(fn + ' 未定义');
  });
});
t('弹窗 HTML：搜索框 + 匹配列表 + 提示 + 免职/取消（确认按钮已移除）', () => {
  if (!html.includes('id="studentSearchInput"')) throw new Error('搜索框缺失');
  if (!html.includes('id="studentMatchList"')) throw new Error('匹配列表容器缺失');
  if (!html.includes('class="ss-list"')) throw new Error('列表样式类缺失');
  if (!html.includes('class="ss-tip"')) throw new Error('提示行缺失');
  if (!html.includes('id="studentSelectRemove"')) throw new Error('免职按钮缺失');
  if (html.includes('id="studentSelectDropdown"')) throw new Error('旧下拉残留');
  if (html.includes('onclick="confirmStudentSelect()"')) throw new Error('旧的确认按钮未下线');
});
t('confirmStudentSelect 改读 _studentPickerId（不再解析下拉）', () => {
  const fn = grab('function confirmStudentSelect()');
  if (!fn.includes('const studentId = _studentPickerId;')) throw new Error('未改读选择 id');
  if (fn.includes('studentSelectDropdown')) throw new Error('仍在读旧下拉');
});
t('三入口都注入候选池并刷新列表（committee / seating / duty）', () => {
  const c = grab('function openCommitteeSelect(key, currentId)');
  if (!c.includes('_studentPickerPool = state.students.slice()')) throw new Error('任命班委未注入全体候选');
  if (!c.includes('refreshStudentPicker();')) throw new Error('任命班委未刷新列表');
  const s = grab('function seatClick(row, col, studentId)');
  if (!s.includes('_studentPickerPool = state.students.filter')) throw new Error('座位未注入剔除已占座候选');
  if (!s.includes('refreshStudentPicker();')) throw new Error('座位未刷新列表');
  const d = grab('function dutyCellClick(day, area)');
  if (!d.includes('_studentPickerPool = state.students.slice()')) throw new Error('值日未注入候选');
  if (!d.includes('refreshStudentPicker();')) throw new Error('值日未刷新列表');
});
t('样式类就位（ss-row/avatar/name/sub/mark/hint/list/tip）且主题变量驱动', () => {
  ['.ss-row', '.ss-avatar', '.ss-name', '.ss-sub', '.ss-mark', '.ss-hint', '.ss-list', '.ss-tip'].forEach(cls => {
    if (!html.includes(cls)) throw new Error('缺样式 ' + cls);
  });
  if (!html.includes('.ss-name{display:block;font-size:14px;font-weight:600;color:var(--text)')) throw new Error('行名未用主题变量');
});
t('v2.17.1 体检弹窗暗色修复：强制白底防文字隐形', () => {
  if (!html.includes('#creditAuditModal .modal{background:#fff}')) throw new Error('体检弹窗白底规则缺失');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
