// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
const V = (function () {
  try {
    var m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(require('fs').readFileSync(require('path').join(__dirname, 'sw.js'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
if (!V) throw new Error('[版本无关化] 未能从 sw.js 反推版本号（CACHE_NAME 缺失或路径不对）');
/* 本版 回归测试：两个手机端问题的修复 ——
 * ① 请假条窄屏「要左右滑动」：680 断点的 .leave-grid 用裸 1fr（= minmax(auto,1fr)），
 *    轨道下限 = grid item 的最小内容宽度；而卡片里 .leave-hist 是 white-space:nowrap，
 *    它的最小内容宽度就是整段历史流水的宽度（实测两条续假并排 = 407px）⇒ 轨道被撑到 440px、
 *    比容器（336px）还宽 ⇒ .content 出现横向滚动条。
 *    ⇒ 三处都要动：轨道 minmax(0,1fr) + item(.leave-card) min-width:0 + 元凶(.leave-hist) min-width:0。
 * ② 切模块回主页课程表不显示：.content 是全站唯一滚动容器，navigateTo 从不重置它
 *    ⇒ 从翻过的长页面（请假/德育/座位）切回首页时把上一页 scrollTop 原样带过来，
 *    首页最上面的课程表已在视口之上（实测 scrollTop=700 ⇒ 课程表 rect.top=-520）；
 *    再从短页面切回来时 scrollTop 被浏览器夹回 0 又正常 ⇒ 时好时坏、循环出现。
 * 运行：node _v3001_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + `不应出现 ${JSON.stringify(b)}`); }

/* 按函数名切出源码（大括号配平，能带出多行函数） */
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
  return buf.join('\n');
}
/* 取某条 CSS 规则（从选择器到第一个 }） */
function cssRule(sel, from) {
  const i = html.indexOf(sel, from || 0);
  if (i < 0) return '';
  return html.slice(i, html.indexOf('}', i) + 1);
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== ① 请假卡窄屏不被 nowrap 长文本撑破 ===');
const GRID_680 = '@media(max-width:680px){.leave-grid{grid-template-columns:minmax(0,1fr);gap:8px}}';
t('680 断点轨道用 minmax(0,1fr)（裸 1fr 的 auto 下限会被内容撑破容器）', () => {
  has(html, GRID_680, '手机断点仍是裸 1fr');
});
t('裸 1fr 的老写法已彻底清除（负向断言，防回退）', () => {
  notHas(html, '{.leave-grid{grid-template-columns:1fr;gap:8px}}', '老写法残留');
});
t('基础三列与 ≤1100 两列仍用 minmax(0,1fr)（本次只该动 680 那条）', () => {
  has(html, '.leave-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}');
  has(html, '@media(max-width:1100px){.leave-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}');
});
t('三个断点的源序没被打乱（768 < 1100 < 680：680 靠源序胜出，手机才是 1 列）', () => {
  const i768 = html.indexOf('@media(max-width:768px){');
  const i1100 = html.indexOf('@media(max-width:1100px){.leave-grid');
  const i680 = html.indexOf('@media(max-width:680px){.leave-grid');
  if (!(i768 >= 0 && i1100 >= 0 && i680 >= 0)) throw new Error('断点定位失败');
  if (!(i768 < i1100)) throw new Error('768 未排在最前：' + i768 + '/' + i1100);
  if (!(i1100 < i680)) throw new Error('1100 未排在 680 之前：' + i1100 + '/' + i680);
});
const cardRule = cssRule('.leave-card{\n  display:flex;flex-direction:column');
t('能定位 .leave-card 主规则（避开 768 断点里的同名紧凑规则）', () => {
  if (!cardRule) throw new Error('定位失败');
  has(cardRule, 'display:flex;flex-direction:column', '不再是 flex column');
});
t('★ .leave-card 显式 min-width:0（grid item 的 min-width:auto 同样取最小内容宽度）', () => {
  has(cardRule, 'min-width:0', 'item 侧没兜住 ⇒ 光改轨道仍会溢出');
  has(cardRule, 'min-width:0', 'min-width:0 缺失');
});
t('★ .leave-hist 加 min-width:0（nowrap 元凶，它就是最小内容宽度的来源）', () => {
  const r = cssRule('.leave-hist{');
  if (!r) throw new Error('未找到 .leave-hist 规则');
  has(r, 'white-space:nowrap', '不再是 nowrap（本次修复的前提变了，需重核）');
  has(r, 'text-overflow:ellipsis', '省略号丢了');
  has(r, 'min-width:0', 'min-width:0 缺失');
});
t('卡片排版没被顺手改坏（flex column / foot margin-top:auto / 原因两行截断 / 移动端字号仍收）', () => {
  has(html, '.leave-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:4px}');
  const r = cssRule('.leave-reason{');
  has(r, '-webkit-line-clamp:2', '原因不再限两行');
  has(html, '.leave-student{font-size:16px}', '移动端姓名未收字号');
});
t('请假卡渲染结构未动（leave-grid 包裹 + 历史用具名类）', () => {
  has(html, "'<div class=\"leave-grid\">' + sorted.map(l => {");
  has(html, 'class="leave-hist"');
});

console.log('\n=== ② 切页重置滚动位置（.content 是全站唯一滚动容器）===');
const navSrc = extractFn('navigateTo');
t('navigateTo 已加切页重置：先读「当前 active 的页」，再判是否真的换页', () => {
  has(navSrc, "var _prevPageEl = document.querySelector('.page.active');", '没读当前页');
  has(navSrc, "if(!_prevPageEl || _prevPageEl.id !== 'page-' + page){", '没做「真的换页」判断');
});
t('重置动作齐备：.content.scrollTop = 0 + window.scrollTo(0,0)', () => {
  has(navSrc, "var _scrollBox = document.getElementById('content');", '没拿滚动容器');
  has(navSrc, "if(_scrollBox) _scrollBox.scrollTop = 0;", '没重置 .content');
  has(navSrc, 'window.scrollTo(0, 0);', '没兜底 window');
});
t('白名单拦截仍在重置之前（越权页提前 return，不会顺手改滚动）', () => {
  const iGuard = navSrc.indexOf("COMMITTEE_PAGES.indexOf(page) < 0");
  const iReset = navSrc.indexOf("_scrollBox.scrollTop = 0");
  if (iGuard < 0) throw new Error('白名单拦截缺失');
  if (iReset < 0) throw new Error('重置缺失');
  if (!(iGuard < iReset)) throw new Error('拦截未排在重置之前：' + iGuard + '/' + iReset);
});

/* ---- 真跑 navigateTo：假 document / 假 window，验「换页重置、同页不动」---- */
function runNavigateTo(setup) {
  const st = { cur: null, scrollTo: 0 };
  const box = { scrollTop: 0 };
  const noop = () => {};
  const elStub = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
                          dataset: {}, style: {}, textContent: '', innerHTML: '' });
  const doc = {
    querySelector: (sel) => (sel === '.page.active' ? (st.cur ? { id: st.cur } : null) : null),
    querySelectorAll: () => [],
    getElementById: (id) => (id === 'content' ? box : elStub()),
  };
  const win = { __cmRole: 'teacher', scrollTo: () => { st.scrollTo++; } };
  const names = ['window', 'document', 'COMMITTEE_PAGES', 'pageTitles', 'showToast',
    'renderDashboard', 'renderStudents', 'initStudentTabIndicator', 'renderCommittee', 'renderDorm',
    'syncInlineSeatInputs', 'renderSeating', 'renderDuty', 'renderDutyToday', 'renderWaterDuty',
    'renderDutyProgress', 'renderPunishments', 'renderAttendance', 'renderRollCall', 'renderGrades',
    'renderTodo', 'renderCreditsPage', 'renderPublicity', 'renderAnalytics', 'renderNotices',
    'renderProfiles', 'renderWorkLogs', 'renderHonors', 'renderBankPage', 'renderSettings',
    'closeMoreDrawer'];
  const vals = names.map(n => n === 'window' ? win
    : n === 'document' ? doc
      : n === 'COMMITTEE_PAGES' ? ['dashboard', 'attendance']
        : n === 'pageTitles' ? {}
          : noop);
  const fn = new Function(...names, 'return ' + navSrc)(...vals);
  setup(st, box, win);
  fn(setup.page);
  return { st, box };
}
t('★ 真跑：换页（请假 → 首页）时 scrollTop 归 0，且 window.scrollTo 被调用', () => {
  const r = runNavigateTo(Object.assign(function (st, box) { st.cur = 'page-attendance'; box.scrollTop = 700; },
    { page: 'dashboard' }));
  eq(r.box.scrollTop, 0, '换页未重置 .content.scrollTop');
  eq(r.st.scrollTo, 1, 'window.scrollTo 调用次数');
});
t('★ 真跑：同页再进（renderAll/refreshData/跨标签合并的路径）不得把位置弹回顶部', () => {
  const r = runNavigateTo(Object.assign(function (st, box) { st.cur = 'page-dashboard'; box.scrollTop = 700; },
    { page: 'dashboard' }));
  eq(r.box.scrollTop, 700, '同页被误重置 ⇒ 同步一次就把用户甩回顶部');
  eq(r.st.scrollTo, 0, 'window.scrollTo 不该被调用');
});
t('★ 真跑：首屏还没有 active 页时（null）按「换页」处理，同样归 0', () => {
  const r = runNavigateTo(Object.assign(function (st, box) { st.cur = null; box.scrollTop = 500; },
    { page: 'dashboard' }));
  eq(r.box.scrollTop, 0, '无 active 页时未重置');
  eq(r.st.scrollTo, 1, 'window.scrollTo 调用次数');
});
t('★ 真跑：班委越权页被白名单提前 return，滚动位置一点不动（顺序护栏）', () => {
  const r = runNavigateTo(Object.assign(function (st, box, win) {
    st.cur = 'page-attendance'; box.scrollTop = 700; win.__cmRole = 'committee';
  }, { page: 'seating' }));
  eq(r.box.scrollTop, 700, '越权页不该动滚动位置');
  eq(r.st.scrollTo, 0, 'window.scrollTo 不该被调用');
});
t('.content 仍是全站唯一滚动容器（本次修复的前提）', () => {
  has(html, '.content{flex:1;overflow-y:auto;padding:24px;position:relative}');
  has(html, '<div class="content" id="content">');
});

console.log('\n=== 版本标记 ===');
t('版本无关化护栏：sw.js 能解出版本号、index.html 与 sw.js 同版', () => {
  const m = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
  if (!m) throw new Error('sw.js 解不出 CACHE_NAME 版本');
  if (!new RegExp(m[1].replace(/\./g, '\\.')).test(html)) throw new Error('index.html 未出现 ' + m[1]);
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
