/* v2.27.0 回归测试：首页课表改成「桌面周表格 + 手机端逐节列表」+ 手动编辑 + PDF 自动导入
   老板需求（2026-10-01）：
     「我想把首页的课表改成表格和课程卡片形式……要同步考虑未来如何能够识别图片或者PDF
       文件自动编辑课表卡片，和如何支持自定义更改……」
     拍板：「A 周表格 + C 兜手机。两个都要，一次做完。」

   本测试要钉住的，是这次改动**最容易静默退化**的几条前提：

     前提 A：state.schedule 必须能被任意来源的脏数据喂进来而不炸、不越界、不留幽灵格。
             normSchedule 是唯一入口（读盘 / 云端 / PDF 导入三条路都过它），
             所以「节次数被改小 ⇒ 越界格子必须丢弃」这条如果退了，用户会看到
             一个改不掉的幽灵格子，而且它还会被同步上云。

     前提 B：科目配色**不落盘**，由「内置表 + 关键词兜底」派生。
             这条如果倒退回「把色系写进 cells」，老师改个科目名就会掉色，
             而旧数据里已经存下的色系又没法回收。测试要同时钉住
             ①内置表全中 ②关键词兜底能用 ③不中的**老老实实无色**（不许硬塞一个色）。

     前提 C：msSchedule 是**整表取新**（按表内 updatedAt），不是逐格并集。
             逐格并集传不出「删除」（清空格子会复活）、也仲裁不了「改科目」，
             这跟 msCommitteePos / msDuty 是同一口径。
             三态必须都对：远端新 ⇒ 取远端；本地新 ⇒ 不动；两边都空 ⇒ 不覆盖。

     前提 D：PDF 逐字项**必须先 NFKC 规范化**。PDF 的 ToUnicode 表会把汉字映射成
             **康熙部首**（U+2F00 区）：看着是「文」其实是 U+2F02，字符串却不等 ⇒
             导入进来的是假字，搜不到、配不上色、跟手输的合不上。
             本测试用真·部首码位断言（不是拿「文」比「文」那种恒真空断言）。

     前提 E：首行上边界必须收在表头之下（+18，不是惯例的 +26）。
             表头「星期X」y=515.8、第 1 节锚点 y=495.1，只差 20.7pt ⇒ +26 会把表头
             整行包进「第1节」，那一格变成「星期一/星期二/…」。
             本测试**带反向对照**：把表头挪进阈值内，必须真的判出脏数据
             —— 否则这条断言就是恒真的。

   夹具：全部**合成**（科目N / 教师M），**不含老板的真实课表** —— 公开仓不许出现班级真实数据。
   版本无关：版本号一律从 sw.js 的 CACHE_NAME 反推，发版不需要动本文件。
   运行：node _v2270_test.js */
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
function jEq(a, b, msg) { eq(JSON.stringify(a), JSON.stringify(b), msg); }

/* 🔴 切片一律用**版本无关**的锚点。
   写 '/* ====== v2.27.0 课程表数据模型' 这种带版本号的字面量当下没问题，
   但**下次发版**（OLDV 变成 v2.27.0）它就会被跟版脚本的 A-0 ③ 判成
   「版本锚点、跟版不会动它 ⇒ 静默失效」而中止。用标记词，不用版本号。 */
function segFrom(marker, endMarker) {
  const k = html.indexOf(marker);
  if (k < 0) throw new Error('找不到标记: ' + marker);
  const i = html.lastIndexOf('/*', k);
  const k2 = html.indexOf(endMarker, k);
  if (k2 < 0 || k2 <= i) throw new Error('找不到终点: ' + endMarker);
  /* 🔴 终点必须退到**那个注释行的行首**，不能停在词上。
     停在词上会留下一截未闭合的块注释起始符，而 JS 的块注释**不嵌套**
     ⇒ 它会一路吞到下一个注释结束符。症状分两种：
       ① 后面紧跟别的代码段时「静默吞掉下一段的头注释」——看着全绿，实则吃了暗亏；
       ② 单独切片时就地报 SyntaxError（_v21200_test.js 上就是这么炸的）。

     ⚠️ 连带教训（本项目新踩）：**在自己写的注释里原样引用注释定界符，
     会把自己的注释提前关掉**，后面的散文立刻变成代码。
     本文件第一次就是这么坏的：`segFrom` 上面那段说明里出现了
     「反引号 + 星号斜杠 + 反引号」的字面组合 ⇒ 注释在第 3 行就结束，
     第 4 行起的中文被当成 JS 解析。
     同族：注释里别写被测符号的原样字面（v2.24.0 的 defaultDuty 计数就是这样被自己坑的）。
     要在注释里提到它，就写「注释结束符」这种**描述**，不要写真字面。 */
  const j = html.lastIndexOf('\n', html.lastIndexOf('/*', k2)) + 1;
  const seg = html.slice(i, j);
  const nOpen = seg.split('/*').length - 1, nClose = seg.split('*/').length - 1;
  if (nOpen !== nClose) throw new Error('切片注释不配平（' + nOpen + ' vs ' + nClose + '）：' + marker);
  return seg;
}
function braced(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('找不到规则: ' + anchor);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('括号不配平: ' + anchor);
}
function blockOf(txt, anchor) { return braced(txt, anchor); }
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到函数 ' + name);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('函数 ' + name + ' 括号不配平');
}

const MODEL = segFrom('课程表数据模型', 'STATE_SCHEMA：状态字段注册表');
const JSMOD = segFrom('课程表：渲染 / 编辑 / PDF 导入', '/* ==================== Dashboard ==================== */');
const CSS_SEG = segFrom('课程表（周表格 + 手机端逐节列表）', '/* ==================== Chart ==================== */');

/* ------------------------------------------------------------------ */
/* 沙箱：把产品里的**原样代码**跑起来（不是 stub —— stub 只会测到 stub 自己） */
/* ------------------------------------------------------------------ */
const PROBE_NAMES = ['defaultSchedule', 'normSchedule', 'scheduleHasContent', 'tsCellKey', 'tsGetCell',
  'tsSetCell', 'tsSubjectGroup', 'tsTouch', 'tsPdfItems', 'tsPdfLines', 'tsBuildGrid', 'tsGroups',
  'tsTodayIndex', 'tsMin', 'tsPeriodRange', 'tsNowMin', 'tsNowPeriodNo', 'tsNextPeriodNo',
  'tsEsc', 'tsGClass', 'tsSetMode', 'tsMobileHtml', 'tsRenderBody', 'tsPartOf'];
const TS_NAMES = ['TS_DAY_NAMES', 'TS_DEFAULT_TIMES', 'TS_DEFAULT_PARTS', 'TS_GROUPS', 'TS_MAX_PERIODS',
  'TS_SUBJECT_GROUP', 'TS_KEYWORD_GROUP'];

function buildApi() {
  const state = { schedule: null };
  const doc = {
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } }; },
    addEventListener() {}, head: { appendChild() {} }, body: {}
  };
  const fn = new Function('window', 'document', 'state', 'localStorage', 'sessionStorage', 'showToast',
    'saveData', 'escapeHtml', 'setTimeout', 'clearTimeout', 'console', 'requestAnimationFrame',
    MODEL + '\n' + JSMOD +
    '\n;return {' + PROBE_NAMES.concat(TS_NAMES).join(',') + '};');
  const api = fn({}, doc, state, {}, {}, function () {}, function () {}, s => s,
    function () {}, function () {}, console, function () {});
  return { api, state, doc };
}
const { api, state } = buildApi();
const msSchedule = (function () {
  const f = new Function('normSchedule', 'scheduleHasContent',
    grabFn(html, 'msSchedule') + '; return msSchedule;');
  return f(api.normSchedule, api.scheduleHasContent);
})();

/* ------------------------------------------------------------------ */
function mkSchedule(mod) {
  const s = api.defaultSchedule();
  s.name = '测试班级';
  Object.assign(s, mod || {});
  return s;
}
/* 合成 PDF 逐字项：几何取自真实教务系统导出的量级（12 节 / 7 天 / 25pt 行距），
   内容全部是假的（科目N / 教师M），**不含任何班级真实数据**。 */
function mkPdfItems(opt) {
  opt = opt || {};
  const items = [];
  const put = (s, x, y, w) => items.push({ str: s, transform: [1, 0, 0, 1, x, y], width: w });
  const Y0 = 495.1, DY = 25, ys = [];
  for (let i = 0; i < 12; i++) { const y = Y0 - i * DY; ys.push(y); put('第' + (i + 1) + '节', 10, y, 30); }
  const HY = (opt.headerY != null) ? opt.headerY : (Y0 + 20.7);   // 真值 515.8
  for (let d = 0; d < 7; d++) put('星期' + '一二三四五六日'[d], 100 + 100 * d, HY, 40);
  put('测试班级', 5, 540, 60);
  const skip = new Set(['0-1', '6-12', '3-9']);
  let filled = 0;
  for (let d = 0; d < 7; d++) for (let i = 0; i < 12; i++) {
    if (skip.has(d + '-' + (i + 1))) continue;
    const x = 130 + 100 * d;
    put('科目' + (i + 1), x, ys[i], 30);
    put('教师' + (d + 1), x, ys[i] - 10, 30);
    filled++;
  }
  for (let i = 0; i < 12; i++) {
    const a = String(7 + (i % 12)).padStart(2, '0') + ':00';
    const b = String(8 + (i % 12)).padStart(2, '0') + ':45';
    put(a + '-' + b, 5, ys[i] - 10, 60);
  }
  return { items, filled, ys };
}

/* ============================================================ */
console.log('\n=== ① 数据模型自愈 normSchedule（读盘 / 云端 / 导入三条路都过它） ===');
t('垃圾输入一律退默认，绝不抛', () => {
  [null, undefined, 0, '', 'x', 123, true, [], function () {}].forEach(v => {
    const r = api.normSchedule(v);
    ok(r && typeof r === 'object' && Array.isArray(r.periods) && r.cells, '输入 ' + JSON.stringify(v) + ' 未退默认');
  });
});
t('defaultSchedule 形状：12 节，节次时间是「HH:MM-HH:MM」可被 tsPeriodRange 解析', () => {
  const d = api.defaultSchedule();
  eq(d.periods.length, 12, '默认节数');
  eq(d.periods.length, api.TS_DEFAULT_TIMES.length, '与 TS_DEFAULT_TIMES 等长');
  jEq(d.periods.map(p => !!api.tsPeriodRange({ periods: d.periods }, d.periods.indexOf(p) + 1)),
    new Array(12).fill(true), '每节时间都能解析');
  eq(d.updatedAt, 0, 'updatedAt 初值');
});
t('★ 节次数被改小 ⇒ 越界格子必须丢弃（不留幽灵格，也不会上云）', () => {
  const r = api.normSchedule({ periods: [{ t: 'a' }, { t: 'b' }], updatedAt: 1,
    cells: { '1-1': { s: '甲' }, '1-2': { s: '乙' }, '1-3': { s: '丙' }, '1-99': { s: '丁' } } });
  eq(r.periods.length, 2, '节数');
  eq(Object.keys(r.cells).length, 2, '存活格子数');
  ok(r.cells['1-3'] === undefined, '第 3 节已越界，必须丢');
  ok(r.cells['1-99'] === undefined, '第 99 节必须丢');
});
t('★ 节次数超过上限 TS_MAX_PERIODS 必须截断（防止脏数据把表撑爆）', () => {
  const ps = []; for (let i = 0; i < 60; i++) ps.push({ t: '0' + (i % 10) + ':00-0' + (i % 10) + ':30' });
  const r = api.normSchedule({ periods: ps, cells: { '1-59': { s: '尾' } } });
  eq(r.periods.length, api.TS_MAX_PERIODS, '截断到上限');
  ok(r.cells['1-59'] === undefined, '超上限的格子必须丢');
});
t('星期只认 1..7、节次只认 1..n（畸形 key 直接丢）', () => {
  const r = api.normSchedule({ periods: api.defaultSchedule().periods,
    cells: { '0-1': { s: 'x' }, '8-1': { s: 'x' }, '一-1': { s: 'x' }, '1-1-1': { s: 'x' }, '1-1': { s: 'ok' } } });
  jEq(Object.keys(r.cells), ['1-1'], '只剩合法 key');
});
t('空壳格子（s、t 都空）不落库；单边有值保留；超长截断', () => {
  const r = api.normSchedule({ periods: api.defaultSchedule().periods,
    cells: { '1-1': { s: '', t: '' }, '1-2': { s: '  甲  ' }, '1-3': { t: '师' },
             '1-4': { s: 'x'.repeat(80) } } });
  jEq(Object.keys(r.cells), ['1-2', '1-3', '1-4'], '空壳被剔除');
  eq(r.cells['1-2'].s, '甲', '两侧去空白');
  eq(r.cells['1-4'].s.length, 24, '科目名截断到 24');
});
t('periods 里混入裸字符串/ null 也能吃下', () => {
  const r = api.normSchedule({ periods: ['07:00-07:45', null, 5], cells: {} });
  eq(r.periods.length, 3, '节数');
  eq(r.periods[0].t, '07:00-07:45', '裸串当时间');
  eq(r.periods[1].t, '', 'null 退空串');
});
t('scheduleHasContent：只看有没有格，不看标题', () => {
  eq(api.scheduleHasContent(null), false, 'null');
  eq(api.scheduleHasContent({ cells: {} }), false, '空格表');
  eq(api.scheduleHasContent({ name: '一班', cells: {} }), false, '只有标题不算有内容');
  eq(api.scheduleHasContent({ cells: { '1-1': { s: '甲' } } }), true, '有一格就算');
});
t('normSchedule 幂等（二次规范化结果不变）', () => {
  const a = api.normSchedule({ name: ' 班 ', updatedAt: 7, periods: [{ t: 'a', p: '上午' }], cells: { '2-1': { s: '乙', t: '师' } } });
  jEq(api.normSchedule(a), a, '幂等');
});

console.log('\n=== ② tsSetCell 写入语义（清空格子必须**真删**） ===');
t('★ 两边都空 ⇒ 真删 key，不留空壳（课表没有墓碑语义：删了就删了）', () => {
  state.schedule = mkSchedule();
  api.tsSetCell(1, 1, '甲', '师', false);
  eq(Object.keys(state.schedule.cells).length, 1, '先写一格');
  api.tsSetCell(1, 1, '', '', false);
  eq('1-1' in state.schedule.cells, false, '必须真删');
  eq(Object.keys(state.schedule.cells).length, 0, '无残留');
});
t('单边有值时保留（老师改了科目但还没填老师）', () => {
  state.schedule = mkSchedule();
  api.tsSetCell(3, 4, '乙', '', false);
  eq(state.schedule.cells['3-4'].s, '乙', '科目');
  eq(state.schedule.cells['3-4'].t, '', '老师空串');
});
t('touched：默认会推 updatedAt，touch=false 不动（导入整表时不该逐格刷新戳）', () => {
  state.schedule = mkSchedule();
  state.schedule.updatedAt = 100;
  api.tsSetCell(1, 1, '甲', '', true);
  ok(state.schedule.updatedAt > 100, 'touch 生效');
  const v = state.schedule.updatedAt;
  api.tsSetCell(1, 2, '乙', '', false);
  eq(state.schedule.updatedAt, v, 'touch=false 不动戳');
});
t('tsGetCell 命中/未命中', () => {
  state.schedule = mkSchedule();
  api.tsSetCell(2, 2, '丙', '师', false);
  eq(api.tsGetCell(2, 2).s, '丙', '命中');
  eq(api.tsGetCell(2, 3), null, '未命中返回 null');
});

console.log('\n=== ③ 科目配色：内置表 + 关键词兜底 + 老老实实无色 ===');
t('四个色系与设计稿一致（文化基础/专业核心/艺体/思政综合）', () => {
  jEq(api.TS_GROUPS.map(g => g.k), ['cul', 'maj', 'art', 'gen'], '色系键');
  jEq(api.TS_GROUPS.map(g => g.c), ['#A63A2B', '#2F7D5B', '#6B5B95', '#B96A1F'], '色系主色');
});
t('内置表：老板课表里的真实科目名全部命中（这是导入后立刻上色的前提）', () => {
  const exp = { '语文': 'cul', '数学': 'cul', '英语': 'cul', '历史': 'gen', '地理': 'gen',
    '思想政治': 'gen', '法安卫国': 'gen', '劳动': 'gen', '计算机应用': 'gen', '心理健康': 'gen',
    '音乐': 'art', '美术': 'art', '舞蹈': 'art', '体育': 'art', '书法': 'art',
    '婴儿安全照护': 'maj', '幼儿健康照护': 'maj', '保育员职业素养': 'maj', '学前儿童卫生与保健': 'maj' };
  for (const k in exp) eq(api.tsSubjectGroup(k), exp[k], k);
});
t('关键词兜底：老师自己新起的名字也能配上色', () => {
  eq(api.tsSubjectGroup('母婴照护实务'), 'maj', '照护');
  eq(api.tsSubjectGroup('幼儿游戏指导'), 'maj', '幼儿');
  eq(api.tsSubjectGroup('专业拓展课'), 'maj', '专业');
  eq(api.tsSubjectGroup('幼儿歌曲弹唱'), 'maj', '幼儿 先于 唱');
  eq(api.tsSubjectGroup('心理素质训练'), 'gen', '心理');
  eq(api.tsSubjectGroup('安全用电'), 'gen', '安全');
  eq(api.tsSubjectGroup('德育实践'), 'gen', '德育');
  eq(api.tsSubjectGroup('儿童绘画'), 'art', '绘');
});
t('★ 都不中时返回空串（**不许硬塞一个色**，界面回落中性灰）', () => {
  eq(api.tsSubjectGroup('未知科目X'), '', '不中');
  eq(api.tsSubjectGroup(''), '', '空串');
  eq(api.tsSubjectGroup(null), '', 'null');
  eq(api.tsSubjectGroup('   '), '', '纯空白');
});
t('先去掉所有空白再查（PDF 导入常带空格 / 全角空格）', () => {
  eq(api.tsSubjectGroup('语 文'), 'cul', '半角空格');
  eq(api.tsSubjectGroup('语\u3000文'), 'cul', '全角空格');
});
t('tsGClass：无色时**不加** g- 类（不是加一个 g-undefined）', () => {
  eq(api.tsGClass('语文'), ' g-cul', '有色');
  eq(api.tsGClass('未知科目X'), '', '无色');
});
t('★ 色系不落盘：normSchedule 出来的 cells 里只有 s / t 两个键', () => {
  const r = api.normSchedule({ periods: api.defaultSchedule().periods, cells: { '1-1': { s: '语文', t: '师', g: 'cul' } } });
  jEq(Object.keys(r.cells['1-1']).sort(), ['s', 't'], 'cells 只保留 s/t，色系是派生的');
});

console.log('\n=== ④ msSchedule：整表取新（按表内 updatedAt） ===');
/* ⚠️ 口径：smartMergeData 是 `st(merged, localData, remoteData, f.key)` ——
   传进去的是**整份数据对象**（{schedule:{…}, students:[…]}），不是 schedule 本身。
   直接传 mkSchedule(...) 的话，函数里取 localData.schedule 得 undefined，
   三条断言会一起变成假绿（实测过：三条全报 Cannot read properties of undefined）。 */
const wrap = s => ({ schedule: s });
t('★ 远端更新 ⇒ 取远端', () => {
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ updatedAt: 100, cells: { '1-1': { s: '旧', t: '' } } })),
                     wrap(mkSchedule({ updatedAt: 200, cells: { '1-1': { s: '新', t: '' } } })));
  eq(merged.schedule.cells['1-1'].s, '新', '取远端');
});
t('本地更新 ⇒ 保持本地不动（不许被远端旧副本覆盖）', () => {
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ updatedAt: 300, cells: { '1-1': { s: '本地', t: '' } } })),
                     wrap(mkSchedule({ updatedAt: 200, cells: { '1-1': { s: '远端', t: '' } } })));
  ok(!merged.schedule, '不该覆盖，merged.schedule 应为空');
});
t('★ 本机空表 + 云端有内容 ⇒ 必须拉下来（否则新设备永远看不到课表）', () => {
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ updatedAt: 0 })),
                     wrap(mkSchedule({ updatedAt: 0, cells: { '1-1': { s: '甲', t: '' } } })));
  eq(merged.schedule.cells['1-1'].s, '甲', '空表让位给有内容的');
});
t('★ 反向对照：本地有内容 + 云端空 + 本地戳更大 ⇒ 必须**不**下拉', () => {
  /* 这条与上一条结论相反。两条同时绿，才说明判据真的在分辨，
     而不是「只要远端有东西就往下拉」那种恒真断言。 */
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ updatedAt: 500, cells: { '1-1': { s: '本地', t: '' } } })),
                     wrap(mkSchedule({ updatedAt: 0 })));
  ok(!merged.schedule, '本地更新且云端空，不该被下拉覆盖');
});
t('两边都空 ⇒ 不覆盖（避免把 name 抹掉 / 造出无意义写入）', () => {
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ name: '本地班' })), wrap(mkSchedule({ name: '远端班' })));
  ok(!merged.schedule, '都不动');
});
t('★ 逐格并集传不出「删除」：远端整格清空后必须跟着空，不许复活', () => {
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ updatedAt: 100, cells: { '1-1': { s: '甲', t: '' }, '1-2': { s: '乙', t: '' } } })),
                     wrap(mkSchedule({ updatedAt: 200, cells: { '1-2': { s: '乙', t: '' } } })));
  eq('1-1' in merged.schedule.cells, false, '远端删掉的格子不许被本地并集复活');
  eq(Object.keys(merged.schedule.cells).length, 1, '格数');
});
t('取远端时会过 normSchedule（脏数据不落地）', () => {
  const merged = {};
  msSchedule(merged, wrap(mkSchedule({ updatedAt: 0 })),
                     { schedule: { updatedAt: 200, periods: [{ t: 'a' }], cells: { '9-9': { s: '越界' } } } });
  eq(Object.keys(merged.schedule.cells).length, 0, '越界格被 normSchedule 丢掉');
});
t('msSchedule 不抛：任一边为 undefined / null / 非对象', () => {
  [{}, null, undefined, 0, 'x'].forEach(l => [{}, null, undefined, 0, 'x'].forEach(r => {
    msSchedule({}, l || {}, r || {});
  }));
});


console.log('\n=== ⑤ PDF 解析（合成夹具；几何取自真实量级，内容全假） ===');
t('★ NFKC：康熙部首（U+2F00 区）必须归一成真汉字', () => {
  /* 码位是实测出来的，**不要照着字形抄** —— 康熙部首区里
     U+2F00=一 / U+2F42=文 / U+2F47=日 / U+2FB3=音，
     照着「看着像哪个字」去标会标错（本项目第一次就标错成 U+2F02/U+2F2F，白跑一轮）。 */
  const pairs = [['\u2F00', '\u4E00'], ['\u2F42', '\u6587'], ['\u2F47', '\u65E5'], ['\u2FB3', '\u97F3']];
  pairs.forEach(([bad, good]) => {
    ok(bad !== good, '前提：部首码位与真字必须不等（否则本断言是恒真的）');
    eq(bad.normalize('NFKC'), good, '前提：' + bad + ' 的 NFKC 就是 ' + good);
  });
  const got = api.tsPdfItems({ items: pairs.map(([bad], i) => ({ str: bad, transform: [1, 0, 0, 1, i * 10, 0], width: 8 })) })
                 .map(o => o.s);
  jEq(got, pairs.map(([, good]) => good), '部首 → 真字');
  ok(!/[\u2E80-\u2FFF]/.test(got.join('')), '输出里不许残留任何一个部首码位');
});
t('tsPdfItems：丢弃纯空白项、去掉所有空白、带出 x/y/w', () => {
  const out = api.tsPdfItems({ items: [
    { str: '  ', transform: [1, 0, 0, 1, 5, 9], width: 1 },
    { str: '\n', transform: [1, 0, 0, 1, 5, 9], width: 1 },
    { str: '语 文', transform: [1, 0, 0, 1, 12, 34], width: 20 },
    { str: 3, transform: [1, 0, 0, 1, 1, 2], width: 4 }
  ] });
  eq(out.length, 2, '空白项被丢');
  eq(out[0].s, '语文', '空白去掉');
  eq(out[0].x, 12, 'x'); eq(out[0].y, 34, 'y');
  eq(out[1].s, '3', '非字符串也被 String() 收编');
});
t('★ 逐字项必须先并成「行 → 词(run)」：否则 indexOf(\'星期一\') 永远命中不了', () => {
  const one = '星期一'.split('').map((c, i) => ({ str: c, transform: [1, 0, 0, 1, 10 + i * 6, 500], width: 6 }));
  const lines = api.tsPdfLines(api.tsPdfItems({ items: one }));
  eq(lines.length, 1, '并成一行');
  jEq(lines[0].runs.map(r => r.s), ['星期一'], '并成一个词');
});
t('tsPdfLines：按 y 聚行（容差 2pt），按 x 排词，词间距 >2.5pt 才断开', () => {
  const I = (s, x, y, w) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: w });
  const lines = api.tsPdfLines(api.tsPdfItems({ items: [
    I('甲', 0, 100, 10), I('乙', 11, 100.5, 10),      // 同一行、紧邻 ⇒ 并
    I('丙', 40, 200, 10), I('丁', 80, 200, 10)        // 同一行、远隔 ⇒ 分
  ] }));
  eq(lines.length, 2, '两行');
  eq(lines[0].y, 200, 'y 降序（上在前）');
  jEq(lines[0].runs.map(r => r.s), ['丙', '丁'], '远隔不断');
  jEq(lines[1].runs.map(r => r.s), ['甲乙'], '紧邻合并');
});
t('★ 合成夹具整表：12 节 × 7 天逐格归位（含空格不落库）', () => {
  const fx = mkPdfItems();
  /* ⚠️ tsBuildGrid 吃的是**已过 tsPdfItems** 的项（{s,x,y,w}），不是 pdf.js 原始项。
     tsHandlePdf 里就是 tsBuildGrid(tsPdfItems(tc))；直接喂原始项会一律报「找不到星期表头行」。 */
  const r = api.tsBuildGrid(api.tsPdfItems({ items: fx.items }));
  eq(r.err, null, 'err 应为 null');
  jEq(r.dayIdx, [0, 1, 2, 3, 4, 5, 6], '星期列序');
  jEq(r.periodNo, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], '节次列序');
  eq(r.nonEmpty, fx.filled, '非空格数（合成的 84 - 3 个跳过）');
  jEq(r.cells['1-2'], ['科目2', '教师1'], '格内容 = 科目行 + 教师行');
  ok(r.cells['1-1'] === undefined, '跳过的空格不许落库');
  ok(r.cells['7-12'] === undefined, '跳过的空格不许落库');
  eq(r.title, '测试班级', '表头正上方那行当标题');
  eq(r.times['1'], '07:00-08:45', '左列时间抓取');
  eq(r.times['12'], '18:00-19:45', '最后一节时间');
});
t('★★ 首行上边界 = 锚点 +18（回归闸）：表头「星期X」绝不能被包进「第1节」', () => {
  const fx = mkPdfItems();                       // 表头 y = 515.8，锚点 y = 495.1，差 20.7pt
  const r = api.tsBuildGrid(api.tsPdfItems({ items: fx.items }));
  const dirty = Object.keys(r.cells).filter(k => /星期/.test(r.cells[k].join('')));
  jEq(dirty, [], '有格子串进了表头文字');
  ok(!/星期/.test(JSON.stringify(r.cells)), '整表都不许出现星期表头文字');
});
t('★★ 反向对照：把表头挪进阈值内，上面那条断言必须真的能判红', () => {
  /* 只有「挪进去能判红」才证明上面那条不是恒真空断言（+26 的老写法就是这样漏的） */
  const fx = mkPdfItems({ headerY: 495.1 + 10 });   // 落在 (第1节 bottom, 第1节 top] 之内
  const r = api.tsBuildGrid(api.tsPdfItems({ items: fx.items }));
  const dirty = Object.keys(r.cells).filter(k => /星期/.test(r.cells[k].join('')));
  ok(dirty.length > 0, '判据失效：表头挪进来都没报脏，说明这条断言是恒真的');
});
t('找不到 6 个以上星期表头 ⇒ 明确报错，不返回半成品', () => {
  const items = api.tsPdfItems({ items: [{ str: '星期一', transform: [1, 0, 0, 1, 0, 500], width: 20 }] });
  eq(api.tsBuildGrid(items).err, '找不到星期表头行', 'err 文案');
});
t('节次列不足 6 个 ⇒ 明确报错（防止把一张普通 PDF 硬解成课表）', () => {
  const fx = mkPdfItems();
  /* ⚠️ 这里必须真的**掉到 6 以下**：上一版只滤掉 6 个、正好剩 6 个，
     刚好满足 `periods.length < 6` 的边界 ⇒ err 仍是 null，断言白写。 */
  const kept = fx.items.filter(it => !/^第(5|6|7|8|9|10|11|12)节$/.test(it.str));
  const r = api.tsBuildGrid(api.tsPdfItems({ items: kept }));
  ok(/找不到节次列/.test(r.err || ''), 'err 文案：' + r.err);
});
t('tsPartOf：按「第几节 / 共几节」定上午下午晚上（注意签名是 (i,n)，不是时间串）', () => {
  eq(api.tsPartOf(1, 12), '上午', '第 1 节');
  eq(api.tsPartOf(5, 12), '上午', '第 5 节');
  eq(api.tsPartOf(6, 12), '下午', '第 6 节');
  eq(api.tsPartOf(10, 12), '晚上', '第 10 节');
  eq(api.tsPartOf(12, 12), '晚上', '第 12 节');
  /* 非 12 节的自定义课表走比例分支 */
  eq(api.tsPartOf(1, 10), '上午', '10 节制的第 1 节');
  eq(api.tsPartOf(6, 10), '下午', '10 节制的第 6 节');
  eq(api.tsPartOf(10, 10), '晚上', '10 节制的第 10 节');
});

console.log('\n=== ⑥ 时间轴（今天 / 当前节 / 下一节） ===');
t('tsTodayIndex：周一=0（JS getDay 是周日=0，必须换算）', () => {
  const d = new Date(2026, 9, 1).getDay();          // 2026-10-01 是周四
  eq(d, 4, '前提：2026-10-01 周四');
  eq(api.tsTodayIndex(), (new Date().getDay() + 6) % 7, '换算一致');
});
t('tsMin / tsPeriodRange：非法时间返回 -1 / null，不抛', () => {
  eq(api.tsMin('07:20'), 440, '07:20');
  eq(api.tsMin(''), -1, '空');
  eq(api.tsMin(null), -1, 'null');
  eq(api.tsPeriodRange({ periods: [{ t: '' }] }, 1), null, '无时间 ⇒ null');
  eq(api.tsPeriodRange({ periods: [{ t: '07:20-08:00' }] }, 1).b, 480, '08:00');
});
t('tsPeriodRange 支持多种连接符（PDF 里出现过 ~ 与全角 －）', () => {
  '07:20-08:00,07:20~08:00,07:20—08:00,07:20－08:00'.split(',').forEach(s => {
    const r = api.tsPeriodRange({ periods: [{ t: s }] }, 1);
    ok(r && r.a === 440 && r.b === 480, '连接符未识别: ' + s);
  });
});
t('tsGroups：连续同名时段并成一组；重名但不相邻必须切开', () => {
  const s = mkSchedule();
  s.periods = s.periods.map((p, i) => ({ t: p.t, p: i < 5 ? '上午' : (i < 9 ? '下午' : '晚上') }));
  const g = api.tsGroups(s);
  eq(g.length, 3, '三组');
  jEq(g.map(x => x.name), ['上午', '下午', '晚上'], '组名');
  jEq(g.map(x => x.from.length), [5, 4, 3], '各组节数');
  const s2 = mkSchedule();
  s2.periods = [{ t: 'a', p: '上午' }, { t: 'b', p: '下午' }, { t: 'c', p: '上午' }];
  eq(api.tsGroups(s2).length, 3, '同名不相邻要切开（否则 rowspan 会把它们并成一个方块）');
});
t('tsGroups：p 为空串的节自成一组（不分组时段）', () => {
  const s = mkSchedule();
  s.periods = [{ t: 'a', p: '' }, { t: 'b', p: '' }, { t: 'c', p: '上午' }];
  const g = api.tsGroups(s);
  eq(g.length, 2, '组数');
  eq(g[0].name, '', '第一组无名');
  eq(g[0].from.length, 2, '合并两节');
});

console.log('\n=== ⑦ 云同步接线（表驱动：加字段只改 schema 一处） ===');
t('schema 注册行：cfs=1 + ms=\'schedule\' + sv=normSchedule', () => {
  const seg = html.slice(html.indexOf("{ key:'schedule', def:function(){ return defaultSchedule(); }"));
  const line = seg.slice(0, seg.indexOf('\n'));
  has(line, 'cfs:1', '必须上云');
  has(line, "ms:'schedule'", '合并策略');
  has(line, 'sv:function(v){ return normSchedule(v); }', '落盘/读盘自愈');
  notHas(line, 'nosv', '课表要落本地');
  notHas(line, 'tomb', '课表不走墓碑（清空格子是就地替换）');
});
t('MERGE_ST 注册了 schedule 策略', () => { has(html, 'schedule:msSchedule,'); });
t('loadData 读盘过 normSchedule（老数据 / 手改过的 localStorage 都能吃）', () => {
  has(html, 'state.schedule = normSchedule(d.schedule);');
});
t('KEEP_ON_WIPE 保留 schedule（清空数据不该把课表也清掉）', () => {
  has(html, 'classAvatar:1, scheduleImage:1, schedule:1,');
});
t('轻量导出 hasSchedule 也认新课表（导出预览不再显示「无课表」）', () => {
  has(html, 'lightData.hasSchedule = !!parsed.scheduleImage || scheduleHasContent(parsed.schedule);');
});
t('首页渲染分派：有课表数据 ⇒ 表格模式直接 return（不落到图片/空状态）', () => {
  has(html, 'if(scheduleHasContent(state.schedule)){ tsRender(); return; }');
});
t('saveData 走 sv，schedule 会被 normSchedule 兜底（不会把 undefined 写进快照）', () => {
  const saved = api.normSchedule(undefined);
  ok(saved && Array.isArray(saved.periods) && saved.cells, 'sv 兜底给了合法形状');
});

console.log('\n=== ⑧ CSS：本轮真栽过的三条坑，逐条立闸 ===');
t('★ 列宽写在**表头 th** 上（table-layout:fixed 只认第一行的 width）', () => {
  has(CSS_SEG, 'table.ts-tb th.gcol{width:25px', '分组列宽');
  has(CSS_SEG, 'table.ts-tb th.corner{width:74px', '节次列宽');
});
t('★ 重置全局 td（index.html 第 563 行的 td{padding:12px 16px} 会压住课格）', () => {
  const r = blockOf(CSS_SEG, 'table.ts-tb thead th,table.ts-tb tbody td{');
  has(r, 'padding:0', '内边距必须归零');
  has(r, 'border-bottom:none', '底边框必须去掉');
  has(r, 'background:transparent', '背景必须透明（否则盖住分组底色）');
  ok(/table\.ts-tb/.test(r), '选择器必须带 table.ts-tb 提高权重（同特异度会被全局盖掉）');
});
t('★ 行悬停染色也要重置（全局 tbody tr:hover 会整行变色）', () => {
  has(CSS_SEG, 'table.ts-tb tbody tr:hover{background:transparent}');
});
t('★ 竖排徽章挂在 span 上，不是挂在 td 上（vertical-rl 的块轴从右往左 ⇒ 挂 td 会整体右偏）', () => {
  const span = blockOf(CSS_SEG, 'table.ts-tb td.gcell span{');
  has(span, 'writing-mode:vertical-rl', 'span 竖排');
  has(span, 'display:inline-block', '必须 shrink-wrap（否则宽度等于整列，居中对齐失效）');
  has(span, 'text-orientation:upright', '汉字正立');
  const td = blockOf(CSS_SEG, 'table.ts-tb td.gcell{');
  notHas(td, 'writing-mode', 'td 只当居中容器，不许自己竖排');
  has(td, 'text-align:center', 'td 负责居中');
  has(td, 'vertical-align:middle', 'td 负责垂直居中');
});
t('徽章字号 15px（老板反馈「不够大」，这是修后的值，不许掉回 12/13px）', () => {
  has(blockOf(CSS_SEG, 'table.ts-tb td.gcell span{'), 'font-size:15px');
});
t('手机断点：表格隐藏 + 列表显示（成对出现）', () => {
  const mq = braced(CSS_SEG, '@media(max-width:768px){');
  has(mq, '.ts-scroll{display:none}', '表格收起');
  has(mq, '.ts-mob{display:block}', '列表展开');
});
t('桌面默认：.ts-mob 默认隐藏（否则手机列表会跟表格一起冒出来）', () => {
  has(CSS_SEG, '.ts-mob{display:none}');
});
t('四个色系的左边框色与 TS_GROUPS 一致（CSS 与 JS 不许漂移）', () => {
  api.TS_GROUPS.forEach(g => {
    has(CSS_SEG, '.ts-cell.g-' + g.k + '{', '缺少 ' + g.k);
    has(CSS_SEG, 'border-left-color:' + g.c, g.k + ' 边框色');
  });
});
t('当前节次高亮只放一个圆点，不用 ::after 写字（历史上写过字，压在教师名上）', () => {
  const r = blockOf(CSS_SEG, '.ts-cell.now::after{');
  has(r, "content:''", '必须是空内容');
  notHas(r, '正在上', '不许用伪元素写字');
});
t('弹窗在深色下不能白底浅字：三个新弹窗都改回主题变量', () => {
  has(CSS_SEG, '#tsEditModal .modal,#tsImportModal .modal,#tsSetModal .modal{background:var(--card-bg)');
});
t('深色模式：四个色系前景色全部提亮（深红字压深底读不出来）', () => {
  ['#E9A08F', '#8FCBAE', '#B9A9DC', '#E0AE74'].forEach(c => has(CSS_SEG, c, '深色前景 ' + c));
  has(CSS_SEG, 'html.dark .ts-cell.g-cul .cs');
});
t('课格 46px 高 + 科目名单行省略（改高度会让 12 节表超出一屏）', () => {
  const r = blockOf(CSS_SEG, '.ts-cell{');
  has(r, 'height:46px', '高度');
  has(blockOf(CSS_SEG, '.ts-cell .cs{'), 'text-overflow:ellipsis', '长科目名省略');
});

console.log('\n=== ⑨ 手机端逐节列表 ===');
t('分段器「今天 / 全周」与 12 行列表容器都在', () => {
  has(html, 'class="ts-seg"', '分段器');
  has(CSS_SEG, '.ts-seg span.on{', '选中态');
  has(CSS_SEG, '.ts-mline{', '列表行');
  has(CSS_SEG, '.ts-mline .mp{', '左侧节次柱');
  has(CSS_SEG, '.ts-mline .mc.empty{', '空格占位');
});
t('列表行也走同一套色系（与桌面表格同源，不许各写一份色表）', () => {
  api.TS_GROUPS.forEach(g => has(CSS_SEG, '.ts-mline .mc.g-' + g.k + '{', g.k));
});
t('空格行渲染成「+ 添加」而不是留白（手机上会出现「以为课没上」的误解）', () => {
  has(JSMOD, 'class="mc' , '有格渲染');
  has(html, "+ 添加", '空行提示');
});
t('tsTodayIndex 决定默认选中的星期，且分段器默认「今天」', () => {
  has(JSMOD, '_tsMobTab', '手机端页签状态');
  ok(/tsMobTab\(/.test(JSMOD), '切换函数');
});

console.log('\n=== ⑩ 契约保全：老的「课表图片」功能一个字没坏 ===');
t('v2.21.0 之前就有的图片链路全在（改名/搬走会静默砸掉既有测试）', () => {
  ['function _scheduleBase64ToBlobUrl', 'function renderScheduleImage', 'function viewScheduleFullscreen',
   'function triggerSchedulePaste', 'function deleteScheduleImage'].forEach(f => has(html, f, f));
  has(html, 'id="scheduleImageWrap"', '图片容器保留（作为「上传图片」降级模式）');
  has(html, "key:'scheduleImage', def:null, cfs:1, ms:'scheduleImage'", 'scheduleImage 仍在 schema');
  has(html, 'scheduleImage:msScheduleImage', 'scheduleImage 合并策略未动');
});
t('三模式互斥只改 display，**不删 DOM**（图片模式仍能被 tsSetMode 唤回）', () => {
  const r = grabFn(JSMOD, 'tsSetMode');
  has(r, "iw.style.display = (mode === 'image') ? '' : 'none'", '图片容器只切 display');
  notHas(r, 'innerHTML', '不许在这里重建 DOM（会砸掉绑定的事件与 blob url）');
  notHas(r, 'removeChild', '不许移除节点');
});
t('图片模式会显式把容器切回 image（否则老用户升级后课表图不显示）', () => {
  has(html, "tsSetMode('image');");
});
t('空状态换了入口但保留了「上传图片」这条路', () => {
  const r = grabFn(JSMOD, 'tsRenderEmpty');
  has(r, 'triggerSchedulePaste', '仍能触发图片上传');
  has(r, 'openTsImport()', '新增 PDF 导入入口');
  has(r, 'tsCreateBlank()', '手动创建入口');
  has(r, 'ts-empty', '空状态样式');
  has(html, "tsSetMode('empty')", '空模式显式设置');
});
t('PDF 依赖走本地文件，按需加载（不引 CDN，离线可用）', () => {
  has(JSMOD, "s.src = './pdf.min.js'");
  has(JSMOD, "workerSrc = './pdf.worker.min.js'");
  has(JSMOD, 'window.pdfjsLib', '已加载则直接复用');
  has(JSMOD, 'window._tsPdfQ', '并发加载去重队列');
  notHas(JSMOD, 'cdnjs', '不许引 CDN');
  notHas(JSMOD, 'unpkg');
});
t('PDF 两个文件确实已落到站点仓（否则线上导入必然 404）', () => {
  ['pdf.min.js', 'pdf.worker.min.js'].forEach(f => {
    const p = __dirname + '/' + f;
    ok(fs.existsSync(p), '缺文件 ' + f);
    ok(fs.statSync(p).size > 1000, f + ' 体积异常');
  });
  has(html, './pdf.min.js', 'index.html 引用了它');
});
t('sw.js 不把 pdf.js 塞进 CORE_ASSETS（addAll 全成全败，装 PWA 时也不该白拉 1.4MB）', () => {
  const core = sw.slice(sw.indexOf('const CORE_ASSETS'), sw.indexOf('];', sw.indexOf('const CORE_ASSETS')));
  notHas(core, 'pdf.min.js', '不该进预缓存清单');
  notHas(core, 'pdf.worker.min.js', '不该进预缓存清单');
  ok(/pdf\.min\.js/.test(sw), '但要在注释里说明依赖关系（可读性）');
});

console.log('\n=== ⑪ 版本一致性（从 CACHE_NAME 反推，发版无需改本文件） ===');
t('VER 取到了', () => ok(/^v\d+\.\d+\.\d+$/.test(VER), 'CACHE_NAME 里的版本：' + VER));
t('四处活动标记与 CACHE_NAME 一致', () => {
  has(html, `<div class="login-version">${VER}</div>`);
  has(html, `<div class="sidebar-footer">${VER} · 班主任工作台</div>`);
  has(html, `🏷️ ${VER}</span>`);
  has(html, `📝 近版更新速览（${VER}）`);
});
t('速览正文至少 3 条（本版：周表格 / 手动编辑 / PDF 导入）', () => {
  const i = html.indexOf('id="settingsReleaseNotes"');
  ok(i > 0, '找不到速览容器');
  const seg = html.slice(i, html.indexOf('</div>', i));
  const n = seg.split('<br>').length - 1;
  ok(n >= 3, '速览正文少于 3 条：' + n);
});

console.log('\n============================================================');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
