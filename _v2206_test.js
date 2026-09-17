/* v2.20.6 回归测试：学分原因菜单「细则框边框加深闪现一次」根治
   老板原话：
     「平板浏览器里查看学分记录模块，加减分选择原因中只有宿舍扣分下面的原因按钮是正常显示，
       其余原因大类会有一个细则原因框边框颜色加深闪现一次，比如考勤，迟到早退就会闪现一次，
       同学关系中闪现的是虚假举报。优化一下」

   根因（Playwright 实测，见 _repro_v2206e.log / _repro_v2206d.log）：
     · 点一次原因大类 → qcPaintItems() 把 .qc-items 整体重画（innerHTML 替换）。
     · Blink 在 DOM 变更后会重算 hover，把**手指停点处新插入的那颗按钮**直接判成 :hover。
       实测：新元素一出生 borderTopColor 就是 rgb(194,91,74)，而基线是 rgb(230,222,205)
       → 老师看到「边框加深了一下又恢复」＝闪现一次。
     · 手指停点为什么会落在细则上：≤768px 时细则排单列，各类目条数不同 → 菜单高度变化 →
       .modal-overlay{align-items:center} 让居中弹窗整体重排（实测 modal.y 跳 −25 / +30px），
       正在点的位置随之被换成一个细则。

   修法（本文件守卫的不变量）：
     ① CSS 层按设备能力分流：@media(hover:none) 内把 .qc-cat:hover / .qc-item:hover 回落成基线
     ② 守卫必须写在 .active / .selected **之前**，否则选中态样式会被守卫夺走
     ③ 守卫的取值必须与「非悬停基线」逐项一致（否则只是换成另一种颜色，仍会闪）
     ④ 桌面（hover:hover）的悬停反馈必须原样保留
     ⑤ 单列断点 768 → 520（平板恢复两列 → 各类目高度一致 → 弹窗不再位移）
     ⑥ 触摸端不再出现原生点按高亮块（对齐 .mobile-tab 既有做法）
   运行：node _v2206_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + `不应包含 ${JSON.stringify(b)}`); }
function count(s) { return html.split(s).length - 1; }

const CAT_GUARD = '@media(hover:none){.qc-cat:hover{border-color:var(--border);color:var(--text-secondary)}}';
const ITEM_GUARD = '@media(hover:none){.qc-item:hover{border-color:var(--border);background:var(--card-bg)}}';
const CAT_HOVER_DESKTOP = '.qc-cat:hover{border-color:var(--primary-light);color:var(--primary-dark)}';
const ITEM_HOVER_DESKTOP = '.qc-item:hover{border-color:var(--primary-light);background:var(--bg-secondary)}';

console.log('\n=== ① 触摸端 hover 守卫：存在 / 唯一 / 取值等于基线 ===');

t('两条 @media(hover:none) 守卫各出现 1 次（不是 pointer:coarse 之类的替代写法）', () => {
  eq(count(CAT_GUARD), 1, '大类 hover 守卫数异常');
  eq(count(ITEM_GUARD), 1, '细则 hover 守卫数异常');
});

t('守卫用 hover:none 媒体特性（能覆盖「有触摸又接了鼠标」的二合一设备）', () => {
  has(html, '@media(hover:none){.qc-cat:hover', '大类守卫未用 hover:none');
  has(html, '@media(hover:none){.qc-item:hover', '细则守卫未用 hover:none');
  // 键盘早已有同款守卫，本次是同一套做法
  has(html, '@media(hover:none){.key:hover', '键盘的既有守卫被改动/删除');
});

t('守卫取值与「非悬停基线」逐项一致 —— 否则只是换成另一种颜色，照样闪', () => {
  // 基线：.qc-cat 的 border 与 color
  has(html, '.qc-cat{padding:7px 16px;border:1px solid var(--border);', '大类基线 border 变了');
  has(html, 'background:var(--card-bg);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;',
      '大类基线色/字重变了（守卫取值需同步）');
  // 基线：.qc-item 的 border 与 background
  has(html, 'border:1px solid var(--border);border-radius:10px;background:var(--card-bg);color:var(--text);cursor:pointer;text-align:left;font-size:14px;',
      '细则基线 border/背景变了（守卫取值需同步）');
  // 守卫里回落的正是 --border / --card-bg / --text-secondary
  has(CAT_GUARD, 'border-color:var(--border)', '大类守卫未回落 border');
  has(CAT_GUARD, 'color:var(--text-secondary)', '大类守卫未回落字色');
  has(ITEM_GUARD, 'border-color:var(--border)', '细则守卫未回落 border');
  has(ITEM_GUARD, 'background:var(--card-bg)', '细则守卫未回落背景');
});

console.log('\n=== ② 级联顺序：守卫必须输给选中态（.active / .selected） ===');

t('大类守卫在 .qc-cat.active 之前（选中大类仍是主色底 + 白字）', () => {
  const iBase = html.indexOf(CAT_HOVER_DESKTOP);
  const iGuard = html.indexOf(CAT_GUARD);
  const iActive = html.indexOf('.qc-cat.active{background:var(--primary);border-color:var(--primary);color:#fff}');
  ok(iBase >= 0 && iGuard >= 0 && iActive >= 0, '基线/守卫/选中态任一定位失败');
  ok(iBase < iGuard, '守卫必须写在基线 :hover 之后，否则盖不住它');
  ok(iGuard < iActive, '守卫必须在 .active 之前，否则点中的大类会被夺走底色');
});

t('细则守卫在 .qc-item.selected 之前（选中细则仍深色描边 + ✓）', () => {
  const iBase = html.indexOf(ITEM_HOVER_DESKTOP);
  const iGuard = html.indexOf(ITEM_GUARD);
  const iSel = html.indexOf('.qc-item.selected{border-color:var(--primary);background:rgba(166,58,43,0.08)}');
  ok(iBase >= 0 && iGuard >= 0 && iSel >= 0, '基线/守卫/选中态任一定位失败');
  ok(iBase < iGuard, '守卫必须写在基线 :hover 之后，否则盖不住它');
  ok(iGuard < iSel, '守卫必须在 .selected 之前，否则触摸端选中的细则会失去高亮与 ✓');
});

t('选中态样式本身未被削弱（主轴：深色描边 + 浅底 + ✓）', () => {
  has(html, '.qc-item.selected{border-color:var(--primary);background:rgba(166,58,43,0.08)}', '选中描边丢了');
  has(html, ".qc-item.selected::after{content:'✓';color:var(--primary);font-weight:700}", '选中对勾丢了');
});

console.log('\n=== ③ 桌面体验必须原样保留（不能把鼠标端的悬停一起改坏） ===');

t('桌面 hover 反馈仍在（大类变主色边+深字；细则变浅边+浅底）', () => {
  has(html, CAT_HOVER_DESKTOP, '大类桌面悬停被误删');
  has(html, ITEM_HOVER_DESKTOP, '细则桌面悬停被误删');
  notHas(html, '@media(hover:hover){.qc-item:hover,', '不该用 hover:hover 反向包一层');
});

t('守卫没有用 !important 蛮干（保持可覆盖）', () => {
  notHas(CAT_GUARD, '!important', '大类守卫用了 !important');
  notHas(ITEM_GUARD, '!important', '细则守卫用了 !important');
});

console.log('\n=== ④ 单列断点 768 → 520（消除平板弹窗位移） ===');

t('单列断点已收到 520px，旧 768px 单列规则零残留', () => {
  has(html, '@media(max-width:520px){.qc-items{grid-template-columns:1fr}}', '缺 520px 单列规则');
  notHas(html, '768px){.qc-items{grid-template-columns:1fr}}', '旧 768px 单列规则仍在（会继续引起弹窗位移）');
});

t('细则区仍是两列网格 + 高度兜底（没把网格本身改掉）', () => {
  has(html, '.qc-items{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:260px;min-height:132px;overflow-y:auto;padding:2px}',
      '细则区网格定义被改动');
});

console.log('\n=== ⑤ 触摸端不再有原生点按高亮块 ===');

t('.qc-cat / .qc-item 均关闭 -webkit-tap-highlight-color', () => {
  has(html, 'transition:all .15s;-webkit-tap-highlight-color:transparent}', '大类未关点按高亮');
  has(html, 'transition:all .12s;-webkit-tap-highlight-color:transparent}', '细则未关点按高亮');
  has(html, '-webkit-tap-highlight-color:transparent', '底部导航的既有做法被删除');
});

console.log('\n=== ⑥ 引擎侧零悬停监听（v2.20.2 结论防回归） ===');

t('qc 引擎源码内没有任何 mouseover / mouseenter / mouseleave / mousemove', () => {
  // 与 _v2202_test.js 用同一套抽取标记（真实实现，不是手抄副本）
  const a = html.indexOf('function qcMenuData(){');
  const b = html.indexOf('/* QC_MENU_ENGINE_END');
  ok(a >= 0 && b > a, '引擎标记丢失（qcMenuData / QC_MENU_ENGINE_END）');
  const src = html.slice(a, b);
  // 只查代码：注释里保留着 v2.20.0~v2.20.2 的踩坑史（含 mouseover 字样），不能当命中
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ['mouseover', 'mouseenter', 'mouseleave', 'mousemove', 'pointerenter', 'pointerover'].forEach(k => {
    notHas(code, k, '引擎里又出现了悬停监听：' + k);
    notHas(code, "addEventListener('" + k + "'", '引擎里又绑了 ' + k);
  });
  eq((code.match(/addEventListener\(/g) || []).length, 1, '引擎内的监听数应为 1（只在 #qcMenu 上做一次 click 委托）');
  has(code, "menu.addEventListener('click'", '唯一监听应为 click');
});

t('点大类只重画细则区（大类按钮不重建 → 光标下元素不被替换）', () => {
  const a = html.indexOf('function qcCommitGroup');
  const b = html.indexOf('function qcPickReason');
  ok(a >= 0 && b > a, 'qcCommitGroup 定位失败');
  const src = html.slice(a, b);
  has(src, 'qcSyncCatClasses();', '缺大类选中态同步');
  has(src, 'qcPaintItems();', '缺细则重画');
  notHas(src, "menu.innerHTML", '不允许在切大类时重建整个菜单');
  notHas(src, 'qcRenderMenu()', '不允许在切大类时整菜单重渲染');
});

console.log('\n=== ⑦ 结论留档 + 版本标记 ===');

t('交互定稿注释留档 v2.20.6 的结论（防止后人把 hover 加回来）', () => {
  has(html, '菜单内所有鼠标悬停已移除', '缺 v2.20.2 的定稿结论');
  has(html, 'v2.20.6 补 CSS 层的漏', '缺 v2.20.6 的补充结论');
  has(html, '凡「跟随指尖的中间态」在触屏上都不做', '缺最终结论一句话');
});

t('四处活动标记均为 v2.20.6（登录页 / 侧栏 / 设置徽标 / 速览标题）', () => {
  has(html, '<div class="login-version">v2.20.6</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">v2.20.6 · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ v2.20.6</span>', '设置徽标未跟版');
  has(html, '📝 近版更新速览（v2.20.6）', '速览标题未跟版');
});

t('sw.js CACHE_NAME 与版本标记同步', () => {
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  eq(ver, 'v2.20.6', 'SW CACHE_NAME 未跟版');
  has(html, '<div class="login-version">' + ver + '</div>', '登录页与 SW 版本不一致');
});

t('速览块非空且标题跟 SW 版本（正文按约定逐版整体替换，不钉条目）', () => {
  const m = html.match(/<div id="settingsReleaseNotes"[^>]*>[\s\S]*?<\/div>/);
  if (!m) throw new Error('缺速览块');
  const plain = m[0].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  ok(plain.length >= 60, '速览块为空或过短：' + plain.length);
  const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';
  has(html, '近版更新速览（' + ver + '）', '速览标题未跟版');
});

console.log('');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
