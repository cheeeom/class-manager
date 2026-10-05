// _v2220_test.js — v2.22.0：请假卡「一行三张」+ 「假」徽章字心居中标定
//
// ① 版本与标记（版本无关：从 sw.js 的 CACHE_NAME 反推，下次跟版零成本）
// ② 「假」徽章字心居中 —— 钉住标定写法，并禁止后人用 transform 代偿
// ③ 请假卡一行三张 —— 三列网格 + 两档断点
// ④ 断点源序 —— 必须 768 < 1100 < 680
// ⑤ lvShortDate 真跑 —— 同年省年份 / 跨年补全 / 非法输入 / 不把日期交给 Date 解析
// ⑥ renderAttendance 结构 —— grid 包裹、底部对齐、文本转义
// ⑦ 暗色主题 —— 硬编码 #fff / #F7F4EC 清除
// ⑧ 排版瘦身 —— 三个 emoji 与老式长日期串清除
// ⑨ 既有契约不破 —— 请假模块关键串 + 点名页 rc-badge 仍在
//
// 为什么 ④ 要单独成组：新增的两个断点必须**成对放在同一处且 680 在后**。
// 既有 @media(max-width:768px) 位于 CSS 更早的位置，同特异度靠源序取胜 ——
// 顺序写反（680 在前），手机上会被后面的 1100 规则反超成 2 列。
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const failures = [];
function log(okc, msg) {
  if (okc) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function has(t, s, msg) { log(String(t).indexOf(s) >= 0, msg + (String(t).indexOf(s) >= 0 ? '' : '\u300c缺 ' + JSON.stringify(String(s).slice(0, 60)) + '\u300d')); }
function notHas(t, s, msg) { log(String(t).indexOf(s) < 0, msg + (String(t).indexOf(s) < 0 ? '' : '\u300c不该有 ' + JSON.stringify(String(s).slice(0, 60)) + '\u300d')); }
function eq(a, b, msg) { log(a === b, (msg || '') + '\uff08期望 ' + JSON.stringify(b) + '\uff0c实得 ' + JSON.stringify(a) + '\uff09'); }
function ok(c, msg) { log(!!c, msg); }
function cnt(t, s) { return String(t).split(s).length - 1; }
function braceFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, began = false, out = '';
  for (let k = i; k < html.length; k++) {
    const ch = html[k];
    out += ch;
    if (ch === '{') { depth++; began = true; }
    else if (ch === '}') { depth--; if (began && depth === 0) break; }
  }
  return out;
}

// ============================================================
console.log('\n\u30101\u3011版本与标记（版本无关断言）');
// ============================================================
const mVer = sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/);
ok(!!mVer, 'sw.js 能解出版本号');
const V = mVer ? mVer[1] : '';
console.log('     （版本 = ' + V + '）');
has(html, '<div class="login-version">' + V + '</div>', '登录页标记 = ' + V);
has(html, '<div class="sidebar-footer">' + V + ' · 班主任工作台</div>', '侧栏页脚标记 = ' + V);
has(html, '\uD83C\uDFF7\uFE0F ' + V + '</span>', '设置页徽标 = ' + V);
has(html, '\uD83D\uDCDD 近版更新速览（' + V + '）', '速览标题 = ' + V);
const iN = html.indexOf('id="settingsReleaseNotes"');
const notesBlock = html.slice(iN, html.indexOf('</div>', iN));
ok(cnt(notesBlock, '<br>') >= 1, '速览正文至少 1 条（实得 ' + cnt(notesBlock, '<br>') + ' 条）');

// ============================================================
console.log('\n\u30102\u3011「假」徽章字心居中（标定写法）');
// ============================================================
const b0 = html.indexOf('.rc-badge{');
const badgeRule = html.slice(b0, html.indexOf('}', b0) + 1);
has(badgeRule, 'display:flex', '徽章用 flex 布局');
has(badgeRule, 'align-items:center', '纵向居中');
has(badgeRule, 'justify-content:center', '横向居中');
has(badgeRule, 'line-height:1', 'line-height 归零（行盒高度 = 字号，居中才有意义）');
has(badgeRule, 'padding-bottom:1px', 'padding-bottom:1px 顶掉中文字形在 em 框内的下沉（核心）');
notHas(badgeRule, 'transform', '徽章规则体里不得有 transform —— 它会连圆一起搬走，实测偏差反而变大');
notHas(html, 'line-height:20px;text-align:center', '旧的 line-height:20px + text-align:center 写法已清除');
// 注释必须留着：后人看不出 padding-bottom:1px 是干嘛的，一删就退回偏下
has(html, '别用 transform', 'CSS 注释留了「别用 transform 代偿」的告诫（防误删 padding-bottom）');
has(html, 'padding-bottom:1px 让行盒', 'CSS 注释写明了标定原理与来源（5 倍渲染墨迹实测）');

// ============================================================
console.log('\n\u30103\u3011请假卡一行三张（三列 + 两档断点）');
// ============================================================
has(html, '.leave-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))', '三列网格（minmax(0,1fr) 防内容撑破）');
has(html, '@media(max-width:1100px){.leave-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}', '≤1100px 降两列');
has(html, '@media(max-width:680px){.leave-grid{grid-template-columns:minmax(0,1fr);gap:8px}}', '≤680px 降一列（本版由裸 1fr 改为 minmax(0,1fr)：1fr = minmax(auto,1fr)，auto 下限取 grid item 的最小内容宽度，会被 nowrap 的长文本撑破容器 ⇒ 手机端横向滚动）');
has(html, "'<div class=\"leave-grid\">' + sorted.map(l => {", '渲染时用 leave-grid 包裹');
has(html, ".join('') + '</div>';", 'grid 容器正确闭合');

// ============================================================
console.log('\n\u30104\u3011断点源序（写反了手机端会变 2 列）');
// ============================================================
const i768 = html.indexOf('@media(max-width:768px){');
const i1100 = html.indexOf('@media(max-width:1100px){.leave-grid');
const i680 = html.indexOf('@media(max-width:680px){.leave-grid');
ok(i768 >= 0 && i1100 >= 0 && i680 >= 0, '三个断点都能定位');
ok(i768 < i1100, '既有 768 断点排在最前（不会被它反超）');
ok(i1100 < i680, '新增的 1100 在 680 之前 —— 680 靠源序胜出，手机才是 1 列');

// ============================================================
console.log('\n\u30105\u3011lvShortDate 真跑');
// ============================================================
let lvShortDate = null;
try { lvShortDate = (new Function('return ' + braceFn('lvShortDate')))(); }
catch (e) { console.log('     抽取失败：' + e.message); }
ok(typeof lvShortDate === 'function', 'lvShortDate 能被抽出并求值');
if (typeof lvShortDate === 'function') {
  eq(lvShortDate('2026-09-28', '2026'), '09-28', '同年只显示 MM-DD');
  eq(lvShortDate('2026-01-01', '2026'), '01-01', '年初边界（不因 UTC 掉到上一年）');
  eq(lvShortDate('2025-12-31', '2026'), '2025-12-31', '跨年补全年份（否则说不清是哪年）');
  eq(lvShortDate('2026-09-28', 2026), '09-28', 'refYear 传数字也能用');
  eq(lvShortDate('', '2026'), '', '空串安全返回空串');
  eq(lvShortDate(null, '2026'), '', 'null 安全返回空串');
  eq(lvShortDate(undefined, '2026'), '', 'undefined 安全返回空串');
  eq(lvShortDate(20260928, '2026'), 20260928, '非字符串原样返回（不抛错）');
  eq(lvShortDate('2026-9-2', '2026'), '2026-9-2', '长度不足 10 时原样返回（兜底）');
  // 不传 refYear 时回落到真实年份（只验证格式，不钉死具体年份）
  const auto = lvShortDate('2026-09-28');
  ok(/^(\d{2}-\d{2}|2026-09-28)$/.test(auto), '不传 refYear 时按今年判断，输出合法');
}
const fnSrc = braceFn('lvShortDate');
notHas(fnSrc, 'new Date(ds)', '不把日期串交给 Date 解析');
has(fnSrc, 'slice(', '走纯字符串切片（零时区风险）');
has(fnSrc, 'new Date().getFullYear()', '只用 Date 取当前年份，不解析输入日期');

// ============================================================
console.log('\n\u30106\u3011renderAttendance 结构');
// ============================================================
has(html, 'class="leave-card-header"', '头部仍在（姓名 + 类型 + 状态徽章）');
has(html, 'class="leave-meta" title="', '起止区间单独成块并挂 title 兜底完整日期');
has(html, 'class="lv-arrow"', '区间用箭头连接');
has(html, 'class="lv-dur"', '时长右对齐');
has(html, 'class="leave-reason" title="', '原因挂 title（截断后仍可看全文）');
has(html, 'class="leave-hist"', '历史记录改用具名类（不再内联样式）');
has(html, 'class="leave-foot"', '底部脚区');
has(html, 'class="leave-created"', '登记时间在脚区左侧');
has(html, '.leave-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto', '脚区 margin-top:auto —— 同行卡片按钮对齐靠它');
has(html, '.leave-card{\n  display:flex;flex-direction:column;\n  background:var(--card-bg);', '卡片是 flex column（grid 负责等高，column 负责内部压底；v2.23.0 已按老板要求删掉固定 min-height）');
has(html, 'escapeHtml(l.reason)', '原因文本已转义（原先是裸插）');
has(html, 'escapeHtml(stuName)', '姓名文本已转义');
has(html, "'<span class=\"leave-actions\">'+actions", '操作按钮移到脚区');

// ============================================================
console.log('\n\u30107\u3011暗色主题（硬编码色清除）');
// ============================================================
// ⚠️ `.leave-card{` 在 CSS 里出现两次（主规则 + 768 断点里的紧凑版），
//    必须用主规则特有的首行定位，否则会切到媒体查询里那条、断言全落空。
const c0 = html.indexOf('.leave-card{\n  display:flex;flex-direction:column');
ok(c0 > 0, '能定位到 .leave-card 主规则（避开 768 断点里那条同名规则）');
const cardRule = html.slice(c0, html.indexOf('}', c0) + 1);
has(cardRule, 'var(--card-bg)', '卡片底色走变量');
has(cardRule, 'var(--border)', '卡片描边走变量');
notHas(cardRule, '#fff', '卡片不再硬编码 #fff（暗色下会白底突脸）');
// #F7F4EC 在文件别处也有（别的模块），所以判据必须限定在 .leave-reason 规则体内
const r0 = html.indexOf('.leave-reason{');
notHas(html.slice(r0, html.indexOf('}', r0) + 1), '#F7F4EC', '原因规则里不再硬编码底色块');
has(html, '.leave-card.status-pending{border-left-color:var(--orange)}', '待销假色条走变量');
has(html, '.leave-card.status-returned{border-left-color:var(--success);opacity:.75}', '已销假色条走变量 + 降透明度');
has(html, '.leave-card.status-extended{border-left-color:var(--purple)}', '续假色条走变量');

// ============================================================
console.log('\n\u30108\u3011排版瘦身（emoji 与长日期串）');
// ============================================================
notHas(html, "'<span>\uD83D\uDCC5 '+l.startDate", '日期行不再拼 emoji');
notHas(html, '<span style="color:var(--primary);font-weight:600">\u23F1 ', '时长不再拼 emoji');
notHas(html, 'l.startDate+\' \'+spText+\' ~ \'+l.endDate', '老式长日期串（含年份全写）已清除');
has(html, 'var rangeFull = l.startDate', '完整区间仍在，只是移到了 title');
has(html, 'lvShortDate(l.startDate)', '显示走短日期');
has(html, 'lvShortDate(l.endDate)', '结束日期同样走短日期');
has(html, '.leave-actions .btn{padding:4px 11px;font-size:12.5px', '按钮在窄卡里保持紧凑（v2.23.0 字号上调一档）');
has(html, '-webkit-line-clamp:2', '原因最多两行');

// ============================================================
console.log('\n\u30109\u3011既有契约不破');
// ============================================================
has(html, 'function renderAttendance(){', '请假页渲染函数仍在');
has(html, "if(page==='attendance') renderAttendance();", '请假页路由未被改动');
has(html, 'function confirmAddLeave(){', '登记请假函数仍在');
has(html, 'function returnLeave(id){', '销假函数仍在');
has(html, 'function extendLeaveApply(leave, newEnd){', '续假函数仍在');
has(html, 'function msLeaves(merged,localData,remoteData){', '请假合并策略仍在');
has(html, 'function calcLeaveDuration(startDate, startPeriod, endDate, endPeriod){', '时长计算未被改动');
has(html, 'id="leaveList"', '请假列表容器仍在');
has(html, 'nav-item" data-page="attendance"', '侧栏请假入口仍在');
has(html, 'more-item" data-page="attendance"', '抽屉请假入口仍在');
has(html, 'role="button" tabindex="0" onclick="rcToggleDone(', '点名卡片的可访问性属性未被破坏');
has(html, 'rc-badge', '点名页仍在用 rc-badge（本版只改了它的对齐）');
has(html, 'function rcOnLeave(l, date){', '当天请假判定仍在');
// 触摸端 hover 守卫必须仍在选中态之前
ok(html.indexOf('@media(hover:none){.rc-card:hover') < html.indexOf('.rc-card.rc-done'),
  '触摸端 hover 守卫仍排在选中态之前');
ok(html.indexOf('.rc-card.rc-done') < html.indexOf('.rc-card.rc-pick'),
  '选中态先后顺序未被破坏');

// ============================================================
console.log('\n' + '='.repeat(56));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  \u2717 ' + f)); }
process.exit(fail ? 1 : 0);
