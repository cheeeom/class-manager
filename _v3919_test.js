/* v3.9.19 回归：默认排序统一按学号 + 学生端实机预览搜索 + 跟版一致性
   ------------------------------------------------------------------
   版本无关：当版号从 sw.js 的 CACHE_NAME 反推，不与具体版本绑死。
   真跑优先：sidCmp / bySid / pvSidCmp / previewFilter 都抽函数体实跑，
   不做「字符串在不在」的假断言（静态锚点只用于确认调用点接上了统一入口）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = __dirname;
const DESK = path.join(WEB, '..', 'class-manager-desktop');
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' → ' + JSON.stringify(a)); }
function has(s, needle, name) { ok(s.indexOf(needle) >= 0, name); }
function count(s, needle) { return s.split(needle).length - 1; }

const html = read(path.join(WEB, 'index.html'));
const cmgx = read(path.join(WEB, 'cmgx.js'));
const portal = read(path.join(WEB, 'portal/index.html'));
const sw = read(path.join(WEB, 'sw.js'));
const manifest = read(path.join(WEB, 'manifest.json'));
const patchPath = path.join(DESK, 'app/src/app.patch.js');
const patch = fs.existsSync(patchPath) ? read(patchPath) : '';

/* 从源码里按大括号配对抓一个完整函数/赋值表达式 */
function grab(marker, src) {
  const s = src.indexOf(marker);
  if (s < 0) return '';
  const i = src.indexOf('{', s);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) { j++; break; }
  }
  return src.slice(s, j + 1);
}

console.log('\n=== ① 跟版一致性（版本从 CACHE_NAME 反推） ===');
const VER = (sw.match(/CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/) || [])[1] || '';
const V = VER.slice(1);
ok(!!VER, 'CACHE_NAME 可解析：' + VER);
has(html, '<div class="login-version">' + VER + '</div>', '登录版本标');
has(html, '<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>', '侧栏版本标');
has(html, '🏷️ ' + VER + '</span>', '设置徽标');
has(html, '📝 近版更新速览（' + VER + '）', '速览标题');
has(html, '<script src="./cmgx.js?v=' + V + '"></script>', 'index 的 cmgx 版本串');
has(sw, "'./cmgx.js?v=" + V + "'", 'sw CORE_ASSETS 的 cmgx 版本串');
eq(count(sw, '?v=' + V), 3, 'sw 三处资源版本串');
eq(count(manifest, '?v=' + V), 3, 'manifest 三处图标版本串');
has(cmgx, '（' + VER + '）', 'cmgx 头注释跟版');

console.log('\n=== ② 学号排序：真跑 sidCmp / bySid ===');
const sidSrc = grab('function sidCmp(a, b)', html);
const bySrc = grab('function bySid(list)', html);
ok(!!sidSrc && !!bySrc, '抓到 sidCmp 与 bySid 函数体');
const bySid = new Function(sidSrc + '\n' + bySrc + '\nreturn bySid;')();
const sample = ['10', '9', '2', '1', '', 'S1'].map(sid => ({ sid: sid }));
const ordered = bySid(sample).map(x => x.sid);
eq(ordered.slice(0, 4), ['1', '2', '9', '10'], 'numeric 升序：9 排在 10 前');
eq(ordered[ordered.length - 1], '', '缺学号垫底');
eq(sample.map(x => x.sid), ['10', '9', '2', '1', '', 'S1'], 'bySid 不改动原数组');
has(html, 'list.sort((a,b)=> sidCmp(a.sid, b.sid));', '学生管理默认排序走 sidCmp');
ok(count(html, 'sidCmp(a.sid, b.sid)') >= 5, '评语助手 / 导出 / 保存并下共用 sidCmp');

console.log('\n=== ③ 其余默认名单接入统一入口 ===');
eq(count(html, '_studentPickerPool = bySid('), 3, '三个选人池都按学号');
has(html, 'opts.pool != null ? opts.pool : bySid(state.students || [])', '公共学生搜索下拉默认池按学号');
has(html, 'function bySid(list)', '统一入口 bySid 存在');
ok(count(cmgx, 'cmBySid(cmReportLiveStudents())') === 2, '网页版学期报告两处名单（个人 + 班级）');
has(cmgx, 'function cmSidCmp(a, b)', '网页版报告引擎有等价回退');
if (patch) {
  ok(count(patch, 'cmBySid(cmReportLiveStudents())') === 2, '桌面版学期报告两处名单（个人 + 班级）');
  has(patch, 'function cmSidCmp(a, b)', '桌面版报告引擎有等价回退');
}

console.log('\n=== ④ 学生查询端实机预览：排序 + 搜索 ===');
has(portal, 'var sids = Object.keys(pp.students).sort(pvSidCmp);', '身份列表按学号排序');
has(portal, 'function pvSidCmp(a, b)', '预览排序函数存在');
has(portal, 'id="pvSearch"', '搜索框存在');
has(portal, 'oninput="previewFilter(this.value)"', '输入即筛选');
has(portal, 'data-name="', '行带姓名索引');
has(portal, 'data-sid="', '行带学号索引');
has(portal, 'id="pvCount"', '结果计数');
has(portal, 'id="pvEmpty"', '空结果提示');
const pvSrc = grab('function pvSidCmp(a, b)', portal);
ok(!!pvSrc, '抓到 pvSidCmp 函数体');
const pvCmp = new Function(pvSrc + '\nreturn pvSidCmp;')();
eq(['10', '9', '2', '1', ''].slice().sort(pvCmp).slice(0, 4), ['1', '2', '9', '10'], '预览 numeric 口径与工作台一致');
eq(['10', '9', '2', '1', ''].slice().sort(pvCmp)[4], '', '预览缺学号垫底');

/* previewFilter 真跑：简易 DOM，验证只切 display 不重画（保住输入焦点） */
const pfSrc = grab('window.previewFilter = function(kw)', portal);
ok(!!pfSrc, '抓到 previewFilter 函数体');
const rows = [
  { dataset: { name: '张三', sid: '9' }, style: {} },
  { dataset: { name: '李四', sid: '10' }, style: {} },
  { dataset: { name: '王五', sid: '2' }, style: {} }
];
const cnt = { textContent: '' };
const emp = { style: { display: 'none' } };
const fakeDoc = {
  getElementById: function (id) {
    if (id === 'pvList') return { querySelectorAll: function () { return rows; } };
    if (id === 'pvCount') return cnt;
    if (id === 'pvEmpty') return emp;
    return null;
  }
};
const fakeWin = {};
const previewFilter = new Function('window', 'document', pfSrc + '\nreturn window.previewFilter;')(fakeWin, fakeDoc);
previewFilter('张');
eq(rows.map(r => r.style.display), ['', 'none', 'none'], '按姓名筛选，只切 display');
eq(cnt.textContent, '匹配 1 / 3 人', '计数随筛选更新');
previewFilter('10');
eq(rows.map(r => r.style.display), ['none', '', 'none'], '按学号筛选');
previewFilter('');
eq(rows.map(r => r.style.display), ['', '', ''], '清空恢复全量');
previewFilter('没有这个人');
eq(emp.style.display, '', '无结果时显示空态');

console.log('\n=== ⑤ 语法可编译 ===');
try { new vm.Script(cmgx); ok(true, 'cmgx.js 语法通过'); } catch (e) { ok(false, 'cmgx.js 语法：' + e.message); }
if (patch) { try { new vm.Script(patch); ok(true, 'app.patch.js 语法通过'); } catch (e) { ok(false, 'app.patch.js 语法：' + e.message); } }

console.log('\n=== ⑥ 桌面版 dist 同步（兄弟仓已构建才验） ===');
const distHtml = path.join(DESK, 'app/dist/index.html');
const distPortal = path.join(DESK, 'app/dist/portal/index.html');
const distPatch = path.join(DESK, 'app/dist/app.patch.js');
if (fs.existsSync(distHtml) && fs.existsSync(distPortal) && fs.existsSync(distPatch)) {
  const dh = read(distHtml), dp = read(distPortal), dpt = read(distPatch);
  has(dh, 'function bySid(list)', 'dist 主应用带统一排序入口');
  eq(count(dpt, 'cmBySid(cmReportLiveStudents())'), 2, 'dist 注入层两处报告名单按学号');
  has(dpt, 'function cmSidCmp(a, b)', 'dist 注入层带等价回退');
  has(dp, 'var sids = Object.keys(pp.students).sort(pvSidCmp);', 'dist 预览身份列表按学号');
  has(dp, 'id="pvSearch"', 'dist 预览带搜索框');
  has(dp, 'window.previewFilter = function(kw)', 'dist 预览带筛选函数');
  const dPkg = JSON.parse(fs.readFileSync(path.join(DESK, 'app/package.json'), 'utf8'));
  has(dh, '<div class="login-version">v' + dPkg.version + ' 桌面版</div>', 'dist 登录版本标与 package.json 一致');
  has(dh, '<div class="sidebar-footer">v' + dPkg.version + ' 桌面版 · 班主任工作台</div>', 'dist 侧栏版本标一致');
  eq(dPkg.baseWeb, VER, 'dist baseWeb 跟到当版基线');
  ok(!/<script[^>]+src=["'][^"']*cmgx\.js/.test(dh), 'dist 未双挂载 cmgx.js');
} else {
  console.log('  ⊘ 桌面版 dist 未构建，跳过（不计失败）');
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) process.exit(1);
