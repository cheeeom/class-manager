/* v3.6.6 回归测试：兑换商店选中学生姓名常显
   背景：老板报障「选中学生后看不到姓名预览，不知道选没选中」。根因=cbStoreFocus
   旧设计「聚焦时若框内是已选姓名就清空」——选中后再碰搜索框名字即被清掉，
   旁边信息条小、窄屏换行，选中状态不可辨。
   修法（铁律：有选中必显名）：聚焦改为 select() 全选待替换（不再清空）+ 展开
   全体候选；失焦时若框空且有选中，cbStoreRestoreName 自动补回姓名。
   运行：node _v3606_test.js */
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

t('① 聚焦不再清空姓名：select() 全选 + 展开全体候选', () => {
  const i = html.indexOf('function cbStoreFocus(el)');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  has(fn, 'el.select()', '聚焦应全选待替换');
  has(fn, "cbStoreSearchInput('')", '聚焦展开全体候选');
  ok(!/el\.value = ''/.test(fn), '聚焦函数内不得清空输入框（旧病根）');
});

t('② 失焦安全网：框空且有选中 → 自动补回姓名', () => {
  has(html, 'function cbStoreRestoreName(inp)', 'cbStoreRestoreName');
  has(html, 'function cbStoreBlur()', 'cbStoreBlur');
  has(html, 'onblur="cbStoreBlur()"', '输入框 onblur 接线');
  const i = html.indexOf('function cbStoreBlur()');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  has(fn, "cbStoreMatch", '失焦仍收起候选框（原行为保留）');
  has(fn, 'cbStoreRestoreName(i)', '空框时补回姓名');
  const r = html.indexOf('function cbStoreRestoreName(inp)');
  const rfn = html.slice(r, html.indexOf('\nfunction ', r + 10));
  has(rfn, 'inp.value = s.name', '补回学生姓名');
  ok(/if\(!cbStoreSid \|\| !inp\) return;/.test(rfn), '无选中/无框时不动作');
});

t('③ 版本 v3.6.6 一致性 + 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1] && m[1] === 'v3.6.6', 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同为 v3.6.6');
  has(html, '选中学生姓名常显（v3.6.6）', '速览当版条目');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
