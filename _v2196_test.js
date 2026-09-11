/* v2.18.12 回归测试：① 荣誉墙删除复活修复（honorDeleted 删除墓碑随云同步传播）
 *   根因：smartMergeData 对 honors 按 id 盲并集——本地删除是硬删，云端旧副本每次拉取都把已删荣誉并回来，
 *         推送前合并还会把它带回云端（与 v2.18.8 原因目录问题同类）。
 * ② 寝室管理「➕ 新增寝室」：customDorms 字段支撑空寝室存在；createDormNew 可勾选学生直接入住。
 * 运行：node _v2196_test.js */
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
const smartMergeData = extractFn('smartMergeData');
global.mergeTsMap = extractFn('mergeTsMap');
global.catTombReviveFilter = extractFn('catTombReviveFilter');
global.sortOpsNewestFirst = extractFn('sortOpsNewestFirst');   // operations 合并依赖
global.cloneCatDeleted = extractFn('cloneCatDeleted');         // catDeleted 合并依赖
global.applyCatTombstones = extractFn('applyCatTombstones');   // 无条件调用
global.flattenReasonCatalog = extractFn('flattenReasonCatalog'); // 无条件调用
global.cbMergeBanks = function(a, b){ return a || b || null; }; // 学分银行合并桩（本套不覆盖其行为）
global.DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
global.state = global.state || {};

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== ① 荣誉删除墓碑：五链路 ===');
t('state 默认 / loadData / saveData / CLOUD_SYNC_FIELDS 全就位', () => {
  has(html, 'honorDeleted: {},   // v2.18.12 荣誉删除墓碑', 'state 默认');
  has(html, 'state.honorDeleted = d.honorDeleted || {};', 'loadData 读入');
  has(html, 'honorDeleted: state.honorDeleted || {},', 'saveData 落盘');
  has(html, "'honorDeleted','customDorms'", 'CLOUD_SYNC_FIELDS');
});
t('deleteHonor 删除时登记墓碑；清空数据清墓碑', () => {
  has(html, 'state.honorDeleted[id] = Date.now();', '删除未记墓碑');
  has(html, 'state.honorDeleted = {};   // v2.18.12 清空数据连带清墓碑', '清空数据未清墓碑');
});

console.log('\n=== ② 荣誉合并行为级（★复活事故复现） ===');
t('★ 事故场景：本地已删 A，云端旧副本仍有 A → 合并后不复活', () => {
  const A = { id: 1, title: '示例荣誉-文明班级', date: '2026-09-01', scope: '集体', level: '校级', persons: [], desc: '' };
  const B = { id: 2, title: '示例荣誉-运动会第一', date: '2026-09-02', scope: '集体', level: '市级', persons: [], desc: '' };
  const local = { students: [], operations: [], honors: [], honorDeleted: { 1: 1700000000000 } };
  const remote = { students: [], operations: [], honors: [A, B] };   // 云端还是删除前的旧副本
  const merged = smartMergeData(local, remote);
  eq(merged.honors.some(h => h.id === 1), false, '已删的示例荣誉复活了！');
  eq(merged.honors.some(h => h.id === 2), true, '云端新增荣誉应保留');
  eq(merged.honorDeleted[1], 1700000000000, '墓碑应保留在合并结果');
});
t('删除发生在另一台设备 → 本机合并同样剔除（双向防御）', () => {
  const A = { id: 5, title: '荣誉甲', date: '2026-09-01', scope: '个人', level: '校级', persons: ['张三'], desc: '' };
  const local = { students: [], operations: [], honors: [A] };
  const remote = { students: [], operations: [], honors: [A], honorDeleted: { 5: 1700000000001 } };
  const merged = smartMergeData(local, remote);
  eq(merged.honors.some(h => h.id === 5), false, '他端删除未在本机生效');
});
t('双侧墓碑按 mergeTsMap 取大合并', () => {
  const local = { students: [], operations: [], honors: [], honorDeleted: { 1: 100, 2: 300 } };
  const remote = { students: [], operations: [], honors: [], honorDeleted: { 2: 500, 3: 700 } };
  const merged = smartMergeData(local, remote);
  eq(merged.honorDeleted[1], 100);
  eq(merged.honorDeleted[2], 500);
  eq(merged.honorDeleted[3], 700);
});

console.log('\n=== ③ customDorms：五链路 + 合并 ===');
t('state 默认 / loadData / saveData / CLOUD_SYNC_FIELDS 全就位', () => {
  has(html, 'customDorms: [],    // v2.18.12 手动新增的寝室号', 'state 默认');
  has(html, 'state.customDorms = d.customDorms || [];', 'loadData 读入');
  has(html, 'customDorms: state.customDorms || [],', 'saveData 落盘');
});
t('customDorms 跨设备并集去重', () => {
  const local = { students: [], operations: [], customDorms: ['6栋-801室'] };
  const remote = { students: [], operations: [], customDorms: ['6栋-802室', '6栋-801室'] };
  const merged = smartMergeData(local, remote);
  eq(merged.customDorms.length, 2);
  eq(merged.customDorms.indexOf('6栋-802室') >= 0, true);
});

console.log('\n=== ④ 新增寝室 UI + 行为级 createDormNew ===');
t('寝室页按钮 / 模态 / 三个函数 / 空寝室卡片全部就位', () => {
  has(html, 'onclick="openDormNewModal()"', 'toolbar 按钮');
  has(html, 'id="dormNewModal"', '模态');
  has(html, 'id="dormNewNo"', '寝室号输入');
  has(html, 'id="dormNewKw"', '搜索框');
  has(html, 'id="dormNewCands"', '候选列表');
  has(html, 'function createDormNew(){', '创建函数');
  has(html, 'function deleteCustomDorm(', '删除空寝室函数');
  has(html, '空寝室 · 点击添加成员', '空卡片文案');
  has(html, 'onclick="createDormNew()"', '创建按钮');
});
t('openDorm 支持空自定义寝室（伪 dorm + 删除按钮）', () => {
  has(html, "if((state.customDorms||[]).indexOf(no) < 0) return;", '空寝室兜底判断');
  has(html, 'd = { no: no, members: [] };', '伪 dorm 构造');
  has(html, '暂无成员，用下方「添加学生」入住', '空成员提示');
});
t('★ 行为级：createDormNew 建寝室+入住 2 人（含走读生摘牌、性别补写、customDorms 登记）', () => {
  // 抽取寝室工具函数块（DAY_TAG → fillAllDormGenders 连续区段）+ createDormNew
  const lines = html.split('\n');
  const s1 = lines.findIndex(l => l.indexOf("const DAY_TAG = '走读';") >= 0);
  const s2 = lines.findIndex(l => l.indexOf('function isDayBoarding(') >= 0);
  if (s1 < 0 || s2 < 0 || s2 <= s1) throw new Error('寝室工具函数区段定位失败');
  const dormUtils = lines.slice(s1, s2).join('\n');
  const ti = lines.findIndex(l => l.indexOf('function createDormNew(){') >= 0);
  let te = ti + 1, depth = 0, began = false;
  for (let i = ti; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    if (began && depth === 0) { te = i; break; }
  }
  const createSrc = lines.slice(ti, te + 1).join('\n');
  const toasts = [], saved = [], opened = [], closed = [], rendered = [];
  const state = {
    students: [
      { id: 1, name: '张三', sid: 'S001', tags: ['走读'] },
      { id: 2, name: '李四', sid: 'S002', tags: [] },
      { id: 3, name: '王五', sid: 'S003', tags: ['6栋-801室'] }
    ]
  };
  const documentStub = {
    checked: [{ value: '1' }, { value: '2' }],
    getElementById: id => ({ value: id === 'dormNewNo' ? '6栋-901室' : '', innerHTML: '', textContent: '' }),
    querySelectorAll: sel => sel.indexOf('dormNewCk') >= 0 ? documentStub.checked : []
  };
  const factory = new Function('state', 'document', 'saveData', 'closeModal', 'renderDorm', 'showToast', 'openDorm',
    dormUtils + '\n' + createSrc + '\nreturn createDormNew;');
  const createDormNew = factory(state, documentStub,
    () => saved.push(1), m => closed.push(m), () => rendered.push(1),
    (m, t2) => toasts.push({ m, t: t2 }), no => opened.push(no));
  createDormNew();
  eq(state.students[0].tags.indexOf('走读'), -1, '走读生入住后应摘掉走读标签');
  eq(state.students[0].tags.indexOf('6栋-901室') >= 0, true, '张三未挂新寝室标签');
  eq(state.students[1].tags.indexOf('6栋-901室') >= 0, true, '李四未挂新寝室标签');
  eq(state.students[2].tags.indexOf('6栋-801室') >= 0, true, '未勾选的王五不应被动');
  eq(state.customDorms.indexOf('6栋-901室') >= 0, true, 'customDorms 未登记');
  eq(saved.length, 1, '未落盘');
  eq(opened.indexOf('6栋-901室') >= 0, true, '创建后未打开寝室弹窗');
  eq(toasts.some(x => /已新增 6栋-901室/.test(x.m) && /入住 2 人/.test(x.m)), true, '提示文案不符');
});
t('★ 行为级：寝室号格式校验（非法不落盘不建寝室）', () => {
  const lines = html.split('\n');
  const s1 = lines.findIndex(l => l.indexOf("const DAY_TAG = '走读';") >= 0);
  const s2 = lines.findIndex(l => l.indexOf('function isDayBoarding(') >= 0);
  const dormUtils = lines.slice(s1, s2).join('\n');
  const ti = lines.findIndex(l => l.indexOf('function createDormNew(){') >= 0);
  let te = ti + 1, depth = 0, began = false;
  for (let i = ti; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    if (began && depth === 0) { te = i; break; }
  }
  const createSrc = lines.slice(ti, te + 1).join('\n');
  const toasts = [], saved = [], opened = [];
  const state = { students: [{ id: 1, name: '张三', tags: [] }] };
  const documentStub = {
    checked: [{ value: '1' }],
    getElementById: id => ({ value: id === 'dormNewNo' ? '802' : '', innerHTML: '', textContent: '' }),
    querySelectorAll: () => []
  };
  const factory = new Function('state', 'document', 'saveData', 'closeModal', 'renderDorm', 'showToast', 'openDorm',
    dormUtils + '\n' + createSrc + '\nreturn createDormNew;');
  factory(state, documentStub, () => saved.push(1), () => {}, () => {}, (m, t2) => toasts.push({ m, t: t2 }), no => opened.push(no))();
  eq(saved.length, 0, '非法寝室号不应落盘');
  eq(opened.length, 0, '非法寝室号不应打开弹窗');
  eq(toasts.some(x => x.t === 'error' && /格式不对/.test(x.m)), true, '缺格式错误提示');
  eq(state.customDorms, undefined, '非法寝室号不应登记 customDorms');
});

console.log('\n=== ⑤ 版本与历史注释 ===');
t('版本标记统一 v2.18.13', () => {
  has(html, '<div class="login-version">v2.18.15</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.15 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.15</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-v2.18.15'", 'SW');
});
t('设置页「近版更新速览」新增本版两条（旧条不删）', () => {
  has(html, '删除的荣誉（含示例荣誉）不再过段时间自己复活', '缺荣誉 notes');
  has(html, '寝室管理新增「➕ 新增寝室」', '缺寝室 notes');
  has(html, '新增「📴 纯本地模式」', 'v2.18.11 旧条目被删');
  has(html, '· 修复：往新建大类里添加原因后刷新整组消失', 'v2.18.9 旧条目被删');
});
t('历史注释不被波及（v2.18.9 / v2.18.11 引入版注释保持原样）', () => {
  has(html, "catDelUndo('dirs', dir);   // v2.18.9 同步 revive 所在方向", '历史注释被改动');
  has(html, '// v2.18.11 纯本地模式：停用自动推送与全部同步弹窗', '历史注释被改动');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
