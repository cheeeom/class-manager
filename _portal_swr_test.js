/* portal 加载性能契约回归（2026-11-11 第一档 + 三层缓存）
   背景：老板问「学生端扫码偶尔很慢」。根因不是随机抖动，是「命中 30 分钟缓存」与「冷启动」两条路径差了 6 倍。
   这一版做了四件事，本测试把它们的形态钉住，防止以后被无意改回：
     ① 串行兜底（raw 干等 25s → api）改成受控竞速；
     ② fetchPayload 做 promise 单例，扫码直达不再重复下载两份；
     ③ qrcode.js（57KB）移出首屏，改 ensureQr() 按需加载；
     ④ 缓存三层：新鲜期直接用 / 陈旧可用期先渲染旧包再后台换新 / 超期才阻塞等网络。
   为什么保缓存比省计算重要：实测 PBKDF2 30000 轮在 PC 上仅 24ms，热路径耗时几乎全在「能不能不下载」。
   ⚠️ 本测试版本无关（portal 不参与 sw.js 发版），不比对 CACHE_NAME。
   运行：node _portal_swr_test.js */
const fs = require('fs');

const portal = fs.readFileSync(__dirname + '/portal/index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

t('① 缓存三层阈值（新鲜 30 分钟 / 陈旧可用 7 天）', () => {
  has(portal, 'var CACHE_TTL_MS = 30 * 60 * 1000;', '新鲜期 30 分钟');
  has(portal, 'var CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;', '陈旧可用期 7 天');
  has(portal, 'var CACHE_KEY = \'cm_portal_cache\';', '缓存键');
});

t('② 陈旧可用期：先返回旧包，后台静默换新（不阻塞、不报错）', () => {
  has(portal, 'if(age < CACHE_STALE_MS){', '陈旧分支存在');
  has(portal, 'netFetchPayload().then(function(){}, function(){});', '后台刷新：成功失败都吞掉（旧包已能撑起页面）');
  /* 顺序反了就是「先等网络再返回」，等于没优化 */
  ok(portal.indexOf('netFetchPayload().then(function(){}, function(){});') <
     portal.indexOf('var inflight = netFetchPayload();'),
     '后台刷新分支必须排在阻塞路径之前');
});

t('③ 网络层与缓存层已分离，且网络层不碰单例状态', () => {
  has(portal, 'function netFetchPayload(){', '纯网络函数');
  has(portal, 'function fetchPayload(){', '缓存判定函数');
  const netStart = portal.indexOf('function netFetchPayload(){');
  const netEnd = portal.indexOf('/* 缓存三层：', netStart);
  ok(netStart > 0 && netEnd > netStart, 'netFetchPayload 函数体可定位');
  const netBody = portal.slice(netStart, netEnd);
  notHas(netBody, '_payloadInflight', '网络层不得操作在途单例（否则后台刷新会污染前台查询）');
  notHas(netBody, 'CACHE_TTL_MS', '网络层不得自行判缓存');
});

t('④ 单例：扫码直达不重复下载', () => {
  has(portal, 'if(_payloadInflight) return _payloadInflight;', '在途复用');
  has(portal, 'var clear = function(){ _payloadInflight = null; };', '完成后释放');
  has(portal, 'inflight.then(clear, clear);', '成功失败都要释放');
});

t('⑤ 竞速：raw 与 API 并行，raw 健康时不浪费 API 配额', () => {
  has(portal, 'firstOk([fromCdn, fromApi])', '双路竞速');
  has(portal, 'if(settled) return new Promise(function(){});', '胜出后放弃抢跑中的 API');
  has(portal, 'API_HEAD_START_MS', 'API 抢跑延迟');
  has(portal, 'fetchWithTimeout(cdn, NET_RACE_MS)', '单路封顶');
});

t('⑥ 算法代次校验仍在（改轮数必须让旧缓存失效）', () => {
  has(portal, '(!c.payload.alg || c.payload.alg === ALG_LABEL)', '缓存 alg 代次比对');
  has(portal, 'var PBKDF2_ROUNDS = 30000;', '轮数 30000（⛔ 降轮数会让已发布数据全线解不开）');
  has(portal, "var ALG_LABEL = 'PBKDF2-SHA256(30000)/AES-GCM-256';", 'ALG 标签与轮数一致');
});

t('⑦ 首屏：QR 库不阻塞 + 数据域名预连接', () => {
  notHas(portal, '<script src="qrcode.js">', 'QR 库不得回到首屏（会拖住 DOMContentLoaded）');
  has(portal, 'function ensureQr(){', '按需加载入口');
  has(portal, 'rel="preconnect" href="https://gist.githubusercontent.com"', '数据源预连接');
  has(portal, 'rel="preconnect" href="https://api.github.com"', '兜底源预连接');
  ok(/rel="preconnect"[^>]*crossorigin/.test(portal), 'preconnect 必须带 crossorigin（否则 CORS 请求复用不上）');
});

t('⑧ 扫码直达不再白等 150ms', () => {
  has(portal, 'setTimeout(submit, 0)', '自动查询立即触发');
  notHas(portal, 'setTimeout(submit, 150)', '150ms 白等已删');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
