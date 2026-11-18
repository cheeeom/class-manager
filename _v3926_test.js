// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
/* v3.9.26 回归：个人成绩单三件套
   ① reportCardData 纯数据口径：逐科班均（缺分者不计入分母）、总分/班均/排名（有分才算参考）、
      上一场对比（date+id 排序，首场无基准）、走势（最近 8 场有分考试）、寄语取 state.comments[s.id]；
   ② rcGradeTier 等第边界（85/75/60 三个分界点两侧都要钉）；
   ③ 三处入口接线都在：成绩管理表格姓名/分析页排名榜（原生+cmgx 两路）/考试卡与分析工具条打印按钮；
   ④ 打印文档 A4 每生一页 + 签名栏；⑤ 载荷 row.sa 逐科班均 + portal 条形与班均刻度。
   运行：node _v3926_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const cmgx = fs.readFileSync('cmgx.js', 'utf8').replace(/\r\n/g, '\n');
const portal = fs.readFileSync('portal/index.html', 'utf8').replace(/\r\n/g, '\n');
const swjs = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');
const manifest = fs.readFileSync('manifest.json', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function count(a, b, n, msg) { const c = String(a).split(b).length - 1; eq(c, n, (msg || '') + `「${b}」出现 `); }

/* ---------- 切出真实纯函数（闭合锚点：函数体内无列 0 的 `}`） ---------- */
const FN_DATA = (html.match(/function reportCardData\(examId, sid\)\{[\s\S]*?\n\}/) || [])[0];
/* v3.9.30 起等第按「占本科满分比例」判，签名多了 full 形参（不传仍按 100，老断言全部照旧） */
const FN_TIER = (html.match(/function rcGradeTier\(v, full\)\{[\s\S]*?\n\}/) || [])[0];
const FN_MAXOF = (html.match(/function examMaxOf\(exam\)\{[\s\S]*?\n\}/) || [])[0];
const FN_FULLSUM = (html.match(/function examFullTotal\(exam\)\{[\s\S]*?\n\}/) || [])[0];
const FN_DEF = (html.match(/function defaultFullOf\(subj\)\{[\s\S]*?\n\}/) || [])[0];
ok(FN_DATA, 'reportCardData 切片失败（锚点被改动？）');
ok(FN_TIER, 'rcGradeTier 切片失败');
ok(FN_MAXOF, 'examMaxOf 切片失败');
ok(FN_FULLSUM, 'examFullTotal 切片失败');
ok(FN_DEF, 'defaultFullOf 切片失败');

const STUB_LEVEL = function (c) { return Number(c) >= 110 ? '进取' : (Number(c) >= 60 ? '常规' : '需努力'); };
const sandbox = new Function('state', 'portalLevelText',
  FN_MAXOF + '\n' + FN_DEF + '\n' + FN_FULLSUM + '\n' + FN_DATA + '\n' + FN_TIER
  + '\n;return {reportCardData: reportCardData, rcGradeTier: rcGradeTier};');

/* ---------- 夹具：两场考试 + 一名缺科学生 ---------- */
const ST = {
  className: '26幼2班',
  students: [
    { id: 1, name: '张三', sid: '2602001', credit: 132 },
    { id: 2, name: '李四', sid: '2602002', credit: 85 },
    { id: 3, name: '王五', sid: '2602003', credit: 42 },
    { id: 4, name: '赵六', sid: '2602004', credit: 100 }
  ],
  exams: [
    { id: 10, name: '月考一', date: '2026-10-15', subjects: ['语文', '数学'],
      scores: { '1': { '语文': 80, '数学': 90 }, '2': { '语文': 70, '数学': 60 }, '3': { '语文': 55, '数学': 40 } } },
    { id: 11, name: '月考二', date: '2026-11-01', subjects: ['语文', '数学'],
      scores: { '1': { '语文': 88, '数学': 92 }, '2': { '语文': 72, '数学': 66 }, '3': { '语文': 50, '数学': 35 }, '4': { '语文': 60 } } }
  ],
  comments: { '1': { text: '继续保持', semester: '', updatedAt: 1 } }
};
const R = sandbox(ST, STUB_LEVEL);
const d1 = R.reportCardData(11, 1);

console.log('=== 行为级：reportCardData 数据口径 ===');
t('逐科分数与逐科班均（缺分者不计入分母：数学均按 3 人算）', () => {
  eq(d1.rows.length, 2, '科目数');
  eq(d1.rows[0].subj, '语文'); eq(d1.rows[0].score, 88); eq(d1.rows[0].avg, 67.5, '语文班均');
  eq(d1.rows[1].subj, '数学'); eq(d1.rows[1].score, 92); eq(d1.rows[1].avg, 64.3, '数学班均（193/3）');
});
t('总分/满分/班均/排名/参考人数', () => {
  eq(d1.total, 180); eq(d1.maxTotal, 200);
  eq(d1.totalAvg, 115.8, '班均（463/4，一位小数）');
  eq(d1.rank, 1); eq(d1.totalN, 4);
});
t('李四排名 = 2（180 在他前面）', () => {
  const d2 = R.reportCardData(11, 2);
  eq(d2.rank, 2); eq(d2.total, 138);
});
t('上一场对比：总分与名次（按 date+id 排序取前一场）', () => {
  eq(d1.prev.id, 10); eq(d1.prev.total, 170); eq(d1.prev.rank, 1);
  const d2 = R.reportCardData(11, 2);
  eq(d2.prev.total, 130); eq(d2.prev.rank, 2);
});
t('首场没有对比基准（prev.total = null）', () => {
  const d0 = R.reportCardData(10, 1);
  ok(d0.prev.total == null && d0.prev.rank == null && d0.prev.id == null, '首场 prev 应全空');
});
t('缺科学生只列有分的科目（数学缺 → rows 仅语文）', () => {
  const d4 = R.reportCardData(11, 4);
  eq(d4.rows.length, 1); eq(d4.rows[0].subj, '语文'); eq(d4.total, 60);
});
t('走势只收有分考试且封顶 8 场', () => {
  eq(d1.trend.length, 2, '张三两场都有分');
  eq(d1.trend[0].n, '月考一'); eq(d1.trend[1].total, 180);
});
t('寄语取 state.comments[学生内部 id]，无寄语学生为空串', () => {
  eq(d1.comment, '继续保持');
  eq(R.reportCardData(11, 2).comment, '');
});
t('无成绩/不存在的考试或学生 → null（弹窗入口据此 toast 拦截）', () => {
  ok(R.reportCardData(11, 5) === null, '没分的学生');
  ok(R.reportCardData(999, 1) === null, '不存在的考试');
  ok(R.reportCardData(11, 3) !== null, '王五有分必须能出单');
});

console.log('=== 行为级：rcGradeTier 等第边界 ===');
t('85/75/60 三条分界线两侧', () => {
  eq(R.rcGradeTier(90).label, '优'); eq(R.rcGradeTier(85).label, '优'); eq(R.rcGradeTier(84).label, '良');
  eq(R.rcGradeTier(75).label, '良'); eq(R.rcGradeTier(74).label, '及格');
  eq(R.rcGradeTier(60).label, '及格'); eq(R.rcGradeTier(59).label, '待及格');
});
t('等第颜色语义（优绿/良蓝/及格琥珀/待及格红）', () => {
  eq(R.rcGradeTier(90).color, '#2F7D5B'); eq(R.rcGradeTier(80).color, '#3B6E8F');
  eq(R.rcGradeTier(65).color, '#C08A2D'); eq(R.rcGradeTier(50).color, '#B42318');
});

console.log('=== 源码形状：入口接线（三处可点 + 两处打印按钮）===');
t('成绩管理表格姓名可点开详情', () => {
  count(html, 'onclick="openStudentReportModal(${r.stu.id},${exam.id})"', 1);
});
t('成绩分析排名榜（前 10 与后 5）都可点（原生渲染路）', () => {
  count(html, "onclick=\"openStudentReportModal(' + r.stu.id + ',' + exam.id + ')", 2);
});
t('cmgx 图表引擎的排名前 10 也可点（接管渲染路）', () => {
  count(cmgx, "openStudentReportModal(' + r.stu.id + ',' + exam.id + ')", 1);
});
t('成绩管理每场考试卡有「🖨 个人成绩单」按钮（null=全班）', () => {
  has(html, 'openReportCardPrint(null, ${exam.id})', '批量打印按钮');
  has(html, '🖨 个人成绩单', '按钮文案');
});
t('成绩分析工具条有「🖨 全班成绩单」', () => {
  has(html, 'onclick="printReportCardsAll()"', '分析页按钮');
});
t('printReportCardsAll 从分析页选择器取考试，取不到回落最近有分考试', () => {
  const fn = (html.match(/function printReportCardsAll\(\)\{[\s\S]*?\n\}/) || [])[0];
  ok(fn, 'printReportCardsAll 切片失败');
  has(fn, 'gradeAnalyticsExamSelect', '应读分析页选择器');
  has(fn, '还没有考试成绩', '空态 toast');
});
t('上一场逐科反查按考试 id（不按名字，防重名考试）', () => {
  count(html, 'd.prev.id != null && e.id === d.prev.id', 2, '弹窗+打印两处');
});

console.log('=== 源码形状：弹窗与打印文档 ===');
t('弹窗有班均刻度线说明与寄语区', () => {
  has(html, '灰色竖线 = 班级平均分位置', '刻度线图例');
  has(html, '老师寄语', '寄语块');
});
t('打印文档：A4 每生一页 + 签名栏 + 另存为 PDF 提示', () => {
  has(html, 'break-after:page', '现代分页属性');
  has(html, 'page-break-after:always', '兼容分页属性');
  has(html, '@page{size:A4', 'A4 纸型');
  has(html, '班主任签名', '签名栏');
  has(html, '家长签收', '签收栏');
  has(html, '另存为 PDF', '工具条提示');
});
t('打印/弹窗内容必须过 escapeHtml（姓名/寄语进独立 HTML 文档，防注入）', () => {
  has(html, "escapeHtml(d.stu.name)", '姓名转义');
  has(html, 'escapeHtml(d.comment)', '寄语转义');
});
t('弹窗打印按钮传参不破坏 onclick 属性（id 用单引号包）', () => {
  ok(html.indexOf("JSON.stringify(String(d.stu.id))") < 0, 'JSON.stringify 产生双引号会打碎 onclick 属性');
  has(html, "openReportCardPrint([\\'' + String(d.stu.id) + '\\']", '单引号包裹的 id');
});

console.log('=== 源码形状：载荷 sa 与 portal 条形 ===');
t('buildPortalPayload 勾「班级均分」时逐科发 sa', () => {
  count(html, 'row.sa = sa', 1);
  has(html, 'v3.9.26 逐科班均', '口径注释在位');
});
t('portal 成绩页：分数条 + 班均刻度线 + 图例说明', () => {
  ok(portal.split('.gbarline').length - 1 >= 4, 'CSS 四条规则（容器/条/不及格色/刻度）');
  has(portal, 'cur.sa[k] != null', 'sa 消费');
  has(portal, '<u style="left:', '刻度线定位');
  has(portal, '灰线 = 班级平均分位置', '图例');
});
t('不及格条用危险红（语义色不跟肤）', () => {
  has(portal, "i.lo{background:#B42318}", 'lo 变体');
});

console.log('=== 版本四处 + 速览（从 CACHE_NAME 反推，动态断言）===');
const VNUM = (swjs.match(/const CACHE_NAME = 'class-manager-v([\d.]+)'/) || [])[1];
ok(VNUM, 'CACHE_NAME 反推失败');
const VT = 'v' + VNUM;
t('版本徽标四处同版（' + VT + '）', () => {
  has(html, `<div class="login-version">${VT}</div>`, '登录页');
  has(html, `<div class="sidebar-footer">${VT} · 班主任工作台</div>`, '侧栏页脚');
  has(html, `🏷️ ${VT}</span>`, '设置页徽标');
  has(html, `近版更新速览（${VT}）`, '速览标题');
});
t('cmgx 引用与缓存参数同版', () => {
  has(html, `<script src="./cmgx.js?v=${VNUM}"></script>`, 'index.html 脚本标签');
  count(swjs, `?v=${VNUM}`, 3, 'sw.js 预缓存参数');
  count(manifest, `?v=${VNUM}`, 3, 'manifest 图标参数');
  has(swjs, `class-manager-v${VNUM}`, 'CACHE_NAME');
  has(cmgx, `增强引擎（${VT}）`, 'cmgx 头注释');
});
t('速览是累积式：上一版条目仍在', () => {
  has(html, '措辞对齐教育政策（v3.9.25）', 'v3.9.25 条目不得被清掉');
  /* 本条刻意钉字面量 v3.9.26，不拼当版号：个人成绩单是 v3.9.26 的史实，
     条目文本永不随版本移动。原写法 `'个人成绩单（' + VT + '）'` 把当版号绑进了
     历史条目，升到 v3.9.27 就误报「条目丢失」——判据错，不是产品错。 */
  has(html, '个人成绩单（v3.9.26）', 'v3.9.26 条目不得被清掉');
});

console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
setTimeout(() => process.exit(0), 200).unref();
