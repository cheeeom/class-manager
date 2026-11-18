/* v3.9.33 回归：首帧预判（免密直达不闪锁屏）+ 启动画面（splash）
 *
 * 背景：老板把工作台装到手机桌面、关掉登录密码后，每次重开都会先闪一下密码页再进主界面。
 *   根因是 #loginOverlay 在 HTML 里默认可见，要等 body 末尾的主脚本跑完 loadData()
 *   才 add('hidden') —— 首帧已经画过了。修法是在 <head> 里提前定调（cmBoot），
 *   CSS 直接 display:none，首帧就不画。
 *
 * 本测试钉住五类契约（版本无关，当版号从 sw.js 反推）：
 *   ① cmBoot 必须存在、在主脚本之前、且四条判据与主脚本同源
 *   ② cmBoot 不能被写成裸 script 标签（多处回归靠 indexOf 找第一个裸块定位主脚本）
 *   ③ CSS 必须有 html.cm-nolock 压制锁屏；init 段必须有兜底移除（防两边都隐藏 ⇒ 白屏）
 *   ④ splash 的显隐开关、最短展示、幂等、会话标记
 *   ⑤ 手机适配：尺寸必须走 clamp、必须有 safe-area 与 reduced-motion 兜底
 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

const VER = (function () {
  const m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(fs.readFileSync('sw.js', 'utf8'));
  return m ? m[1] : '';
})();
if (!VER) throw new Error('[版本无关化] 未能从 sw.js 反推版本号');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function ok(c, m) { if (!c) throw new Error(m || '断言失败'); }
function has(s, sub, m) { if (String(s).indexOf(sub) < 0) throw new Error(m || ('缺少 ' + sub)); }
function notHas(s, sub, m) { if (String(s).indexOf(sub) >= 0) throw new Error(m || ('不该出现 ' + sub)); }

function slice(from, to) {
  const a = html.indexOf(from);
  ok(a >= 0, '切片起点不存在：' + from);
  const b = to ? html.indexOf(to, a + from.length) : html.length;
  ok(b > a, '切片终点不存在：' + to);
  return html.slice(a, b);
}

const BOOT = slice('<script id="cmBoot">', '</script>');
const MAIN_AT = html.indexOf('<script>');
const BOOT_AT = html.indexOf('<script id="cmBoot">');
const CSS = slice('<style', '</style>');

/* ==================== ① cmBoot 存在且时序正确 ==================== */
t('① cmBoot 在 head 内、且早于主脚本（首帧前定调的前提）', () => {
  ok(BOOT_AT > 0, 'cmBoot 不存在');
  ok(BOOT_AT < html.indexOf('</head>'), 'cmBoot 必须位于 </head> 之前');
  ok(MAIN_AT > BOOT_AT, 'cmBoot 必须早于主脚本');
  ok(BOOT.length > 200, 'cmBoot 内容过短，像是被清空了');
});

t('② 四条判据与主脚本同源（键名必须逐字一致，否则首帧判定漂移）', () => {
  /* 免密三判据 */
  has(BOOT, "'classManagerUnlocked'", '缺 SESSION_KEY 判定');
  has(BOOT, "'cm_role'", '缺班委模式判定');
  has(BOOT, "'cm_login_pwd_off'", '缺关闭登录密码判定');
  has(BOOT, "=== 'committee'", '班委判定必须比对 committee');
  /* 与主脚本常量逐字校验：常量一旦改名，这里必须同步 */
  has(html, "const SESSION_KEY = 'classManagerUnlocked'");
  has(html, "const LOGIN_PWD_OFF_KEY = 'cm_login_pwd_off'");
  has(html, "const CM_ROLE_KEY = 'cm_role'");
  /* 主题同源 */
  has(BOOT, "'cm_theme'", '缺主题提前定调');
  has(BOOT, "classList.add('dark')", '主题未在首帧应用（暗色用户会先闪一帧亮底）');
  /* 启动画面开关 */
  has(BOOT, "'cm_splash_seen'", '缺会话标记判定');
  has(BOOT, "classList.add('cm-splash-off')", '缺跳过启动画面的分支');
  has(BOOT, '/Electron/i.test', '桌面版必须跳过（否则和 app/splash.html 叠成两次动画）');
});

t('③ cmBoot 不许写成裸标签，也不许在注释里写出裸标签字面量', () => {
  /* 多处回归用 html.indexOf 找第一个裸 script 块当主脚本；这里若出现裸标签，
     会把它截胡，几十套测试当场错位。注释里写出字面量同样会被 indexOf 命中。 */
  const firstBare = html.indexOf('<script>');
  ok(firstBare === MAIN_AT, '第一个裸 script 块必须是主脚本');
  ok(html.indexOf('<script>', 0) > BOOT_AT, 'cmBoot 之前的 head 里不许有裸 script 块');
  const boomComment = BOOT.indexOf('<scr' + 'ipt>');
  ok(boomComment < 0, 'cmBoot 中出现裸标签字面量，会截胡 indexOf 定位');
});

/* ==================== ② 零闪现的 CSS 与兜底 ==================== */
t('④ CSS 必须用 html.cm-nolock 直接压掉锁屏（不是靠 JS 事后 add hidden）', () => {
  has(CSS, 'html.cm-nolock .login-overlay{display:none}', '缺免密直达的 CSS 压制');
  /* 反向：这条必须在 .login-overlay.hidden 之外独立存在，不能靠 .hidden 类 */
  has(CSS, '.login-overlay.hidden{display:none}');
});

t('⑤ init 段必须有兜底：判据漂移时摘掉 cm-nolock，避免「两边都隐藏」白屏', () => {
  const gate = slice('// 登录拦截', '} else {\n  document.getElementById(\'loginOverlay\').classList.add(\'hidden\');');
  has(gate, "classList.remove('cm-nolock')", '缺兜底移除：若 cmBoot 与 init 判据漂移，CSS 藏锁屏 + JS 藏 .app ⇒ 全白');
  /* 兜底必须在 else（要锁屏）分支里，不能在免密分支里 */
  const iElse = gate.lastIndexOf('} else {');
  const iRem = gate.indexOf("classList.remove('cm-nolock')");
  ok(iRem > iElse, 'remove 必须写在要锁屏的 else 分支内');
});

t('⑥ 关密码的开关反向操作后必须摘掉标记（否则锁屏被 CSS 永久压死）', () => {
  const fn = slice('function changeLoginPwd()', 'function ');
  has(fn, "classList.remove('cm-nolock')", '开启登录密码后未摘掉免密标记');
});

/* ==================== ③ splash 结构与显隐 ==================== */
t('⑦ splash 必须在 body 最前（要盖住「主脚本尚未执行」那段）', () => {
  const iBody = html.indexOf('<body>');
  const iSplash = html.indexOf('<div class="cm-splash"');
  const iSvgLib = html.indexOf('<svg xmlns="http://www.w3.org/2000/svg" style="display:none"');
  ok(iSplash > iBody, 'splash 必须在 body 内');
  ok(iSplash < iSvgLib, 'splash 必须早于图标 symbol 库');
  has(html, 'id="cmSplash"', 'splash 必须有 id 供 cmSplashDone 取用');
});

t('⑧ 两级隐藏：会话已播过 → cm-splash-off；播完 → .gone', () => {
  has(CSS, 'html.cm-splash-off .cm-splash,.cm-splash.gone{display:none}', '缺两级隐藏');
  has(CSS, '.cm-splash.out{', '缺淡出态');
});

t('⑨ cmSplashDone 定义存在、在 renderAll 之后调用（等真渲染完再淡出）', () => {
  has(html, 'function cmSplashDone(');
  const iRender = html.indexOf('renderClassBrand();\nrenderAll();');
  const iCall = html.indexOf('cmSplashDone();', iRender);
  ok(iRender > 0, '找不到 init 段的 renderAll 调用点');
  ok(iCall > iRender, 'cmSplashDone 必须在 renderAll 之后调用');
});

/* ==================== ④ 行为级：真跑 cmSplashDone ==================== */
const FN = slice('var CM_SPLASH_MIN_MS', '/* ==================== Init ====================');

function makeSandbox(opts) {
  const o = opts || {};
  const timers = [];
  const classes = new Set(o.htmlClasses || []);
  const docEl = { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) } };
  const el = { classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } } };
  const store = {};
  const sb = {
    CM_SPLASH_MIN_MS: 0, CM_SPLASH_FADE_MS: 0, _cmSplashClosed: false,
    sessionStorage: {
      setItem(k, v) { store[k] = String(v); },
      getItem(k) { return k in store ? store[k] : null; }
    },
    document: { documentElement: docEl, getElementById: id => (id === 'cmSplash' ? (o.noEl ? null : el) : null) },
    window: o.noAt ? {} : { __cmSplashAt: 0 },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    Date: { now: () => (o.now == null ? 1000 : o.now) }
  };
  const src = 'var CM_SPLASH_MIN_MS=900, CM_SPLASH_FADE_MS=500, _cmSplashClosed=false;\n'
    + FN.replace(/\/\*[\s\S]*?\*\//g, '')   // 去注释，避免注释里的分号干扰
    + '\n;return {done: cmSplashDone, isClosed: function(){ return _cmSplashClosed; }};';
  const api = new Function(
    'document', 'sessionStorage', 'setTimeout', 'Date', 'window',
    src
  )(sb.document, sb.sessionStorage, sb.setTimeout, sb.Date, sb.window);
  return { api, el, store, timers, classes };
}

t('⑩ 真跑：调一次 → 写会话标记 + 排淡出定时器', () => {
  const s = makeSandbox({ htmlClasses: [], now: 1000 });
  s.api.done();
  ok(s.store['cm_splash_seen'] === '1', '未写会话标记（刷新会重播动画）');
  ok(s.timers.length >= 1, '未排定时器');
  ok(s.api.isClosed(), '未置幂等标记');
});

t('⑪ 真跑：幂等 —— 调两次只产生一组定时器', () => {
  const s = makeSandbox({});
  s.api.done(); s.api.done(); s.api.done();
  ok(s.timers.length === 1, '重复调用产生了 ' + s.timers.length + ' 个定时器（应只 1 个）');
});

t('⑫ 真跑：cm-splash-off（本会话已播过）→ 直接 gone，不排定时器', () => {
  const s = makeSandbox({ htmlClasses: ['cm-splash-off'] });
  s.api.done();
  ok(s.el.classList.contains('gone'), '未直接置 gone');
  ok(s.timers.length === 0, '跳过时不该排定时器');
});

t('⑬ 真跑：找不到元素不抛错（脚本被内联到别处也不会炸）', () => {
  const s = makeSandbox({ noEl: true });
  s.api.done();
  ok(true);
});

t('⑭ 真跑：最短展示算法 —— 已过 300ms 时只需再等 600ms', () => {
  /* __cmSplashAt = 1000，now = 1300 ⇒ 已展示 300ms ⇒ wait = 900-300 = 600 */
  const s = makeSandbox({ now: 1300 });
  s.window && (s.window.__cmSplashAt = 1000);
  /* makeSandbox 里 window 是 o.noAt ? {} : {__cmSplashAt:0}，这里显式覆盖 */
  const s2 = makeSandbox({ now: 1300 });
  ok(s2.timers.length === 0);
  /* 直接重跑一份，把 __cmSplashAt 设成 1000 */
  const timers = [];
  const src = 'var CM_SPLASH_MIN_MS=900, CM_SPLASH_FADE_MS=500, _cmSplashClosed=false;\n'
    + FN.replace(/\/\*[\s\S]*?\*\//g, '') + '\n; return cmSplashDone;';
  const fn = new Function('document', 'sessionStorage', 'setTimeout', 'Date', 'window', src)(
    { documentElement: { classList: { contains: () => false } }, getElementById: () => ({ classList: { add() {} } }) },
    { setItem() {} },
    (f, ms) => timers.push(ms),
    { now: () => 1300 },
    { __cmSplashAt: 1000 }
  );
  fn();
  ok(timers.length === 1 && timers[0] === 600, '最短展示剩余时长算错：得到 ' + JSON.stringify(timers));
});

/* ==================== ⑤ 手机适配 ==================== */
t('⑮ 尺寸必须是 clamp（手机/平板/桌面免断点），不许写死 px 宽度', () => {
  const logo = /\.cm-splash-logo\{[\s\S]*?\}/.exec(CSS);
  ok(logo, '缺 .cm-splash-logo 样式');
  has(logo[0], 'width:clamp(', '图标宽度未走 clamp');
  has(logo[0], 'border-radius:clamp(', '圆角未走 clamp');
  has(logo[0], 'font-size:clamp(', '字号未走 clamp');
  const rule = /\.cm-splash-rule\{[^}]*\}/.exec(CSS);
  has(rule[0], 'width:clamp(', '横线宽度未走 clamp');
  const ttl = /\.cm-splash-title\{[\s\S]*?\}/.exec(CSS);
  has(ttl[0], 'font-size:clamp(', '标题字号未走 clamp');
});

t('⑯ 刘海屏与底部手势条要留安全区', () => {
  const sp = /\.cm-splash\{[\s\S]*?\}/.exec(CSS);
  has(sp[0], 'env(safe-area-inset-top', '缺顶部安全区');
  has(sp[0], 'env(safe-area-inset-bottom', '缺底部安全区');
  /* 用 inset:0 而不是 height:100vh：iOS 地址栏收缩时 vh 会溢出留白 */
  has(sp[0], 'position:fixed;inset:0', '要用 inset:0 而不是 height:100vh');
  notHas(sp[0], 'height:100vh', '不要用 100vh（iOS 地址栏收缩会溢出）');
});

t('⑰ 关掉动画的用户要立刻定版（视觉可达性）', () => {
  const m = /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.cm-splash/.exec(CSS);
  ok(m, '缺 prefers-reduced-motion 兜底');
});

t('⑱ 底色必须吃主题变量，不许写死（暗色会闪白）', () => {
  const sp = /\.cm-splash\{[\s\S]*?\}/.exec(CSS);
  has(sp[0], 'background:var(--bg)', '启动画面底色未走主题变量');
  notHas(sp[0], 'background:#', '底色写死了 hex，暗色模式会闪白');
  const ttl = /\.cm-splash-title\{[\s\S]*?\}/.exec(CSS);
  has(ttl[0], 'color:var(--text)', '标题颜色未走主题变量');
});

t('⑲ 图标渐变必须用主色令牌（跟皮肤走）', () => {
  const logo = /\.cm-splash-logo\{[\s\S]*?\}/.exec(CSS);
  has(logo[0], 'linear-gradient(150deg,var(--primary-light),var(--primary-dark))', '图标渐变未用主色令牌');
});

console.log('\n' + (fail === 0 ? '全部通过' : '有失败') + '：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
