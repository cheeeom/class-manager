/* v2.11.3 回归测试：彻底重置机制（wipeAt 全链路）+ 整页脚本语法检查
   运行：node _v2113_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  eq(blocks.length >= 1, true);
  blocks.forEach((code, i) => { new Function(code); });   // 只编译不执行
});

console.log('\n=== checkPushSafety 重置决策表（明文分支） ===');
function extractFn(name) {
  const m = html.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数 ' + name);
  return m[0];
}
const state = { students: [], wipeAt: 0 };
const scope = {
  state,
  Promise, atob, Uint8Array, TextDecoder, JSON,
  hasSyncPwd: () => true,
  decryptFromCloud: (r) => Promise.resolve(r.__plain || {}),
  console,
};
function runCheckPushSafety(remoteJson) {
  with (scope) { return eval('(' + extractFn('checkPushSafety') + ')')(remoteJson); }
}
function b64json(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64'); }
const remoteJson = (data) => data ? { content: b64json(data) } : null;

(async () => {
  const cases = [
    ['云端无重置戳 + 两边都有人 → 放行', { students: [{ id: 1 }], wipeAt: 0 }, { students: [{ id: 1 }] }, 0, r => eq(r.ok, true)],
    ['云端 wipeAt 较新 → 拦截并要求本机对齐清空', { students: [], wipeAt: 500 }, { students: [{ id: 1 }], wipeAt: 999 }, 500, r => { eq(r.ok, false); eq(r.resync, true); }],
    ['云端 wipeAt 与本机一致 → 放行', { students: [], wipeAt: 999 }, { students: [], wipeAt: 999 }, 999, r => eq(r.ok, true)],
    ['云端无戳 + 本机空 + 云端有人 → 空本地保护（原有行为保留）', { students: [], wipeAt: 0 }, { students: [{ id: 1 }], wipeAt: 0 }, 0, r => { eq(r.ok, false); eq(r.resync, true); }],
    ['云端无人 + 本机有人 → 放行（正常空数据推送）', { students: [{ id: 1 }], wipeAt: 0 }, { students: [], wipeAt: 0 }, 0, r => eq(r.ok, true)],
  ];
  for (const [name, local, remote, wipeAt, assert] of cases) {
    state.students = local.students; state.wipeAt = local.wipeAt;
    const r = await runCheckPushSafety(remoteJson(remote));
    t(name, () => assert(r));
  }
  t('云端 404（null）→ 放行（删除文件后首次推送）', () => {
    return runCheckPushSafety(null).then(r => eq(r.ok, true));
  });

  console.log('\n=== 关键结构断言 ===');
  t('CLOUD_SYNC_FIELDS 含 wipeAt / schemaVer（重置戳与目录版本随推送上云）', () => {
    { // v2.19.0 CFS 由 STATE_SCHEMA 派生
      const _ss = eval('(' + html.slice(html.indexOf('const STATE_SCHEMA'), html.indexOf('\n];', html.indexOf('const STATE_SCHEMA')) + 3).replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
      const _cfs = _ss.filter(f2 => f2.cfs).map(f2 => f2.key);
      eq(_cfs.includes('wipeAt') && _cfs.includes('schemaVer'), true);
    }
  });
  t('loadData 恢复 wipeAt（否则对齐判断每次误触发）', () => {
    eq(/state\.wipeAt = d\.wipeAt \|\| 0;/.test(html), true);
  });
  t('applyCloudData 在 smartMerge 之前做 wipeAt 对齐', () => {
    const fn = html.match(/function applyCloudData\([\s\S]*?\n\}/)[0];
    const alignAt = fn.indexOf('wipeAt');
    const mergeAt = fn.indexOf('smartMergeData');
    eq(alignAt >= 0 && mergeAt >= 0 && alignAt < mergeAt, true);
  });
  t('autoSyncFromCloud / autoPushToCloud / doPushToCloud 均有 wipeInProgress 闸门', () => {
    eq((html.match(/wipeInProgress/g) || []).length >= 6, true);
  });
  t('clearData 重置完整（v2.19.1 表驱动：全 schema 回默认 + reasonScores 专用默认 + wipeAt 重置戳）', () => {
    const fn = html.match(/function clearData\([\s\S]*?\n\}/)[0];
    ['buildDefaultState()', 'defaultReasonScores', 'state.wipeAt = Date.now()', 'pushWipeToCloud()'].forEach(s => {
      if (!fn.includes(s)) throw new Error('缺少: ' + s);
    });
  });
  t('v2.18.4：duty 默认值收敛为 defaultDuty() 工厂（轮次制字段随工厂重置，杜绝三处手写漏字段）', () => {
    const dd = html.match(/function defaultDuty\(\)\{[\s\S]*?\n\}/)[0];
    ['lastGenWeek:-1', 'queue:[]', 'roundLedger:[]', 'waterCursorId:null', 'servedIds:[]'].forEach(s => {
      if (!dd.includes(s)) throw new Error('defaultDuty 缺少: ' + s);
    });
  });
  t('clearData 保留品牌配置（className/classMotto/classAvatar 不清）', () => {
    const fn = html.match(/function clearData\([\s\S]*?\n\}/)[0];
    if (/state\.className = '高一班级'/.test(fn)) throw new Error('不应把班级名重置为默认');
  });

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
