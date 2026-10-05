/* v2.26.0 回归测试：课堂点名卡片墙「默认姓名音序 + 一键打乱」与预览栏向左侧拓展
   老板原话（2026-10-01）：
     「姓名卡片要支持重新打乱顺序，和支持默认按姓名首字母音序排序，
       将洗牌按钮放在重置本轮右侧。我发现抽取人数5人以上的时候，
       右侧的预览栏就会往下拓展，你把预览栏往左侧拓展一些空间，左侧还有余量。」

   本测试要钉住的，是这次改动**最容易静默退化**的几条前提：

     前提 A：音序排序的正确性全靠一张「多音字姓氏 → 同音代理字」表，
             而 ICU 的中文排序对多音字是**按字面默认读音**排的
             （曾=céng、单=dān、解=jiě、查=chá、区=qū、尉=wèi、种=zhǒng、
               乐=lè、藏=cáng、秘=mì、术=shù…），与姓氏读音不符就会排错音段。
             本测试**不读表自证**，而是把表里每个字与它的代理字分别跟一批
             读音已知的锚点字混排，要求**邻居完全相同** —— 这才证明代理字真的读对。
             同时反向要求：实测 ICU 本来就对的字（隗/任/相/阚/纪/舍/长）不许进表。
             ⇒ 这条判据经反向对照验证过有效（仇/单/解 用非姓氏读音时邻居吻合、
               用姓氏读音时不吻合），不是恒真的空断言。

     前提 B：rcOrder 是「显示顺序」的唯一真相，且学生增删后**不许少人、不许留空洞**。
             rcOrderedStudents() = rcOrder 里仍在册的按 rcOrder + 未登记的追加到末尾并按音序。
             加学生要立刻出现在末尾、删学生不留空洞 —— 这两条都是行为级真跑。

     前提 C：顺序存在 sessionStorage（与已点到/中签同一条会话记录），**不进 state**。
             它是本机会话态，不该同步上云；也不该为它新开 state 字段。
             ⇒ 老会话没有 order 字段时必须优雅落到「按音序」，不能崩。

     前提 D：预览栏加宽**不能靠抬 flex-basis**，只能靠「改 flex-grow + 用 max-width 封顶」。
             原因：flex-wrap:wrap 的换行判定看的是 flex-basis（hypothetical main size），
             抬任一边的 basis 都会把「并排门槛」顶上去，越宽的屏反而越早被顶到第二行。
             而 max-width 不参与该判定 ⇒ 才能「控制组别吸走余量」与「门槛不变」两全。
             改动还必须整体隔离进 @media(min-width:1280px)：改动前的
             「预览栏 grow:0 ⇒ 余量全归控制组」在 1188~1248 视口恰好是**必要的**，
             在主规则里动它会让那几档视口的控制组内部换行（实测 84→118）。
             全部数字来自无头 Edge 跑真实 CSS：_rm/_probe_ctrl.py、_rm/_cmp_plan.py、
             _rm/_vp_verify.py（后者按真实视口渲染，媒体查询才测得准）。

   版本无关：版本号一律从 sw.js 的 CACHE_NAME 反推，发版不需要动本文件下半部分。
   运行：node _v2260_test.js */
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
function blockOf(txt, anchor) {
  const i = txt.indexOf(anchor);
  if (i < 0) throw new Error('找不到规则: ' + anchor);
  const j = txt.indexOf('}', i);
  return txt.slice(i, j + 1);
}

const CSS = sliceFrom('.rc-toolbar{', '</style>');
const RC_SLICE = sliceFrom('var RC_SESSION_KEY', '/* ==================== \u6210\u7ee9\u7ba1\u7406');
const LOCALDATE = (function () {
  const i = html.indexOf('function localDateStr(');
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
})();

/* ============================================================
   沙箱：与 _v2210b_test.js / _v2230_test.js 同一套做法
   —— 形参 10 / 实参 10，必须一一对应
      （new Function 的实参错位不会报错，只会让后面全变 undefined）
   ============================================================ */
function elStub() {
  return {
    textContent: '', innerHTML: '', value: '1', disabled: false, max: '',
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, dataset: {}, setAttribute() {}, getAttribute() { return null; }
  };
}
function mkSandbox(st, opts) {
  opts = opts || {};
  const els = {};
  const doc = {
    getElementById(id) { if (!els[id]) els[id] = elStub(); return els[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    /* RC 区段里有一句模块级的 document.addEventListener('visibilitychange', …)
       ⇒ 桩里必须有它，否则 new Function 一执行就 TypeError（漏宿主全局的老坑） */
    addEventListener() {},
    hidden: false
  };
  const session = opts.session || {
    _m: {},
    getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
    setItem(k, v) { this._m[k] = String(v); }
  };
  const toasts = [];
  const win = { matchMedia: () => ({ matches: false }) };
  const api = new Function(
    'state', 'localDateStr', 'escapeHtml', 'showToast', 'document', 'sessionStorage',
    'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    LOCALDATE + '\n' + RC_SLICE +
    '\nreturn { rcLeaveEnd, rcOnLeave, rcLeaveMap, rcCandidates, rcSample, rcHas, rcEnsureToday,' +
    ' rcLoad, rcSave, rcToggleDone, rcRefreshStats, rcStartDraw, rcReveal, rcCancelRoll, rcReset,' +
    ' rcPaintCard, rcNameKey, rcCompareName, rcSortByName, rcOrderedStudents, rcShuffle, RC,' +
    ' getOrder: function(){ return rcOrder; }, setOrder: function(a){ rcOrder = a; },' +
    ' getDone: function(){ return rcDoneSet; }, setDone: function(a){ rcDoneSet = a; },' +
    ' getPicked: function(){ return rcPickedSet; }, setPicked: function(a){ rcPickedSet = a; },' +
    ' getDate: function(){ return rcDate; }, setDate: function(d){ rcDate = d; },' +
    ' setLoaded: function(b){ rcLoaded = b; } };'
  )(
    st,
    function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    function (s) { return String(s == null ? '' : s); },
    function (m, k) { toasts.push({ m: m, k: k }); },
    doc, session, win,
    function (cb) { return 1; },
    function () {},
    function (fn, ms) { return 1; }
  );
  return { st, api, els, session, toasts };
}
function stu(id, name) { return { id: id, name: name, credit: 0, tags: [] }; }

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  ok(blocks.length > 0, '一个 script 块都没找到');
  blocks.forEach(m => new Function(m[1]));
});
t('签名：rcSortByName(list) 接收数组并返回新数组', () => {
  const src = sliceFrom('function rcSortByName(', '\nfunction rcOrderedStudents');
  has(src, 'list.slice().sort(');
});
t('rcOrderedStudents 无参（顺序由内部 rcOrder + state 派生）', () => {
  has(html, 'function rcOrderedStudents(){');
});

/* ============================================================ */
console.log('\n=== ① 洗牌按钮：在「重置本轮」右侧，图标放在 sprite 干净处 ===');
const BTN = sliceFrom('<button class="btn btn-outline" id="rcShuffleBtn"', '</button>');
t('按钮形态：中性描边样式（不新造按钮类）+ 绑定 rcShuffle', () => {
  has(BTN, 'class="btn btn-outline"');
  has(BTN, 'onclick="rcShuffle()"');
  has(BTN, 'id="rcShuffleBtn"');
});
t('按钮带洗牌图标', () => has(BTN, '<use href="#i-shuffle"/>'));
t('★ 洗牌按钮在「重置本轮」右侧', () => {
  const iReset = html.indexOf('id="rcResetBtn"');
  const iShuf = html.indexOf('id="rcShuffleBtn"');
  ok(iReset > 0 && iShuf > iReset, `reset=${iReset} shuffle=${iShuf}`);
});
t('★ 洗牌与重置都在「开始抽取」右侧（工具栏顺序：开始 → 重置 → 打乱）', () => {
  const tb = html.indexOf('<div class="rc-toolbar">');
  const iStart = html.indexOf('id="rcStartBtn"', tb);
  const iReset = html.indexOf('id="rcResetBtn"', tb);
  const iShuf = html.indexOf('id="rcShuffleBtn"', tb);
  ok(iStart > tb && iReset > iStart && iShuf > iReset, `${iStart} / ${iReset} / ${iShuf}`);
});
t('★ 图标 symbol 插在 i-dorm 畸形区之前（不碰那片未闭合的 <symbol>）', () => {
  const i = html.indexOf('<symbol id="i-shuffle"');
  const iDorm = html.indexOf('<symbol id="i-dorm"');
  ok(i > 0 && i < iDorm, `shuffle=${i} i-dorm=${iDorm}`);
});
t('洗牌图标是描边风格（与本项目 .ic 一致，不写死颜色）', () => {
  const sym = sliceFrom('<symbol id="i-shuffle"', '</symbol>');
  has(sym, 'viewBox="0 0 24 24"');
  notHas(sym, 'fill="');
  notHas(sym, 'stroke="');
  notHas(sym, '#');
});

/* ============================================================ */
console.log('\n=== ② 默认音序排序（行为级真跑）===');
const S = mkSandbox({ students: [
  stu(1, '陈嘉悦'), stu(2, '安然'), stu(3, '张小明'), stu(4, '李思远'),
  stu(5, '王雨桐'), stu(6, '丁一'), stu(7, '白露'), stu(8, '曹雪'), stu(9, '邓超')
], leaves: [] });

t('★ 已知无歧义姓名按拼音排到正确顺序', () => {
  const got = S.api.rcSortByName(S.st.students).map(s => s.name);
  eq(got.join(' '), '安然 白露 曹雪 陈嘉悦 邓超 丁一 李思远 王雨桐 张小明');
});
t('自证有序：排完的结果里相邻两项 cmp <= 0（不写死顺序，随 ICU 版本也成立）', () => {
  const arr = S.api.rcSortByName(S.st.students);
  for (let i = 1; i < arr.length; i++) {
    const c = S.api.rcCompareName(arr[i - 1].name, arr[i].name);
    ok(c <= 0, `第 ${i} 与 ${i + 1} 项逆序：${arr[i - 1].name} / ${arr[i].name} → ${c}`);
  }
});
t('rcSortByName 不改动传入数组（返回新数组）', () => {
  const before = S.st.students.map(s => s.id).join(',');
  S.api.rcSortByName(S.st.students);
  eq(S.st.students.map(s => s.id).join(','), before);
});
t('同名同音用 id 兜底 ⇒ 顺序稳定可复现', () => {
  const dup = [{ id: 9, name: '张小明' }, { id: 3, name: '张小明' }, { id: 5, name: '张小明' }];
  const a = S.api.rcSortByName(dup).map(s => s.id).join(',');
  const b = S.api.rcSortByName(dup.slice().reverse()).map(s => s.id).join(',');
  eq(a, '3,5,9');
  eq(a, b, '同名单在正序/逆序输入下结果必须一致');
});
t('rcNameKey 对空 / null 名字不崩', () => {
  eq(S.api.rcNameKey(''), '');
  eq(S.api.rcNameKey(null), '');
  eq(S.api.rcNameKey(undefined), '');
});

/* ============================================================ */
console.log('\n=== ③ 多音字姓氏代理表（用位置判据**实测**核验每一条）===');
/* 锚点：常见姓氏，读音无歧义，覆盖整个拼音表 */
const ANCHORS = '阿白包鲍毕卞卜蔡曹岑昌常车陈成程池充储楚褚崔戴单党邓狄刁丁董窦杜段范方房费冯伏符傅甘高郜戈盖耿弓公龚巩勾古谷顾关管桂郭国韩杭郝何贺洪侯胡花华滑怀黄惠霍姬吉纪季贾简江姜蒋焦金靳经井居鞠康柯孔寇蒯匡邝赖蓝郎劳乐雷冷黎李理厉连廉练梁廖林凌刘柳龙娄卢鲁陆路逯吕栾罗骆马麦满毛茅梅孟米宓苗闵明缪莫牟穆那倪聂宁牛钮农潘庞裴彭皮平蒲浦戚齐钱强乔秦邱裘曲屈瞿权冉饶任荣阮芮萨赛桑沙山商邵佘申沈盛施石史舒束双水司宋苏宿孙邰谭汤唐陶滕田佟童涂屠万汪王危韦卫魏温文翁邬吴伍武奚习席夏鲜项向萧谢辛邢熊徐许薛荀严言阎颜晏燕杨姚叶伊易殷尹应尤于俞虞禹郁喻元袁岳云臧曾翟詹湛张章赵甄郑钟周朱诸祝庄卓宗邹祖';
const COLL = new Intl.Collator('zh-Hans-CN', { usage: 'sort' });
/* 某个字在「锚点 + 它自己」里的前后各 3 个邻居 —— 邻居暴露 ICU 给它的读音 */
function neighbors(ch) {
  const all = (ANCHORS + ch).split('');
  const uniq = [...new Set(all)];
  uniq.sort(COLL.compare);
  const i = uniq.indexOf(ch);
  return uniq.slice(Math.max(0, i - 3), i).join('') + '│' + uniq.slice(i + 1, i + 4).join('');
}
const ALIAS_SRC = sliceFrom('var RC_SURNAME_ALIAS = {', '};');
const ALIAS = {};
[...ALIAS_SRC.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)].forEach(m => { ALIAS[m[1]] = m[2]; });
const ALIAS_N = Object.keys(ALIAS).length;

t(`★ 代理表已建立（${ALIAS_N} 条，且实测每条都真的需要代理）`, () => {
  ok(ALIAS_N >= 15, '表太小了，可能被误删：' + ALIAS_N);
  const useless = [];
  for (const [ch, alias] of Object.entries(ALIAS)) {
    if (neighbors(ch) === neighbors(alias)) useless.push(ch);
  }
  eq(useless.join(','), '', '这些字的 ICU 读音本来就对，不该进表：' + useless.join(','));
});
t('★ 每个被代理的字，排序键恰好落到代理字的位置（即读音被纠正）', () => {
  for (const [ch, alias] of Object.entries(ALIAS)) {
    const a = S.api.rcNameKey(ch + '毅');
    eq(a, alias + '毅', `${ch} 应换成 ${alias}`);
  }
});
t('★ 实测 ICU 本来就对的字，刻意不在表里（防止无意义膨胀）', () => {
  const alreadyOk = ['隗', '任', '相', '阚', '纪', '舍', '长'];
  const bad = alreadyOk.filter(c => Object.prototype.hasOwnProperty.call(ALIAS, c));
  eq(bad.join(','), '', '这些实测 ICU 就读对，不该进表：' + bad.join(','));
});
t('★ 端到端：多音字「曾」被排到 z 段（不代理时会被排进 c 段）', () => {
  const names = ['曾毅', '陈嘉悦', '曹雪', '蔡明', '邓超', '丁一'];
  const st = { students: names.map((n, i) => stu(i + 1, n)), leaves: [] };
  const s2 = mkSandbox(st);
  eq(s2.api.rcSortByName(st.students).map(s => s.name).join(' '),
    '蔡明 曹雪 陈嘉悦 邓超 丁一 曾毅');
});
t('★ 对照：非姓氏读音不应被代理（「单」读 dān 时排 d 段是对的）', () => {
  /* 反向对照 —— 证明上面的判据不是恒真的空断言 */
  eq(neighbors('单') === neighbors('善'), false, '若「单」的邻居与「善」相同，判据失效');
  eq(S.api.rcNameKey('单田芳'), '善田芳', '作姓时按 shàn 代理');
});
t('代理只作用于**姓氏**（首字），名不动', () => {
  eq(S.api.rcNameKey('曾毅'), '增毅');
  eq(S.api.rcNameKey('李明曾'), '李明曾', '「曾」在末字不该被换');
});
t('代理表查表走 hasOwnProperty（不会被原型键 construct/toString 命中）', () => {
  has(html, 'Object.prototype.hasOwnProperty.call(RC_SURNAME_ALIAS, ch)');
  ok(S.api.rcNameKey('曾毅').length === 2, '长度不该变（代理是等长单字）');
});
t('无 Intl 的降级路径存在（不抛异常，退回码点比较）', () => {
  has(html, "if(c) return c.compare(x, y);");
  has(html, "return x < y ? -1 : (x > y ? 1 : 0);");
});

/* ============================================================ */
console.log('\n=== ④ 打乱顺序（行为级真跑）===');
t('★ rcShuffle 是**置换**：id 集合一个不多一个不少', () => {
  const st = { students: ['甲一', '乙二', '丙三', '丁四', '戊五', '己六', '庚七', '辛八'].map((n, i) => stu(i + 1, n)), leaves: [] };
  const s3 = mkSandbox(st);
  s3.api.rcShuffle();
  const before = st.students.map(s => s.id).sort((a, b) => a - b).join(',');
  const after = s3.api.getOrder().slice().sort((a, b) => a - b).join(',');
  eq(after, before, '洗牌后必须还是同一批人');
  eq(s3.api.getOrder().length, 8);
});
t('★ rcShuffle 真的会打乱（连洗 30 次至少出现 2 种不同顺序）', () => {
  const st = { students: ['甲一', '乙二', '丙三', '丁四', '戊五', '己六'].map((n, i) => stu(i + 1, n)), leaves: [] };
  const s3 = mkSandbox(st);
  const seen = new Set();
  for (let i = 0; i < 30; i++) { s3.api.rcShuffle(); seen.add(s3.api.getOrder().join(',')); }
  ok(seen.size >= 2, '连洗 30 次只有一种顺序 —— 洗牌没生效');
});
t('洗牌后顺序真的用上了：rcOrderedStudents 跟着 rcOrder 走', () => {
  const st = { students: ['甲一', '乙二', '丙三'].map((n, i) => stu(i + 1, n)), leaves: [] };
  const s3 = mkSandbox(st);
  s3.api.setOrder([3, 1, 2]);
  eq(s3.api.rcOrderedStudents().map(s => s.name).join(' '), '丙三 甲一 乙二');
});
t('动效期间不响应洗牌（RC.phase !== idle 直接 return）', () => {
  const st = { students: ['甲一', '乙二'].map((n, i) => stu(i + 1, n)), leaves: [] };
  const s3 = mkSandbox(st);
  s3.api.setOrder([1, 2]);
  s3.api.RC.phase = 'rolling';
  s3.api.rcShuffle();
  eq(s3.api.getOrder().join(','), '1,2', '动效中不该改动顺序');
  s3.api.RC.phase = 'idle';
  s3.api.rcShuffle();
  ok(s3.api.getOrder().length === 2, '回到 idle 后应能洗牌');
});
t('洗牌会落盘 + 给一次提示', () => {
  const st = { students: ['甲一', '乙二'].map((n, i) => stu(i + 1, n)), leaves: [] };
  const s3 = mkSandbox(st);
  s3.api.rcShuffle();
  const saved = JSON.parse(s3.session.getItem('cm_rc_state'));
  ok(Array.isArray(saved.order), 'rcSave 必须写入 order 字段');
  ok(s3.toasts.length === 1, '应提示一次，实际 ' + s3.toasts.length);
});

/* 🔴 绝不能写死日期（v2.27.4 当场撞上）：
   rcLoad 有一道「跨天自动失效」闸 —— `if(!o || o.date !== localDateStr()) return;`。
   本文件原先把会话日期写死成 '2026-10-01'，于是 2026-10-02 一到，凡是「当天会话」的用例
   全部静默变红（顺序读不回来）。更阴的是其中两条「老会话缺字段 / 字段类型不对」的用例
   反而**因为日期不匹配而变绿** —— 看着通过，其实根本没测到它要测的那件事。
   期望值必须跟着当天算。 */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const TODAY = todayStr();

/* ============================================================ */
console.log('\n=== ⑤ rcOrderedStudents：学生增删的不变量 ===');
t('rcOrder 为空 ⇒ 落到姓名音序（这就是「默认按音序」的落点）', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然'), stu(3, '李思远')], leaves: [] };
  const s4 = mkSandbox(st);
  eq(s4.api.rcOrderedStudents().map(s => s.name).join(' '), '安然 李思远 张小明');
});
t('★ 中途加学生：追加到**末尾**（不乱插、不吞人）', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然'), stu(3, '李思远')], leaves: [] };
  const s4 = mkSandbox(st);
  s4.api.setOrder([3, 1, 2]);
  st.students.push(stu(4, '曹雪'));           // 新加的，不在 rcOrder 里
  const got = s4.api.rcOrderedStudents();
  eq(got.length, 4, '一个都不能少');
  eq(got.map(s => s.name).join(' '), '李思远 张小明 安然 曹雪');
});
t('★ 中途删学生：不留空洞、不报错', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然'), stu(3, '李思远')], leaves: [] };
  const s4 = mkSandbox(st);
  s4.api.setOrder([3, 1, 2]);
  st.students = st.students.filter(s => s.id !== 1);   // 删掉 1
  const got = s4.api.rcOrderedStudents();
  eq(got.length, 2);
  eq(got.map(s => s.name).join(' '), '李思远 安然');
});
t('★ 加与删同时发生：仍恰好等于在校学生集合（顺序不重不漏）', () => {
  const st = { students: [stu(1, '甲'), stu(2, '乙'), stu(3, '丙'), stu(4, '丁')], leaves: [] };
  const s4 = mkSandbox(st);
  s4.api.setOrder([4, 2, 1, 3]);
  st.students = [st.students[0], st.students[2], stu(9, '戊')];   // 删 2、4，加 9
  const got = s4.api.rcOrderedStudents().map(s => s.id);
  eq(got.slice().sort((a, b) => a - b).join(','), '1,3,9');
  eq(new Set(got).size, got.length, '不能有重复');
  eq(got[got.length - 1], 9, '新加的 9 应在末尾');
});
t('rcOrder 里的脏 id（已不存在的学生）不会造成空洞', () => {
  const st = { students: [stu(1, '甲'), stu(2, '乙')], leaves: [] };
  const s4 = mkSandbox(st);
  s4.api.setOrder([99, 2, 1]);
  eq(s4.api.rcOrderedStudents().map(s => s.id).join(','), '2,1');
});
t('rcOrder 有重复 id 时只认第一次出现的位置', () => {
  const st = { students: [stu(1, '甲'), stu(2, '乙')], leaves: [] };
  const s4 = mkSandbox(st);
  s4.api.setOrder([2, 2, 1]);
  eq(s4.api.rcOrderedStudents().map(s => s.id).join(','), '2,1');
});

/* ============================================================ */
console.log('\n=== ⑥ 会话持久化（含老会话兼容）===');
t('rcSave 写入 order / rcLoad 读回', () => {
  const st = { students: [stu(1, '甲'), stu(2, '乙')], leaves: [] };
  const s5 = mkSandbox(st);
  s5.api.setLoaded(true);
  s5.api.setDate(TODAY);   // 必须是「今天」，否则会被跨天闸拦掉
  s5.api.setOrder([2, 1]);
  s5.api.rcSave();
  const raw = JSON.parse(s5.session.getItem('cm_rc_state'));
  eq(raw.order.join(','), '2,1');
  const s6 = mkSandbox(st, { session: s5.session });
  s6.api.rcLoad();
  eq(s6.api.getOrder().join(','), '2,1', '读回的顺序应一致');
});
t('★ 老会话没有 order 字段 ⇒ 落到空数组（回音序），不崩', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然')], leaves: [] };
  const session = {
    _m: { cm_rc_state: JSON.stringify({ date: TODAY, done: [1], picked: [] }) },
    getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
    setItem(k, v) { this._m[k] = String(v); }
  };
  const s7 = mkSandbox(st, { session });
  s7.api.setLoaded(true);
  let threw = null;
  try { s7.api.rcLoad(); } catch (e) { threw = e; }
  ok(!threw, '老会话不该抛异常：' + (threw && threw.message));
  eq(s7.api.getOrder().length, 0, '没有 order 字段时应为空数组');
  eq(s7.api.rcOrderedStudents().map(s => s.name).join(' '), '安然 张小明', '应回落到姓名音序');
});
t('order 字段类型不对（不是数组）时也回落到空数组', () => {
  const st = { students: [stu(1, '甲')], leaves: [] };
  const session = {
    _m: { cm_rc_state: JSON.stringify({ date: TODAY, done: [], picked: [], order: 'oops' }) },
    getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
    setItem(k, v) { this._m[k] = String(v); }
  };
  const s7 = mkSandbox(st, { session });
  s7.api.setLoaded(true);
  s7.api.rcLoad();
  eq(s7.api.getOrder().length, 0);
});
t('跨天失效仍然有效（顺序跟着一起失效，回到音序）', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然')], leaves: [] };
  const session = {
    _m: { cm_rc_state: JSON.stringify({ date: '1999-01-01', done: [1], picked: [1], order: [1, 2] }) },
    getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
    setItem(k, v) { this._m[k] = String(v); }
  };
  const s7 = mkSandbox(st, { session });
  s7.api.setLoaded(true);
  s7.api.rcLoad();
  eq(s7.api.getOrder().length, 0, '跨天不该继承旧顺序');
});
t('★ 顺序仍只存 sessionStorage，没有第二处持久化（不落云端、不开 state 字段）', () => {
  has(html, 'RC_SESSION_KEY');
  notHas(html, 'state.rcOrder');
  notHas(html, 'state.rollcallOrder');
  const cnt = (html.match(/cm_rc_state/g) || []).length;
  eq(cnt, 1, '点名会话 key 只该出现一次，实际 ' + cnt);
});

/* ============================================================ */
console.log('\n=== ⑦ 渲染与统计都跟随同一顺序 ===');
t('卡片墙走 rcOrderedStudents()（不再直接用 state.students）', () => {
  has(html, 'wall.innerHTML = rcOrderedStudents().map(function(s){');
});
t('★ 未点到名单顺序 == 卡片墙顺序', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然'), stu(3, '李思远')], leaves: [] };
  const s8 = mkSandbox(st);
  s8.api.setOrder([3, 1, 2]);
  s8.api.rcRefreshStats();
  const box = s8.els['rcPendingNames'].innerHTML;
  const i3 = box.indexOf('李思远'), i1 = box.indexOf('张小明'), i2 = box.indexOf('安然');
  ok(i3 >= 0 && i1 >= 0 && i2 >= 0, '三个人名都该在未点到名单里');
  ok(i3 < i1 && i1 < i2, '名单顺序应是 李思远 → 张小明 → 安然，实际：' + box);
});
t('★ 本轮抽中预览栏顺序 == 卡片墙顺序', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然'), stu(3, '李思远')], leaves: [] };
  const s8 = mkSandbox(st);
  s8.api.setOrder([3, 1, 2]);
  s8.api.setDone([1, 3]);
  s8.api.setPicked([3, 1]);
  s8.api.rcRefreshStats();
  const box = s8.els['rcPickedNames'].innerHTML;
  ok(box.indexOf('李思远') < box.indexOf('张小明'), '预览栏也该按 rcOrder 排：' + box);
});
t('请假学生仍不计入应到（顺序改动没碰这条既有语义）', () => {
  const st = { students: [stu(1, '甲'), stu(2, '乙')], leaves: [{ studentId: 1, startDate: '2026-10-01', endDate: '2026-10-03' }] };
  const s8 = mkSandbox(st);
  s8.api.setDate('2026-10-01');
  s8.api.rcRefreshStats();
  eq(s8.els['rcStatTotal'].textContent, 1, '应到应扣掉请假');
  eq(s8.els['rcStatLeave'].textContent, 1);
});

/* ============================================================ */
console.log('\n=== ⑧ 重置本轮顺带恢复默认音序 ===');
t('★ rcReset 清空 rcOrder（洗牌只影响一次会话，重置即恢复音序）', () => {
  const st = { students: [stu(1, '张小明'), stu(2, '安然')], leaves: [] };
  const s9 = mkSandbox(st);
  s9.api.setOrder([1, 2]);
  s9.api.rcReset();
  eq(s9.api.getOrder().length, 0, '重置后 rcOrder 应清空');
  eq(s9.api.rcOrderedStudents().map(s => s.name).join(' '), '安然 张小明', '应回到姓名音序');
});
t('rcReset 既有语义不变：已点到 / 中签清空', () => {
  const st = { students: [stu(1, '甲'), stu(2, '乙')], leaves: [] };
  const s9 = mkSandbox(st);
  s9.api.setDone([1]); s9.api.setPicked([1]);
  s9.api.rcReset();
  eq(s9.api.getDone().length, 0);
  eq(s9.api.getPicked().length, 0);
});
t('重置提示里说清了「顺序已恢复」', () => {
  has(html, '全班重新开始（顺序已恢复按姓名）');
});

/* ============================================================ */
console.log('\n=== ⑨ 预览栏向左侧拓展（数值由实测拐点决定）===');
const PANEL = blockOf(CSS, '.rc-picked-panel{');
const CTRL = blockOf(CSS, '.rc-controls{');
t('★ 主规则一字不改：控制组 basis 430px / 预览栏 330px（沿用线上原值）', () => {
  /* 🔴 这不是「懒得改」：flex-wrap:wrap 的换行判定看 flex-basis（hypothetical main size），
     不是收缩之后的实际宽度。抬任一边的 basis 都会把「并排门槛」顶上去，
     结果更宽的屏反而整块掉到第二行 —— 本轮为此踩了两次（scripts/_patch_v2260b.log）。 */
  has(CTRL, 'flex:1 1 430px');
  has(PANEL, 'flex:0 1 330px');
  has(PANEL, 'min-width:330px');
});
t('★★ 并排门槛仍是 772px（430 + 330 + 间距12）⇒ 并排行为与改动前一致', () => {
  const c = CTRL.match(/flex:\d+ \d+ (\d+)px/);
  const p = PANEL.match(/flex:\d+ \d+ (\d+)px/);
  ok(c && p, '解析不出两处 flex 基准宽');
  eq(parseInt(c[1], 10) + parseInt(p[1], 10) + 12, 772, '并排门槛被改动了');
});
t('★ 改动整体隔离在 @media(min-width:1280px)，窄屏逐像素不变', () => {
  /* 为什么必须隔离：改动前预览栏 flex-grow:0 ⇒ 余量全归左侧控制组，
     这在 1188~1248 视口恰好能避免控制组内部换行。若在主规则里就把 grow 改成 1，
     等分会抢走小容器下控制组的份额 —— _rm/_cmp_plan.py 实测那 4 个点工具栏 84→118。 */
  const i = CSS.indexOf('@media(min-width:1280px){');
  ok(i >= 0, '找不到 1280 断点');
  const blk = CSS.slice(i, CSS.indexOf('\n}', i));
  has(blk, '.rc-picked-panel{flex:1 1 330px}');
  has(blk, 'max-width');
  notHas(blk, 'flex:0 1 330px');
});
t('★ 断点内：预览栏只把 grow 由 0 改成 1，基准宽与下限一律不动', () => {
  const blk = sliceFrom('@media(min-width:1280px){', '\n}', CSS);
  const m = blk.match(/\.rc-picked-panel\{flex:(\d+) (\d+) (\d+)px\}/);
  ok(m, '解析不出断点内的预览栏规则：' + blk);
  ok(parseInt(m[1], 10) >= 1, 'grow 必须 ≥ 1，否则余量又变回留白');
  eq(parseInt(m[3], 10), 330, '🔴 基准宽必须保持 330：抬它会把并排门槛顶上去');
  has(CSS, '.rc-picked-panel{flex:0 1 330px;min-width:330px;');
});
t('★★ 断点内：控制组用 max-width 封顶，flex-basis 仍是 430', () => {
  /* max-width **不参与** flex-wrap 的换行判定（hypothetical main size 里 basis 仍是 430）
     ⇒ 这是「让控制组别再吸走余量」与「不顶高并排门槛」唯一能同时成立的做法。
     若改成抬 basis（比如 flex:0 1 572px），并排门槛会从 772 涨到 914 —— 退回老问题。 */
  const blk = sliceFrom('@media(min-width:1280px){', '\n}', CSS);
  const m = blk.match(/\.rc-controls\{flex:(\d+) (\d+) (\d+)px;max-width:(\d+)px\}/);
  ok(m, '解析不出断点内的控制组规则：' + blk);
  eq(parseInt(m[3], 10), 430, '🔴 basis 必须是 430，抬它会顶高并排门槛');
  ok(parseInt(m[1], 10) >= 2,
     'grow 必须 ≥ 2：临界容器 992 下按 1:1 等分会让控制组只拿 540px 而内部换行');
  const mx = parseInt(m[4], 10);
  ok(mx >= 566, 'max-width 必须 ≥ 控制组实测内容自然宽 566，实际 ' + mx);
  ok(mx <= 640, 'max-width 过大又会把余量从预览栏抢回来：' + mx);
});
t('★ 断点阈值 ≥ 1280 视口（容器 ≥992）—— 别往下调', () => {
  const m = CSS.match(/@media\(min-width:(\d+)px\)\{\n {2}\.rc-picked-panel\{flex:1 1 330px\}/);
  ok(m, '找不到 1280 断点的精确形态');
  ok(parseInt(m[1], 10) >= 1280,
     '断点太低：容器 <980 时余量喂不饱控制组（需 ~566）会内部换行，实测过');
});
t('控制组仍可收缩（窄屏下必须能缩，否则会溢出）', () => {
  const m = CTRL.match(/flex:\d+ (\d+) /);
  ok(parseInt(m[1], 10) >= 1, 'shrink 必须 ≥ 1');
});
t('预览栏既有视觉语言未变（左色条 + 石绿）', () => {
  has(PANEL, 'border-left:4px solid var(--success)');
  has(PANEL, 'border-radius:var(--radius)');
});
t('两道既有边界仍在：工具栏可换行 + 手机断点独占整行', () => {
  has(blockOf(CSS, '.rc-toolbar{'), 'flex-wrap:wrap');
  has(CSS, '.rc-picked-panel{flex:1 1 100%}');
});
t('工具栏仍 align-items:stretch（两块卡片等高是刻意设计，不是 bug）', () => {
  has(blockOf(CSS, '.rc-toolbar{'), 'align-items:stretch');
});

/* ============================================================ */
console.log('\n=== ⑩ 既有契约不破 ===');
for (const lit of [
  '.rc-toolbar{', 'class="rc-toolbar"', '<div class="rc-toolbar">',
  '.rc-picked-panel{', 'id="rcPickedNames"', 'id="rcPickedCnt"',
  'class="rc-picked-chip"', '.rc-badge{', '.rc-card.rc-pick{', '.rc-wall{',
  'id="rcWall"', 'class="page" id="page-rollcall"', 'id="rcStartBtn"',
  'class="btn btn-success" id="rcResetBtn"', 'onclick="rcReset()"',
  '<use href="#i-refresh"/>', '<span class="rc-toolbar-label">\u62bd\u53d6\u4eba\u6570</span>',
  'id="rcCount" type="number"', "if(page==='rollcall') renderRollCall();"
]) {
  t('保留 ' + lit.slice(0, 40), () => has(html, lit));
}
t('★ CSS 源序三条（既有三套测试逐字断言，顺序不许动）', () => {
  const iHook = CSS.indexOf('@media(hover:none){.rc-card:hover');
  const iDone = CSS.indexOf('.rc-card.rc-done');
  const iPick = CSS.indexOf('.rc-card.rc-pick');
  const iNew = CSS.indexOf('.rc-card.rc-done::after');
  ok(iHook >= 0 && iHook < iDone, `hover=${iHook} done=${iDone}`);
  ok(iDone < iPick, `done=${iDone} pick=${iPick}`);
  ok(iPick < iNew, `pick=${iPick} new=${iNew}`);
});
t('点名页仍不落 state（顺序也不进 state、不落云端）', () => {
  /* 与 _v2210b_test.js 同一对判据，保证「不落云端」这条一期约定没被本轮破坏 */
  notHas(html, "key:'rollcallSessions'", '一期不给点名开 state 字段（不落云端）');
  notHas(html, "cm_rc_state').push", 'sessionStorage 之外没有第二处点名持久化');
  notHas(html, "state.rollcall");
});
t('卡片墙仍无第二层滚动区（v2.23.0 的既有限制）', () => {
  notHas(blockOf(CSS, '.rc-wall{'), 'overflow-y:auto');
  notHas(blockOf(CSS, '.rc-wall{'), 'max-height');
});

/* ============================================================ */
console.log('\n=== ⑪ 版本一致性（从 CACHE_NAME 反推，发版无需改本文件） ===');
t('VER 取到了', () => ok(/^v\d+\.\d+\.\d+$/.test(VER), 'CACHE_NAME 里的版本：' + VER));
t('四处活动标记与 CACHE_NAME 一致', () => {
  has(html, `<div class="login-version">${VER}</div>`);
  has(html, `<div class="sidebar-footer">${VER} · 班主任工作台</div>`);
  has(html, `🏷️ ${VER}</span>`);
  has(html, `📝 近版更新速览（${VER}）`);
});
t('速览正文至少 1 条（本版新增音序/洗牌/预览栏三条）', () => {
  const i = html.indexOf('id="settingsReleaseNotes"');
  ok(i > 0, '找不到速览容器');
  const seg = html.slice(i, html.indexOf('</div>', i));
  const n = seg.split('<br>').length - 1;
  ok(n >= 1, '速览正文少于 1 条：' + n);
});

console.log('\n============================================================');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
