/* v3.9.6 回归测试：点名预览栏的定格姓名不再自动消失
   老板口径：抽中的名字要一直留在右上角预览栏，**直到点「开始抽取」**才收起、开始新动画。
   本文件用真跑（抽 RC_SLICE 段代码进 new Function 沙箱）验证行为，
   不只看源码字符串 —— 否则改个变量名就假绿。

   ⚠️ 沙箱宿主清单（漏一个就报 ReferenceError，症状像产品 bug）：
      state / localDateStr / escapeHtml / showToast / document / sessionStorage /
      window / requestAnimationFrame / cancelAnimationFrame / setTimeout
   刻意**不提供 clearTimeout**：v3.9.6 起 _rcNameTimer 已删除，若还有人偷偷用它，
   沙箱会直接抛错 —— 这是有意留的探测器（原代码就是靠「变量恒为 0」躲过这个洞）。 */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); } }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }
function sliceFrom(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('切片锚点找不到：' + a + ' / ' + b);
  return html.slice(i, j);
}

/* RC_SLICE 覆盖整段课堂点名（rcSetRollName ... rcAbortOnHide），锚点与 _v2210b/_v2230/_v2260 一致 */
const RC_SLICE = sliceFrom('var RC_SESSION_KEY', '/* ==================== 成绩管理');
const LOCALDATE = (function () {
  const i = html.indexOf('function localDateStr(');
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
})();

console.log('=== ① 源码层：三处收尾逻辑已就位 ===');

t('rcReveal 里不再有 900ms 自动收起', () => {
  const REVEAL = sliceFrom('function rcReveal(', 'function rcFinish(');
  notHas(REVEAL, "rcSetRollName('')", 'rcReveal 不该再清空姓名');
  notHas(REVEAL, '_rcNameTimer', '定时器机制应已删除');
  has(REVEAL, 'rcSetRollName(stu.name, true)', '定格（lock）必须保留');
});

t('rcDrawNext 不再先清空（多人抽取时不能闪一帧白）', () => {
  const NEXT = sliceFrom('function rcDrawNext(', 'function rcTick(');
  notHas(NEXT, "rcSetRollName('')", 'rcDrawNext 不该清空姓名');
  notHas(NEXT, '_rcNameTimer');
});

t('rcStartDraw 在 phase 守卫之后、任何早期 return 之前清空', () => {
  const START = sliceFrom('function rcStartDraw(', 'function rcDrawNext(');
  const iGuard = START.indexOf("if(RC.phase !== 'idle') return;");
  const iClear = START.indexOf("rcSetRollName('');");
  const iEnsure = START.indexOf('rcEnsureToday();');
  const iReset = START.indexOf('rcReset();');
  ok(iGuard >= 0 && iClear >= 0 && iEnsure >= 0, '三个锚点都要在');
  ok(iGuard < iClear, '清空必须在 phase 守卫之后（否则守卫前就清了）');
  ok(iClear < iEnsure, '清空必须在 rcEnsureToday 之前');
  ok(iClear < iReset, '清空必须在「池空 → rcReset」这条早期 return 之前');
});

t('_rcNameTimer 变量与其 clearTimeout 全链删除（否则残留死代码）', () => {
  notHas(html, '_rcNameTimer', '全文档不该再有该标识符');
});

t('中止路径仍然清空（切走 / 重置不能留残影）', () => {
  const CANCEL = sliceFrom('function rcCancelRoll(', '/* --- 抽取主流程 --- */');
  has(CANCEL, "rcSetRollName('')", 'rcCancelRoll 必须清空');
  const RESET = sliceFrom('function rcReset()', '/* v3.9.2 预览栏');
  has(RESET, 'rcCancelRoll()', 'rcReset 必须经 rcCancelRoll 清空');
});

console.log('\n=== ② 行为层：真跑抽取流程 ===');

/* 预览栏的「名字盒」桩：模拟真实 DOM 的 textContent 语义
   —— box.textContent='' 会移除子节点，所以 firstElementChild 必须跟着清，
   否则读出来的名字仍是旧的，断言会假绿。 */
function mkNameBox() {
  const set = new Set();
  const box = {
    firstElementChild: null, offsetWidth: 0,
    classList: {
      add(c) { set.add(c); }, remove(...cs) { cs.forEach(c => set.delete(c)); },
      contains(c) { return set.has(c); },
      toggle(c, on) { if (on === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (on) { set.add(c); } else { set.delete(c); } }
    },
    appendChild(c) { box.firstElementChild = c; return c; },
    _cls: set
  };
  let txt = '';
  Object.defineProperty(box, 'textContent', {
    get() { return txt; },
    set(v) { txt = String(v); if (!txt) box.firstElementChild = null; }
  });
  return box;
}
function elStub(extra) {
  const o = Object.assign({
    innerHTML: '', textContent: '', value: '1', disabled: false, className: '',
    offsetWidth: 0, firstElementChild: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild(c) { this.firstElementChild = c; return c; },
    setAttribute() {}, dataset: {}
  }, extra || {});
  return o;
}

function mkSandbox(st) {
  const calls = { toasts: [], timers: [] };
  const nameBox = mkNameBox();
  const generic = {};
  const doc = {
    getElementById(id) {
      if (id === 'rcRollName') return nameBox;
      if (!generic[id]) generic[id] = elStub();
      return generic[id];
    },
    createElement() { return elStub({ className: '' }); },
    querySelectorAll() { return []; },
    addEventListener() {},
    hidden: false
  };
  const session = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); } };
  const win = { matchMedia: () => ({ matches: false }) };

  const api = new Function(
    'state', 'localDateStr', 'escapeHtml', 'showToast', 'document', 'sessionStorage',
    'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    LOCALDATE + '\n' + RC_SLICE +
    '\nreturn { rcSetRollName, rcStartDraw, rcDrawNext, rcReveal, rcCancelRoll, rcReset,' +
    ' rcCandidates, RC, getDone: function(){ return rcDoneSet; },' +
    ' getPicked: function(){ return rcPickedSet; },' +
    ' setQueue: function(q){ RC.queue = q; RC.idx = 0; } };'
  )(
    st,
    function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    function (s) { return String(s == null ? '' : s); },
    function (m, k) { calls.toasts.push({ m, k }); },
    doc, session, win,
    function () { return 1; },      // requestAnimationFrame：不真跑
    function () {},
    function (fn, ms) { calls.timers.push({ fn, ms }); return calls.timers.length; }
  );

  // 读当前预览栏显示的名字（与真实 DOM 同语义：没有子节点就是空）
  const shown = () => (nameBox.firstElementChild ? nameBox.firstElementChild.textContent : '');
  // 把排队的定时器全跑完（跑完还会排新的就继续，最多 10 轮防死循环）
  const flush = () => { for (let k = 0; k < 10 && calls.timers.length; k++) { const batch = calls.timers.splice(0); batch.forEach(x => x.fn()); } };
  return { api, calls, nameBox, shown, flush, doc };
}

const STU = [{ id: 1, name: '林知远' }, { id: 2, name: '周予安' }, { id: 3, name: '沈书白' }];

t('抽中后名字定格在预览栏，且跑完所有定时器也不消失（核心）', () => {
  const sb = mkSandbox({ students: STU.slice(), leaves: [] });
  sb.api.setQueue([STU[0]]);
  sb.api.rcReveal();
  eq(sb.shown(), '林知远', 'rcReveal 后应显示抽中的名字');
  ok(sb.nameBox._cls.has('lock'), '应带上 lock 类（琥珀金 + 回弹）');
  sb.flush();                       // 关键：原来是 900ms 后被一个 setTimeout 清掉的
  eq(sb.shown(), '林知远', '定时器跑完后名字必须还在（v3.9.6 不许自动收起）');
  ok(sb.nameBox._cls.has('lock'), 'lock 类也要留着，颜色不能退回绿色');
});

t('抽完这一轮（rcFinish）之后名字仍然留着', () => {
  const sb = mkSandbox({ students: STU.slice(), leaves: [] });
  sb.api.setQueue([STU[1]]);
  sb.api.rcReveal();
  sb.flush();
  eq(sb.api.RC.phase, 'idle', '单人抽完应回到 idle');
  eq(sb.shown(), '周予安', '整轮结束后名字应常驻，充当「本轮最后抽中」');
});

t('点「开始抽取」才收起旧名字', () => {
  const sb = mkSandbox({ students: STU.slice(), leaves: [] });
  sb.api.setQueue([STU[2]]);
  sb.api.rcReveal();
  sb.flush();
  eq(sb.shown(), '沈书白', '前置条件：名字还在');
  sb.api.rcStartDraw();             // 下一轮
  eq(sb.shown(), '', '点开始抽取后旧名字必须立刻收起');
  ok(!sb.nameBox._cls.has('lock'), 'lock 类同时清掉，否则新滚动还是琥珀色');
  eq(sb.api.RC.phase, 'rolling', '并进入新一轮滚动');
});

t('多人抽取：上一位的定格名不会被「下一位开滚」提前清掉', () => {
  const sb = mkSandbox({ students: STU.slice(), leaves: [] });
  sb.api.setQueue([STU[0], STU[1]]);
  sb.api.rcReveal();                // 第一位揭晓
  eq(sb.shown(), '林知远', '第一位定格');
  sb.api.rcDrawNext();              // 下一位开始滚（沙子箱里 rAF 不真跑，所以名字没人接管）
  eq(sb.shown(), '林知远', '下一位开滚前不许清空 —— 清了就是老板看到的「闪一下白」');
});

t('中止 / 重置仍然清空（不能留残影）', () => {
  const sb = mkSandbox({ students: STU.slice(), leaves: [] });
  sb.api.setQueue([STU[0]]);
  sb.api.rcReveal();
  sb.flush();
  eq(sb.shown(), '林知远', '前置条件');
  sb.api.rcCancelRoll();
  eq(sb.shown(), '', 'rcCancelRoll 应清空');
  sb.api.setQueue([STU[0]]);
  sb.api.rcReveal();
  sb.flush();
  sb.api.rcReset();
  eq(sb.shown(), '', 'rcReset 应清空');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
