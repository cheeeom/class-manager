/* v2.18.4 回归测试：P1（改名跨设备传播 / 原生弹窗全部改模态）+ P2（死代码与重复块清理 / 公共工具收敛）
   覆盖：
     P1-a 目录/大类改名写删除墓碑 → 跨设备合并后旧名不再复活（原「编辑没生效」观感）
     P1-b 业务输入 6 处 prompt + 重置云端口令 prompt 全部改走站内模态 cmPrompt（口令走密码框，不再明文回显）
     P2-a 8 个零引用死函数删除   P2-b 22 条无引用 CSS 删除（动态拼接类名 lv-/tl-/hl- 保留）
     P2-c 调试日志收敛 dbg()（默认静默，?debug=1 / window.__CM_DEBUG / cm_debug=1 开启）
     P2-d duty / seating / 补零 / DPR 画布 四面收敛为公共实现
   运行：node _v2188_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(b)); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + ' 不应包含 ' + JSON.stringify(b)); }
function eq(a, b) { if (a !== b) throw new Error('期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function count(needle) { return html.split(needle).length - 1; }

/* 取完整函数源码：正则锚定「签名 + { ... 行首 }」 */
function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}
/* 取完整函数源码：按花括号配平（可处理 async / 单行） */
function fnBody(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => /^\s*(async\s+)?function\s+/.test(l) && l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return buf.join('\n');
}
/* 单行函数按行取实现（grab 的「行首 }」规则对单行定义无效） */
function oneLine(nameAndArgs) {
  const line = html.split('\n').filter(l => l.indexOf('function ' + nameAndArgs) >= 0)[0];
  if (!line) throw new Error('未找到单行函数 ' + nameAndArgs);
  return eval('(' + line.trim() + ')');
}

/* ==================== 语法与版本 ==================== */
console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.13（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.19\.0</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.19\.0 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.19.0')) throw new Error('SW CACHE_NAME 未更新');
});
t('设置页版本徽标随版 = v2.18.13', () => {
  has(html, '🏷️ v2.19.0</span>', '设置页版本徽标未跟版');
});
t('历史注释保护：v2.18.3 的 P0 修复注释 8 处保留（不随升版盲替）', () => {
  eq(count('v2.18.3'), 8);
  has(html, "{ key:'punishments', def:function(){ return []; }, cfs:1, ms:'punishments' },   // v2.18.3 处分记录");
  has(html, "{ key:'nextPunishId', def:1, cfs:1, ms:'max1' },   // v2.18.3");
  has(html, '处分记录补入同步链路：此前漏加 → buildCloudPayload 按本表过滤时从不带它上传');
});
t('设置页 notes 更新为本版条目（弹窗改造 / 改名跨设备 / 代码清理 / 调试静默）', () => {
  has(html, '原生弹窗全部换成站内模态', '缺弹窗改造说明');
  has(html, '修复原因目录改名不跨设备传播', '缺改名跨设备说明');
  has(html, '删除 8 个零引用函数与 22 条无引用 CSS 规则', '缺代码清理说明');
  has(html, '调试日志默认静默（地址栏加 ?debug=1 打开）', '缺调试静默说明');
});

/* ==================== P1-b cmPrompt 通用输入模态 ==================== */
console.log('\n=== P1-b 通用输入模态（替代原生 prompt） ===');
t('模态骨架齐：标题/标签/输入/确认/提示/错误/取消/确定', () => {
  ['id="cmPromptModal"', 'id="cmPromptTitle"', 'id="cmPromptLabel"', 'id="cmPromptInput"',
   'id="cmPromptConfirmWrap"', 'id="cmPromptConfirmLabel"', 'id="cmPromptConfirmInput"',
   'id="cmPromptHint"', 'id="cmPromptError"', 'cmPromptCancel()', 'cmPromptSubmit()']
    .forEach(s => has(html, s, '模态缺 ' + s));
});
t('确认框为密码框（原生 prompt 会明文回显口令）', () => {
  has(html, 'type="password" id="cmPromptConfirmInput"');
  has(html, 'id="cmPromptConfirmInput" autocomplete="new-password"');
  const b = fnBody('cmPrompt');
  has(b, "inp.type = o.type || 'text'");
  has(b, "wrap.style.display = 'block'");
  has(b, "openModal('cmPromptModal')");
});
t('cmPromptSubmit：两次一致 + 最小长度 + 自定义校验 + onOk 回调', () => {
  const b = fnBody('cmPromptSubmit');
  has(b, "if(again !== val){ cmPromptError('两次输入不一致'); return; }");
  has(b, 'if(o.minLength && val.length < o.minLength)');
  has(b, "if(typeof o.validate === 'function')");
  has(b, "if(typeof o.onOk === 'function') o.onOk(val);");
});
t('键盘：Enter 提交 / Escape 取消（与全站模态一致）', () => {
  const b = fnBody('cmPromptKeydown');
  has(b, "if(e.key === 'Enter')");
  has(b, "else if(e.key === 'Escape')");
});
t('cmPromptCancel 清空 opts 引用（防上次回调残留）', () => {
  has(fnBody('cmPromptCancel'), '_cmPromptOpts = null;');
});
t('业务输入 6 处已改 cmPrompt（口号 / 新增方向 / 新增大类 / 改名方向 / 改名大类 / 续假）', () => {
  ['editMotto', 'openReasonDirModal', 'openReasonGroupModal', 'catRenameDir', 'catRenameGroup', 'extendLeave']
    .forEach(n => {
      const b = fnBody(n);
      has(b, 'cmPrompt({', n + ' 未走模态');
      notHas(b, 'prompt(', n + ' 仍用原生 prompt');
    });
});
t('重置云端口令改密码模态（不再明文回显）', () => {
  const b = fnBody('resetCloudPwd');
  has(b, "type: 'password'");
  has(b, "confirmLabel: '请再次输入新口令以确认'");
  has(b, 'minLength: 8');
  notHas(b, 'prompt(');
  has(b, 'onOk: resetCloudPwdApply');
});
t('抽出执行体便于测试：extendLeaveApply / resetCloudPwdApply 均已定义并被调用', () => {
  has(html, 'function extendLeaveApply(leave, newEnd){');
  has(html, 'function resetCloudPwdApply(p){');
  has(fnBody('extendLeave'), 'extendLeaveApply(leave, newEnd)');
});
t('全站仅剩 3 处原生 prompt（同步口令 / 确认口令 / GitHub Token），无业务输入', () => {
  eq(count('= prompt('), 3);
  has(html, "var token = prompt('GitHub Token ");
  has(html, "var again = prompt('请再次输入口令以确认：')");
});
t('cmPrompt 调用点 7 处（6 业务 + 重置口令）', () => eq(count('cmPrompt({'), 7));

/* ==================== P1-a 目录改名跨设备传播 ==================== */
console.log('\n=== P1-a 目录改名跨设备传播（删除墓碑） ===');
const cloneReasonCatalog = eval('(' + html.split('\n').filter(l => l.indexOf('function cloneReasonCatalog(') >= 0)[0].trim() + ')');
const mergeReasonCatalog = eval('(' + grab('function mergeReasonCatalog(a, b)') + ')');
const applyCatTombstones = eval('(' + grab('function applyCatTombstones(cat, scores, tomb)') + ')');
const catDelAdd = eval('(' + grab('function catDelAdd(list, key)') + ')');

t('catRenameDir：旧名写墓碑 + 新名清墓碑 + 本地键迁移', () => {
  const b = fnBody('catRenameDir');
  has(b, 'state.reasonCatalog[name] = state.reasonCatalog[oldName];');
  has(b, 'delete state.reasonCatalog[oldName];');
  has(b, "catDeletedAdd('dirs', oldName);");
  has(b, "catDelUndo('dirs', name);");
});
t('catRenameGroup：大类键以「方向|大类」写墓碑', () => {
  const b = fnBody('catRenameGroup');
  has(b, 'state.reasonCatalog[dir][name] = state.reasonCatalog[dir][oldName];');
  has(b, 'delete state.reasonCatalog[dir][oldName];');
  has(b, "catDeletedAdd('groups', dir + '|' + oldName);");
  has(b, "catDelUndo('groups', dir + '|' + name);");
});
t('★ 端到端：A 机改名后，B 机（仍持旧名）合并不再同时出现新旧两份', () => {
  const tomb = { dirs: [], groups: [], reasons: [] };
  catDelAdd(tomb.dirs, '扣分');                     // A 机改名时写入的墓碑
  const devA = { 违规: { 课堂纪律: ['讲话'] }, 加分: { 学习: ['举手'] } };
  const devB = { 扣分: { 课堂纪律: ['讲话'] }, 加分: { 学习: ['举手'] } };
  const merged = applyCatTombstones(mergeReasonCatalog(devB, devA), {}, tomb);
  ok(!merged['扣分'], '旧名「扣分」未被墓碑剔除 → 另一端会同时显示新旧两份');
  ok(merged['违规'], '新名「违规」丢失');
  ok(merged['加分'], '无关方向被误删');
});
t('★ 端到端：大类改名同理（旧大类被墓碑剔除，新大类保留）', () => {
  const tomb = { dirs: [], groups: [], reasons: [] };
  catDelAdd(tomb.groups, '扣分|课堂纪律');
  const devA = { 扣分: { 纪律违规: ['讲话'] } };
  const devB = { 扣分: { 课堂纪律: ['讲话'] } };
  const merged = applyCatTombstones(mergeReasonCatalog(devB, devA), {}, tomb);
  ok(!(merged['扣分'] && merged['扣分']['课堂纪律']), '旧大类未被墓碑剔除');
  ok(merged['扣分'] && merged['扣分']['纪律违规'], '新大类丢失');
});
t('重复改名不产生重复墓碑（catDelAdd 幂等）', () => {
  const list = [];
  catDelAdd(list, 'x'); catDelAdd(list, 'x'); catDelAdd(list, 'y');
  eq(list.join(','), 'x,y');
});

/* ==================== P2-a/P2-b 死代码清理 ==================== */
console.log('\n=== P2-a/P2-b 死代码与死 CSS 清理 ===');
t('8 个零引用死函数已删除', () => {
  ['revertCreditOp', 'cbCreditOf', 'cbStoreSidPick', 'dutySlotsPerWeek',
   'autoDuty', 'clearDuty', 'renderCreditStudentSelect', 'onCreditInputSearch']
    .forEach(n => notHas(html, 'function ' + n + '(', n + ' 仍存在'));
});
t('22 条无引用 CSS 已清理', () => {
  ['.profile-info{', '.pub-boards{', '.student-card{', '.grade-bar{', '.dragover{',
   '.tag-positive{', '.tag-negative{', '.tag-close{', '.student-grid{', '.credit-table{',
   '.data-table{', '.search-row{', '.detail-panel{', '.tag-list{', '.punish-student-row',
   '.motto-quote{', '.hidden-tab', '.table-striped', '.pwa-banner', '.fade-in',
   '.data-table-container'].forEach(s => notHas(html, s, s + ' 未清理'));
});
t('★ 动态拼接类名保留（不可当死码删）', () => {
  has(html, "cls: 'lv-' + t.level", 'lv- 动态档位类被误删');
  has(html, "const typeCls = 'tl-' + t.type;", 'tl- 动态类型类被误删');
  has(html, "const lvCls = 'hl-' + ({校级:1,区级:2,市级:3,省级:4,国家级:5}[h.level]||1);", 'hl- 动态荣誉类被误删');
  has(html, "cls:'lv-top'", 'lv-top 档位类被误删');
});

/* ==================== P2-c 调试开关 ==================== */
console.log('\n=== P2-c 调试日志收敛 dbg() ===');
t('console.log 全部收敛为 dbg()（0 处残留）', () => eq(count('console.log('), 0));
t('warn / error 保留（线上排查靠它们）', () => {
  ok(count('console.warn(') > 0, 'console.warn 被误删');
  ok(count('console.error(') > 0, 'console.error 被误删');
});
t('★ dbg：默认静默；window.__CM_DEBUG / ?debug=1 / cm_debug=1 任一开启才输出', () => {
  const logged = [];
  const con = { log: function () { logged.push([].slice.call(arguments).join(' ')); } };
  const win = { console: con };
  const loc = { search: '' };
  const ls = { getItem: function () { return null; } };
  const dbgFn = new Function('window', 'location', 'localStorage', 'console',
    grab('function dbg()') + '\nreturn dbg;')(win, loc, ls, con);
  dbgFn('a'); eq(logged.length, 0);                                        // 默认静默
  win.__CM_DEBUG = true; dbgFn('b'); eq(logged.length, 1);                  // 显式开关优先
  delete win.__CM_DEBUG; loc.search = '?debug=1'; dbgFn('c'); eq(logged.length, 2);
  loc.search = ''; ls.getItem = function () { return '1'; }; dbgFn('d'); eq(logged.length, 3);
});

/* ==================== P2-d 公共工具收敛 ==================== */
console.log('\n=== P2-d 公共工具收敛 ===');
t('★ defaultDuty() / defaultSeating() 返回全新对象（防共享引用污染）', () => {
  const dd = eval('(' + grab('function defaultDuty()') + ')');
  const ds = oneLine('defaultSeating()');
  const a = dd(), b = dd();
  ok(a !== b, 'defaultDuty 两次调用返回同一引用');
  ['currentWeek', 'schedule', 'waterDuty', 'waterUsedIds', 'waterRound', 'queue', 'cursorId',
   'round', 'servedIds', 'roundLedger', 'lastGenWeek', 'waterCursorId']
    .forEach(k => ok(k in a, 'defaultDuty 缺字段 ' + k));
  ok(Array.isArray(a.schedule) && Array.isArray(a.queue) && Array.isArray(a.roundLedger), '数组字段类型错');
  eq(a.lastGenWeek, -1);
  const s1 = ds(), s2 = ds();
  ok(s1 !== s2, 'defaultSeating 共享引用');
  eq(s1.cols, 8); eq(s1.rows, 5); ok(Array.isArray(s1.seats));
});
t('duty/seating 默认值三站点收敛（对象默认值 / loadData / 彻底重置）', () => {
  eq(count('defaultDuty()'), 4);
  eq(count('defaultSeating()'), 4);
  has(html, "def:function(){ return defaultDuty(); }");
  has(html, "def:function(){ return defaultSeating(); }");
  has(fnBody('loadData'), 'defaultDuty()');
  has(fnBody('loadData'), 'defaultSeating()');
  has(fnBody('clearData'), 'defaultDuty()');
  has(fnBody('clearData'), 'defaultSeating()');
});
t('★ pad2：统一两位补零，三处局部实现收敛', () => {
  const p = oneLine('pad2(v)');
  eq(p(5), '05'); eq(p(12), '12'); eq(p(0), '00');
  eq(count('pad2('), 11);
  has(fnBody('cbFmtTime'), 'pad2(');
  has(fnBody('formatOpTime'), 'pad2(');
  has(fnBody('todayStr'), 'pad2(');
});
t('★ hiDPICanvas：用 setTransform 而非 scale（重复重绘不会累积变换）', () => {
  const savedWin = global.window;
  global.window = { devicePixelRatio: 2 };
  try {
    const fn = eval('(' + grab('function hiDPICanvas(canvas, cssH)') + ')');
    const ops = [];
    const ctx = new Proxy({}, {
      get(t2, k) {
        if (k === 'setTransform' || k === 'scale' || k === 'clearRect') return function () { ops.push(k); };
        return function () {};
      },
      set(t2, k, v) { t2[k] = v; return true; }
    });
    const cv = { width: 0, height: 0, style: {}, getBoundingClientRect: () => ({ width: 560 }), getContext: () => ctx };
    const r = fn(cv, 240);
    eq(cv.width, 1120); eq(cv.height, 480); eq(cv.style.height, '240px');
    eq(r.W, 560); eq(r.H, 240);
    ok(ops.indexOf('setTransform') >= 0, '未用 setTransform');
    ok(ops.indexOf('scale') < 0, '仍在用 scale（重复重绘会逐次累积）');
    ok(ops.indexOf('clearRect') >= 0, '缺清屏');
  } finally { global.window = savedWin; }
});
t('DPR 画布样板收敛：4 图表 + 公示画布就绪 均走 hiDPICanvas', () => {
  eq(count('hiDPICanvas('), 6);
  ['drawDistChart', 'drawRangeChart', 'drawPieChart', 'drawTrendChart', 'pubCanvasReady']
    .forEach(n => has(fnBody(n), 'hiDPICanvas(', n + ' 未走公共画布初始化'));
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
