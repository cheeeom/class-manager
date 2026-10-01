/* v2.25.0 回归测试：课堂点名卡片右上角「已点到」绿勾
   老板原话（2026-10-01）：
     「在课堂点名点击姓名卡片或者抽人的时候，姓名卡片反馈变灰的同时
       右上角应该加上绿色的勾号。」

   本版是**纯 CSS 改动**（零 JS、零 HTML 结构），所以测试的重点不是「有没有那段 CSS」，
   而是把这次改动**依赖的三条前提**钉住 —— 任何一条被后来的改动破坏，勾就会静默失效：

     前提 A：勾的几何与「圆心」互为反算。
             圆 top:3px 直径 20 ⇒ 圆心距顶/右各 13；勾元素写的就是 top:13px right:13px。
             只改圆径而不改这两个 13 ⇒ 勾会从圆里飘出去。本测试**真算**这个等式。
     前提 B：勾靠类名驱动，而 rcPaintCard 只 toggle 类、不重建 DOM。
             ⇒ 勾必须用伪元素实现；一旦改成插 DOM 就得同时改两条渲染路径。
     前提 C：rc-leave / rc-pick / rc-done 三态**互斥**。
             ⇒ 请假卡（右上角已有绿色「假」徽章）永远不会同时挂上勾，不会出现两个绿圆。
             这一条是**行为级真跑** rcPaintCard 验的，不是读源码猜的。

   另一处本轮顺手修掉的雷（A-0 护栏新增第③查的现场）：
     _v2241_test.js 曾写 `html.indexOf('/* v2.24.1 推送互斥')`，
     即「拿 index.html 里一段带版本号的注释当切片起点」。跟版只改四处活动标记、
     不改那段注释 ⇒ 锚点静默失效、整套测试崩。已换成版本无关锚点。

   版本无关：版本号一律从 sw.js 的 CACHE_NAME 反推，发版不需要动本文件。
   运行：node _v2250_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const VER = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + `不应出现 ${JSON.stringify(b)}`); }

function sliceFrom(a, b, src) {
  const s = src || html;
  const i = s.indexOf(a);
  if (i < 0) throw new Error('切片起点找不到: ' + a);
  const j = s.indexOf(b, i + 1);
  if (j < 0) throw new Error('切片终点找不到: ' + b);
  return s.slice(i, j);
}
/* 从锚点切到它后面第一个 } —— 多行选择器组也能整段拿到 */
function blockAfter(anchor) {
  const i = CSS.indexOf(anchor);
  if (i < 0) throw new Error('找不到规则: ' + anchor);
  const j = CSS.indexOf('}', i);
  return CSS.slice(i, j + 1);
}
function blockOf(txt, anchor) {
  const i = txt.indexOf(anchor);
  if (i < 0) throw new Error('找不到规则: ' + anchor);
  const j = txt.indexOf('}', i);
  return txt.slice(i, j + 1);
}
/* 从源码里按花括号配平切出一个函数（与 _v2191_test.js 同款） */
function extractFn(name, src) {
  const s = src || html;
  const lines = s.split('\n');
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

/* 点名页 CSS 区段（与 _v2210b_test.js 同一对锚点，确保测的就是它切片的那一段） */
const CSS = sliceFrom('.rc-toolbar{', '</style>');

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  ok(blocks.length > 0, '一个 script 块都没找到');
  blocks.forEach(m => new Function(m[1]));
});

console.log('\n=== ① 绿勾两条规则存在且形状正确 ===');
const ROUND = blockAfter('.rc-card.rc-done::after');
const CHECK = blockAfter('.rc-card.rc-done::before');

t('圆底规则：灰卡与黄框卡共用一组选择器', () => {
  const sel = ROUND.split('{')[0];
  has(sel, '.rc-card.rc-done');
  has(sel, '.rc-card.rc-pick');
  has(sel, '::after');
});
t('圆底形状：贴角 3px / 直径 20 / 正圆 / 走 --success', () => {
  has(ROUND, 'position:absolute');
  has(ROUND, 'top:3px;right:3px;width:20px;height:20px;');
  has(ROUND, 'border-radius:50%');
  has(ROUND, 'background:var(--success)');
  has(ROUND, 'content:\'\'');
});
t('圆底走主题变量、不硬编码绿（深色主题靠它自动跟随）', () => {
  notHas(ROUND, '#2F7D5B', '不许硬编码石绿');
  notHas(ROUND, 'background:#', '不许硬编码颜色');
});
t('勾规则：白勾 + 旋转 45° 的 L 形边框', () => {
  const sel = CHECK.split('{')[0];
  has(sel, '.rc-card.rc-done');
  has(sel, '.rc-card.rc-pick');
  has(sel, '::before');
  has(CHECK, 'border:solid #fff;border-width:0 2px 2px 0');
  has(CHECK, 'transform:translate(50%,-50%) rotate(45deg)');
});
t('两条规则都不吃点击（pointer-events:none）', () => {
  has(ROUND, 'pointer-events:none', '圆底会挡住卡片点击');
  has(CHECK, 'pointer-events:none', '勾会挡住卡片点击');
});
t('勾压在圆之上（z-index 分层）', () => {
  const zr = /z-index:(\d+)/.exec(ROUND);
  const zc = /z-index:(\d+)/.exec(CHECK);
  ok(zr && zc, '两条规则都要有 z-index');
  ok(Number(zc[1]) > Number(zr[1]), '勾的 z-index 必须高于圆底');
});
t('⛔ 勾不用字形（本项目勾选框一律不用字形，会渲染成彩色 emoji）', () => {
  ['✓', '✔', '☑', '√', '✅', '🗸'].forEach(g => notHas(ROUND + CHECK, g, '出现了字形 ' + g));
  eq((ROUND + CHECK).match(/content:/g).length, 2, 'content 出现次数');
  eq((ROUND + CHECK).match(/content:''/g).length, 2, 'content 必须都是空串（纯 CSS 画）');
});

console.log('\n=== ② 几何不变量：勾心与圆心必须互为反算（真算，不是读字面） ===');
const mr = /top:(\d+)px;right:(\d+)px;width:(\d+)px;height:(\d+)px/.exec(ROUND);
const mc = /top:(\d+)px;right:(\d+)px;width:(\d+)px;height:(\d+)px/.exec(CHECK);
t('两条规则的几何声明都能解析出来', () => { ok(mr && mc, '几何声明缺失或格式变了'); });
t('圆是正圆（宽高相等）', () => { eq(mr[3], mr[4], '圆必须正圆'); });
t('★ 勾元素的 top == 圆心距顶（改圆径必须同步改勾）', () => {
  const centerFromTop = Number(mr[1]) + Number(mr[4]) / 2;
  eq(Number(mc[1]), centerFromTop,
     `圆心距顶 = ${mr[1]}+${mr[4]}/2 = ${centerFromTop}，勾元素写的却是 ${mc[1]}`);
});
t('★ 勾元素的 right == 圆心距右', () => {
  const centerFromRight = Number(mr[2]) + Number(mr[3]) / 2;
  eq(Number(mc[2]), centerFromRight,
     `圆心距右 = ${mr[2]}+${mr[3]}/2 = ${centerFromRight}，勾元素写的却是 ${mc[2]}`);
});
t('勾的外接尺寸放得进圆里（旋转 45° 后的对角 < 圆内接正方形边长）', () => {
  const w = Number(mc[3]), h = Number(mc[4]);
  const diag = (w + h) / Math.SQRT2;                 // 旋转 45° 后的包围盒边长
  const inner = Number(mr[3]) / Math.SQRT2;           // 圆内接正方形边长
  ok(diag < inner, `勾旋转后 ${diag.toFixed(2)}px 超过圆内接正方形 ${inner.toFixed(2)}px`);
});
t('圆与请假徽章几何一致（右上角标记保持一套语言）', () => {
  const badge = blockOf(CSS, '.rc-badge{');
  const mb = /top:(\d+)px;right:(\d+)px;width:(\d+)px;height:(\d+)px/.exec(badge);
  ok(mb, '请假徽章的几何声明找不到');
  eq(mr[1], mb[1], '贴角 top 应与请假徽章一致');
  eq(mr[2], mb[2], '贴角 right 应与请假徽章一致');
  eq(mr[3], mb[3], '直径应与请假徽章一致');
  eq(mr[4], mb[4], '高度应与请假徽章一致');
});

console.log('\n=== ③ 勾只挂「已点到」语义：滚动闪烁与请假都不给勾 ===');
t('两组选择器都不含 rc-roll（滚动闪烁的卡还没进已点到集合）', () => {
  notHas(ROUND.split('{')[0], '.rc-roll');
  notHas(CHECK.split('{')[0], '.rc-roll');
});
t('两组选择器都不含 rc-leave（请假卡右上角是绿色「假」徽章，不能出现两个绿圆）', () => {
  notHas(ROUND.split('{')[0], '.rc-leave');
  notHas(CHECK.split('{')[0], '.rc-leave');
});

console.log('\n=== ④ 「已点到」不再整卡降透明度（否则绿勾被一起冲淡） ===');
const DONE_RULE = blockOf(CSS, '.rc-card.rc-done{');
const NAME_RULE = blockOf(CSS, '.rc-card.rc-done .rc-name{');
const PICK_RULE = blockOf(CSS, '.rc-card.rc-pick{');
t('整卡规则里不再有 opacity', () => {
  notHas(DONE_RULE, 'opacity',
    '整卡 opacity 是分组不透明度，会把新增的绿勾一起冲淡（60% 下最深只能到灰绿）');
});
t('姓名单独降到 60%', () => { has(NAME_RULE, 'opacity:.6'); });
t('黄框卡仍是满不透明（两处勾才会同色）', () => { has(PICK_RULE, 'opacity:1'); });
t('灰卡仍走灰底 + 灰字（「变灰」的反馈没有被削弱）', () => {
  has(DONE_RULE, 'background:var(--bg-secondary)');
  has(DONE_RULE, 'color:var(--text-muted)');
});

console.log('\n=== ⑤ 行为级真跑：三态互斥（勾靠它才不会串到请假卡上） ===');
const PAINT_SRC = extractFn('rcPaintCard');
/* ⚠️ new Function 只是**定义** rcPaintCard，必须显式 return 出来再调用 ——
   少了这一步不会报错，只会「什么都没发生」（四个状态全是 undefined）。 */
const PAINT_FACTORY = new Function(
  'document', 'rcLeaveMap', 'rcDate', 'rcHas', 'rcPickedSet', 'rcDoneSet',
  PAINT_SRC + '\nreturn rcPaintCard;');
function paint(isLeave, inPicked, inDone) {
  const cls = {};
  const el = { classList: { toggle(c, on) { cls[c] = !!on; } } };
  const document = { getElementById() { return { querySelector() { return el; } }; } };
  const rcLeaveMap = () => (isLeave ? { 7: { studentId: 7 } } : {});
  const rcHas = (arr, id) => arr.indexOf(id) >= 0;
  const rcPickedSet = inPicked ? [7] : [];
  const rcDoneSet = inDone ? [7] : [];
  const fn = PAINT_FACTORY(document, rcLeaveMap, '2026-10-01', rcHas, rcPickedSet, rcDoneSet);
  fn(7);
  return cls;
}
t('请假学生：只挂 rc-leave（因此只会出现「假」徽章，不会有勾）', () => {
  const s = paint(true, false, true);      // 即使数据脏了（同时在 done 集合里）也不给勾
  eq(s['rc-leave'], true);
  eq(s['rc-pick'], false, 'rc-pick 不该出现');
  eq(s['rc-done'], false, 'rc-done 不该出现（否则请假卡会多出一个绿勾）');
});
t('刚抽中：挂 rc-pick、不挂 rc-done（黄框压灰底）', () => {
  const s = paint(false, true, true);
  eq(s['rc-pick'], true);
  eq(s['rc-done'], false);
  eq(s['rc-leave'], false);
});
t('已点到：挂 rc-done、不挂 rc-pick', () => {
  const s = paint(false, false, true);
  eq(s['rc-done'], true);
  eq(s['rc-pick'], false);
});
t('未点到：三态都不挂（所以没有勾）', () => {
  const s = paint(false, false, false);
  eq(s['rc-done'], false);
  eq(s['rc-pick'], false);
  eq(s['rc-leave'], false);
});
t('整墙重画走的是同一套互斥（renderRollCall 的 else-if 链）', () => {
  const rr = extractFn('renderRollCall');
  has(rr, "if(lm[s.id]) cls += ' rc-leave';");
  has(rr, "else if(rcHas(rcPickedSet, s.id)) cls += ' rc-pick';");
  has(rr, "else if(rcHas(rcDoneSet, s.id)) cls += ' rc-done';");
});

console.log('\n=== ⑥ 揭晓才落勾：滚动闪烁期间不亮 ===');
const TICK_SRC = sliceFrom('function rcTick(', 'function rcReveal(');
const REVEAL_SRC = sliceFrom('function rcReveal(', 'function rcFinish(');
t('滚动循环只碰 rc-roll，从不碰 rc-done / rc-pick', () => {
  has(TICK_SRC, 'rc-roll');
  notHas(TICK_SRC, 'rc-done');
  notHas(TICK_SRC, 'rc-pick');
});
t('rcReveal 才把学生写进两个集合（黄框与勾同时出现的那一刻）', () => {
  has(REVEAL_SRC, 'rcDoneSet.push(stu.id)');
  has(REVEAL_SRC, 'rcPickedSet.push(stu.id)');
});

console.log('\n=== ⑦ 源序：新规则不破坏既有三套测试的断言 ===');
t('触摸守卫 < rc-done < rc-pick，且新规则在 rc-pick 之后', () => {
  const iHook = CSS.indexOf('@media(hover:none){.rc-card:hover');
  const iDone = CSS.indexOf('.rc-card.rc-done');
  const iPick = CSS.indexOf('.rc-card.rc-pick');
  const iNew = CSS.indexOf('.rc-card.rc-done::after');
  ok(iHook >= 0 && iDone >= 0 && iPick >= 0 && iNew >= 0, '四个锚点都要能找到');
  ok(iHook < iDone, '触摸守卫必须排在 rc-done 之前');
  ok(iDone < iPick, 'rc-done 必须排在 rc-pick 之前');
  ok(iPick < iNew, '新规则必须插在既有选中态之后');
});
t('新注释里不含两个选择器的原样字面（否则 indexOf 命中位置整体前移）', () => {
  const iNew = CSS.indexOf('/* v2.25.0 课堂点名卡片');
  ok(iNew >= 0, '找不到本轮的新注释');
  const seg = CSS.slice(iNew, CSS.indexOf('*/', iNew));
  notHas(seg, '.rc-card.rc-done');
  notHas(seg, '.rc-card.rc-pick');
  notHas(seg, '.rc-badge{');
});
t('拆分透明度那条注释也不含选择器原样字面', () => {
  const iNew = CSS.indexOf('/* v2.25.0 「已点到」');
  ok(iNew >= 0, '找不到拆分透明度的注释');
  const seg = CSS.slice(iNew, CSS.indexOf('*/', iNew));
  notHas(seg, '.rc-card.rc-done');
  notHas(seg, '.rc-card.rc-pick');
});

console.log('\n=== ⑧ 既有契约不破 ===');
t('请假徽章的标定注释与 padding-bottom 仍在（_v2220/_v2230 锁着）', () => {
  has(html, 'padding-bottom:1px 让行盒');
  has(blockOf(CSS, '.rc-badge{'), 'padding-bottom:1px');
});
t('黄框卡的弹入动效与降级仍在', () => {
  has(PICK_RULE, 'animation:rcPop');
  has(html, '@keyframes rcPop');
  const rm = html.slice(html.indexOf('@media(prefers-reduced-motion:reduce)'));
  has(rm, '.rc-card.rc-pick{animation:none}');
});
t('卡片墙仍不内嵌独立滚动区（_v2230 的约定）', () => {
  notHas(blockOf(CSS, '.rc-wall{'), 'overflow-y:auto');
  notHas(blockOf(CSS, '.rc-wall{'), 'max-height');
});
t('点名的落盘约定未变（仍不落 state、不上云）', () => {
  notHas(html, "key:'rollcallSessions'");
});
t('卡片仍只用类名驱动、不重建 DOM（勾靠的就是这一点）', () => {
  notHas(PAINT_SRC, 'innerHTML');
  has(PAINT_SRC, 'classList.toggle');
});

console.log('\n=== ⑨ 版本一致性（从 CACHE_NAME 反推，发版无需改本文件） ===');
t('四处活动标记与 CACHE_NAME 一致', () => {
  ok(VER, 'sw.js 里没读到 CACHE_NAME');
  has(html, `<div class="login-version">${VER}</div>`);
  has(html, `<div class="sidebar-footer">${VER} · 班主任工作台</div>`);
  has(html, `🏷️ ${VER}</span>`);
  has(html, `📝 近版更新速览（${VER}）`);
});
t('速览正文至少 3 条', () => {
  const i = html.indexOf('id="settingsReleaseNotes"');
  ok(i > 0, '找不到速览容器');
  const seg = html.slice(i, html.indexOf('</div>', i));
  ok(seg.split('<br>').length - 1 >= 3, '速览正文少于 3 条');
});

console.log('\n' + '='.repeat(56));
console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail) {
  console.log('\n失败项：');
  failures.forEach(f => console.log('  ✗ ' + f));
}
process.exit(fail ? 1 : 0);
