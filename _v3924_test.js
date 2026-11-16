// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.24 回归：侧栏「固定展开」后被悬停定时器偷偷盖住正文
   真机症状：平板点 rail-toggle 展开 → 约 1 秒后右侧正文被侧栏压住 172px。
   根因：cmRailEnter 埋的 1000ms 定时器触发时**不复查** .rail 是否还在。
        平板上一次点按就会合成 mouseenter，于是「点展开」之前表已定好；
        点展开把 .rail 摘掉后，定时器照样 add('rail-open') ⇒
        .sidebar.rail-open 把侧栏画成 240 宽、flex 只占 68（负 margin-right），
        z-index:60 + 投影，直接浮在正文上面。

   本文件是**行为级**测试：把 index.html 里真实的 rail 模块切出来，
   配假 DOM / 假计时器跑一遍，而不是只比对源码字符串。
   运行：node _v3924_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

/* ---------- 切出真实的 rail 模块 ---------- */
const MOD = (html.match(/var cmRailSidebar = document\.getElementById\('sidebar'\);[\s\S]*?cmRailSidebar\.classList\.remove\('rail-init'\);[\s\S]*?\n  \} catch\(e\)\{\}\n\}/) || [])[0];
if (!MOD) throw new Error('rail 模块切片失败（锚点被改动？）');

/* ---------- 假 DOM / 假计时器 ---------- */
function mkEl(cls) {
  const set = new Set(String(cls || '').split(/\s+/).filter(Boolean));
  const listeners = {};
  return {
    set: set,
    classList: {
      contains: c => set.has(c),
      add: function () { for (let i = 0; i < arguments.length; i++) set.add(arguments[i]); },
      remove: function () { for (let i = 0; i < arguments.length; i++) set.delete(arguments[i]); },
      toggle: function (c, f) { const on = (f === undefined) ? !set.has(c) : !!f; on ? set.add(c) : set.delete(c); return on; }
    },
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire: function (type) { (listeners[type] || []).forEach(fn => fn({})); }
  };
}

function run(opts) {
  const sb = mkEl(opts.cls || 'sidebar');
  const nav = mkEl('');
  const pending = [];
  let seq = 0;
  const store = {};
  const win = { matchMedia: function (q) { return { matches: !!opts.hover, media: q }; } };
  const doc = { getElementById: id => (id === 'sidebar' ? sb : (id === 'nav' ? nav : null)) };
  const ls = { getItem: k => (store[k] === undefined ? null : store[k]), setItem: (k, v) => { store[k] = String(v); } };
  const setT = function (fn, ms) { const id = ++seq; pending.push({ id: id, fn: fn, ms: ms, dead: false }); return id; };
  const clearT = function (id) { pending.forEach(p => { if (p.id === id) p.dead = true; }); };
  const raf = fn => fn();

  const f = new Function('document', 'window', 'localStorage', 'setTimeout', 'clearTimeout', 'requestAnimationFrame',
    MOD + '\n;return {cmRailEnter:cmRailEnter,cmRailToggle:cmRailToggle,cmRailApply:cmRailApply};');
  const api = f(doc, win, ls, setT, clearT, raf);
  return {
    api: api, sb: sb, nav: nav, store: store,
    alive: () => pending.filter(p => !p.dead).length,
    fireAll: function () { pending.forEach(p => { if (!p.dead) { p.dead = true; p.fn(); } }); }
  };
}

console.log('=== 核心回归：定时器不能在 .rail 被摘掉之后仍展开浮层 ===');
t('rail 态先埋悬停计时器、再点「固定展开」→ 定时器触发后不得出现 rail-open', () => {
  const s = run({ hover: true, cls: 'sidebar rail' });
  s.api.cmRailEnter();
  eq(s.alive(), 1, '悬停应埋下 1 个计时器');
  s.api.cmRailToggle();                       // 用户点了「固定展开」
  ok(!s.sb.classList.contains('rail'), '点展开后应摘掉 .rail');
  s.fireAll();                                // 1 秒后定时器到点
  ok(!s.sb.classList.contains('rail-open'),
    '定时器仍把 rail-open 塞进去了 —— 侧栏会浮起来盖住正文（这就是平板遮挡的根因）');
});
t('点击「固定展开」必须当场掐掉悬停计时器（不留待发作的雷）', () => {
  const s = run({ hover: true, cls: 'sidebar rail' });
  s.api.cmRailEnter();
  eq(s.alive(), 1, '计时器未埋下');
  s.api.cmRailToggle();
  eq(s.alive(), 0, 'cmRailToggle 未 clearTimeout(cmRailHoverTimer)');
});

console.log('=== 防修成锁死：正常路径必须还在 ===');
t('桌面鼠标：悬停 1s 仍能临时展开浮层', () => {
  const s = run({ hover: true, cls: 'sidebar rail' });
  s.api.cmRailEnter();
  s.fireAll();
  ok(s.sb.classList.contains('rail-open'), '悬停展开被误杀');
});
t('桌面鼠标：rail 态单击导航仍立即展开浮层', () => {
  const s = run({ hover: true, cls: 'sidebar rail' });
  s.nav.fire('click');
  ok(s.sb.classList.contains('rail-open'), '桌面单击展开被误杀');
});
t('展开后 localStorage 记忆为 0，折叠为 1', () => {
  const s = run({ hover: true, cls: 'sidebar rail' });
  s.api.cmRailToggle();
  eq(s.store['cm_sidebar_rail'], '0', '展开态未记忆');
  s.api.cmRailToggle();
  eq(s.store['cm_sidebar_rail'], '1', '折叠态未记忆');
});

console.log('=== 触摸设备：根本不该进悬停这条路 ===');
t('hover:none 时 cmRailEnter 不埋计时器', () => {
  const s = run({ hover: false, cls: 'sidebar rail' });
  s.api.cmRailEnter();
  eq(s.alive(), 0, '触摸设备仍埋了悬停计时器（合成 mouseenter 会让它误触发）');
  s.fireAll();
  ok(!s.sb.classList.contains('rail-open'), '触摸设备不该出现悬停浮层');
});
t('hover:none 时单击导航不展开浮层（没有 mouseleave，开了就关不掉）', () => {
  const s = run({ hover: false, cls: 'sidebar rail' });
  s.nav.fire('click');
  ok(!s.sb.classList.contains('rail-open'), '触摸端仍会展开关不掉的浮层');
});

console.log('=== CSS 收口：浮层只能是 rail 的派生态 ===');
t('不存在裸 .sidebar.rail-open（浮层必须同时带 .rail）', () => {
  ok(html.indexOf('.sidebar.rail-open') < 0, '仍有未加 .rail 约束的 .sidebar.rail-open 规则');
});
t('浮层主规则仍在且带 .rail 前缀', () => {
  has(html, '.sidebar.rail.rail-open{width:var(--sidebar-w);margin-right:calc(68px - var(--sidebar-w));', '浮层主规则缺失');
  has(html, '.sidebar.rail{width:68px}', 'rail 宽度缺失');
});
t('所有 .rail-open 选择器都带 .rail 前缀', () => {
  const bad = [...html.matchAll(/\.sidebar[^{,]*\.rail-open?[^{]*\{/g)]
    .map(m => m[0]).filter(s => s.indexOf('.rail.rail-open') < 0 && s.indexOf('.rail-open') >= 0);
  eq(bad.length, 0, '存在未收口的规则：' + bad.join(' | '));
});

console.log('=== 源码形状守卫（防止将来又被改回去）===');
t('setTimeout 回调内先复查 .rail 再 add(rail-open)', () => {
  const enter = (MOD.match(/function cmRailEnter\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(enter, 'cmRailEnter 切片失败');
  const iChk = enter.indexOf("if(!cmRailSidebar.classList.contains('rail')) return;", enter.indexOf('setTimeout'));
  const iAdd = enter.indexOf("classList.add('rail-open')");
  ok(iChk > 0, '定时器回调里缺少对 .rail 的复查');
  ok(iAdd > iChk, '复查必须在 add(rail-open) 之前');
});
t('cmRailCanHover 用 (hover:hover) and (pointer:fine) 判定', () => {
  has(html, "matchMedia('(hover:hover) and (pointer:fine)')", '悬停能力判定缺失或口径被改');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 200).unref();
