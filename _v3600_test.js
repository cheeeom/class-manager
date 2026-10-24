/* v3.6.0 回归测试：数据分析图表引擎 + 学期报告引擎移植自桌面版（cmgx.js 体系）

   背景：桌面版 v1.3.0/v1.1.0 的两大引擎（ECharts cmInk 图表 + 学期报告）由
   class-manager-desktop 仓 app/_port_to_web.py 移植进网页版，网页版免费开放（无 Pro 闸）。
   本套钉住移植契约，防两端漂移：

     1. 文件三件套：cmgx.js / echarts.min.js 存在，echarts 与桌面源逐字节一致（溯源锁）；
     2. cmgx 纯净性：零桌面专属符号（__CM_DESKTOP/__CM_PRO/Pro 闸/主进程导出）；
     3. 接管契约：window.renderGradeAnalyticsDetail / renderAnalytics 重挂 + 启动五接线 + echarts 懒加载回退；
     4. index.html：script 注入在主脚本后 </body> 前；v3.4.1 停更横幅（与本功能矛盾的公告）已摘除；
     5. sw.js：两新文件进 CORE_ASSETS（PWA 离线可用）+ CACHE_NAME 跟版；
     6. 结构铁律：全文档 div 深度平衡（横幅摘除是结构手术）；
     7. v3.6.1 导航图标：i-report 精灵符号恰好一份 + cmgx 导航注入引用之（弃用 emoji），
        报告面板 h3 标题的 emoji 属弹窗标题惯例、不在管制内。

   运行：node _v3600_test.js（版本号从 sw.js CACHE_NAME 反推，无需随版改） */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const cmgxPath = __dirname + '/cmgx.js';
const echPath = __dirname + '/echarts.min.js';
const deskEch = path.join(__dirname, '..', 'class-manager-desktop', 'app', 'src', 'echarts.min.js');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + ` 缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + ` 不应出现 ${JSON.stringify(b)}`); }
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

let cmgx = null;
try { cmgx = fs.readFileSync(cmgxPath, 'utf8'); } catch (e) { /* 缺文件由下方判红 */ }

t('① 文件三件套：cmgx.js / echarts.min.js 存在且溯源一致', () => {
  ok(cmgx, 'cmgx.js 缺失');
  ok(fs.existsSync(echPath), 'echarts.min.js 缺失');
  const st = fs.statSync(echPath);
  ok(st.size > 1000000, 'echarts.min.js 体积异常: ' + st.size);
  if (fs.existsSync(deskEch)) {
    ok(sha(echPath) === sha(deskEch), 'echarts.min.js 与桌面源不一致（两端漂移）');
  }
  has(cmgx, '移植自桌面版注入层', '文件头溯源说明');
});

t('② cmgx 纯净性：零桌面专属符号（网页版免费开放）', () => {
  ok(cmgx, 'cmgx.js 缺失');
  for (const k of ['__CM_PRO', 'cmProActive', 'cmProModal', 'printToPDF', 'cmWrapPro', 'buildNavPro', 'userData', 'electron']) {
    notHas(cmgx, k, '桌面残留');
  }
  // __CM_DESKTOP 唯一合法出现 = 桌面壳早退守卫（防桌面同步本文件后双重引擎）
  const n = cmgx.split('__CM_DESKTOP').length - 1;
  ok(n === 1 && /if \(window\.__CM_DESKTOP\) return;/.test(cmgx), '__CM_DESKTOP 只许出现在早退守卫（实际 ' + n + ' 处）');
  notHas(cmgx, '<span class="cmDesk-pro-badge">', 'PRO 徽标残留');
});

t('③ 接管契约：四大渲染接管 + 启动五接线 + echarts 懒加载回退', () => {
  ok(cmgx, 'cmgx.js 缺失');
  has(cmgx, 'window.renderGradeAnalyticsDetail = wrapped', '成绩 tab 接管');
  has(cmgx, 'window.renderAnalytics = wrapped', '学分 tab 接管');
  has(cmgx, 'function cmWrapGradeDetail()', '成绩接管安装器');
  has(cmgx, 'function cmWrapCreditRender()', '学分接管安装器');
  has(cmgx, 'function cmWrapCreditTabSwitch()', '切页补渲染');
  has(cmgx, 'function cmWrapDistChart()', '首页分布接管');
  has(cmgx, 'function cmWrapPubCharts()', '公示四图接管');
  has(cmgx, "s.src = './echarts.min.js'", 'echarts 相对路径加载');
  has(cmgx, '失败/超时静默回退', '回退说明');
  has(cmgx, 'function cmReportOpen', '学期报告入口');
  has(cmgx, 'srcdoc', '报告打印 iframe 方案');
  has(cmgx, 'gxPlayCounters', 'KPI 滚动数字');
  has(cmgx, "cmNavReport", '报告导航入口 id');
  // 学期起点口径与公示页同源
  has(cmgx, 'loadPubSetting(\'semesterStart\')', '学期起点同口径');
});

t('④ index.html：注入位置正确 + 停更横幅已摘除', () => {
  const inj = html.indexOf('src="./cmgx.js"');
  ok(inj > 0, '缺少 cmgx script 标签');
  ok(html.slice(0, inj).lastIndexOf('</script>') > 0, '主脚本必须先于 cmgx 加载（cmgx 接管其函数）');
  ok(html.indexOf('<script', inj) < 0, 'cmgx 标签之后不应再出现脚本（它必须是最后一个）');
  ok(html.indexOf('</body>') - inj < 60, 'cmgx 标签应紧邻 </body>');
  notHas(html, 'eolBanner', '停更横幅（v3.4.1）应已摘除——本版起网页版恢复功能更新');
  notHas(html, 'data-eol', '横幅内联脚本残留');
});

t('⑤ sw.js：PWA 离线资产 + CACHE_NAME 跟版', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  ok(m, 'CACHE_NAME 缺失');
  const core = sw.match(/CORE_ASSETS\s*=\s*\[[\s\S]*?\]/)[0];
  has(core, './cmgx.js', '离线资产缺 cmgx.js');
  has(core, './echarts.min.js', '离线资产缺 echarts.min.js');
  // 版本一致性：登录页与 CACHE 同版
  const vm = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(vm && vm[1] === m[1], '登录页版本 ' + (vm && vm[1]) + ' 与 CACHE ' + m[1] + ' 不同步');
  has(html, '📊 <b>数据分析图表引擎 + 学期报告引擎上线', '速览当版条目');
});

t('⑥ 结构铁律：全文档 div 深度平衡（横幅摘除是结构手术）', () => {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length))
                       .replace(/<script[\s\S]*?<\/script>/g, m => ' '.repeat(m.length));
  const o = (stripped.match(/<div\b/g) || []).length;
  const c = (stripped.match(/<\/div>/g) || []).length;
  ok(o === c, 'div 不平衡: 开 ' + o + ' 闭 ' + c);
});

t('⑦ v3.6.1 导航图标契约：学期报告并入 #i-xxx 线条图标体系', () => {
  ok(cmgx, 'cmgx.js 缺失');
  const nav = cmgx.match(/item\.innerHTML = '([^']*)';/);
  ok(nav, 'cmgx 导航注入 innerHTML 缺失');
  has(nav[1], '<svg class="ic"><use href="#i-report"/></svg>', '导航图标应为精灵引用');
  notHas(nav[1], '🎓', '导航图标不得用 emoji');
  const syms = html.match(/<symbol id="i-report"[^>]*>[\s\S]*?<\/symbol>/g) || [];
  ok(syms.length === 1, 'i-report 符号应恰好 1 个（实际 ' + syms.length + '）');
  ok(/viewBox="0 0 24 24"/.test(syms[0]) && !/fill=|stroke/.test(syms[0]), '符号须裸路径（继承全局 .ic 描边）');
  // 导航注入口的符号必须真实存在于精灵图，防引用悬空
  ok(html.indexOf('</symbol>\n</svg>') > html.indexOf('id="i-report"'), 'i-report 应位于精灵图容器内');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
