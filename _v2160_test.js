/* v2.16.0 回归测试：学分公示模块（周期统计/榜单/隐私/导航白名单/导出入口）
   运行：node _v2160_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

/* ---------- 抽取与 stub ---------- */
function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}
// rangeStartOf 的 semester 分支会读 loadPubSetting，mock 之
global.__pubMock = {};
global.loadPubSetting = function (k) { return global.__pubMock[k]; };
const rangeStartOf = eval('(' + grab('function rangeStartOf(kind, nowDate)') + ')');
const pubCreditLevel = eval('(' + grab('function pubCreditLevel(c)') + ')');
const pubDisplayName = eval('(' + grab('function pubDisplayName(s)') + ')');
global.pubCredit = s => { const n = Number(s.credit); return isNaN(n) ? 0 : n; };
const computePublicityData = eval('(' + grab('function computePublicityData(students, operations, rangeKind, nowDate)') + ')');
global.state = {};

console.log('\n=== 周期边界 ===');
t('today：取当日 00:00', () => {
  eq(rangeStartOf('today', new Date(2026, 8, 6, 15, 30)), new Date(2026, 8, 6).getTime());
});
t('week：周一为起点（2026-09-06 是周日 → 往前回到 2026-08-31 周一）', () => {
  const w = new Date(rangeStartOf('week', new Date(2026, 8, 6)));
  eq(w.getDay(), 1); eq(w.getDate(), 31); eq(w.getMonth(), 7);
});
t('month：取当月 1 号', () => {
  eq(rangeStartOf('month', new Date(2026, 8, 6)), new Date(2026, 8, 1).getTime());
});
t('semester：9 月默认取当年 9/1（秋季）', () => {
  eq(rangeStartOf('semester', new Date(2026, 8, 6)), new Date(2026, 8, 1).getTime());
});
t('semester：3 月默认取当年 3/1（春季）', () => {
  eq(rangeStartOf('semester', new Date(2026, 2, 15)), new Date(2026, 2, 1).getTime());
});
t('semester：1 月默认取上年 9/1', () => {
  eq(rangeStartOf('semester', new Date(2026, 0, 15)), new Date(2025, 8, 1).getTime());
});
t('semester：自定义开学日期优先（设置里配过就用配置）', () => {
  global.__pubMock.semesterStart = String(new Date(2026, 7, 24).getTime());   // 8/24 开学
  eq(rangeStartOf('semester', new Date(2026, 8, 6)), new Date(2026, 7, 24).getTime());
  delete global.__pubMock.semesterStart;
});

console.log('\n=== 等级与隐私 ===');
t('pubCreditLevel：100 分制四档边界', () => {
  eq(pubCreditLevel(120).label, '优秀'); eq(pubCreditLevel(100).label, '优秀');
  eq(pubCreditLevel(90).label, '合格'); eq(pubCreditLevel(80).label, '一般');
  eq(pubCreditLevel(79).label, '不合格');
});
t('pubDisplayName：默认全名', () => {
  global.__pubMock.nameMode = undefined;
  eq(pubDisplayName({ name: '张伟', sid: '2026001' }), '张伟');
});
t('pubDisplayName：mask 姓 + *', () => {
  global.__pubMock.nameMode = 'mask';
  eq(pubDisplayName({ name: '张伟', sid: '2026001' }), '张*');
});
t('pubDisplayName：仅学号', () => {
  global.__pubMock.nameMode = 'sid';
  eq(pubDisplayName({ name: '张伟', sid: '2026001' }), '#2026001');
  delete global.__pubMock.nameMode;
});

console.log('\n=== 核心统计 computePublicityData ===');
const now = Date.now();
const stu = [
  { id: 1, sid: 'A001', name: '小明', credit: 100 },
  { id: 2, sid: 'A002', name: '小红', credit: 90 },
  { id: 3, sid: 'A003', name: '小刚', credit: 100 },
  { id: 4, sid: 'A004', name: '小美', credit: 75 }
];
const ops = [
  { studentId: 1, amount: 5,  reason: '作业优秀', time: now },
  { studentId: 1, amount: 2,  reason: '助人',     time: now },
  { studentId: 2, amount: -3, reason: '迟到',     time: now },
  { studentId: 3, amount: 10, reason: '获奖',     time: now },
  { studentId: 4, amount: 1,  reason: '举手',     time: now },
  { studentId: 99, amount: 9, reason: '孤儿记录', time: now }   // 学生已删，应跳过
];
t('净增/汇总：netSum=15、加分 +18 共4次、扣分 -3 共1次', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.netSum, 15); eq(d.addPts, 18); eq(d.addCnt, 4); eq(d.subPts, 3); eq(d.subCnt, 1);
});
t('周期过滤：today 只收今天流水；昨天的不进统计', () => {
  const yesterday = now - 86400000;
  const d = computePublicityData(stu, [{ studentId: 1, amount: 99, time: yesterday }], 'today');
  eq(d.netSum, 0);   // 昨天 → 今日口径应过滤
});
t('非数字/缺失时间戳的流水被忽略（不污染统计）', () => {
  const d = computePublicityData(stu, [{ studentId: 1, amount: 5, time: 'bad' }], 'month');
  eq(d.netSum, 0);
});
t('学分榜按总分降序（同分按学号），top 前 3 = A001 / A003 / A002', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.top[0].sid, 'A001'); eq(d.top[1].sid, 'A003'); eq(d.top[2].sid, 'A002');
});
t('进步榜：净增 >0 按增分降序 → 小刚(+10) 第一、小明(+7) 第二', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.prog.length, 3);
  eq(d.prog[0].sid, 'A003'); eq(d.prog[0].net, 10);
  eq(d.prog[1].sid, 'A001'); eq(d.prog[1].net, 7);
});
t('退步榜：净增 <0 升序 → 只有小红(-3)', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.reg.length, 1); eq(d.reg[0].sid, 'A002'); eq(d.reg[0].net, -3);
});
t('零扣分榜：本期有记录且无扣分 → 小明(2条) / 小刚 / 小美（不含无记录者与扣分者）', () => {
  const d = computePublicityData(stu, ops, 'month');
  const sids = d.zero.map(r => r.sid).join(',');
  eq(sids, 'A001,A003,A004');
});
t('预警榜：当前 <80 → 小美(75)', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.warn.length, 1); eq(d.warn[0].sid, 'A004');
});
t('单项之星：加分次数最多=小明(2次)，单笔最高=小刚(+10)', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.starAdd.name, '小明'); eq(d.starAddN, 2);          // 加分条数最多
  eq(d.maxSingle.v, 10); eq(d.maxSingle.name, '小刚');     // 金额最大
});
t('孤儿流水（学生已删）：不进榜单、不进汇总、不当单笔最高（孤儿 +99 被忽略）', () => {
  const ops2 = ops.concat([{ studentId: 99, amount: 99, reason: '孤儿大额', time: now }]);
  const d = computePublicityData(stu, ops2, 'month');
  eq(d.netSum, 15);                      // 99 不计入
  eq(d.maxSingle.v, 10);                 // 99 不成为单笔最高
  eq(d.addPts, 18); eq(d.addCnt, 4);
  d.top.concat(d.prog, d.reg).forEach(r => { if (r.sid === 'A099') throw new Error('孤儿记录上榜'); });
});
t('平均变动 = 汇总/人数（netSum 15 ÷ 4 = 3.75）', () => {
  const d = computePublicityData(stu, ops, 'month');
  eq(d.avgDelta, 3.75);
});

console.log('\n=== 页面与导航接线 ===');
t('侧栏有「学分公示」导航、学分页 div、canvas 四张齐备', () => {
  ['data-page="publicity"', 'id="page-publicity"', 'id="pubSummary"', 'id="pubBoards"',
   'id="pubTrendChart"', 'id="pubDailyChart"', 'id="pubDistChart"', 'id="pubReasonChart"',
   'id="pubTabs"', 'onclick="exportPublicityPoster(\'portrait\')"'].forEach(s => {
    if (!html.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('更多抽屉也有公示入口', () => {
  if (!html.includes('data-page="publicity" onclick="navigateTo(\'publicity\')"')) throw new Error('抽屉缺公示');
});
t('pageTitles 含 publicity，navigateTo 调用 renderPublicity', () => {
  if (!html.includes("publicity:'学分公示'")) throw new Error('标题缺');
  if (!html.includes("if(page==='publicity') renderPublicity();")) throw new Error('路由缺');
});
t('班委白名单含 publicity（公示是公开页，班委可见）', () => {
  const m = html.match(/const COMMITTEE_PAGES = \[([^\]]*)\]/);
  eq(m[1].includes('publicity'), true);
});
t('公示姓名/开学日期设置项在设置页（仅班主任可达）', () => {
  if (!html.includes('id="pubNameMode"') || !html.includes('id="pubSemesterStart"')) throw new Error('设置项缺');
});
t('渲染入口 renderPublicity / 海报导出 / 核心统计函数存在', () => {
  ['function renderPublicity()', 'function exportPublicityPoster(mode)', 'function computePublicityData',
   'function drawPubTrend', 'function drawPubDaily', 'function drawPubDist', 'function drawPubReason'].forEach(s => {
    if (!html.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('导出海报为纯 canvas 自绘（不依赖 html2canvas/第三方库）', () => {
  const src = html.match(/function drawPubPoster\(ctx[\s\S]*?\n\}/);
  if (!src) throw new Error('海报绘制函数缺');
  if (/html2canvas|Chart\.js|echarts|frappe/i.test(src[0])) throw new Error('海报引用了第三方库');
});

console.log('\n=== 版本号 ===');
t('v2.16.0 三处同步：登录页 / 侧栏 / SW CACHE_NAME', () => {
  if (!/login-version">v2\.16\.0</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.16\.0 ·/.test(html)) throw new Error('侧栏版本号未更新');
  const sw = fs.readFileSync('sw.js', 'utf8');
  if (!sw.includes('class-manager-v2.16.0')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
