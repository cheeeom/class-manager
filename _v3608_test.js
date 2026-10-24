/* v3.6.8 回归测试：学分批量「按寝室选择」
   需求（老板）：学分加减分模块「全班全选」左边新增按寝室选择，快速给目标寝室加减分。
   实现：🏠按钮 + dormPickList 下拉（buildDormMap 同源口径，寝室号+人数+全选✓态）；
   点寝室行整寝选入/移出（toggle 语义：全选中→移出，否则→选入）；点外关闭（一次性绑定）。
   运行：node _v3608_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }

t('① 按钮位置：全班全选左侧 + 下拉容器', () => {
  const btn = html.indexOf('🏠 按寝室');
  const all = html.indexOf('全班全选');
  ok(btn > 0 && all > 0 && btn < all, '「按寝室」应在「全班全选」左侧');
  has(html, 'id="dormPickList"', '下拉容器');
  has(html, 'onclick="toggleDormPickList(event)"', '按钮接线');
});

t('② 下拉渲染：buildDormMap 同源 + 空态提示 + 行点击', () => {
  has(html, 'function renderDormPickList()', '渲染函数');
  const i = html.indexOf('function renderDormPickList()');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  has(fn, 'buildDormMap(state.students)', '数据口径与寝室管理页同源');
  has(fn, "还没有寝室数据", '空态提示');
  has(fn, "d.members.length", '行内人数');
});

t('③ 整寝选入/移出：toggle 语义 + chips 联动 + 提示', () => {
  has(html, 'function toggleDormCreditSelection(no)', '切换函数');
  const i = html.indexOf('function toggleDormCreditSelection(no)');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  has(fn, "_creditSelectedIds.add(m.id)", '选入');
  has(fn, "_creditSelectedIds.delete(m.id)", '移出（整寝已选时再点=移出）');
  has(fn, 'renderCreditSelectedChips()', 'chips 联动');
  has(fn, "已移出 '", '移出提示');
  has(fn, "已选入 '", '选入提示');
});

t('④ 点外关闭：一次性全局绑定', () => {
  has(html, 'window.__dormPickBound', '防重复绑定标记');
  has(html, "dd.parentElement && !dd.parentElement.contains(e.target)", '点外判定');
});

t('⑤ 版本一致性（动态跟版）+ 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（从 CACHE 反推，无需随版改）');
  has(html, '学分批量按寝室选择（v3.6.8）', '速览当版条目');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
