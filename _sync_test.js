// 云同步逻辑的行为测试（v2.8.0）
// 直接从 index.html 抽取真实实现，用 mock fetch 覆盖 6 个关键场景：
//   1. 空本地 + 云端有数据 → 阻止推送并自动恢复（P0 竞态）
//   2. 云端已加密 + 本机无口令 → 阻止推送（否则明文覆盖密文）
//   3. 云端已加密 + 口令错误 → 阻止推送（否则用错密钥加密覆盖，等于毁数据）
//   4. 正常情况 → 放行、加密、合并后推送
//   5. 推送前与云端合并，不丢另一台设备的新增
//   6. data.json 不存在（404）→ 走创建分支，不报错
//
// 用法：node _sync_test.js

const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// ---- 抽取实现：stripNoticeHistoryImages + 加密小节 + 推送闸门 ----
const stripFn = html.slice(
  html.indexOf('function stripNoticeHistoryImages'),
  html.indexOf('/* ==================== 云同步加密')
);
const start = html.indexOf("const SYNC_PWD_KEY");
const endAt = html.indexOf("let cloudSyncTimer = null;");
if (start < 0 || endAt < 0) { console.error('抽取失败'); process.exit(1); }
let code = html.slice(start, endAt);
// 去掉 configSyncPwd（它用 prompt/confirm，测试里不需要）
code = code.slice(0, code.indexOf('function configSyncPwd(){')) +
       code.slice(code.indexOf('// 推送前安全闸门'));

// ---- 抽取 smartMergeData ----
const ms = html.indexOf('function smartMergeData');
const me = html.indexOf('\nfunction ', ms + 10);
const mergeCode = html.slice(ms, me > 0 ? me : undefined);

// ---- 环境替身 ----
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = { crypto: globalThis.crypto };
global.crypto = globalThis.crypto;

// 被测代码会引用的外部符号（测试里给最小实现）
global.state = { students: [], operations: [] };
global.showToast = () => {};
global.STORE_KEY = 'classManagerData';
global.GH_OWNER = 'cheeeom'; global.GH_REPO = 'class-manager';
global.GH_BRANCH = 'main'; global.GH_DATA_PATH = 'data.json';
global.CLOUD_SYNC_FIELDS = ['className', 'students', 'operations', 'nextId', 'notices'];
global.cloudDataInfo = null;
global.lastSyncTime = null;
// v2.9.0 起 smartMergeData 依赖班委默认 8 岗常量（测试的外部符号桩）
global.DEFAULT_COMMITTEE = {banzhang:null, fubanzhang:null, jilv:null, xuexi:null, tiyu:null, shenghuo:null, wenyi:null, xinli:null};

// mock fetch：记录请求，按场景返回
let reqLog = [];
let responder = null;
global.fetch = (url, opts) => {
  reqLog.push({ url, opts });
  return Promise.resolve(responder(url, opts));
};

eval(stripFn + '\n' + code + '\n' + mergeCode +
     '\nglobal.__api={encryptForCloud,decryptFromCloud,setSyncPwd,hasSyncPwd,checkPushSafety,buildCloudPayload,smartMergeData,getSyncPwd};' +
     '\nglobal.__setResponder=f=>{responder=f}; global.__reqLog=()=>reqLog; global.__resetLog=()=>{reqLog=[]};');

const api = global.__api;

// ---- 工具 ----
const gql = s => JSON.stringify(s);
const enc = o => Buffer.from(gql(o), 'utf8').toString('base64');
const mkResp = (obj, ok = true, status = 200) => ({
  ok, status,
  json: () => Promise.resolve(obj),
  text: () => Promise.resolve(gql(obj))
});
const b64decode = s => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ✅ ' + name); pass++; }
  else { console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); fail++; }
}

const CLOUD_STUDENTS = [
  { id: 1, name: '云端学生A', parentPhone: '13800000001' },
  { id: 2, name: '云端学生B', parentPhone: '13800000002' }
];

(async () => {
  const PWD = 'GuangYuan-2026-Sync!';

  // =====================================================================
  console.log('\n[场景 1] 空本地 + 云端有数据 → 应阻止推送并触发恢复');
  // =====================================================================
  global.state.students = [];
  store[global.STORE_KEY] = gql({ students: [], nextId: 1 });
  global.__setResponder(() => mkResp({ sha: 'sha1', content: enc({ students: CLOUD_STUDENTS, nextId: 2 }) }));
  let r1 = await api.checkPushSafety({ content: enc({ students: CLOUD_STUDENTS, nextId: 2 }) });
  check('阻止推送', r1.ok === false);
  check('触发自动恢复', r1.resync === true);
  check('提示含云端人数', /2\s*名学生/.test(r1.msg || ''), r1.msg);

  // =====================================================================
  console.log('\n[场景 2] 云端已加密 + 本机无口令 → 应阻止推送');
  // =====================================================================
  api.setSyncPwd('');
  const env = await (async () => {
    const saved = store[global.STORE_KEY];
    api.setSyncPwd(PWD);
    const e = await api.encryptForCloud({ students: CLOUD_STUDENTS });
    api.setSyncPwd('');
    store[global.STORE_KEY] = saved;
    return e;
  })();
  let r2 = await api.checkPushSafety({ content: enc(env) });
  check('阻止推送', r2.ok === false);
  check('提示未配置口令', /未配置同步口令/.test(r2.msg || ''), r2.msg);

  // =====================================================================
  console.log('\n[场景 3] 云端已加密 + 口令错误 → 应阻止推送');
  // =====================================================================
  api.setSyncPwd('Wrong-Password-XXX');
  let r3 = await api.checkPushSafety({ content: enc(env) });
  check('阻止推送', r3.ok === false);
  check('提示口令不一致', /不一致|无法解密/.test(r3.msg || ''), r3.msg);

  // =====================================================================
  console.log('\n[场景 4] 正常情况 → 放行、返回云端明文供合并');
  // =====================================================================
  api.setSyncPwd(PWD);
  global.state.students = [{ id: 1, name: '本地学生' }];
  store[global.STORE_KEY] = gql({ students: [{ id: 1, name: '本地学生' }], nextId: 5 });
  let r4 = await api.checkPushSafety({ content: enc(env) });
  check('放行', r4.ok === true, r4.msg);
  check('回传云端明文', Array.isArray(r4.remote && r4.remote.students) && r4.remote.students.length === 2);

  // =====================================================================
  console.log('\n[场景 5] 推送前合并：本地新增不应被云端覆盖，也不该丢云端新增');
  // =====================================================================
  const local = { students: [{ id: 9, name: '本地独有' }], nextId: 9, notices: { history: [{ id: 1, text: 't', image: 'data:image/jpeg;base64,AAAAAAAA' }] } };
  const merged = api.smartMergeData(local, r4.remote);
  const ids = merged.students.map(s => s.id).sort();
  check('合并后含本地独有 id=9', ids.includes(9), JSON.stringify(ids));
  check('合并后含云端 id=1,2', ids.includes(1) && ids.includes(2), JSON.stringify(ids));
  check('nextId 取最大值', merged.nextId === 9, String(merged.nextId));

  // 通知历史图片应被剥离（防止 data.json 膨胀）
  const payload = api.buildCloudPayload(merged);
  check('推送负载剥离了通知历史图片',
    !payload.notices || !payload.notices.history || payload.notices.history.every(h => h.image === undefined));

  // =====================================================================
  console.log('\n[场景 6] 加密往返 + 推送负载确实是密文');
  // =====================================================================
  const finalEnv = await api.encryptForCloud(payload);
  check('负载是密文信封', finalEnv.enc === 1);
  check('密文不含学生姓名', !JSON.stringify(finalEnv).includes('云端学生A'));
  check('密文不含家长手机号', !JSON.stringify(finalEnv).includes('13800000001'));
  const back = await api.decryptFromCloud(JSON.parse(JSON.stringify(finalEnv)));
  check('解密后数据一致', JSON.stringify(back) === JSON.stringify(payload));

  // =====================================================================
  console.log('\n[场景 7] 无口令时降级为明文（向后兼容，不阻断老用户）');
  // =====================================================================
  api.setSyncPwd('');
  const plain = await api.encryptForCloud({ students: [{ id: 1, name: 'x' }] });
  check('无口令 → 原样返回明文', plain.enc === undefined && Array.isArray(plain.students));
  api.setSyncPwd(PWD);

  // =====================================================================
  console.log('\n[场景 8] 多设备 salt 一致');
  // =====================================================================
  await api.decryptFromCloud(finalEnv);                 // 记下云端 salt
  const env2 = await api.encryptForCloud(payload);
  check('第二台设备沿用云端 salt', env2.salt === finalEnv.salt);
  const back2 = await api.decryptFromCloud(env2);
  check('第二台设备可解密第一台的密文', JSON.stringify(back2) === JSON.stringify(payload));

  // =====================================================================
  console.log('\n[场景 9] data.json 不存在（历史清理后）→ 应走创建分支，不报错');
  // =====================================================================
  // 这条路径是历史清理后重建 data.json 的唯一途径，必须验证：
  // GET 返回 404 时 sha 应为 undefined，PUT body 里不带 sha 即创建文件。
  global.__resetLog();
  global.state.students = [{ id: 7, name: '重建用数据' }];
  store[global.STORE_KEY] = gql({ students: [{ id: 7, name: '重建用数据' }], nextId: 7 });
  global.getGHToken = () => 'fake-token-for-test';
  global.__setResponder(() => mkResp({}, false, 404));   // 首轮 GET 404

  let putBody = null;
  global.__setResponder((url, opts) => {
    if (opts && opts.method === 'PUT') { putBody = JSON.parse(opts.body); return mkResp({ commit: { sha: 'new' } }); }
    return mkResp({}, false, 404);
  });

  const err404 = await (async () => {
    try { await eval('doPushToCloud')('test: create'); return null; }
    catch (e) { return e; }
  })();
  check('404 不抛异常', err404 === null, err404 && err404.message);
  check('发出了 PUT 请求', putBody !== null);
  check('PUT body 不含 sha（GitHub 据此判定为新建）', putBody && putBody.sha === undefined,
        putBody ? JSON.stringify(Object.keys(putBody)) : 'no body');
  if (putBody) {
    const created = b64decode(putBody.content);
    check('新建的内容是加密信封', created.enc === 1);
    check('密文不含学生姓名', !JSON.stringify(created).includes('重建用数据'));
    const rt = await api.decryptFromCloud(created);
    check('可解密回原始数据', JSON.stringify(rt.students) === JSON.stringify([{ id: 7, name: '重建用数据' }]));
  }

  console.log('\n========================================');
  console.log(` 通过 ${pass} 项，失败 ${fail} 项`);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
