/* v2.20.1 回归测试：学分快速加减分「原因大类」交互修正
 *
 * 旧 bug（老师反馈）：点完原因大类后，鼠标只要从别的大类上划过，原因就自动跟着切换、来回跳。
 * 成因有两层叠加：
 *   ① 大类按钮同时绑了 mouseenter + click，**悬停即切换**；
 *   ② 切换时整体 innerHTML 重渲染 —— 光标下的按钮被换成新元素，新元素再次触发 mouseenter，
 *      于是状态来回抖、已选原因被无谓清空。
 *
 * 本版把状态拆成三层：
 *   _qcGroup = 已锁定的大类（**只有 click 能改**）
 *   _qcHover = 悬停预览的大类（临时态，只决定细则区显示什么，不提交）
 *   悬停路径只切 class + 只重画细则区 → 光标下的按钮不被替换 → 消除抖动
 *
 * 运行：node _v2201_test.js */
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

/* ---------- 从 index.html 抽取被测引擎（真实实现，不是手抄副本） ---------- */
const ENGINE_START = 'function qcMenuData(){';
const ENGINE_END = '/* QC_MENU_ENGINE_END';
const engine = html.slice(html.indexOf(ENGINE_START), html.indexOf(ENGINE_END));

function bodyOf(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('未找到函数 ' + name);
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
}

/* ---------- 极简伪装 DOM：够 qc 引擎用即可 ---------- */
function mkEl(attrs) {
  const cls = new Set();
  const el = {
    _a: attrs || {},
    getAttribute(k) { return el._a[k]; },
    classList: {
      toggle(c, on) { if (on) cls.add(c); else cls.delete(c); },
      contains(c) { return cls.has(c); }
    },
    addEventListener() {}
  };
  return el;
}
function mkMenu() {
  const m = {
    _html: '',
    _cats: [],
    _items: { innerHTML: '' },
    _peek: { innerHTML: '' },
    _h: {},
    addEventListener(type, fn) { (m._h[type] = m._h[type] || []).push(fn); },
    querySelectorAll(sel) { return sel === '.qc-cat' ? m._cats : []; },
    querySelector(sel) {
      if (sel === '.qc-items') return m._items;
      if (sel === '.qc-peek') return m._peek;
      return null;
    },
    fire(type, target) { (m._h[type] || []).forEach(fn => fn({ target: target })); },
    catOf(g) { return m._cats.filter(c => c.getAttribute('data-g') === g)[0]; }
  };
  Object.defineProperty(m, 'innerHTML', {
    get() { return m._html; },
    set(v) {
      m._html = v;
      m._cats = [];
      const re = /class="qc-cat[^"]*"\s+data-g="([^"]*)"/g;
      let x;
      while ((x = re.exec(v))) m._cats.push(mkEl({ 'data-g': x[1] }));
      m._items.innerHTML = '';
      m._peek.innerHTML = '';
    }
  });
  return m;
}
// 伪装事件目标：closest(sel) 只在 sel 匹配时返回该元素
const tgt = (el, sel) => ({ closest(s) { return s === sel ? el : null; } });

// 每个用例一套全新沙箱（状态互不污染）
function sandbox() {
  const menu = mkMenu();
  const store = {};
  const state = {
    reasonCatalog: {
      '加分': { '学习表现': ['作业优秀', '课堂发言'], '班级服务': ['主动值日'] },
      '扣分': { '课堂纪律': ['扰乱课堂'] }
    },
    reasonScores: { '作业优秀': 2, '课堂发言': 1, '主动值日': 3, '扰乱课堂': -2 }
  };
  const api = new Function(
    'document', 'localStorage', 'escapeHtml', 'state', 'qcDirName', 'qcUpdatePreview',
    'var _qcSign="plus",_qcGroup=null,_qcReason=null,_qcHover=null,_qcMenuBound=false;\n' +
    engine + '\n' +
    'return { render:qcRenderMenu, hover:qcSetHover, commit:qcCommitGroup, pick:qcPickReason,' +
    ' snap:function(){return {g:_qcGroup,h:_qcHover,r:_qcReason};} };'
  )(
    { getElementById(id) { return id === 'qcMenu' ? menu : null; } },
    { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    s => String(s),
    state,
    () => '加分',
    () => {}
  );
  return { menu, api, store };
}
// 细则区当前渲染了哪些原因
function shownItems(menu) {
  const rs = [];
  const re = /data-r="([^"]*)"/g;
  let x;
  while ((x = re.exec(menu._items.innerHTML))) rs.push(x[1]);
  return rs;
}
// 大类按钮当前的视觉态
function catClasses(menu, g) {
  const el = menu.catOf(g);
  if (!el) throw new Error('未渲染出大类按钮：' + g);
  return { active: el.classList.contains('active'), preview: el.classList.contains('preview') };
}

console.log('\n=== 源码层面：不再有「悬停即切换」 ===');
t('qc 区块内不得再绑定 mouseenter（旧 bug 的直接成因）', () => {
  // 注意：注释里提到 mouseenter 是允许的（那是本版修复说明），要断言的是「没有绑监听」
  notHas(engine, "addEventListener('mouseenter'", '不得再绑 mouseenter 监听（悬停须走 mouseover 委托 + 幂等预览）');
  has(engine, "addEventListener('mouseover'", '应采用 mouseover 事件委托');
  has(engine, "addEventListener('mouseleave'", '应监听 mouseleave 清除预览');
});
t('悬停路径（qcSetHover）不重建任何 DOM', () => {
  const b = bodyOf('qcSetHover');
  notHas(b, 'innerHTML', '悬停路径不得写 innerHTML（重建 DOM 是抖动根因）');
  has(b, 'qcSyncCatClasses', '悬停应只切 class');
});
t('大类按钮的锁定态只由 qcCommitGroup（点击）改动', () => {
  has(bodyOf('qcCommitGroup'), '_qcGroup = g', '点击处理应负责写 _qcGroup');
  notHas(bodyOf('qcSetHover'), '_qcGroup =', '悬停路径不得给 _qcGroup 赋值');
});
t('重渲染时事件委托只绑一次（_qcMenuBound 守卫）', () => {
  has(bodyOf('qcBindMenu'), '_qcMenuBound', '缺绑定守卫（会重复绑定，点击会触发多次）');
});

console.log('\n=== 行为级：悬停只预览，点击才切换 ===');
t('初始渲染：锁定第一个大类，无预览态', () => {
  const s = sandbox();
  s.api.render();
  const snap = s.api.snap();
  eq(snap.g, '学习表现', '默认应锁定第一个大类');
  eq(snap.h, null, '初始不应有预览态');
  eq(catClasses(s.menu, '学习表现').active, true, '第一个大类应为 active');
  eq(shownItems(s.menu).join(','), '作业优秀,课堂发言', '应显示锁定大类的细则');
});
t('★核心：悬停别的大类 —— 锁定态不变、已选原因不被清掉', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');                       // 先选好一个原因
  eq(s.api.snap().r, '作业优秀', '前置：原因应已选上');
  s.menu.fire('mouseover', tgt(s.menu.catOf('班级服务'), '.qc-cat'));   // 鼠标划过别的大类
  const snap = s.api.snap();
  eq(snap.g, '学习表现', '锁定的大类不得因悬停而改变（这就是老师反馈的 bug）');
  eq(snap.r, '作业优秀', '已选原因不得因悬停而丢失');
  eq(snap.h, '班级服务', '应进入「班级服务」的预览态');
  eq(shownItems(s.menu).join(','), '主动值日', '细则区应实时切换到预览大类的内容');
  has(s.menu._peek.innerHTML, '班级服务', '顶部应有预览提示并点名该大类');
  eq(catClasses(s.menu, '学习表现').active, true, '锁定大类仍应是 active');
  eq(catClasses(s.menu, '班级服务').preview, true, '预览大类应是 preview（虚线态）');
});
t('悬停来回滑过多个大类，锁定态与已选原因始终不动（防抖动）', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('课堂发言');
  ['班级服务', '学习表现', '班级服务', '学习表现'].forEach(g => {
    s.menu.fire('mouseover', tgt(s.menu.catOf(g), '.qc-cat'));
    eq(s.api.snap().g, '学习表现', '来回悬停后锁定态仍须是 学习表现');
    eq(s.api.snap().r, '课堂发言', '来回悬停后已选原因仍须保留');
  });
});
t('点大体名 = 唯一切换入口（并把预览态收干净）', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');
  s.menu.fire('mouseover', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  s.menu.fire('click', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  const snap = s.api.snap();
  eq(snap.g, '班级服务', '点击后应切换到 班级服务');
  eq(snap.h, null, '切换后应清除预览态');
  eq(snap.r, null, '换了大类，旧原因（属别的大类）应被清掉');
  eq(shownItems(s.menu).join(','), '主动值日', '细则区应是新大类的');
  eq(s.store['qcLastGroup_加分'], '班级服务', '应持久化上次大类');
  eq(catClasses(s.menu, '班级服务').active, true, '新大类应为 active');
  eq(catClasses(s.menu, '学习表现').active, false, '旧大类应取消 active');
});
t('点已锁定的大类：不误清已选原因', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');
  s.menu.fire('click', tgt(s.menu.catOf('学习表现'), '.qc-cat'));
  eq(s.api.snap().g, '学习表现', '大类不变');
  eq(s.api.snap().r, '作业优秀', '同大类重复点击不得清掉已选原因');
});
t('鼠标移出菜单：预览态清除，细则回到锁定大类', () => {
  const s = sandbox();
  s.api.render();
  s.menu.fire('mouseover', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  eq(shownItems(s.menu).join(','), '主动值日', '前置：预览中');
  s.menu.fire('mouseleave', {});
  const snap = s.api.snap();
  eq(snap.h, null, '移出后应清除预览');
  eq(shownItems(s.menu).join(','), '作业优秀,课堂发言', '细则区应回到锁定大类的');
  eq(s.menu._peek.innerHTML, '', '预览提示应清空');
});
t('点预览里的细则：顺带锁定它所属大类（防「幽灵选中」）', () => {
  const s = sandbox();
  s.api.render();
  s.menu.fire('mouseover', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  s.menu.fire('click', tgt(mkEl({ 'data-r': '主动值日' }), '.qc-item'));
  const snap = s.api.snap();
  eq(snap.r, '主动值日', '细则应被选上');
  eq(snap.g, '班级服务', '锁定大类应跟随细则所属大类，否则细则会「藏」在别的大类下');
  eq(snap.h, null, '预览态应清除');
  eq(s.store['qcLastGroup_加分'], '班级服务', '应持久化');
});
t('点细则后小结区显示对应大类（不再出现「选中的细则不可见」）', () => {
  const s = sandbox();
  s.api.render();
  s.api.hover('班级服务');
  s.api.pick('主动值日');
  eq(s.api.snap().g, '班级服务', '锁定态应指向该细则所在大类');
  has(shownItems(s.menu).join(','), '主动值日', '细则区应显示到已选细则');
});
t('重渲染清掉残留预览态（打开弹窗 / 连续记账时不残留上一次的预览）', () => {
  const s = sandbox();
  s.api.render();
  s.api.hover('班级服务');
  eq(s.api.snap().h, '班级服务', '前置：已进入预览态');
  s.api.render();
  const snap = s.api.snap();
  eq(snap.h, null, '重渲染后应清除预览态');
  eq(snap.g, '学习表现', '锁定态应保持');
});

console.log('\n=== 版本号（四处跟版 v2.20.1） ===');
t('登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME', () => {
  has(html, '<div class="login-version">v2.20.1</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">v2.20.1 · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ v2.20.1</span>', '设置徽标未跟版');
  has(sw, "CACHE_NAME = 'class-manager-v2.20.1'", 'SW CACHE_NAME 未跟版');
});
t('速览标题与 CACHE_NAME 同版本号（自洽，不硬编码）', () => {
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
});
t('本版交互说明已进速览（老师能在设置页看到）', () => {
  has(html, '原因大类改为「点击锁定」', '速览缺本版说明');
});

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
