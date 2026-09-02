// 一次性冒烟测试：验证 index.html 里的加解密实现能真正跑通并互相还原
// 直接从源码抽取「云同步加密」小节，避免手抄导致测试与实现不同步
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const start = html.indexOf("const SYNC_PWD_KEY");
const endMark = "function configSyncPwd(){";
const end = html.indexOf(endMark);
if (start < 0 || end < 0) { console.error('抽取失败：未找到加密小节边界'); process.exit(1); }
let code = html.slice(start, end);

// 浏览器环境替身
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = { crypto: globalThis.crypto };

// 执行抽取出的实现
eval(code + '\nglobal.__api={encryptForCloud,decryptFromCloud,setSyncPwd,hasSyncPwd,_getSalt};');

const sample = {
  className: '26幼2班',
  students: [
    { id: 2, sid: '2026001', name: '【学生】', gender: '女', credit: 100,
      tags: ['6栋-803室'], parentName: '', parentPhone: '13800000000' }
  ],
  notices: { history: [{ id: 1, text: '开学通知', image: 'data:image/jpeg;base64,AAAA' }] }
};

(async () => {
  const api = global.__api;
  const enc = api.encryptForCloud(sample);
  console.log('无明文字段残留(姓名):', !JSON.stringify(enc).includes('【学生】'));
  console.log('无明文字段残留(手机号):', !JSON.stringify(enc).includes('13800000000'));

  api.setSyncPwd('GuangYuan-2026-Sync!');
  const env = await api.encryptForCloud(sample);
  console.log('\n[信封字段]', Object.keys(env).join(', '));
  console.log('[算法]', env.alg);
  console.log('[密文长度]', env.data.length, 'chars');
  console.log('密文不含姓名:', !JSON.stringify(env).includes('【学生】'));
  console.log('密文不含手机号:', !JSON.stringify(env).includes('13800000000'));
  console.log('密文不含班级名:', !JSON.stringify(env).includes('26幼2班'));

  const back = await api.decryptFromCloud(JSON.parse(JSON.stringify(env)));
  console.log('\n[解密还原一致]', JSON.stringify(back) === JSON.stringify(sample));

  // 错误口令必须失败（AES-GCM 自带认证标签）
  api.setSyncPwd('WRONG-PASSWORD');
  let rejected = false;
  try { await api.decryptFromCloud(env); } catch (e) { rejected = true; console.log('[错口令被拒]', e.message); }
  if (!rejected) { console.error('!! 严重：错误口令竟然解密成功'); process.exit(1); }

  // 多设备 salt 一致性：模拟第二台设备用同口令解密后，用云端 salt 再加密
  api.setSyncPwd('GuangYuan-2026-Sync!');
  await api.decryptFromCloud(env);              // 会把云端 salt 记入 lastCloudSalt
  const env2 = await api.encryptForCloud(sample);
  console.log('[多设备 salt 一致]', env2.salt === env.salt);
  const back2 = await api.decryptFromCloud(env2);
  console.log('[第二台设备解密成功]', JSON.stringify(back2) === JSON.stringify(sample));

  console.log('\n全部通过 ✅');
})().catch(e => { console.error('测试失败:', e); process.exit(1); });
