/* v3.9.20 / v1.7.7 回归：学生档案名单按学号 + 桌面版两个尾巴收口
   ------------------------------------------------------------------
    · 档案列表 renderProfileList 原走 sortStudentsByPinyin（v2.17.30 刻意设计），
      本版统一到 bySid（numeric 感知、缺学号垫底）；拼音函数本体保留给座次表等。
    · 桌面版补 cross-env 到 devDependencies（npm run smoke 原命令跑不起来）。
    · 桌面版请假分析（v1.7.7 移植）随重建不得丢失。
   版本号一律从 sw.js 的 CACHE_NAME 反推，跟版不用改本文件。
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WEB = __dirname;
const DESK = 'C:/Users/84669/.zcode/workspace/default/class-manager-desktop';
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } }
function has(s, x, n) { ok(s.indexOf(x) >= 0, n); }
function eq(a, b, n) { ok(JSON.stringify(a) === JSON.stringify(b), n + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a))); }
function count(s, x) { return s.split(x).length - 1; }
function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

const html = read(path.join(WEB, 'index.html'));
const sw = read(path.join(WEB, 'sw.js'));
const mani = fs.readFileSync(path.join(WEB, 'manifest.json'), 'utf8');
const m = sw.match(/const CACHE_NAME = 'class-manager-(v\d+\.\d+\.\d+)';/);
ok(!!m, 'CACHE_NAME 可反推出当版号');
const VER = m[1], NUM = VER.slice(1), Q = '?v=' + NUM;

console.log('\n=== ① 档案名单静态契约 ===');
const rp = html.match(/function renderProfileList\(\)\{[\s\S]*?\n\}/);
ok(!!rp, '能取到 renderProfileList 函数体');
if (rp) {
  has(rp[0], 'bySid(state.students', '档案名单走 bySid');
  ok(rp[0].indexOf('sortStudentsByPinyin(') < 0, '档案名单不再调拼音排序');
}
has(html, 'function bySid(list)', '统一入口 bySid 仍在');
has(html, 'function sortStudentsByPinyin(list)', '拼音函数本体保留（座次表等仍可能用）');
has(html, '功能性排序（学分/币/成绩/座位）不走这里', 'bySid 注释不再把拼音列为功能性例外');

console.log('\n=== ② bySid 真跑（numeric / 缺号垫底 / 不改原数组） ===');
const sidSrc = html.match(/function sidCmp\(a, b\)\{[\s\S]*?\n\}/);
const bySrc = html.match(/function bySid\(list\)\{[^\n]*\}/);
ok(!!(sidSrc && bySrc), '能抽到 sidCmp + bySid');
if (sidSrc && bySrc) {
  const box = new Function(sidSrc[0] + '\n' + bySrc[0] + '\nreturn { sidCmp: sidCmp, bySid: bySid };')();
  const arr = [{ sid: '10', name: '甲' }, { sid: '9', name: '乙' }, { sid: '', name: '丙' },
               { sid: '2', name: '丁' }, { sid: '1', name: '戊' }];
  eq(box.bySid(arr).map(x => x.sid), ['1', '2', '9', '10', ''], '9 排在 10 前、缺学号垫底');
  eq(arr.map(x => x.sid), ['10', '9', '', '2', '1'], 'bySid 不改动原数组（slice）');
  eq(box.bySid(null).length, 0, 'null 入参安全返回空数组');
}

console.log('\n=== ③ 跟版联动（版本无关，从 CACHE_NAME 反推 ' + VER + '） ===');
has(html, 'href="./icon_192.png' + Q + '"', 'apple-touch-icon 带当版 ?v=');
has(html, '<script src="./cmgx.js' + Q + '"></script>', '页面脚本引用同版');
has(html, '<div class="login-version">' + VER + '</div>', '登录页徽标同版');
has(html, '<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>', '侧栏页脚同版');
has(html, '近版更新速览（' + VER + '）', '速览标题同版');
has(html, '🏷️ ' + VER + '</span>', '关于页徽标同版');
/* v3.9.21 修锚点自伤：原断言把 v3.9.20 的速览历史条目（「档案名单也按学号（v3.9.20）」）
   绑成了当版号，一跟版就必然红——而历史条目是史实，绝不回改。
   改为版本无关判据：速览区里当版号至少出现 2 次（标题 1 次 + 正文本版条目 1 次）。 */
ok(count(html, '（' + VER + '）') >= 2, '速览有本版说明（标题+正文条目，历史条目不受牵连）');
has(sw, "'./cmgx.js" + Q + "'", 'sw CORE_ASSETS 脚本同版');
eq(count(sw, Q), 3, 'sw CORE_ASSETS 三处 ?v= 全同版');
eq(count(mani, Q), 3, 'manifest 三处 ?v= 全同版');

console.log('\n=== ④ 桌面版 cross-env 补依赖 ===');
const dPkgPath = path.join(DESK, 'app/package.json');
const dLockPath = path.join(DESK, 'app/package-lock.json');
if (fs.existsSync(dPkgPath) && fs.existsSync(dLockPath)) {
  const dPkg = JSON.parse(fs.readFileSync(dPkgPath, 'utf8'));
  const dLock = JSON.parse(fs.readFileSync(dLockPath, 'utf8'));
  ok(!!(dPkg.devDependencies && dPkg.devDependencies['cross-env']), 'devDependencies 声明了 cross-env');
  has(dPkg.scripts.smoke, 'cross-env', 'smoke 脚本仍走 cross-env');
  ok(!!(dLock.packages[''] && dLock.packages[''].devDependencies && dLock.packages[''].devDependencies['cross-env']),
     'package-lock 根包声明了 cross-env');
  ok(!!dLock.packages['node_modules/cross-env'], 'package-lock 有 node_modules/cross-env 条目');
  ok(fs.existsSync(path.join(DESK, 'app/node_modules/cross-env/package.json')), 'cross-env 已落地 node_modules');
  eq(dLock.packages[''].version, dPkg.version, 'lock 根包版本与 package.json 一致');
  eq(dPkg.baseWeb, VER, 'baseWeb 跟到当版基线');
} else {
  console.log('  ⊘ 兄弟仓 class-manager-desktop 不在本机，跳过（不计失败）');
}

console.log('\n=== ⑤ 桌面版 dist 同步（兄弟仓已构建才验） ===');
const distHtml = path.join(DESK, 'app/dist/index.html');
const distPatch = path.join(DESK, 'app/dist/app.patch.js');
const distCss = path.join(DESK, 'app/dist/wizard.css');
const distPortal = path.join(DESK, 'app/dist/portal/index.html');
if (fs.existsSync(distHtml) && fs.existsSync(distPatch)) {
  const dh = read(distHtml), dpt = read(distPatch);
  const drp = dh.match(/function renderProfileList\(\)\{[\s\S]*?\n\}/);
  ok(!!drp, 'dist 能取到 renderProfileList');
  if (drp) {
    has(drp[0], 'bySid(state.students', 'dist 档案名单按学号');
    ok(drp[0].indexOf('sortStudentsByPinyin(') < 0, 'dist 档案名单不再用拼音排序');
  }
  has(dh, 'function bySid(list)', 'dist 主应用带统一排序入口');
  // 🔴 桌面版 build 会摘掉 cmgx 脚本标签，dist 里不该有 cmgx.js?v=；
  //    跟版基线看的是 build 补丁写下的「网页版近版更新速览（vX）」标记。
  has(dh, '网页版近版更新速览（' + VER + '）', 'dist 速览标跟到当版基线');
  has(dpt, 'function cmLvInject(', 'dist 注入层仍带请假分析');
  has(dpt, 'cmBySid(cmReportLiveStudents())', 'dist 报告名单仍按学号');
  if (fs.existsSync(distCss)) has(read(distCss), '.cmLvChip{', 'dist CSS 仍带请假分析样式');
  if (fs.existsSync(distPortal)) has(read(distPortal), 'id="pvSearch"', 'dist portal 仍带预览搜索框');
  const dPkg = JSON.parse(fs.readFileSync(dPkgPath, 'utf8'));
  has(dh, '<div class="login-version">v' + dPkg.version + ' 桌面版</div>', 'dist 版本标与 package.json 一致');
  has(read(path.join(DESK, 'index.html')), 'WINDOWS 桌面版 · V' + dPkg.version.toUpperCase(), '落地页静态兜底同版');
  ok(!/<script[^>]+src=["'][^"']*cmgx\.js/.test(dh), 'dist 未双挂载 cmgx.js');
} else {
  console.log('  ⊘ 桌面版 dist 未构建，跳过（不计失败）');
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) process.exit(1);
