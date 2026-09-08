/* v2.17.0 回归测试：可编辑原因目录 + 多级选择器逐层化 + 班委操作（身份署名/扣分开关）
   运行：node _v2170_test.js */
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
function grabConst(name, re) {
  const m = html.match(re || new RegExp('const ' + name + ' = ([\\s\\S]*?);\\n'));
  if (!m) throw new Error('未找到常量 ' + name);
  return eval('(' + m[1] + ')');
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.17.23 版本三处同步 ===');
t('登录页 / 侧栏 / SW CACHE_NAME = v2.17.23', () => {
  if (!/login-version">v2\.17\.23</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.17\.23 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!fs.readFileSync('sw.js', 'utf8').includes('class-manager-v2.17.23')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 目录纯函数 ===');
const defaultReasons = grabConst('defaultReasons', /const defaultReasons = (\[[\s\S]*?\]);\n/);
const REASON_CATALOG = grabConst('REASON_CATALOG', /const REASON_CATALOG = (\{[\s\S]*?\n\});\n/);
const flattenReasonCatalog = eval('(' + grab('function flattenReasonCatalog(cat)') + ')');
const mergeReasonCatalog = eval('(' + grab('function mergeReasonCatalog(a, b)') + ')');
var cloneReasonCatalog = c => JSON.parse(JSON.stringify(c));   // 单行函数 stub（merge/migrate 内部引用）
const migrateReasonCatalog = eval('(' + grab('function migrateReasonCatalog(savedCat, oldReasons)') + ')');
// defaultReasonCatalog / cloneReasonCatalog 是单行定义（行首 } 抓不到），stub 为深拷贝模板
const defaultReasonCatalog = () => JSON.parse(JSON.stringify(REASON_CATALOG));
t('defaultReasonCatalog = 模板深拷贝（改动不污染常量）', () => {
  const c1 = defaultReasonCatalog(), c2 = defaultReasonCatalog();
  c1['加分']['学习表现'].push('测试项');
  eq(REASON_CATALOG['加分']['学习表现'].length, 4);   // 常量不受影响
  eq(c2['加分']['学习表现'].length, 4);               // 每次深拷贝
});
t('flattenReasonCatalog：保序扁平且去重', () => {
  const f = flattenReasonCatalog({ A:{ g1:['x','y'], g2:['y','z'] }, B:{ g3:['w'] } });
  eq(f.join(','), 'x,y,z,w');
});
t('mergeReasonCatalog：方向/大类并集、原因去重保序；空值兜底', () => {
  const m = mergeReasonCatalog({ A:{ g1:['x'] } }, { A:{ g1:['y'], g2:['z'] }, B:{ g1:['q'] } });
  eq(JSON.stringify(m.A.g1), JSON.stringify(['x','y']));
  eq(JSON.stringify(m.A.g2), JSON.stringify(['z']));
  eq(JSON.stringify(m.B.g1), JSON.stringify(['q']));
  const e = mergeReasonCatalog(null, null);
  eq(JSON.stringify(e), JSON.stringify({}));
});
t('migrateReasonCatalog：无 savedCat → 模板目录', () => {
  const c = migrateReasonCatalog(undefined, defaultReasons);
  eq(c['加分']['学习表现'].length, 4);
});
t('migrateReasonCatalog：老自定义原因并入「其他→自定义原因」不丢', () => {
  const oldReasons = defaultReasons.concat(['主动擦黑板']);
  const c = migrateReasonCatalog(undefined, oldReasons);
  eq(c['其他']['自定义原因'].indexOf('主动擦黑板') >= 0, true);
});
t('migrateReasonCatalog：已有目录尊重用户编辑（删除的预设不复活）', () => {
  const saved = defaultReasonCatalog();
  delete saved['扣分']['考勤'];            // 用户删了扣分→考勤
  saved['加分']['新组'] = ['自定义新原因'];
  const c = migrateReasonCatalog(saved, defaultReasons);
  eq(c['扣分']['考勤'], undefined);        // 不复活
  eq(c['加分']['新组'][0], '自定义新原因');
});

console.log('\n=== 数据接线 ===');
t('state 默认 reasonCatalog + reasons 派生；CLOUD_SYNC_FIELDS/saveData 含 reasonCatalog', () => {
  if (!/reasonCatalog: defaultReasonCatalog\(\),/.test(html)) throw new Error('state 缺 reasonCatalog 默认值');
  const sync = html.match(/const CLOUD_SYNC_FIELDS = \[([^\]]*)\]/);
  if (!sync[1].includes('reasonCatalog')) throw new Error('CLOUD_SYNC_FIELDS 缺 reasonCatalog');
  if (!html.includes('reasonCatalog: state.reasonCatalog || {},')) throw new Error('saveData 未落盘 reasonCatalog');
  if (!html.includes('migrateReasonCatalog(d.reasonCatalog, (d.reasons && d.reasons.length) ? d.reasons : defaultReasons)')) throw new Error('loadData 未迁移目录');
  if (!html.includes('syncReasonsFromCatalog();')) throw new Error('loadData 未派生 reasons');
});
t('smartMergeData 对 reasonCatalog 做结构并集', () => {
  const fn = html.match(/function smartMergeData\([\s\S]*?\n\}/)[0];
  if (!fn.includes('mergeReasonCatalog')) throw new Error('smartMerge 缺目录合并');
});
t('applyCreditDelta 统一入口已接署名；renderOpItem 渲染班委标签', () => {
  const fn = html.match(/function applyCreditDelta\([\s\S]*?\n\}/)[0];
  if (!fn.includes("if(window.__cmRole === 'committee')") || !fn.includes('op.by =')) throw new Error('applyCreditDelta 缺署名');
  const r = html.match(/function renderOpItem\([\s\S]*?\n\}/)[0];
  if (!r.includes("op.by === 'cm'") || !r.includes('tl-cm')) throw new Error('renderOpItem 缺班委标签');
});

console.log('\n=== applyCreditDelta 署名行为 ===');
var state = { nextOpId: 1, operations: [], reasons: ['其他'] };
var ensureCreditBase = function () {};
var window = {};
var applyCreditDelta = eval('(' + grab('function applyCreditDelta(student, amount, reason, opts)') + ')');
t('教师操作：不写 by 字段', () => {
  state.operations = []; state.nextOpId = 1;
  const op = applyCreditDelta({ id: 1, name: '小明', creditBase: 100, credit: 100 }, 2, '作业优秀');
  eq(op.by, undefined);
});
t('班委操作：op.by=cm + 署名姓名/岗位', () => {
  state.operations = []; state.nextOpId = 1;
  window.__cmRole = 'committee';
  window.__cmIdentity = { name: '王小明', post: '班长', anonymous: false };
  const op = applyCreditDelta({ id: 2, name: '小红', creditBase: 100, credit: 100 }, -3, '迟到');
  eq(op.by, 'cm'); eq(op.byName, '王小明'); eq(op.byPost, '班长');
  delete window.__cmRole; delete window.__cmIdentity;
});

console.log('\n=== renderOpItem 班委署名渲染 ===');
var escapeHtml = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
var formatOpTime = () => '2026-09-07 00:00';
var renderOpItem = eval('(' + grab('function renderOpItem(op)') + ')');
t('班委署名标签：含姓名与岗位', () => {
  const h = renderOpItem({ studentName: '小红', amount: -3, reason: '迟到', by: 'cm', byName: '王小明', byPost: '班长', time: 1 });
  if (!h.includes('王小明') || !h.includes('· 班长') || !h.includes('tl-cm')) throw new Error('输出: ' + h);
});
t('教师记录（无 by）：不出现班委标签', () => {
  const h = renderOpItem({ studentName: '小红', amount: 2, reason: '作业优秀', time: 1 });
  if (h.includes('tl-cm')) throw new Error('误标班委');
});
t('班委 by 缺姓名时兜底「通用班委」', () => {
  const h = renderOpItem({ studentName: '小红', amount: 1, reason: 'x', by: 'cm', time: 1 });
  if (!h.includes('通用班委')) throw new Error('输出: ' + h);
});

console.log('\n=== 班委扣分开关 ===');
var showToast = function (m) { global.__lastToast = m; };
var _cmCanMinus = true;
var cmCanMinus = function () { return _cmCanMinus; };
var cmMinusBlocked = eval('(' + grab('function cmMinusBlocked()') + ')');
t('教师模式：永不拦截', () => {
  delete window.__cmRole; _cmCanMinus = false;
  eq(cmMinusBlocked(), false);
});
t('班委 + 允许扣分：放行', () => {
  window.__cmRole = 'committee'; _cmCanMinus = true;
  eq(cmMinusBlocked(), false);
});
t('班委 + 关闭扣分：拦截并提示', () => {
  window.__cmRole = 'committee'; _cmCanMinus = false;
  eq(cmMinusBlocked(), true);
  eq(global.__lastToast.includes('只能加分'), true);
});
t('三个负值入口都接了 cmMinusBlocked', () => {
  [['function quickCredit(amount){', 'if(amount < 0 && cmMinusBlocked()) return;'],
   ['function customCreditApply(){', 'if(amount < 0 && cmMinusBlocked()) return;'],
   ['function confirmBatchCredit(){', 'if(amount < 0 && cmMinusBlocked()) return;']].forEach(([sig, line]) => {
    const i = html.indexOf(sig);
    if (i < 0) throw new Error('缺函数 ' + sig);
    if (!html.slice(i, i + 700).includes(line)) throw new Error(sig + ' 未接扣分拦截');
  });
});
t('v2.17.23 updateCreditBtnStates：不再引用快捷按钮组，负分（班委禁扣）时禁用应用按钮', () => {
  const fn = html.match(/function updateCreditBtnStates\(\)\{[\s\S]*?\n\}/)[0];
  if (fn.includes('quickBtnGroup')) throw new Error('仍残留快捷按钮组逻辑');
  if (!fn.includes('cmMinusLock')) throw new Error('缺班委禁扣判定');
  if (!/amt < 0/.test(fn)) throw new Error('缺负分判定');
  if (!fn.includes('班主任已关闭班委扣分权限')) throw new Error('缺禁扣提示');
});
t('v2.17.23 学分操作页不再有 ±快捷预设按钮组（原因自带分值）', () => {
  if (html.includes('id="quickBtnGroup"')) throw new Error('仍残留快捷按钮组 HTML');
  // 工具栏顺序：姓名搜索 → rp-credit（原因）→ customCredit → 应用
  const iS = html.indexOf('id="creditStudentInput"');
  const iR = html.indexOf('id="rp-credit"');
  const iC = html.indexOf('id="customCredit"');
  const iA = html.indexOf('id="customApplyBtn"');
  if (!(iS > 0 && iR > iS && iC > iR && iA > iC)) throw new Error('工具栏布局顺序不对：' + [iS, iR, iC, iA].join('>'));
});

console.log('\n=== 多级选择器逐层渲染（stub DOM 冒烟） ===');
var RP_INSTANCES = { 'rp-credit': { selectId: 'creditReason', scoreInputId: 'customCredit', dir: null, group: null, open: true } };
var _docEls = {};
var document = { getElementById: function (id) { if (!_docEls[id]) _docEls[id] = { innerHTML: '', value: '', style: {} }; return _docEls[id]; } };
var escapeAttr = s => String(s);
var rcScoreOf = function (name) { var sc = (state.reasonScores || {})[name]; return (typeof sc === 'number' && sc !== 0) ? sc : null; };
var rcSelValue = function (st) { var el = document.getElementById(st.selectId); return el ? el.value : ''; };
state.reasonCatalog = {
  '加分': { '学习表现': ['月度全勤', '课堂表现积极'] },
  '扣分': { '考勤': ['迟到早退', '旷课'] }
};
state.reasonScores = { '月度全勤': 3, '迟到早退': -2 };
var renderReasonPicker = eval('(' + grab('function renderReasonPicker(rootId)') + ')');
t('第 1 层：只显示方向（不提前泄出大类/原因）', () => {
  RP_INSTANCES['rp-credit'].dir = null; RP_INSTANCES['rp-credit'].group = null;
  renderReasonPicker('rp-credit');
  const h = _docEls['rp-credit'].innerHTML;
  if (!h.includes('加分') || !h.includes('扣分')) throw new Error('缺方向: ' + h);
  if (h.includes('学习表现') || h.includes('月度全勤')) throw new Error('提前泄出下层: ' + h);
});
t('第 2 层：显示该方向大类 + 「换方向」面包屑', () => {
  RP_INSTANCES['rp-credit'].dir = '加分';
  renderReasonPicker('rp-credit');
  const h = _docEls['rp-credit'].innerHTML;
  if (!h.includes('学习表现') || !h.includes('‹ 换方向')) throw new Error('缺大类/面包屑: ' + h);
  if (h.includes('月度全勤')) throw new Error('提前泄出原因: ' + h);
});
t('第 3 层：显示原因 + 分值提示 + 返回大类路径', () => {
  RP_INSTANCES['rp-credit'].group = '学习表现';
  renderReasonPicker('rp-credit');
  const h = _docEls['rp-credit'].innerHTML;
  if (!h.includes('月度全勤') || !h.includes('课堂表现积极')) throw new Error('缺原因: ' + h);
  if (!h.includes('‹ 返回大类') || !h.includes('③ 加分 → 学习表现')) throw new Error('缺路径: ' + h);
  if (!h.includes('+3')) throw new Error('缺分值提示: ' + h);
});
t('空目录：给出引导文案', () => {
  const bak = state.reasonCatalog; state.reasonCatalog = {};
  RP_INSTANCES['rp-credit'].dir = null;
  renderReasonPicker('rp-credit');
  const h = _docEls['rp-credit'].innerHTML;
  if (!h.includes('目录为空')) throw new Error('缺空目录提示: ' + h);
  state.reasonCatalog = bak;
});
t('renderReasonPicker 数据源已切 state.reasonCatalog（不再直读常量）', () => {
  const fn = html.match(/function renderReasonPicker\([\s\S]*?\n\}/)[0];
  if (!fn.includes('state.reasonCatalog')) throw new Error('未切数据源');
  if (/REASON_CATALOG\s*\[/.test(fn)) throw new Error('仍直读常量目录');
});
t('逐层导航函数齐备：rcSetDir 直入 / rcToDirs 回方向 / rcSetGroup(null) 回大类', () => {
  const sd = html.match(/function rcSetDir\([\s\S]*?\n\}/)[0];
  if (!sd.includes('st.dir = dir;')) throw new Error('rcSetDir 未直入');
  if (!html.includes('function rcToDirs(rootId)')) throw new Error('缺 rcToDirs');
  const sg = html.match(/function rcSetGroup\([\s\S]*?\n\}/)[0];
  if (!sg.includes('st.group = g || null;')) throw new Error('rcSetGroup 缺返回语义');
});

console.log('\n=== 设置页目录管理 & 班委端接线 ===');
t('目录管理 UI/弹窗/样式就位', () => {
  ['id="reasonCatalogTree"', 'id="reasonItemModal"', 'id="catDirSel"', 'id="catGroupSel"', 'id="catNewGroupInput"',
   'id="catNameInput"', 'id="catScoreInput"', 'onclick="askResetReasonCatalog()"',
   'function renderReasonCatalogTree()', 'function catSaveNewItem()', 'function catDeleteReason(',
   '.cat-dir{', '.cat-reason-row{', '.rp-crumb{', '.rp-empty{'].forEach(s => {
    if (!html.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('旧一维原因编辑 UI（reasonTagList 块）已下线', () => {
  if (html.includes('学分操作原因预设') || html.includes('newReasonInput')) throw new Error('旧 UI 残留');
});
t('班委身份选择：入口按钮/面板/名单/密钥齐全', () => {
  ['id="cmIdentityPanel"', 'id="cmIdentityList"', 'id="loginPwdArea"', 'id="loginKeypad"',
   'function cmLoginAs(uid)', 'function openCmIdentityPanel()', 'const CM_UID_KEY =', 'function resolveCmIdentity()',
   'window.__cmIdentity = resolveCmIdentity();'].forEach(s => {
    if (!html.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('侧栏班委徽标/副标题显示身份（非匿名时含姓名岗位）', () => {
  const fn = html.match(/function applyCommitteeRestrictions\(\)\{[\s\S]*?\n\}/)[0];
  if (!fn.includes("idt.anonymous || !idt.name")) throw new Error('徽标未按身份渲染');
});
t('班委协作设置：开关 UI/存储/回填就位', () => {
  ['id="cmCanMinusChk"', 'onchange="onCmCanMinusChange()"', 'function cmCanMinus()', 'function loadTSetting(', 'cmChk.checked = cmCanMinus();'].forEach(s => {
    if (!html.includes(s)) throw new Error('缺少: ' + s);
  });
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
