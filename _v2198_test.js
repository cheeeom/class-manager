/* v2.18.14 回归测试：JSON 导入改「覆盖式合并」修复荣誉复活 ——
 * ① mergeImportData 纯函数：本机为底 + 备份同步字段覆盖
 * ② 删除墓碑（honorDeleted 取大 / catDeleted 并集 / catDeletedAt·catRevived 取大）不被旧备份擦除
 * ③ ★复活场景复现：本机已删荣誉 + 旧备份含该荣誉 → 导入后仍被墓碑过滤
 * ④ 备份未提及的字段（leaves/exams/todos/notices/creditBank/customDorms 等）原样保留
 * 运行：node _v2198_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

function extractFn(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return eval('(' + buf.join('\n') + ')');
}
// CLOUD_SYNC_FIELDS 是多行 const 声明，按行切片提取
const csfStart = html.split('\n').findIndex(l => l.indexOf('const CLOUD_SYNC_FIELDS = [') >= 0);
if (csfStart < 0) throw new Error('未找到 CLOUD_SYNC_FIELDS');
const csfEnd = html.split('\n').findIndex((l, i) => i >= csfStart && l.indexOf('];') >= 0);
const CLOUD_SYNC_FIELDS = eval('(' + html.split('\n').slice(csfStart, csfEnd + 1).join('\n').replace('const CLOUD_SYNC_FIELDS = ', '').replace(/;\s*$/, '') + ')');

const mergeTsMap = extractFn('mergeTsMap');
const cloneCatDeleted = extractFn('cloneCatDeleted');
const mergeImportData = extractFn('mergeImportData');

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== ① ★ 复活场景：本机已删荣誉 + 旧备份含该荣誉 ===');
t('导入后墓碑保留 → 模拟 loadData 过滤 → 荣誉不再出现', () => {
  const ts = 1700000000000;
  const prev = {
    students: [{ id: 1, name: '张三', sid: 'S0001', tags: [] }],
    honors: [],
    honorDeleted: { 3: ts },                     // 本机删除时登记的墓碑
    leaves: [{ id: 1, studentId: 1 }],           // 备份时代的备份没有这些新字段
    creditBank: { ledger: [] },
    customDorms: ['6栋-901室']
  };
  const backup = {
    students: [{ id: 1, name: '张三', sid: 'S0001', tags: [] }, { id: 2, name: '李四', sid: 'S0002', tags: [] }],
    honors: [{ id: 3, title: '示例荣誉-文明班级', date: '2026-09-01', scope: '集体', level: '校级', persons: [], desc: '' }],
    nextHonorId: 4
    // 旧备份：没有 honorDeleted / leaves / creditBank / customDorms
  };
  const merged = mergeImportData(backup, prev);
  eq(merged.honorDeleted[3], ts, '本机墓碑被旧备份擦掉了');
  eq(merged.leaves.length, 1, '备份没提的 leaves 应保留本机');
  eq(merged.creditBank.ledger.length, 0, '备份没提的 creditBank 应保留本机');
  eq(merged.customDorms[0], '6栋-901室', '备份没提的 customDorms 应保留本机');
  eq(merged.students.length, 2, '备份里的 students 覆盖本机');
  eq(merged.honors.length, 1, '备份荣誉进入 merged（随后被墓碑过滤）');
  // 模拟 loadData 的墓碑自愈过滤
  const live = merged.honors.filter(h => h && !merged.honorDeleted[h.id]);
  eq(live.length, 0, '★ 已删荣誉复活了！');
});

console.log('\n=== ② 墓碑不被旧备份回滚 ===');
t('备份带 honorDeleted → 与本机取大合并', () => {
  const prev = { honorDeleted: { 3: 2000, 5: 9000 } };
  const backup = { honorDeleted: { 3: 3000, 7: 100 } };
  const m = mergeImportData(backup, prev);
  eq(m.honorDeleted[3], 3000, '取大');
  eq(m.honorDeleted[5], 9000, '本机独有保留');
  eq(m.honorDeleted[7], 100, '备份独有并入');
});
t('catDeleted 并集 + catDeletedAt/catRevived 取大', () => {
  const prev = { catDeleted: { dirs: ['纪律'], groups: [], reasons: ['迟到'] }, catDeletedAt: { '纪律': 100 }, catRevived: { '迟到': 500 } };
  const backup = { catDeleted: { dirs: ['卫生'], groups: ['纪律|课堂'], reasons: [] }, catDeletedAt: { '纪律': 300, '卫生': 200 }, catRevived: { '迟到': 900 } };
  const m = mergeImportData(backup, prev);
  eq(m.catDeleted.dirs.sort().join('|'), '卫生|纪律', 'dirs 并集');
  eq(m.catDeleted.groups.join('|'), '纪律|课堂', 'groups 并集');
  eq(m.catDeleted.reasons.join('|'), '迟到', 'reasons 保留');
  eq(m.catDeletedAt['纪律'], 300, 'catDeletedAt 取大');
  eq(m.catDeletedAt['卫生'], 200, 'catDeletedAt 备份并入');
  eq(m.catRevived['迟到'], 900, 'catRevived 取大');
});

console.log('\n=== ③ 白名单边界 ===');
t('备份里的非同步字段（垃圾/本地偏好）不进入 merged', () => {
  const prev = { students: [], cm_sync_pwd: '不该进来', wipeAt: 111 };
  const backup = { students: [{ id: 1, name: '王五', tags: [] }], evilKey: 'x', gh_sync_token: 'y' };
  const m = mergeImportData(backup, prev);
  eq(m.students.length, 1, '同步字段覆盖');
  eq(m.evilKey, undefined, '垃圾键被过滤');
  eq(m.gh_sync_token, undefined, 'token 类键被过滤');
  eq(m.wipeAt, 111, '本机字段保留');
});
t('备份没有 students 键时不覆盖本机', () => {
  const prev = { students: [{ id: 1, name: '张三', tags: [] }] };
  const m = mergeImportData({ honors: [] }, prev);
  eq(m.students.length, 1, '本机 students 保留');
});
t('prevData 为空（首次导入/空库）不炸', () => {
  const m = mergeImportData({ students: [{ id: 1, name: '张三', tags: [] }] }, null);
  eq(m.students.length, 1, '空库导入正常');
  eq(m.honorDeleted && Object.keys(m.honorDeleted).length, 0, '墓碑初始化为空对象');
});

console.log('\n=== ④ UI 接线 ===');
t('handleImportFile 使用 mergeImportData + prevData', () => {
  has(html, 'const merged = mergeImportData(d, prevData);', '导入走新合并函数');
  has(html, "try{ prevData = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }catch(e2){ prevData = {}; }", 'prevData 读取');
  has(html, '(merged.students || []).forEach(s => {', 'tags 兜底防空数组崩');
  if (html.indexOf('// Merge with defaults for new fields') >= 0) throw new Error('旧白名单块残留');
});

console.log('\n=== ⑤ 版本与历史注释 ===');
t('版本标记统一 v2.18.14', () => {
  has(html, '<div class="login-version">v2.18.14</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.14 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.14</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-v2.18.14'", 'SW');
});
t('设置页「近版更新速览」新增本版条目（旧条不删）', () => {
  has(html, '导入改「覆盖式合并」', '缺 v2.18.14 notes 条目');
  has(html, '新增「📊 批量导入学生表格」', 'v2.18.13 旧条被删');
  has(html, '删除的荣誉（含示例荣誉）不再过段时间自己复活', 'v2.18.12 旧条被删');
});
t('历史注释不被波及（v2.18.13 引入版注释保持原样）', () => {
  has(html, '// v2.18.13 表格分流：.xlsx/.csv 走学生表格导入，.json 走原备份导入', '历史注释被改动');
  has(html, '/* ==================== v2.18.13 批量导入学生表格（.xlsx / .csv，零依赖内置解析） ==================== */', '历史注释被改动');
  has(html, "// v2.18.11 纯本地模式：停用自动推送与全部同步弹窗", '历史注释被改动');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
