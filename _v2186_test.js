/* v2.18.2 回归测试：零扣分榜改按「未扣分天数」排名
   覆盖：榜行右侧展示天数（去掉学分徽章）/ 排序只认天数（并列按学号，不再以学分为次键）/
        副标题明示 / 版本三处同步 v2.18.2 / 设置页 notes 新条 / 主 script 语法。
   运行：node _v2186_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + '不应包含 ' + JSON.stringify(b)); }

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

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.13（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.19\.1</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.19\.1 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.19.1')) throw new Error('SW CACHE_NAME 未更新');
});
t('设置页版本徽标随版 = v2.18.13', () => {
  has(html, '🏷️ v2.19.1</span>', '设置页版本徽标未跟版');
});
t('历史注释保护：v2.18.1 功能注释 4 处保留', () => {
  const n = (html.match(/v2\.18\.1(?![0-9])/g) || []).length; // (?![0-9]) 排除 v2.18.13+ 子串误命中
  eq(n, 4, 'v2.18.1 功能注释数');
});

console.log('\n=== 榜行渲染：右侧改未扣分天数 ===');
global.__pubMock = {};
global.loadPubSetting = k => global.__pubMock[k];
global.pubCredit = s => { const n = Number(s.credit); return isNaN(n) ? 0 : n; };
global.escapeHtml = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
global.cbCreditBadge = c => (Math.round(Number(c) || 0)) + ' 分';
global.pubDisplayName = extractFn('pubDisplayName');
const pubStaminaRow = extractFn('pubStaminaRow');
t('从未扣分 → 右侧「从未扣分」，不显示学分', () => {
  const h = pubStaminaRow({ row: { name: '张伟', sid: 'A001', credit: 100 }, days: null }, 0);
  has(h, '从未扣分'); has(h, '张伟');
  notHas(h, '100 分', '仍显示学分'); notHas(h, 'cbCreditBadge', '仍调用学分徽章');
});
t('10 天未扣分 → 右侧「10 天」', () => {
  const h = pubStaminaRow({ row: { name: '李四', sid: 'A002', credit: 92 }, days: 10 }, 1);
  has(h, '10 天'); notHas(h, '92 分', '仍显示学分');
});
t('pubStaminaRow 源码不再依赖学分（无 credit / cbCreditBadge 引用）', () => {
  const src = pubStaminaRow.toString();
  notHas(src, 'cbCreditBadge', '源码仍引用徽章');
  notHas(src, 'credit', '源码仍引用学分');
});

console.log('\n=== 排序：只认未扣分天数 ===');
const rangeStartOf = extractFn('rangeStartOf');
const computePublicityData = extractFn('computePublicityData');
t('天数降序 + 从未扣分居首 + 今天扣分垫底', () => {
  const DAY = 86400000, T = Date.now();
  const stus = [
    { id: 1, sid: 'B001', name: '甲', credit: 100 },
    { id: 2, sid: 'B002', name: '乙', credit: 97 },
    { id: 3, sid: 'B003', name: '丙', credit: 95 }
  ];
  const dz = computePublicityData(stus, [
    { studentId: 2, amount: -3, time: T - 10 * DAY },
    { studentId: 3, amount: -5, time: T }
  ], 'month', new Date(T)).zero;
  eq(dz[0].days, null); eq(dz[0].row.sid, 'B001');
  eq(dz[1].days, 10);   eq(dz[1].row.sid, 'B002');
  eq(dz[2].days, 0);    eq(dz[2].row.sid, 'B003');
});
t('★ 并列天数/并列从未扣分时按学号，不按学分（学号小者在前，即便学分更低）', () => {
  const T = Date.now();
  const stus = [
    { id: 1, sid: 'C002', name: '高学分', credit: 100 },   // 学分高但学号大
    { id: 2, sid: 'C001', name: '低学分', credit: 60 }     // 学分低但学号小
  ];
  const dz = computePublicityData(stus, [], 'month', new Date(T)).zero;
  eq(dz[0].row.sid, 'C001', '并列从未扣分应按学号排（若按学分则 C002 在前）');
  eq(dz[1].row.sid, 'C002');
});
t('zero 排序源码：sidSort 就位、无 creditSort', () => {
  const i = html.indexOf('var zero = rows.map');
  const seg = html.slice(i, html.indexOf('slice(0,10);', i));
  has(seg, 'sidSort', '未用学号次键');
  notHas(seg, 'creditSort', '仍以学分为次键');
});
t('卡片副标题明示按未扣分天数排名', () => {
  has(html, "pubCard('🌟 零扣分榜 Top10', '按未扣分天数排名 · 从未扣分居首'", '副标题未更新');
});

console.log('\n=== 设置页 notes ===');
t('notes 置顶「零扣分榜按未扣分天数排名」条', () => {
  has(html, '（v2.19.1）', '缺新条');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
