/* v3.6.9 回归测试：首页学分分布冷启动空白修复
   根因（v3.6.0 移植潜伏 bug）：cmgx 的 cmGxChart 在 echarts 未就绪时丢弃本次 option，
   依赖 cmEchartsAfterLoad 补画——但该函数被调用两处却从未定义（桌面启动段实现未随切片
   移植），ReferenceError 被 try/catch 静默吞掉。首页学分分布在 boot 时先于 echarts（1.12MB
   懒加载）渲染 → option 被丢 → 补画不存在 → 永远空白。分析页图表不受影响（用户切过去时
   echarts 早已就绪）。
   修法三层：①cmGxChart 未就绪按 id 排队（同图后画覆盖前画）；②补定义 cmEchartsAfterLoad
   （flush 队列 + cmGxThemeExtras 补画可见页）；③首页分布在 echarts 加载失败时移除替换 div、
   恢复原 canvas 走原实现回退。移植器 4e/4f 适配 + NAV 模板同步（重跑不回退）。
   运行：node _v3609_test.js */
const fs = require('fs');

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

t('① cmEchartsAfterLoad 已定义（此前被调用却未定义，异常被吞）', () => {
  has(cmgx, 'function cmEchartsAfterLoad()', '定义');
  const n = (cmgx.match(/cmEchartsAfterLoad\(\)/g) || []).length;
  ok(n === 2, '定义 1 处 + cmLoadEcharts onload 调用 1 处 = 恰 2 次（实际 ' + n + '）');
  const i = cmgx.indexOf('function cmEchartsAfterLoad()');
  const fn = cmgx.slice(i, i + 700);
  has(fn, 'cmGxPendingById', 'flush 队列');
  has(fn, 'cmGxThemeExtras()', '可见页补画');
});

t('② cmGxChart 未就绪排队（同图后画覆盖前画，失败清队）', () => {
  has(cmgx, 'var cmGxPendingById = {};', '队列声明');
  has(cmgx, 'cmGxPendingById[id] = option;', '按 id 记 option');
  has(cmgx, "if (!okFlag) cmGxPendingById = {};", '失败清队');
  // 未就绪分支不得再只丢 option（旧病根：回调里只调 afterLoad 不存画面）
  const i = cmgx.indexOf('function cmGxChart(id, option)');
  const fn = cmgx.slice(i, cmgx.indexOf('\n  function', i + 10));
  ok(!/cmLoadEcharts\(function \(okFlag\) \{ if \(okFlag\) \{ try/.test(fn), '旧丢画面写法不得回潮');
});

t('③ 首页分布失败回退：恢复原 canvas + 调原实现', () => {
  has(cmgx, "回退原 canvas 实现（加载失败/超时）", '回退注释');
  const i = cmgx.indexOf("if (okFlag) return;   /* 成功由 cmEchartsAfterLoad 补画 */");
  ok(i > 0, '回退锚点');
  const seg = cmgx.slice(i, i + 500);
  has(seg, "removeChild(bx)", '移除替换 div');
  has(seg, "cv.style.display = ''", '恢复原 canvas');
  has(seg, 'orig(credits)', '调用原实现');
});

t('④ 移植器同步（重跑不回退）+ 版本 v3.6.9 一致性', () => {
  const py = fs.readFileSync(require('path').join(__dirname, '..', 'class-manager-desktop', 'app', '_port_to_web.py'), 'utf8');
  has(py, 'cmGxPendingById[id] = option;', '4e 排队适配');
  has(py, '回退原 canvas 实现（加载失败/超时）', '4f 回退适配');
  has(py, 'function cmEchartsAfterLoad()', 'NAV 模板补函数');
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1] && m[1] === 'v3.6.9', 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同为 v3.6.9');
  has(html, '首页学分分布空白修复（v3.6.9）', '速览当版条目');
  ok((cmgx.match(/增强引擎（v3\.6\.9）/g) || []).length === 1, 'cmgx 头跟版');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
