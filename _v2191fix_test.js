/* v2.19.2 回归测试：云同步两大 P0 修复
   ① data.json >1MB 后 GitHub Contents API JSON 媒体类型返回 content:""，
     旧实现把空内容当「无云端数据」→ checkPushSafety 放行 → 空本地保护/密文覆盖保护/
     推送前合并全部静默失效。修复 = fetchCloudMeta 对空 content 追加 raw 媒体类型 GET。
   ② wipeAt 标了 nosv 不进本地快照，而 buildCloudPayload 只从快照取数 → 重置戳永远推不上云。
     修复 = buildCloudPayload 显式带上 state.wipeAt。
   运行：node _v2191fix_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ✅ ' + name); pass++; }
  else { console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); fail++; }
}

// ---- 抽取实现（与 _sync_test.js 同一窗口：含 checkPushSafety/fetchCloudMeta/doPushToCloud/buildCloudPayload） ----
const start = html.indexOf("const SYNC_PWD_KEY");
const endAt = html.indexOf("let cloudSyncTimer = null;");
if (start < 0 || endAt < 0) { console.error('抽取失败'); process.exit(1); }
let code = html.slice(start, endAt);
code = code.slice(0, code.indexOf('function configSyncPwd(){')) +
       code.slice(code.indexOf('// 推送前安全闸门'));

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = { crypto: globalThis.crypto };
global.crypto = globalThis.crypto;
global.state = { students: [], operations: [], wipeAt: 0 };
global.showToast = () => {};
global.dbg = () => {};
global.STORE_KEY = 'classManagerData';
global.GH_OWNER = 'cheeeom'; global.GH_REPO = 'class-manager';
global.GH_BRANCH = 'main'; global.GH_DATA_PATH = 'data.json';
global.CLOUD_SYNC_FIELDS = ['className', 'students', 'operations', 'nextId', 'notices'];
global.getGHToken = () => 'fake-token';

// smartMergeData 依赖（同 _sync_test.js）
const STATE_SCHEMA = eval('(' + html.slice(html.indexOf('const STATE_SCHEMA'), html.indexOf('\n];', html.indexOf('const STATE_SCHEMA')) + 3).replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
eval(html.slice(html.indexOf('function msStudents'), html.indexOf('/* MERGE_ENGINE_END')));
const ms = html.indexOf('function smartMergeData');
const me = html.indexOf('\nfunction ', ms + 10);
const mergeCode = html.slice(html.indexOf('function sortOpsNewestFirst'), me > 0 ? me : undefined);
// doPushToCloud 的 resync 分支会调 autoSyncFromCloud（在抽取窗口外），测试用桩
global.autoSyncFromCloud = () => Promise.resolve();
// msStudents 等合并策略依赖墓碑辅助函数（同 _sync_test.js 的 _sliceFn 注入）
function _sliceFn(name){
  const s = html.indexOf('function ' + name);
  if (s < 0) throw new Error('未找到函数 ' + name);
  const lines = html.slice(s).split('\n');
  let depth = 0, began = false, out = [];
  for (const ln of lines) {
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    out.push(ln);
    if (began && depth === 0) break;
  }
  return eval('(' + out.join('\n') + ')');
}
const cloneCatDeleted = _sliceFn('cloneCatDeleted');
const catDelAdd = _sliceFn('catDelAdd');
const applyCatTombstones = _sliceFn('applyCatTombstones');
const flattenReasonCatalog = _sliceFn('flattenReasonCatalog');
const cloneReasonCatalog = _sliceFn('cloneReasonCatalog');
const mergeReasonCatalog = _sliceFn('mergeReasonCatalog');
const mergeTsMap = _sliceFn('mergeTsMap');
const catTombReviveFilter = _sliceFn('catTombReviveFilter');
global.DEFAULT_COMMITTEE = {banzhang:null, fubanzhang:null, jilv:null, xuexi:null, tiyu:null, shenghuo:null, wenyi:null, xinli:null};

// mock fetch
let reqLog = [];
let responder = null;
global.fetch = (url, opts) => {
  reqLog.push({ url, opts, headers: (opts && opts.headers) || {} });
  return Promise.resolve(responder(url, opts));
};

eval(code + '\n' + mergeCode +
     '\nglobal.__api={checkPushSafety,fetchCloudMeta,doPushToCloud,buildCloudPayload,smartMergeData,encryptForCloud,decryptFromCloud,setSyncPwd,getSyncPwd};' +
     '\nglobal.__setResponder=f=>{responder=f}; global.__reqLog=()=>reqLog; global.__resetLog=()=>{reqLog=[]};');
const api = global.__api;

const gql = s => JSON.stringify(s);
const enc = o => Buffer.from(gql(o), 'utf8').toString('base64');
const mkResp = (obj, ok = true, status = 200) => ({
  ok, status,
  json: () => Promise.resolve(obj),
  text: () => Promise.resolve(typeof obj === 'string' ? obj : gql(obj))
});
const b64decode = s => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

(async () => {
  console.log('\n[修复①-a] fetchCloudMeta：>1MB（content 为空）→ 追加 raw GET 拿内容');
  global.__resetLog();
  const cloudPayload = { students: [{ id: 1, name: '云端A' }, { id: 2, name: '云端B' }], nextId: 2, wipeAt: 0 };
  global.__setResponder((url, opts) => {
    if (opts.headers.Accept === 'application/vnd.github.v3+json')
      return mkResp({ sha: 'bigsha', content: '', encoding: 'none', size: 13147267 });
    return mkResp(gql(cloudPayload));   // raw 媒体类型 → 返回原文
  });
  const meta = await api.fetchCloudMeta('https://api.github.com/repos/x/y/contents/data.json',
    { 'Authorization': 'token t', 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'cm' });
  const gets = global.__reqLog().filter(r => !r.opts.method || r.opts.method === 'GET');
  check('共发出 2 次 GET', gets.length === 2, String(gets.length));
  check('第二次 GET 用 raw 媒体类型', gets[1] && gets[1].headers.Accept === 'application/vnd.github.raw+json',
        gets[1] && gets[1].headers.Accept);
  check('sha 保留自首次响应', meta.sha === 'bigsha', meta.sha);
  check('remote 为解析后的云端负载（2 名学生）', meta.remote && meta.remote.students.length === 2);

  console.log('\n[修复①-b] doPushToCloud 端到端：>1MB 云端数据参与推送前合并');
  global.__resetLog();
  global.state.students = [{ id: 9, name: '本地独有' }];
  store[global.STORE_KEY] = gql({ students: [{ id: 9, name: '本地独有' }], nextId: 9 });
  let putBody = null;
  global.__setResponder((url, opts) => {
    if (opts.method === 'PUT') { putBody = JSON.parse(opts.body); return mkResp({ commit: { sha: 'new' } }); }
    if (opts.headers.Accept === 'application/vnd.github.raw+json') return mkResp(gql(cloudPayload));
    return mkResp({ sha: 'bigsha', content: '', encoding: 'none', size: 13147267 });
  });
  let pushErr = null;
  try { await api.doPushToCloud('test: big file merge'); } catch (e) { pushErr = e; }
  check('推送不报错', pushErr === null, pushErr && pushErr.message);
  check('PUT 带上 bigsha（覆盖而非新建）', putBody && putBody.sha === 'bigsha', putBody && putBody.sha);
  const pushed = b64decode(putBody.content);
  const ids = pushed.students.map(s => s.id).sort();
  check('推送负载 = 本地+云端合并（1,2,9）', JSON.stringify(ids) === '[1,2,9]', JSON.stringify(ids));
  check('负载带 wipeAt 字段（修复②）', 'wipeAt' in pushed, JSON.stringify(Object.keys(pushed)));

  console.log('\n[修复①-c] 空本地保护对 >1MB 云端数据重新生效（修复前的丢数据场景）');
  global.state.students = [];
  store[global.STORE_KEY] = gql({ students: [], nextId: 1 });
  let blocked = null;
  try { await api.doPushToCloud('test: empty local guard'); } catch (e) { blocked = e; }
  check('空本地 + 云端有人 → 推送被阻止', blocked && /本机为空/.test(blocked.message), blocked && blocked.message);

  console.log('\n[修复①-d] wipeAt 对齐检查对 >1MB 云端数据重新生效');
  global.state.students = [{ id: 1, name: '本机旧数据' }];
  global.state.wipeAt = 500;
  const wipedCloud = { students: [], wipeAt: 999 };
  global.__setResponder((url, opts) => {
    if (opts.method === 'PUT') { putBody = JSON.parse(opts.body); return mkResp({ commit: { sha: 'new' } }); }
    if (opts.headers.Accept === 'application/vnd.github.raw+json') return mkResp(gql(wipedCloud));
    return mkResp({ sha: 'bigsha', content: '', encoding: 'none', size: 13147267 });
  });
  let resyncErr = null;
  try { await api.doPushToCloud('test: wipe align'); } catch (e) { resyncErr = e; }
  check('云端已重置 → 拦截并要求本机对齐清空', resyncErr && /已重置/.test(resyncErr.message), resyncErr && resyncErr.message);

  console.log('\n[修复②] buildCloudPayload 显式带上 wipeAt（nosv 不再造成断链）');
  global.state.wipeAt = 1726000000000;
  const p = api.buildCloudPayload({ students: [{ id: 1 }], nextId: 1 });
  check('负载含内存 state 的 wipeAt', p.wipeAt === 1726000000000, String(p.wipeAt));
  check('快照里没有 wipeAt 也能带上（state 为权威来源）',
    !('wipeAt' in { students: [{ id: 1 }], nextId: 1 }) && p.wipeAt === 1726000000000);
  global.state.wipeAt = 0;
  check('未重置设备 wipeAt=0（不会误触发他机清空）', api.buildCloudPayload({}).wipeAt === 0);

  console.log('\n[兼容] ≤1MB（content 有值）单次 GET 即可，行为不变');
  global.__resetLog();
  global.__setResponder(() => mkResp({ sha: 'smallsha', content: enc(cloudPayload) }));
  const meta2 = await api.fetchCloudMeta('u', { 'Accept': 'application/vnd.github.v3+json' });
  check('仅 1 次 GET', global.__reqLog().length === 1, String(global.__reqLog().length));
  check('remote 正确解析', meta2.remote && meta2.remote.students.length === 2 && meta2.sha === 'smallsha');
  check('兼容旧信封入参（回归测试/其他调用方）',
    (await api.checkPushSafety({ content: enc(cloudPayload) })).ok === true);

  console.log('\n[修复③] 券合并仲裁：退款/过期时间戳纳入（退款不再被核销状态顶掉）');
  // 抽取 cbMergeBanks 及其依赖（不在云同步窗口内，单独切函数）
  function extractFnBalanced(name) {
    const si = html.indexOf('function ' + name);
    if (si < 0) throw new Error('未找到 ' + name);
    const ls = html.slice(si).split('\n');
    let depth = 0, began = false, out = [];
    for (const ln of ls) {
      for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
      out.push(ln);
      if (began && depth === 0) break;
    }
    return eval('(' + out.join('\n') + ')');
  }
  const cbMergeBanks = extractFnBalanced('cbMergeBanks');
  const cbNormalizeShape = extractFnBalanced('cbNormalizeShape');   // cbMergeBanks 内部依赖
  const cbDefaultBank = extractFnBalanced('cbDefaultBank');
  const mkV = over => Object.assign({ id: 1, key: 'lunch', name: '午餐', status: 'unused', time: 1000 }, over);
  // 场景 A：A 设备核销(usedAt=2000) 后，B 设备在旧快照上退款(refundedAt=3000) → 退款应胜出
  const mA = cbMergeBanks(
    { wallets: { '1': { pendingItems: [mkV({ status: 'used', usedAt: 2000 })], discountMonth: '' } } },
    { wallets: { '1': { pendingItems: [mkV({ status: 'refunded', refundedAt: 3000 })], discountMonth: '' } } }
  );
  check('退款(更晚) 胜过 核销(更早)', mA.wallets['1'].pendingItems[0].status === 'refunded',
    mA.wallets['1'].pendingItems[0].status);
  // 场景 B：核销(2000) 晚于退款(1500) → 核销胜出
  const mB = cbMergeBanks(
    { wallets: { '1': { pendingItems: [mkV({ status: 'refunded', refundedAt: 1500 })], discountMonth: '' } } },
    { wallets: { '1': { pendingItems: [mkV({ status: 'used', usedAt: 2000 })], discountMonth: '' } } }
  );
  check('核销(更晚) 胜过 退款(更早)', mB.wallets['1'].pendingItems[0].status === 'used',
    mB.wallets['1'].pendingItems[0].status);
  // 场景 C：过期时间戳也参与仲裁
  const mC = cbMergeBanks(
    { wallets: { '1': { pendingItems: [mkV({ status: 'unused' })], discountMonth: '' } } },
    { wallets: { '1': { pendingItems: [mkV({ status: 'expired', expiredAt: 2500 })], discountMonth: '' } } }
  );
  check('过期(2500) 胜过 无时间戳更新(unused)', mC.wallets['1'].pendingItems[0].status === 'expired',
    mC.wallets['1'].pendingItems[0].status);

  console.log('\n========================================');
  console.log(` 通过 ${pass} 项，失败 ${fail} 项`);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
