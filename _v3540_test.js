// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
const V = (function () {
  try {
    var m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(require('fs').readFileSync(require('path').join(__dirname, 'sw.js'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
if (!V) throw new Error('[版本无关化] 未能从 sw.js 反推版本号（CACHE_NAME 缺失或路径不对）');
/* v3.5.4 回归测试：学分预警一人一单状态机
   覆盖：
     ① 一人一单：恶化升级在原单改写（黄→橙→红），不再叠加
     ② 办结冷却：老师办结/删除后学分未回升前完全静默（跨月也不复活）
     ③ 红色及以上重新点亮：冷却中恶化到红档重建新单并标注「较办结时恶化升级」
     ④ 回升 ≥60 自动办结 + 解除冷却；再次跌入按新一轮计（relapse 递增）
     ⑤ 迁移收敛：历史叠加的多张有效单收敛为最重一张，其余关闭留痕（merged）
     ⑥ 降档不改写：单据保留最重档留痕
     ⑦ 流水归档 UI：折叠切换/导出函数/默认收起文案在位
   运行：node _v3540_test.js */
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

/* ---------- 抽取工具（按花括号配平，支持多行函数） ---------- */
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
function extractConstRaw(name) {
  const arr = html.match(new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n\\];'));
  if (arr) return arr[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '');
  const single = html.match(new RegExp('const ' + name + ' = [^\\n]*;'));
  if (single) return single[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '');
  throw new Error('未找到常量 ' + name);
}

const CB_ALERT_TIERS = eval('(' + extractConstRaw('CB_ALERT_TIERS') + ')');
const CB_ALERT_MIN = eval(extractConstRaw('CB_ALERT_MIN'));

var state = { className: '', students: [], operations: [], creditBank: null };

const cbDefaultBank = extractFn('cbDefaultBank');
const cbBankSafe = extractFn('cbBankSafe');
const cbWalletKey = extractFn('cbWalletKey');
const cbMonthKey = extractFn('cbMonthKey');
const cbTierOf = extractFn('cbTierOf');
const cbTierSeverity = extractFn('cbTierSeverity');
const cbScanAlerts = extractFn('cbScanAlerts');
const cbPendingAlertCount = extractFn('cbPendingAlertCount');

function freshState(students) {
  return { className: '', students: students || [], operations: [], creditBank: cbDefaultBank() };
}
function opensOf(sid) {
  return state.creditBank.alerts.filter(a => String(a.sid) === cbWalletKey(sid) && (a.status === 'pending' || a.status === 'notified'));
}

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('四处跟版 ' + V + '（登录页 / 侧栏 / 设置徽标 / SW CACHE_NAME）', () => {
  has(html, '<div class="login-version">' + V + '</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">' + V + ' · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ ' + V + '</span>', '设置徽标未跟版');
  has(sw, "CACHE_NAME = 'class-manager-" + V + "'", 'SW CACHE_NAME 未跟版');
});

console.log('=== ① 一人一单：恶化升级在原单改写 ===');
t('黄→橙→红三次恶化：始终只有 1 条工单，档位与 credit 跟随，note 记升级', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 55 }]);
  eq(cbScanAlerts(), 1, '55 建黄单');
  eq(state.creditBank.alerts.length, 1);
  state.students[0].credit = 45;
  eq(cbScanAlerts(), 1, '45 橙：改写原单');
  eq(state.creditBank.alerts.length, 1, '不另开新条');
  state.students[0].credit = 30;
  eq(cbScanAlerts(), 1, '30 红：仍在原单升级');
  const a = state.creditBank.alerts[0];
  eq(state.creditBank.alerts.length, 1, '三档过后仍 1 条');
  eq(a.level, 'red', '档位红色');
  eq(a.credit, 30, 'credit 刷新为当前学分');
  has(a.note, '恶化升级至', 'note 记录升级链');
  eq(cbPendingAlertCount(), 1);
});
t('幂等：学分不动时重复扫描零变更', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 52 }]);
  cbScanAlerts();
  eq(cbScanAlerts(), 0, '再扫 0');
  eq(cbScanAlerts(), 0, '三扫 0');
  eq(state.creditBank.alerts.length, 1);
});
t('降档不改写：橙单 + 学分回黄区 → 保留最重档', () => {
  state = freshState([{ id: 1, sid: 'S1', name: '甲', credit: 52 }]);
  cbScanAlerts();
  state.students[0].credit = 45; cbScanAlerts();       // 橙
  state.students[0].credit = 55;                       // 回到黄区但未出预警区
  eq(cbScanAlerts(), 0, '不降档不改写');
  const a = state.creditBank.alerts[0];
  eq(a.level, 'orange', '保留最重档');
  eq(state.creditBank.alerts.length, 1);
});

console.log('=== ② 办结冷却：办结后不复活（含跨月） ===');
t('办结后同档不复活', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  const a = state.creditBank.alerts[0];
  a.status = 'resolved'; a.resolvedAt = Date.now();    // 模拟人工办结
  eq(cbScanAlerts(), 0, '冷却静默');
  eq(cbScanAlerts(), 0, '再扫仍静默');
  eq(state.creditBank.alerts.length, 1, '不新建');
});
t('跨月也不复活（冷却不看月份）', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  const a = state.creditBank.alerts[0];
  a.status = 'resolved'; a.resolvedAt = Date.now();
  a.month = '2099-12';                                  // 把记录月份改到「未来」，模拟跨月
  eq(cbScanAlerts(), 0, '跨月静默（旧逻辑此处会重建）');
  eq(state.creditBank.alerts.length, 1);
});
t('删除同样进入冷却', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  const a = state.creditBank.alerts[0];
  a.status = 'deleted'; a.deletedAt = Date.now();
  eq(cbScanAlerts(), 0, '删除后静默');
  eq(state.creditBank.alerts.length, 1, '墓碑保留');
});

console.log('=== ③ 红色及以上重新点亮 ===');
t('冷却中恶化到橙：不点亮', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  state.creditBank.alerts[0].status = 'resolved';       // 人工办结（黄）
  state.students[0].credit = 45;
  eq(cbScanAlerts(), 0, '橙不点亮');
  eq(state.creditBank.alerts.length, 1);
});
t('冷却中恶化到红：点亮新单，标注较办结时恶化', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  state.creditBank.alerts[0].status = 'resolved';       // 人工办结（黄）
  state.students[0].credit = 30;
  eq(cbScanAlerts(), 1, '红点亮');
  const list = state.creditBank.alerts;
  eq(list.length, 2, '新单独立流水');
  eq(list[1].level, 'red');
  has(list[1].note, '较办结时恶化升级', 'note 标注');
});
t('冷却中恶化到深红：同样点亮', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  state.creditBank.alerts[0].status = 'resolved';
  state.students[0].credit = 20;
  eq(cbScanAlerts(), 1, '深红点亮');
  eq(state.creditBank.alerts[1].level, 'dark');
});

console.log('=== ④ 回升自动办结与冷却解除 ===');
t('回升 ≥60：自动办结 + 解除冷却；再回落 = 新一轮（relapse 递增）', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 62 }]);
  eq(cbScanAlerts(), 0, '正常区不建档');
  state.students[0].credit = 52;
  eq(cbScanAlerts(), 1, '回落建档');
  state.students[0].credit = 65;
  eq(cbScanAlerts(), 1, '回升自动办结');
  const a0 = state.creditBank.alerts[0];
  eq(a0.status, 'resolved');
  eq(a0.autoResolved, true, '自动办结标记');
  state.students[0].credit = 52;
  eq(cbScanAlerts(), 1, '冷却已解除：再回落建新单');
  const a1 = state.creditBank.alerts[1];
  eq(a1.relapse, 1, '第 1 次回落');
  has(a1.note, '回升后再次回落', 'note 标注回落');
});
t('办结（非回升）解除冷却：回升时给人工办结记录打 relapseReset', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 52 }]);
  cbScanAlerts();
  const a = state.creditBank.alerts[0];
  a.status = 'resolved'; a.resolvedAt = Date.now();    // 人工办结 → 冷却
  state.students[0].credit = 70;
  eq(cbScanAlerts(), 1, '回升解除冷却（打标记算 1 次变更）');
  eq(a.relapseReset, true, 'relapseReset 标记');
  has(a.note, '预警周期结束', 'note 标注周期结束');
  state.students[0].credit = 52;
  eq(cbScanAlerts(), 1, '再回落 = 新一轮');
  eq(cbScanAlerts(), 0, '幂等');
});

console.log('=== ⑤ 迁移收敛：历史叠加多单收敛为最重一张 ===');
t('两条 pending（黄+橙）→ 保留橙，黄单关闭留痕（merged）', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 45 }]);
  const b = state.creditBank;
  const now = Date.now();
  b.alerts.push({ id: b.nextAlertId++, sid: cbWalletKey(1), sname: '甲', level: 'yellow', label: '黄色预警', act: '通报家长', credit: 55, month: cbMonthKey(), status: 'pending', time: now - 10000, resolvedAt: 0, relapse: 0, note: '' });
  b.alerts.push({ id: b.nextAlertId++, sid: cbWalletKey(1), sname: '甲', level: 'orange', label: '橙色预警', act: '手抄《学生手册》', credit: 45, month: cbMonthKey(), status: 'pending', time: now, resolvedAt: 0, relapse: 0, note: '' });
  eq(cbScanAlerts(), 1, '收敛产生 1 次变更');
  const pend = opensOf(1);
  eq(pend.length, 1, '有效单只剩 1 条');
  eq(pend[0].level, 'orange', '保留最重档');
  const merged = state.creditBank.alerts.filter(a => a.merged);
  eq(merged.length, 1, '黄单打 merged 标记');
  eq(merged[0].status, 'resolved', '黄单关闭');
  has(merged[0].note, '合并为单人单预警', '留痕');
});
t('收敛后正常走一人一单：继续恶化不改写错对象', () => {
  state = freshState([{ id: 1, sid: 'S0001', name: '甲', credit: 45 }]);
  const b = state.creditBank;
  const now = Date.now();
  b.alerts.push({ id: b.nextAlertId++, sid: cbWalletKey(1), sname: '甲', level: 'yellow', label: '黄色预警', act: '通报家长', credit: 55, month: cbMonthKey(), status: 'pending', time: now - 10000, resolvedAt: 0, relapse: 0, note: '' });
  b.alerts.push({ id: b.nextAlertId++, sid: cbWalletKey(1), sname: '甲', level: 'orange', label: '橙色预警', act: '手抄《学生手册》', credit: 45, month: cbMonthKey(), status: 'pending', time: now, resolvedAt: 0, relapse: 0, note: '' });
  cbScanAlerts();                                       // 收敛
  state.students[0].credit = 20;
  cbScanAlerts();                                       // 恶化到深红
  const pend = opensOf(1);
  eq(pend.length, 1, '仍 1 条有效');
  eq(pend[0].level, 'dark', '在保留单上升档');
});

console.log('=== ⑥ 多人互不干扰 ===');
t('两个学生独立状态机：各自建单/办结/回落互不影响', () => {
  state = freshState([
    { id: 1, sid: 'S1', name: '甲', credit: 52 },
    { id: 2, sid: 'S2', name: '乙', credit: 40 }
  ]);
  eq(cbScanAlerts(), 2, '两人各建 1 单');
  const a = state.creditBank.alerts.find(x => String(x.sid) === cbWalletKey(1));
  a.status = 'resolved'; a.resolvedAt = Date.now();     // 甲办结
  eq(cbScanAlerts(), 0, '甲冷却、乙幂等');
  state.students[0].credit = 30;                        // 甲恶化到红
  eq(cbScanAlerts(), 1, '只有甲的红单点亮');
  eq(opensOf(1).length, 1);
  eq(opensOf(2).length, 1);
});

console.log('=== ⑦ 流水归档 UI 契约 ===');
t('归档折叠切换与导出函数在位且绑定', () => {
  has(html, 'function cbAlertArchToggle()', '折叠切换函数缺失');
  has(html, 'function cbAlertArchExport()', '导出函数缺失');
  has(html, 'onclick="cbAlertArchToggle()"', '折叠头未绑定');
  has(html, 'onclick="cbAlertArchExport()"', '导出按钮未绑定');
  has(html, '默认收起 · 展开显示最近 10 条', '收起文案缺失');
  has(html, 'var cbAlertArchOpen = false;', '展开态变量缺失');
});
t('导出 payload 含 resolved/deleted 全量（slice(0,10) 只作用于展示）', () => {
  const fn = html.match(/function cbAlertArchExport\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, "a.status === 'resolved' || a.status === 'deleted'", '导出未含全量流水');
  ok(fn.indexOf('list.slice(0, 10)') < 0, '导出不应截断 10 条');
});
t('有效区与流水区口径互斥（pending/notified 与 resolved/deleted）', () => {
  const fn = html.match(/function cbRenderStudentAlerts\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, "a.status === 'pending' || a.status === 'notified'", '有效区过滤缺失');
  has(fn, "a.status === 'resolved' || a.status === 'deleted'", '流水区过滤缺失');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 500).unref();
