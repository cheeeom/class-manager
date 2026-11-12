/* v3.9.22 回归：学号格式自适应（不再硬编码年份前缀）
   背景：`rosterBuildPlan` 曾写死 `'2026' + pad(no)`，跑一次「名单同步」就把全班写成
   2026001..2026060（老板平板/手机上那 18 个脏学号的源头）；`nextSidFromList` 又只认纯数字，
   带字母头的班（A001 / 2026-001）新增学生时会掉成 S0001。
   本版改为「跟着本班现有学号的格式走」：别人用小班自定义格式也不会被固定住。
   运行：node _v3922_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const VER = (function () {
  const m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(sw);
  if (!m) throw new Error('[版本无关化] 未能从 sw.js 反推版本号');
  return m[1];
})();

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) throw new Error((msg ? msg + '：' : '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function hasNot(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不该出现 ' + JSON.stringify(k)); }

/* 抽真实实现（与 _v2197 同法：按大括号配平取整段函数体） */
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
  return eval('(' + buf.join('\n') + ')');
}

const sidTemplateOf = extractFn('sidTemplateOf');
const sidByNo = extractFn('sidByNo');
const nextSidFromList = extractFn('nextSidFromList');
const rosterBuildPlan = extractFn('rosterBuildPlan');
const rosterParse = extractFn('rosterParse');

const S = list => list.map(sid => ({ id: 1, sid, name: 'x', credit: 0, tags: [] }));
const seq = (head, from, to, w) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(head + String(i).padStart(w, '0'));
  return out;
};

console.log(`\n=== v3.9.22 回归：学号格式自适应（${VER}） ===`);

console.log('\n① sidTemplateOf：本班格式推断（不预设前缀）');
t('2602xxx 班 → 续号 2602061', () => {
  const tpl = sidTemplateOf(S(seq('2602', 1, 60, 3)));
  eq(tpl.head, '', '纯数字学号 head 为空');
  eq(tpl.next, '2602061');
});
t('2026xxx 班 → 续号 2026061（老班型照样自洽）', () => {
  eq(sidTemplateOf(S(seq('2026', 1, 60, 3))).next, '2026061');
});
t('A001 班 → 续号 A061（以前会掉成 S0001）', () => {
  const tpl = sidTemplateOf(S(seq('A', 1, 60, 3)));
  eq(tpl.head, 'A');
  eq(tpl.next, 'A061');
});
t('2026-001 班 → 续号 2026-061', () => {
  const tpl = sidTemplateOf(S(seq('2026-', 1, 60, 3)));
  eq(tpl.head, '2026-');
  eq(tpl.next, '2026-061');
});
t('纯序号 1..10 → 续号 11（位数取众数，不被 10 撑成两位）', () => {
  const tpl = sidTemplateOf(S(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']));
  eq(tpl.width, 1);
  eq(tpl.next, '11');
});
t('零填充 01..10 → 续号 11 且保持两位（11 本身两位）', () => {
  eq(sidTemplateOf(S(seq('', 1, 10, 2))).next, '11');
});
t('空班级 → null（交回退分支，不瞎猜格式）', () => {
  eq(sidTemplateOf([]), null);
  eq(sidTemplateOf(null), null);
  eq(sidTemplateOf([{ sid: '' }, { sid: '暂无' }]), null);
});
t('混排：60 个 2602xxx + 2 个 S000x → 按人数最多的本班格式续', () => {
  const list = seq('2602', 1, 60, 3).concat(['S0001', 'S0002']);
  eq(sidTemplateOf(S(list)).next, '2602061');
});
t('人数打平：纯数字学号优先（兼容 v3.7.5 旧语义）', () => {
  eq(nextSidFromList([{ sid: '2602001' }, { sid: 'S0003' }]), '2602002');
});

console.log('\n② sidByNo：名单序号 → 学号（跟着本班，不写死年份）');
t('2602xxx 班：47 号 → 2602047（正是邢丝露被写错的那个）', () => {
  const tpl = sidTemplateOf(S(seq('2602', 1, 60, 3)));
  eq(sidByNo(tpl, 47, 60), '2602047');
  eq(sidByNo(tpl, 3, 60), '2602003');
  eq(sidByNo(tpl, 60, 60), '2602060');
});
t('2026xxx 班：47 号 → 2026047（保留他自己的老格式）', () => {
  const tpl = sidTemplateOf(S(seq('2026', 1, 60, 3)));
  eq(sidByNo(tpl, 47, 60), '2026047');
});
t('A001 班：3 号 → A003；2026-001 班：3 号 → 2026-003', () => {
  eq(sidByNo(sidTemplateOf(S(seq('A', 1, 60, 3))), 3, 60), 'A003');
  eq(sidByNo(sidTemplateOf(S(seq('2026-', 1, 60, 3))), 3, 60), '2026-003');
});
t('纯序号 1..10 班：3 号 → 3（不补零，不被撑成 03）', () => {
  eq(sidByNo(sidTemplateOf(S(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])), 3, 10), '3');
});
t('模板为 null → 返回 null（调用方一律不动学号）', () => {
  eq(sidByNo(null, 3, 60), null);
});

console.log('\n③ rosterBuildPlan 端到端：跑名单同步不再产出 2026xxx');
t('2602xxx 班 + 1..60 名单 → 学号更新全部落在 2602xxx', () => {
  // 让本班学号整体「错开一位」，逼出全员学号更新的最坏情况
  const existing = seq('2602', 1, 60, 3).map((sid, i) => ({
    id: i + 1, sid: '2602' + String((i + 2) > 60 ? 1 : (i + 2)).padStart(3, '0'),
    name: '学生' + (i + 1), credit: 0, tags: []
  }));
  const entries = rosterParse(Array.from({ length: 60 }, (_, i) => (i + 1) + ' 学生' + (i + 1)).join('\n'));
  const p = rosterBuildPlan(entries, existing);
  eq(p.updates.length, 60, '60 人全部命中更新');
  const bad = p.updates.filter(u => !/^2602\d{3}$/.test(u.newSid));
  eq(bad.length, 0, '没有任何一条离开 2602xxx 格式：' + JSON.stringify(bad.slice(0, 3)));
});
t('2026xxx 班 → 仍然产出 2026xxx（尊重本班既有格式，不强行改成 2602）', () => {
  const existing = seq('2026', 1, 5, 3).map((sid, i) => ({ id: i + 1, sid, name: '学生' + (i + 1), credit: 0, tags: [] }));
  const p = rosterBuildPlan(rosterParse('1 学生1\n2 学生2\n6 新同学'), existing);
  const add6 = p.adds.find(a => a.name === '新同学');
  eq(add6.sid, '2026006', '新增学生按 2026xxx 格式补号（2026 + 006）');
});
t('A001 班 → 名单同步产出 A0xx，不出现 2026xxx', () => {
  const existing = seq('A', 1, 5, 3).map((sid, i) => ({ id: i + 1, sid, name: '学生' + (i + 1), credit: 0, tags: [] }));
  const p = rosterBuildPlan(rosterParse('1 学生1\n2 学生2\n6 新同学'), existing);
  const add6 = p.adds.find(a => a.name === '新同学');
  eq(add6.sid, 'A006');
  const all = p.updates.map(u => u.newSid).concat(p.adds.map(a => a.sid));
  eq(all.filter(s => s.indexOf('2026') >= 0).length, 0, '不该冒出 2026 前缀');
});
t('全新空班级 → 不替老师瞎编学号：0 条学号更新、新增学号留空', () => {
  const p = rosterBuildPlan(rosterParse('1 甲\n2 乙\n3 丙'), []);
  eq(p.updates.length, 0, '没有学号可更新');
  eq(p.adds.map(a => a.sid), ['', '', ''], '新增留空，交批量配学号/导入补');
});

console.log('\n④ 代码锚点：硬编码已彻底移除，且后继无人');
t("index.html 里不再有 const targetSid = no => '2026' + pad(no);", () => {
  hasNot(html, "'2026' + pad(no)", '名单同步不许再写死年份');
  hasNot(html, "targetSid = no => '2026'", '同上');
});
t('rosterBuildPlan 改走 sidTemplateOf + sidByNo', () => {
  const i = html.indexOf('function rosterBuildPlan(');
  const fn = html.slice(i, i + 1400);
  has(fn, 'sidTemplateOf(students)', '格式从本班推断');
  has(fn, 'sidByNo(sidTpl, no, maxNo)', '序号 → 学号按模板');
  has(fn, 'sidTpl', '模板已取');
});
t('genSid 续号与导入新建都走同一套模板', () => {
  has(html, 'function sidTemplateOf(list)', '模板函数在位');
  has(html, 'function nextSidFromList(list)', '续号纯函数在位');
  has(html, 'return t ? t.next : null;', 'nextSidFromList 由模板产出');
  has(html, 'nextSidFromList(state.students)', 'genSid 走续号');
  has(html, 'nextSidFromList(existing.concat(plan.creates))', '批量导入新建同口径');
});
t('applyBulkSids：带字母头的学号 parseInt 为 NaN，必须守住 nextSid', () => {
  const i = html.indexOf('function applyBulkSids()');
  const fn = html.slice(i, html.indexOf('\n}', i) + 2);
  has(fn, 'isFinite(nextNum)', 'NaN 守卫');
  hasNot(fn, 'state.nextSid = parseInt(next, 10);', '旧的直写已删');
});
t('版本一致：sw.js CACHE_NAME 与 index.html 版本标同源', () => {
  has(sw, `class-manager-${VER}`, 'sw CACHE_NAME 与当版号一致');
  has(html, VER, 'index.html 出现当版版本号');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
