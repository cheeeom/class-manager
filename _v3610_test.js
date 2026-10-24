/* v3.6.10 回归测试：审查整改——手机端学期报告入口 + 撤快速加减分弹窗内「按寝室」
   P1（bug）：手机「更多」抽屉是静态清单，学期报告注入只进桌面侧栏 → 手机不可达。
   修法：gxInjectReportNav 重构为侧栏/抽屉各自幂等注入（抽屉项点击=收抽屉+开报告）。
   P2（老板拍板撤）：v3.6.8 加的快速加减分弹窗内「按寝室」按钮与 v2.17.30 既有
   「🏠 按寝室加减分」专用流重叠 → 撤弹窗内捷径，保留页面级专用入口。
   P3：删工作区空壳 data.json（0 学生）与 _v3608_test.js（撤下功能的守卫）。
   运行：node _v3610_test.js */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const cmgx = fs.readFileSync(__dirname + '/cmgx.js', 'utf8');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

t('① P1：cmgx 抽屉注入（手机「更多」含学期报告，点击收抽屉+开报告）', () => {
  has(cmgx, "document.getElementById('moreGrid')", '定位抽屉网格');
  has(cmgx, "'cmNavReportDrawer'", '抽屉项 id');
  has(cmgx, 'toggleMoreDrawer();', '点击先收抽屉');
  has(cmgx, "'more-item'", '复用抽屉条目样式');
  has(cmgx, '#i-report', '复用 i-report 图标');
  // 侧栏注入与抽屉注入各自幂等（重构后不再共用早退）
  const i = cmgx.indexOf('function gxInjectReportNav()');
  const fn = cmgx.slice(i, cmgx.indexOf('\n  }', i) + 6);
  ok(fn.indexOf('cmNavReport') < fn.indexOf('cmNavReportDrawer'), '侧栏在前抽屉在后');
  // py 模板同步
  const py = fs.readFileSync(path.join(__dirname, '..', 'class-manager-desktop', 'app', '_port_to_web.py'), 'utf8');
  has(py, "'cmNavReportDrawer'", 'py NAV 模板同步');
});

t('② P2：弹窗内「按寝室」已撤，页面级专用入口保留', () => {
  notHas(html, 'dormPickList', '下拉容器');
  notHas(html, 'toggleDormCreditSelection', '整寝切换函数');
  notHas(html, '__dormPickBound', '全局点外关闭');
  const quickBar = html.slice(html.indexOf('credit-sel-head'), html.indexOf('credit-sel-head') + 700);
  notHas(quickBar, '按寝室', '快速加减分已选条不再有按寝室按钮');
  ok(html.includes('openDormCredit()">🏠 按寝室加减分'), '页面级 v2.17.30 专用入口保留');
  notHas(html, "onclick=\"toggleDormPickList(event)\"", '按钮接线');
});

t('③ P3：_v3608_test.js 已删（撤下功能的守卫随之退役）', () => {
  ok(!fs.existsSync(path.join(__dirname, '_v3608_test.js')), '_v3608_test.js 应已删除');
});

t('④ 版本 v3.6.10 一致性 + 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1] && m[1] === 'v3.6.10', 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同为 v3.6.10');
  has(html, '手机端学期报告入口（v3.6.10）', '速览当版条目');
  ok((cmgx.match(/增强引擎（v3\.6\.10）/g) || []).length === 1, 'cmgx 头跟版');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
