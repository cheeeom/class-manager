/* v2.20.2 回归测试：学分快速加减分「原因大类」菜单 —— 彻底点击化（无任何悬停响应）
 *
 * 老师反馈的三轮：
 *   v2.20.0  点完大类后，鼠标只要划过别的大类，原因就自动跟着切换、来回跳
 *            （大类按钮同时绑 mouseenter + click，且切换时整体 innerHTML 重渲染，
 *              光标下的按钮被换成新元素 → 再次触发 mouseenter → 自我循环）
 *   v2.20.2  改用「悬停预览 + 点击锁定」，老师验收：抖动更厉害了
 *            （预览提示行随悬停出现/消失 → 菜单高度突变、内容上下跳；
 *              触屏还会合成 mouseover 反复触发）
 *   v2.20.2  定稿：悬停 = 完全无动作。只有 click 能改 _qcGroup / _qcReason。
 *
 * 本测试把「悬停必须是空操作」同时钉在【源码层】和【行为层】两处：
 *   源码层 —— 引擎里不得存在 mouseover / mouseenter / mouseleave 监听，只允许 1 个 click 委托
 *   行为层 —— 即便硬派发悬停事件，状态也必须纹丝不动（防御未来有人加回监听）
 *
 * 运行：node _v2202_test.js
 */
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
      contains(c) { return cls.has(c); },
      _all() { return Array.from(cls); }
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
    _h: {},
    addEventListener(type, fn) { (m._h[type] = m._h[type] || []).push(fn); },
    querySelectorAll(sel) { return sel === '.qc-cat' ? m._cats : []; },
    querySelector(sel) { return sel === '.qc-items' ? m._items : null; },
    // 派发事件，返回实际被调用的监听器数量（0 = 该事件无人监听 = 空操作）
    fire(type, target) {
      const hs = m._h[type] || [];
      hs.forEach(fn => fn({ target: target }));
      return hs.length;
    },
    listeners() { return Object.keys(m._h).sort(); },
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
    }
  });
  return m;
}
const tgt = (el, sel) => ({ closest(s) { return s === sel ? el : null; } });

// 每个用例一套全新沙箱（状态互不污染）
function sandbox() {
  const menu = mkMenu();
  const store = {};
  const state = {
    reasonCatalog: {
      '加分': { '学习表现': ['作业优秀', '课堂发言'], '班级服务': ['主动值日'], '集体荣誉': ['校级表彰'] },
      '扣分': { '课堂纪律': ['扰乱课堂'] }
    },
    reasonScores: { '作业优秀': 2, '课堂发言': 1, '主动值日': 3, '校级表彰': 5, '扰乱课堂': -2 }
  };
  const api = new Function(
    'document', 'localStorage', 'escapeHtml', 'state', 'qcDirName', 'qcUpdatePreview',
    'var _qcSign="plus",_qcGroup=null,_qcReason=null,_qcMenuBound=false;\n' +
    engine + '\n' +
    'return { render:qcRenderMenu, commit:qcCommitGroup, pick:qcPickReason,' +
    ' snap:function(){return {g:_qcGroup,r:_qcReason};} };'
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
function shownItems(menu) {
  const rs = [];
  const re = /data-r="([^"]*)"/g;
  let x;
  while ((x = re.exec(menu._items.innerHTML))) rs.push(x[1]);
  return rs;
}
function catClasses(menu, g) {
  const el = menu.catOf(g);
  if (!el) throw new Error('未渲染出大类按钮：' + g);
  return el.classList._all().sort().join(',');
}

console.log('\n=== 源码层：悬停路径已整体移除 ===');
t('引擎里不得存在任何悬停监听（mouseover / mouseenter / mouseleave）', () => {
  notHas(engine, "addEventListener('mouseover'", '不应再有 mouseover 预览');
  notHas(engine, "addEventListener('mouseenter'", '不应再有 mouseenter 悬停切换');
  notHas(engine, "addEventListener('mouseleave'", '不应再有 mouseleave 清理预览');
});
t('引擎只允许 1 个监听绑定，且是 click 委托', () => {
  eq(engine.split('addEventListener').length - 1, 1, '监听绑定数量应为 1');
  has(engine, "menu.addEventListener('click'", '唯一监听应为 click');
});
t('悬停相关的函数与状态已删除干净（不留死代码）', () => {
  notHas(html, '_qcHover', '悬停预览态变量应彻底删除');
  notHas(html, 'qcSetHover', '悬停处理函数应彻底删除');
  notHas(html, 'qc-peek', '预览提示元素/CSS 应彻底删除');
  notHas(html, 'qc-cat.preview', '预览虚线态样式应彻底删除');
});
t('大类按钮的视觉态只有 active（点击态）', () => {
  const b = bodyOf('qcSyncCatClasses');
  has(b, "classList.toggle('active'", '应切换 active');
  notHas(b, 'preview', '不应再有 preview 视觉态');
});
t('重渲染时事件委托只绑一次（_qcMenuBound 守卫）', () => {
  has(bodyOf('qcBindMenu'), '_qcMenuBound', '缺绑定守卫（会重复绑定，点击触发多次）');
});
t('菜单骨架不再包含预览提示容器', () => {
  has(html, '<div class="qc-cats">\' + cats + \'</div><div class="qc-items"></div>', '骨架应为 大类条 + 细则区 两段');
});
t('细则区有最小高度（切换大类时下方内容不位移）', () => {
  has(html, '.qc-items{display:grid;', '细则区样式');
  has(html, 'min-height:132px', '缺最小高度，切类时下方会跳');
});

console.log('\n=== 行为层：只有点击能改状态 ===');
t('初始渲染：锁定第一个大类、无残余状态', () => {
  const s = sandbox();
  s.api.render();
  const snap = s.api.snap();
  eq(snap.g, '学习表现', '默认应锁定第一个大类');
  eq(snap.r, null, '初始不应有已选原因');
  eq(catClasses(s.menu, '学习表现'), 'active', '第一个大类应为 active');
  eq(shownItems(s.menu).join(','), '作业优秀,课堂发言', '应显示锁定大类的细则');
});
t('渲染后 #qcMenu 上只挂了 click 一个监听类型', () => {
  const s = sandbox();
  s.api.render();
  eq(s.menu.listeners().join(','), 'click', '不应挂任何悬停类监听');
});
t('★核心：划过别的大类 —— 事件无人监听，状态纹丝不动', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');                                  // 先选好一个原因
  eq(s.api.snap().r, '作业优秀', '前置：原因应已选上');
  const cat = s.menu.catOf('班级服务');                     // 鼠标划过「班级服务」
  eq(s.menu.fire('mouseover', tgt(cat, '.qc-cat')), 0, 'mouseover 不应有人监听');
  eq(s.menu.fire('mouseenter', tgt(cat, '.qc-cat')), 0, 'mouseenter 不应有人监听');
  eq(s.menu.fire('mousemove', tgt(cat, '.qc-cat')), 0, 'mousemove 不应有人监听');
  eq(s.menu.fire('mouseleave', {}), 0, 'mouseleave 不应有人监听');
  const snap = s.api.snap();
  eq(snap.g, '学习表现', '锁定的大类不得因悬停而改变（这就是老师反馈的 bug）');
  eq(snap.r, '作业优秀', '已选原因不得因悬停而丢失');
  eq(shownItems(s.menu).join(','), '作业优秀,课堂发言', '细则区不得因悬停而切换内容');
  eq(catClasses(s.menu, '学习表现'), 'active', '锁定大类仍应是 active');
  eq(catClasses(s.menu, '班级服务'), '', '划过的大类不得有任何态（不再有 preview）');
});
t('来回划过多个大类，状态始终不动（防抖动）', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('课堂发言');
  ['班级服务', '集体荣誉', '学习表现', '班级服务', '集体荣誉'].forEach(g => {
    s.menu.fire('mouseover', tgt(s.menu.catOf(g), '.qc-cat'));
    s.menu.fire('mouseenter', tgt(s.menu.catOf(g), '.qc-cat'));
    eq(s.api.snap().g, '学习表现', '来回悬停后锁定态仍须是 学习表现');
    eq(s.api.snap().r, '课堂发言', '来回悬停后已选原因仍须保留');
  });
});
t('点击大类 = 唯一的切换入口', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');
  s.menu.fire('click', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  const snap = s.api.snap();
  eq(snap.g, '班级服务', '点击后应切换到 班级服务');
  eq(snap.r, null, '换了大类，旧原因（属别的大类）应被清掉');
  eq(shownItems(s.menu).join(','), '主动值日', '细则区应是新大类的');
  eq(s.store['qcLastGroup_加分'], '班级服务', '应持久化上次大类');
  eq(catClasses(s.menu, '班级服务'), 'active', '新大类应为 active');
  eq(catClasses(s.menu, '学习表现'), '', '旧大类应取消 active');
});
t('连续点击多个大类，最终态 = 最后一次点击', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('主动值日');
  ['集体荣誉', '学习表现', '集体荣誉'].forEach(g => {
    s.menu.fire('click', tgt(s.menu.catOf(g), '.qc-cat'));
  });
  eq(s.api.snap().g, '集体荣誉', '应停在最后点击的大类');
  eq(shownItems(s.menu).join(','), '校级表彰', '细则区应是最后一次点击大类的');
  eq(s.store['qcLastGroup_加分'], '集体荣誉', '持久化应为最后一次');
  eq(catClasses(s.menu, '集体荣誉'), 'active', '只有当前大类是 active');
  eq(catClasses(s.menu, '学习表现'), '', '其余大类无态');
});
t('点已锁定的大类：不误清已选原因', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');
  s.menu.fire('click', tgt(s.menu.catOf('学习表现'), '.qc-cat'));
  eq(s.api.snap().g, '学习表现', '大类不变');
  eq(s.api.snap().r, '作业优秀', '同大类重复点击不得清掉已选原因');
});
t('点细则：选中并锁定它所属大类（防「幽灵选中」）', () => {
  const s = sandbox();
  s.api.render();
  s.api.pick('作业优秀');
  s.menu.fire('click', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  s.menu.fire('click', tgt(mkEl({ 'data-r': '主动值日' }), '.qc-item'));
  const snap = s.api.snap();
  eq(snap.r, '主动值日', '细则应被选上');
  eq(snap.g, '班级服务', '锁定大类应跟随细则所属大类，否则细则会「藏」在别的大类下');
  eq(s.store['qcLastGroup_加分'], '班级服务', '应持久化');
  has(shownItems(s.menu).join(','), '主动值日', '细则区应包含已选细则');
});
t('重渲染（打开弹窗 / 连续记账）后：锁定态保持、无悬停残留', () => {
  const s = sandbox();
  s.api.render();
  s.menu.fire('click', tgt(s.menu.catOf('班级服务'), '.qc-cat'));
  s.api.render();
  const snap = s.api.snap();
  eq(snap.g, '班级服务', '重渲染后锁定态应保持');
  eq(s.menu.listeners().join(','), 'click', '重渲染不得新增悬停监听');
});

console.log('\n=== 版本号（四处跟版 v2.20.6） ===');
t('登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME', () => {
  has(html, '<div class="login-version">v2.20.6</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">v2.20.6 · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ v2.20.6</span>', '设置徽标未跟版');
  has(sw, "CACHE_NAME = 'class-manager-v2.20.6'", 'SW CACHE_NAME 未跟版');
});
t('速览标题与 CACHE_NAME 同版本号（自洽，不硬编码）', () => {
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
});
t('速览块非空 + 「悬停无动作」结论在引擎注释留档（不硬编码版本条目）', () => {
  // 速览正文按项目约定「只保留最新一版」逐版整体替换，故不断言具体版本条目（必然逐版失效）；
  // 改成断言不随版本流失的不变量：速览块存在且非空 + 引擎注释留档本轮结论。
  const m = html.match(/<div id="settingsReleaseNotes"[^>]*>[\s\S]*?<\/div>/);
  if (!m) throw new Error('缺速览块');
  const plain = m[0].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  if (plain.length < 60) throw new Error('速览块为空或过短：' + plain.length);
  has(html, '菜单内所有鼠标悬停已移除', '引擎注释未留档「悬停已移除」结论');
});

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
