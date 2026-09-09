/* v2.17.30 回归测试：班委署名身份解析顺序 —— Init 先 loadData 再 applyCommitteeRestrictions，
   身份解析时学生名单已就绪 → 记录署名到人（此前名单为空退化成「通用班委」）。
   运行：node _v2175_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

function extractFn(name) {
  // 花括号配平抽取：从「function name(」所在行起累计，遇到闭合到深度 0 的独立 } 行结束
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
const committeeConfig = eval(html.match(/const committeeConfig = (\[[\s\S]*?\n\]);/)[1]);

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.18.1 版本三处同步 ===');
t('登录页 / 侧栏 / SW CACHE_NAME = v2.18.1', () => {
  if (!/login-version">v2\.18\.1</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.1 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!fs.readFileSync('sw.js', 'utf8').includes('class-manager-v2.18.1')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== Init 顺序回归（v2.17.30 修复点） ===');
const initStart = html.indexOf('/* ==================== Init');
const initEnd = html.indexOf('// Auto-compress legacy oversized schedule image on load');
if (initStart < 0 || initEnd < 0 || initEnd <= initStart) throw new Error('Init 区块边界定位失败');
const initBlock = html.slice(initStart, initEnd);
t('Init 区块内 loadData() 恰好一次（旧的登录门后二次调用已删除）', () => {
  const n = initBlock.split('loadData();').length - 1;
  eq(n, 1, 'loadData() 次数');
});
t('loadData() 先于登录拦截 if 与 applyCommitteeRestrictions()（名单先就绪再解析身份）', () => {
  const iLoad = initBlock.indexOf('loadData();');
  const iGate = initBlock.indexOf("sessionStorage.getItem(SESSION_KEY)");
  const iRest = initBlock.indexOf('applyCommitteeRestrictions();');
  if (iLoad < 0 || iGate < 0 || iRest < 0) throw new Error('Init 区块缺关键调用');
  if (!(iLoad < iGate && iLoad < iRest)) throw new Error('顺序错误：loadData 未先于登录门/身份限制');
  has(initBlock, '// v2.17.30 先加载本地数据', '缺修复注释标记');
});
t('班委分支仍在登录门内执行 applyCommitteeRestrictions（受限视图逻辑未丢）', () => {
  has(initBlock, "if(isCommitteeMode()){", '缺班委模式分支');
  has(initBlock, 'applyCommitteeRestrictions();', '缺身份限制调用');
});
t('云端补解析钩子：autoSyncFromCloud 完成后对匿名班委重试身份解析', () => {
  const cStart = html.indexOf('// Auto sync from cloud on page load');
  const cEnd = html.indexOf('// Auto sync when tab becomes visible');
  if (cStart < 0 || cEnd < 0) throw new Error('云同步区块定位失败');
  const block = html.slice(cStart, cEnd);
  has(block, "window.__cmRole === 'committee' && window.__cmIdentity && window.__cmIdentity.anonymous", '缺匿名守卫');
  has(block, 'state.students && state.students.length', '缺名单就绪守卫');
  has(block, 'applyCommitteeRestrictions();', '缺重解析调用');
});

console.log('\n=== resolveCmIdentity 身份解析（名单就绪与否） ===');
var CM_UID_KEY = 'cm_uid';
var sessionStorage = { getItem: function (k) { return k === CM_UID_KEY ? '7' : null; } };
var state = { students: [], committee: {} };
var resolveCmIdentity = extractFn('resolveCmIdentity');
t('名单就绪 + uid 命中任命 → 解析出姓名/岗位（非匿名）', () => {
  state.students = [{ id: 7, name: '王小明' }];
  state.committee = { banzhang: 7, jilv: 3 };
  const idt = resolveCmIdentity();
  eq(idt.name, '王小明');
  eq(idt.post, '班长');
  eq(idt.anonymous, false);
});
t('多重任命 → post 以 / 连接', () => {
  state.committee = { banzhang: 7, jilv: 7 };
  const idt = resolveCmIdentity();
  eq(idt.post, '班长/纪律委员');
  state.committee = { banzhang: 7, jilv: 3 };
});
t('名单为空（旧 bug 场景）→ 匿名：证明 loadData 必须先于身份解析', () => {
  state.students = [];
  const idt = resolveCmIdentity();
  eq(idt.anonymous, true);
  eq(idt.name, '');
  state.students = [{ id: 7, name: '王小明' }];   // 还原
});
t('uid 未命中（学生被删/未选身份）→ 匿名', () => {
  sessionStorage.getItem = function (k) { return k === CM_UID_KEY ? '999' : null; };
  const idt = resolveCmIdentity();
  eq(idt.anonymous, true);
  sessionStorage.getItem = function (k) { return k === CM_UID_KEY ? '7' : null; };
});

console.log('\n=== 用户可见链路：选身份 → 加分/扣分 → 记录署名到人 ===');
// 抽出的函数闭包绑定模块级作用域，window / 依赖须放顶层（回调内 var 局部声明对 eval 出的函数不可见）
var window = {};
var ensureCreditBase = function () {};
t('名单就绪下班委操作：op.by=cm 且 byName/byPost = 所选身份（不再「通用班委」）', () => {
  state.students = [{ id: 7, name: '王小明', creditBase: 100, credit: 100 }];
  state.committee = { banzhang: 7 };
  state.nextOpId = 1; state.operations = []; state.reasons = ['其他'];
  window.__cmRole = 'committee';
  window.__cmIdentity = resolveCmIdentity();
  const applyCreditDelta = extractFn('applyCreditDelta');
  const op = applyCreditDelta(state.students[0], -3, '迟到');
  eq(op.by, 'cm');
  eq(op.byName, '王小明');
  eq(op.byPost, '班长');
  eq(state.operations[0].byName, '王小明');
});
t('教师操作不受影响（无 by 字段）', () => {
  state.nextOpId = 100; state.operations = [];
  const applyCreditDelta = extractFn('applyCreditDelta');
  delete window.__cmRole; delete window.__cmIdentity;
  const op = applyCreditDelta(state.students[0], 2, '作业优秀');
  eq(op.by, undefined);
  eq(op.byName, undefined);
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
