/* v2.20.7 回归测试：班级数据从公开站点仓迁到私有数据仓（class-manager-data）

背景：
  · 原架构——数据放在**公开仓** class-manager，站点目录里的 ./data.json 全世界可读
    （虽然是 AES-GCM 密文，但仍是一个"人人可下载的密文文件"）。老板决定搬进**私有仓**。
  · 私有仓（Free 计划）没有 Pages ⇒ 拉取路径必须换：不能再匿名 fetch('./data.json')，
    改走带 Token 的 Contents API。推送路径本来就打 api.github.com + PAT，改常量即全部跟过去。

本文件守卫的不变量：
  ① GH_REPO 指向数据仓，且 GH_OWNER / GH_BRANCH / GH_DATA_PATH 三个未被误伤
  ② 三条拉取路径（autoSyncFromCloud / pullFromCloud / restoreFromCloud）全部改走 fetchCloudEnvelope()，
     且 `getDataJsonUrl()` 这个"匿名读站点文件"的入口彻底消失
  ③ fetchCloudEnvelope() 的行为：URL 指向数据仓 Contents API、有 Token 才带 Authorization、
     404 → null、>1MB（content 为空）→ 自动追加 raw 媒体类型兜底
  ④ configGHToken() 改为校验「仓库是否可达」而不是「data.json 是否存在」
     —— 新仓还没有数据文件时，按文件校验会把 404 误判成"无权限"，老师端永远存不下 Token
  ⑤ 设置页文案不再声称"本仓库是公开的"
  ⑥ sw.js 的 CORE_ASSETS 不再预缓存数据文件
     —— addAll 是全成全败，清单里只要有一个请求 404，整套预缓存就整体 reject、SW 装不上
  ⑦ 版本标记自洽（不硬编码版本号，只断言"四处活动标记 == sw.js 的 CACHE_NAME"）

用法：node _v2207_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + `不应包含 ${JSON.stringify(b)}`); }
function count(s) { return html.split(s).length - 1; }

/* 去掉注释后的"纯代码"副本。
   必要性：本版在源码里留了迁移说明注释，其中提到 `fetch('./data.json')` / `getDataJsonUrl`
   作为"已废弃的旧写法"。直接在全文里 notHas 会撞上这些注释（踩过一次），
   而只查真代码才是这条断言的本意。 */
const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// 版本不硬编码：唯一事实源是 sw.js 的 CACHE_NAME
const ver = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';

// ---------------------------------------------------------------
// 抽取 index.html 里的真实实现（不做复制粘贴，防止"测试与实现各写一份"）
// ---------------------------------------------------------------
function sliceFn(name) {
  const s = html.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('未找到函数 ' + name);
  const out = [];
  for (const ln of html.slice(s).split('\n')) {
    out.push(ln);
    if (out.length > 1 && ln === '}') break;   // 顶层收尾（函数体都缩进，列 0 的 } 一定是结尾）
  }
  return out.join('\n');
}
function sliceConst(name) {
  const s = html.indexOf('const ' + name + ' = ');
  if (s < 0) throw new Error('未找到常量 ' + name);
  const e = html.indexOf('\n', s);
  return html.slice(s, e < 0 ? undefined : e);
}

const GH_CONSTS = ['GH_OWNER', 'GH_REPO', 'GH_BRANCH', 'GH_DATA_PATH'].map(sliceConst).join('\n');
const SRC_CLOUD_API = sliceFn('cloudApiUrl');
const SRC_FETCH_META = sliceFn('fetchCloudMeta');
const SRC_FETCH_ENV = sliceFn('fetchCloudEnvelope');

/* 用真实常量 + 真实三个函数拼一个沙箱：
   getGHToken 换成可控桩（本版只要求"有 Token 才加 Authorization 头"这一点行为）；
   fetch 换成 mock（避免真发请求）。 */
function buildSandbox(token, fetchImpl) {
  const body = [
    GH_CONSTS,
    'var fetch = __fetch;',
    'function getGHToken(){ return __tok; }',
    SRC_CLOUD_API,
    SRC_FETCH_META,
    SRC_FETCH_ENV,
    'return { cloudApiUrl: cloudApiUrl, fetchCloudEnvelope: fetchCloudEnvelope, GH_OWNER: GH_OWNER, GH_REPO: GH_REPO, GH_DATA_PATH: GH_DATA_PATH };'
  ].join('\n');
  return new Function('__tok', '__fetch', body)(token, fetchImpl);
}
const DATA_API = 'https://api.github.com/repos/cheeeom/class-manager-data/contents/data.json';

(async function main() {

console.log('\n=== ① 常量指向私有数据仓 ===');

await t("GH_REPO 已指向数据仓 'class-manager-data'，旧站点仓 'class-manager' 无残留", () => {
  has(html, "const GH_REPO = 'class-manager-data';", 'GH_REPO 未指向数据仓');
  notHas(html, "const GH_REPO = 'class-manager';", '旧的 GH_REPO 仍有残留');
});

await t('GH_OWNER / GH_BRANCH / GH_DATA_PATH 三个常量未被误伤，且各只出现 1 次', () => {
  for (const c of ["const GH_OWNER = 'cheeeom';", "const GH_BRANCH = 'main';", "const GH_DATA_PATH = 'data.json';"]) {
    eq(count(c), 1, '常量异常：' + c);
  }
});

await t('迁移说明注释留档（写清"私有仓没有 Pages，拉取必须换路"）', () => {
  has(html, 'v2.20.7 数据托管迁移', '缺迁移说明');
  has(html, '私有仓没有 Pages', '缺拉取换路的原因说明');
});

await t('推送侧 4 个写入点仍统一走 Contents API 端点（没被顺手改坏）', () => {
  // doPushToCloud / 清空数据强制推送 / 重置云端口令 三处 + cloudApiUrl 一处
  eq(count("'/contents/' + GH_DATA_PATH"), 4, 'Contents 端点引用数不对');
});

console.log('\n=== ② 三条拉取路径已切到 Contents API ===');

await t('注释剥离副本可用（防止下面基于 code 的断言变成空转）', () => {
  ok(code.length > 0, '剥离后为空');
  ok(code.indexOf('v2.20.7 数据托管迁移') < 0, '块注释未被剥离');
  has(code, 'function fetchCloudEnvelope(){', '剥离过度，把真代码也删了');
});

await t('fetchCloudEnvelope / cloudApiUrl 均已定义，且各只 1 处', () => {
  eq(count('function fetchCloudEnvelope(){'), 1, 'fetchCloudEnvelope 定义数不对');
  eq(count('function cloudApiUrl(){'), 1, 'cloudApiUrl 定义数不对');
});

await t('三条拉取路径全部改走 fetchCloudEnvelope()（auto 1 处 + pull/restore 2 处）', () => {
  eq(count('return fetchCloudEnvelope()'), 1, 'autoSyncFromCloud 未切');
  eq(count('\n  fetchCloudEnvelope()'), 2, 'pullFromCloud / restoreFromCloud 未切');
});

await t('"匿名读站点文件"的入口 getDataJsonUrl 已彻底移除（真代码里定义与 3 处调用都不在）', () => {
  notHas(code, 'function getDataJsonUrl', '定义仍在');
  notHas(code, 'getDataJsonUrl() + ', '调用仍在');
  notHas(code, "fetch('./data.json'", "真代码里仍存在匿名 fetch('./data.json')");
});

await t('"未加密的旧数据原样通过"的兼容注释与 decryptFromCloud 通路保留', () => {
  has(html, '未加密的旧数据原样通过', '兼容通路被误删');
  // 注意：不能简单数 'decryptFromCloud(env)' —— 函数定义行 `function decryptFromCloud(env){`
  // 本身就含这个子串（v2.20.7 踩过一次），故按三条拉取的完整调用形态数
  eq(count('.then(function(env){ return decryptFromCloud(env); })'), 3, '三条拉取都应过 decryptFromCloud');
});

console.log('\n=== ③ fetchCloudEnvelope 行为（真跑，mock fetch） ===');

await t('cloudApiUrl() 指向数据仓的 Contents API 端点', () => {
  const s = buildSandbox('T', () => Promise.resolve({ status: 404, ok: false }));
  eq(s.cloudApiUrl(), DATA_API);
});

await t('有 Token：请求带 Authorization 头，且返回解码后的信封（不再要求 fetch 出 .json()）', async () => {
  const envelope = { enc: 1, alg: 'PBKDF2-SHA256(250000)/AES-GCM-256', salt: 'c2FsdA==', iv: 'aXZpdg==', data: 'ZGF0YQ==' };
  const calls = [];
  const fakeFetch = (url, opts) => {
    calls.push({ url, opts });
    return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ sha: 'abc123', content: Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64') }) });
  };
  const s = buildSandbox('TOKEN_A', fakeFetch);
  const got = await s.fetchCloudEnvelope();
  eq(calls.length, 1, '应只发 1 次请求');
  eq(calls[0].url, DATA_API, '请求 URL 不是数据仓端点');
  eq(calls[0].opts.headers.Authorization, 'token TOKEN_A', 'Authorization 头不对');
  eq(calls[0].opts.method, 'GET', '应为 GET');
  eq(JSON.stringify(got), JSON.stringify(envelope), '未返回解码后的信封');
});

await t('无 Token：不带 Authorization 头（私有仓访问不到时由调用方按 null 处理，不抛错）', async () => {
  const calls = [];
  const fakeFetch = (url, opts) => {
    calls.push({ url, opts });
    return Promise.resolve({ status: 404, ok: false });
  };
  const s = buildSandbox('', fakeFetch);
  const got = await s.fetchCloudEnvelope();
  eq(got, null, '404 应返回 null');
  ok(!('Authorization' in calls[0].opts.headers), '无 Token 时不应带 Authorization 头');
});

await t('云端还没有 data.json（404）→ 返回 null，不当成异常', async () => {
  const s = buildSandbox('T', () => Promise.resolve({ status: 404, ok: false }));
  eq(await s.fetchCloudEnvelope(), null);
});

await t('>1MB 的坑仍被兜住：content 为空 → 追加 raw 媒体类型 GET，且拿到原文', async () => {
  const envelope = { enc: 1, data: 'BIG' };
  const calls = [];
  const fakeFetch = (url, opts) => {
    calls.push({ url, opts });
    if (calls.length === 1) return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ sha: 's1', content: '' }) });
    return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve(JSON.stringify(envelope)) });
  };
  const s = buildSandbox('T', fakeFetch);
  const got = await s.fetchCloudEnvelope();
  eq(calls.length, 2, '应追加一次 raw GET');
  eq(calls[1].opts.headers.Accept, 'application/vnd.github.raw+json', 'raw 兜底的 Accept 头不对');
  eq(calls[1].opts.headers.Authorization, 'token T', 'raw 兜底也要带 Token（私有仓）');
  eq(JSON.stringify(got), JSON.stringify(envelope), 'raw 兜底未正确解析原文');
});

await t('源码层：Authorization 是"有条件"加的（私有化后首次部署可能还没填 Token）', () => {
  has(html, "if(token) headers['Authorization'] = 'token ' + token;", '条件加 Token 的写法丢失');
});

console.log('\n=== ④ configGHToken 改为校验「仓库可达」而非「data.json 存在」 ===');

await t('校验请求打的是仓库端点（不再拼 /contents/data.json）', () => {
  has(html, "fetch('https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO, {", '未改验仓库');
  notHas(html, "fetch('https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + GH_DATA_PATH, {", '仍在按文件校验');
});

await t('403/404 的提示文案带上仓库名（便于排查授权错仓）', () => {
  has(html, "'Token 访问不到仓库 ' + GH_OWNER + '/' + GH_REPO", '提示未带仓库名');
  notHas(html, 'Token 无本仓库读写权限', '旧提示仍在');
});

await t('Token 输入提示里的授权仓库名改为常量拼接（跟仓走，不写死）', () => {
  has(html, "仅授权本仓库 ' + GH_OWNER + '/' + GH_REPO + '（私有数据仓）", '提示未跟仓');
  notHas(html, '仅授权本仓库 cheeeom/class-manager，', '旧提示仍在');
});

console.log('\n=== ⑤ 设置页文案与私有仓一致 ===');

await t('不再声称"本仓库是公开的"', () => {
  notHas(html, '本仓库是公开的', '旧文案仍在（私有仓后不成立）');
  notHas(html, '公开也无所谓', '旧文案仍在');
});

await t('新文案写明：私有仓 + 外部访客 404 + 需配 Token', () => {
  has(html, '数据存于<b>私有仓库</b>', '缺私有仓说明');
  has(html, '外部访客访问一律返回 404', '缺可见性说明');
  has(html, '每台设备须配置对该仓库有读写权限的 GitHub Token', '缺 Token 说明');
});

console.log('\n=== ⑥ sw.js 预缓存不再含数据文件（否则删文件后 SW 装不上） ===');

await t("CACHE_NAME 与版本自洽（'class-manager-' + ver）", () => {
  ok(ver, 'sw.js 里取不到 CACHE_NAME 版本号');
  has(sw, "const CACHE_NAME = 'class-manager-" + ver + "';", 'CACHE_NAME 形态异常');
});

await t("CORE_ASSETS 里没有 './data.json'，但核心资源一个没少", () => {
  const m = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  ok(m, '缺 CORE_ASSETS');
  const body = m[1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  notHas(body, "'./data.json'", '仍预缓存数据文件 —— addAll 是全成全败，删文件后 SW 安装会整体 reject');
  for (const must of ["'./'", "'./index.html'", "'./manifest.json'", "'./icon_192.png'", "'./icon_512.png'"]) {
    has(body, must, '核心资源被误删：' + must);
  }
});

await t('fetch 拦截里去掉 data.json 特判，图片同步用的 .txt 分支保留', () => {
  notHas(sw, "endsWith('data.json')", 'data.json 特判仍在（会把 404 响应写进缓存）');
  has(sw, "endsWith('.txt')", '.txt 分支被误删');
  has(sw, "url.hostname === 'api.github.com'", 'api.github.com 直通分支丢失');
});

console.log('\n=== ⑦ 版本标记自洽（不硬编码版本号） ===');

await t('四处活动标记全部等于 sw.js 的 CACHE_NAME 版本号', () => {
  has(html, '<div class="login-version">' + ver + '</div>', '登录页未跟版');
  has(html, '<div class="sidebar-footer">' + ver + ' · 班主任工作台</div>', '侧栏未跟版');
  has(html, '🏷️ ' + ver + '</span>', '设置徽标未跟版');
  has(html, '📝 近版更新速览（' + ver + '）', '速览标题未跟版');
});

await t('速览块存在且非空（正文按约定逐版整体替换，故不钉当版条目）', () => {
  const m = html.match(/<div id="settingsReleaseNotes"[^>]*>[\s\S]*?<\/div>/);
  ok(m, '缺速览块');
  const plain = m[0].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  ok(plain.length >= 60, '速览块为空或过短：' + plain.length);
});

await t('历史注释未被升版波及（v2.20.6 的结论留档仍在）', () => {
  has(html, 'v2.20.6 补 CSS 层的漏', 'v2.20.6 的 CSS 结论被误删');
  has(html, '菜单内所有鼠标悬停已移除', 'v2.20.2 的定稿结论被误删');
});

console.log('\n=== ⑧ 无外部注入 ===');

await t('index.html 不含 data-page-node-id 注入', () => {
  eq(count('data-page-node-id'), 0, '存在外部注入');
});

console.log('');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);

})();
