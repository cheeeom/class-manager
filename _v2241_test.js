/* v2.24.1 回归测试：推送互斥锁 + 409 归类 + toast 时长分档
   背景（2026-10-01 排查结论）：老板报「修改数据后弹窗推送被拒」。
   根因 = 自动推送去抖 2000ms，而一次推送全程约 6 秒（GET 拿 sha 2.6s + PBKDF2 25 万轮 ×2 + PUT 3s）
          ⇒ 两次编辑间隔 < 6 秒时两笔推送必然重叠，后一笔读到旧 sha ⇒ GitHub 回 409 Conflict。
          且旧版 friendlyPushError 只把 422 当并发 ⇒ 409 既不重试也被报成「推送被拒」。
   本测试覆盖：
     ① 锁的形状与「调用方零改动」
     ② 行为级真跑：三连击只开一笔、复用同一 Promise、结束后补推一次、失败也释放锁、响应可重复读
     ③ 409 归类（且能命中 recoverable 正则）
     ④ showToast 时长分档
     ⑤ 抽取窗口契约（防止后来者把新符号挪出 _sync_test / _v2191fix_test 的切片范围）
   版本无关：版本号一律从 sw.js 的 CACHE_NAME 反推，发版不需要动本文件。
   运行：node _v2241_test.js */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const VER = (sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/) || [])[1] || '';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
async function ta(name, fn) {
  try { await fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + `不应出现 ${JSON.stringify(b)}`); }

/* 从源码里按花括号配平切出一个函数（与 _v2191_test.js 同款） */
function extractFn(name, src) {
  const s = src || html;
  const lines = s.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return buf.join('\n');
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  eq(blocks.length > 0, true, '一个 script 块都没找到');
  blocks.forEach(m => new Function(m[1]));
});

console.log('\n=== ⑤ 抽取窗口契约（_sync_test / _v2191fix_test 的切片范围） ===');
const W_START = html.indexOf('// 推送前安全闸门');
const CT_DECL = 'let cloudSyncTimer = null;';
const W_END = html.indexOf(CT_DECL);
t('窗口两端锚点都存在', () => {
  ok(W_START >= 0, '缺「推送前安全闸门」标记');
  ok(W_END >= 0, '缺 cloudSyncTimer 声明');
  ok(W_START < W_END, '窗口端点顺序反了');
});
t('★ 窗口末端锚点全文唯一（注释里写它原样字面就会把窗口提前截断）', () => {
  eq(html.split(CT_DECL).length - 1, 1, '该声明出现次数必须是 1');
});
t('★ 锁的全部符号都落在切片窗口内', () => {
  ['/* v2.24.1 推送互斥',
   'var _pushInFlight = null;',
   'function _freezeResponse(res){',
   'function _afterPushSettled(){',
   'function _doPushOnce(message){',
   'function doPushToCloud(message){',
   '.then(_freezeResponse)'].forEach(f => {
    const p = html.indexOf(f);
    ok(p >= 0, '缺 ' + f);
    ok(p > W_START && p < W_END, f + ' 落在窗口外（pos=' + p + '，窗口 ' + W_START + '~' + W_END + '）');
  });
});
t('★ 模拟 _sync_test.js 的切片，窗口里必须能拿到锁入口与既有实现', () => {
  const code = html.slice(html.indexOf('const SYNC_PWD_KEY'), W_END);
  has(code, 'function doPushToCloud(message){', '切片窗口里没有锁入口，_sync_test/_v2191fix_test 会 ReferenceError');
  has(code, 'function _freezeResponse(res){', '切片窗口里没有响应包装');
  has(code, 'function checkPushSafety(', '切片窗口应含原有同步闸门（窗口被改小了的信号）');
  // _v2191fix_test.js 明确从切片里导出 buildCloudPayload 并真跑它 ⇒ 必须被**完整**包住
  ['applyCloudData', 'buildCloudPayload'].forEach(n => {
    const i = code.indexOf('function ' + n + '(');
    ok(i >= 0, '切片窗口里没有 ' + n + '()');
    // 花括号配平找出函数结尾，必须仍在切片内
    let off = i, depth = 0, began = false;
    while (true) {
      const j = code.indexOf('\n', off);
      if (j < 0) throw new Error(n + '() 被窗口截断（找不到结尾）');
      for (const ch of code.slice(off, j)) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
      off = j + 1;
      if (began && depth === 0) break;
    }
    ok(off <= code.length, n + '() 被窗口截断 —— _v2191fix_test 会 ReferenceError');
  });
});

console.log('\n=== ① 锁的形状 + 调用方零改动 ===');
t('锁状态与两个辅助函数就位', () => {
  has(html, 'var _pushInFlight = null;', '缺 in-flight 变量');
  has(html, 'var _pushAgainPending = false;', '缺补推登记变量');
  has(html, 'function _freezeResponse(res){', '缺响应包装');
  has(html, 'function _afterPushSettled(){', '缺收尾处理');
});
t('原推送实现整体改名 _doPushOnce，函数体首行闸门原样保留', () => {
  has(html, "function _doPushOnce(message){\n  if(wipeInProgress){ dbg('[Sync] wipe in progress, skip push:', message); return Promise.resolve(); }",
      'wipeInProgress 闸门被改了');
});
t('锁包装：在飞时复用同一笔并登记补推', () => {
  const fn = extractFn('doPushToCloud');
  has(fn, 'if(_pushInFlight){', '缺在飞判断');
  has(fn, '_pushAgainPending = true;', '缺补推登记');
  has(fn, 'return _pushInFlight;', '缺复用分支');
  has(fn, '.then(_freezeResponse)', '缺响应包装');
  ok(fn.indexOf('_doPushOnce(message)') > 0, '没有真正调用底层实现');
});
t('锁包装：成功与失败都释放锁（否则一次失败会永久堵死后续推送）', () => {
  const fn = extractFn('doPushToCloud');
  // 🔴 必须就地双侧注册 —— 写成 inflight.then(noop,noop).then(settle) 会晚一个微任务，
  //    紧跟着的下一笔会看到没释放的锁、误判成并发（_v2191fix_test.js 串行 await 抓到过）
  has(fn, 'inflight.then(settle, settle);', '缺就地双侧注册（会晚一个微任务释放）');
  notHas(fn, '.then(function(){}, function(){}).then(', '不得用「晚一个微任务」的释放链');
  has(fn, 'if(_pushInFlight === inflight) _pushInFlight = null;', '缺条件释放（会被后续那笔误清）');
  has(fn, '_afterPushSettled();', '释放后没有处理补推');
});
t('★ 释放与调用方的 await 同批排队（串行两笔不能互相误判成并发）', () => {
  // 这是 _v2191fix_test.js 抓出来的真 bug 的定点回归：两笔串行 await 的推送，
  // 第二笔必须真正新开一笔，而不是复用第一笔的响应。
  const fn = extractFn('doPushToCloud');
  const iSettle = fn.indexOf('function settle(){');
  const iReg = fn.indexOf('inflight.then(settle, settle);');
  ok(iSettle > 0 && iReg > iSettle, 'settle 必须先声明再注册');
  ok(fn.indexOf('_pushInFlight = inflight;') < iReg, '必须先登记锁再注册释放（否则同步分支看不到锁）');
});
t('收尾补推被 try 包住（切片窗口里没有 autoPushToCloud）', () => {
  const fn = extractFn('_afterPushSettled');
  has(fn, 'if(!_pushAgainPending) return;', '缺前置短路');
  has(fn, '_pushAgainPending = false;', '必须先把标志清掉再补推（否则重复补推）');
  has(fn, 'try{ autoPushToCloud(); }catch(e){', 'autoPushToCloud 未被 try 包住');
});
t('★ 调用方零改动：auto / manual 两个调用点原样', () => {
  has(html, "doPushToCloud('auto-sync: update data.json')", '自动推送调用点被改了');
  has(html, "doPushToCloud('manual push: update data.json')", '手动推送调用点被改了');
  eq(html.split('doPushToCloud(').length - 1, 3, 'doPushToCloud 出现次数应为 3（1 定义 + 2 调用）');
});
t('★ 退避重试逻辑一行未动（_v2191_test.js 钉着的那些）', () => {
  has(html, '_pushRetryCount++');
  has(html, 'Math.min(30000, 3000 * Math.pow(2, _pushRetryCount - 1))');
  has(html, 'PUSH_MAX_RETRY = 4');
  has(html, '_pushRetryCount = 0;\n        dbg');
  has(html, 'var recoverable = /网络|并发|重试/.test(msg) && !/口令|Token|加密/.test(msg)');
  has(html, "var msg = friendlyPushError(e.message || '')");
  notHas(html, "showToast('云端同步失败: ' + e.message.substring(0,80)");
});

console.log('\n=== ② 行为级真跑：锁（沙箱注入假 _doPushOnce） ===');

/* 抽锁代码：从区段注释到 _doPushOnce 定义之前 */
const lockStart = html.indexOf('/* v2.24.1 推送互斥');
const lockEnd = html.indexOf('function _doPushOnce(message){');
if (lockStart < 0 || lockEnd < 0 || lockStart > lockEnd) {
  console.log('  ❌ 锁代码抽取失败');
  fail++;
}
const lockSrc = html.slice(lockStart, lockEnd);
const doPushSrc = extractFn('doPushToCloud');

/* 沙箱：形参 = _doPushOnce, dbg, autoPushToCloud —— 数量与下面实参一一对应 */
const factory = new Function('_doPushOnce', 'dbg', 'autoPushToCloud',
  lockSrc + '\n' + doPushSrc + '\n' +
  'return { push: doPushToCloud,' +
  ' snap: function(){ return { inflight: _pushInFlight !== null, again: _pushAgainPending }; } };');

/* 一次性响应替身：text() 只允许读一次（真 fetch 的 body 也是这个语义） */
function oneShotResponse(body, opts) {
  opts = opts || {};
  let read = 0;
  return {
    ok: opts.ok !== false, status: opts.status || 200,
    text: () => {
      read++;
      if (read > 1) return Promise.reject(new Error('body stream already read'));
      return Promise.resolve(body);
    },
    _reads: () => read
  };
}

(async () => {
  let calls = [], pendings = [], rePushes = [];
  const fake = (msg) => { calls.push(msg); return new Promise((res, rej) => pendings.push({ res, rej })); };
  const api = factory(fake, () => {}, () => rePushes.push(1));
  const settle = () => new Promise(r => setTimeout(r, 0));

  await ta('三连击只开一笔推送（消灭自激 409 的直接判据）', async () => {
    const p1 = api.push('m1'); const p2 = api.push('m2'); const p3 = api.push('m3');
    eq(calls.length, 1, '三连击应只调用底层推送 1 次');
    ok(p1 === p2 && p2 === p3, '后来者必须复用同一 Promise');
    eq(api.snap().again, true, '应登记「结束后补推一次」');
    eq(api.snap().inflight, true, '应处于在飞状态');
    pendings[0].res(oneShotResponse('{"commit":{"sha":"aaa"}}'));
    await settle(); await settle(); await settle();
    void p1; void p2; void p3;
  });

  await ta('★ 串行两笔：前一笔 await 结束后立刻再推，必须真的新开一笔', async () => {
    // 定点复现 _v2191fix_test.js 抓到的真 bug：释放链晚一个微任务时，第二笔会看到还没释放的锁、
    // 误判成并发而复用第一笔的响应。这里刻意**只用 await、不加 setTimeout**，与真实调用节奏一致。
    const before = calls.length;
    const p1 = api.push('s1');
    pendings[pendings.length - 1].res(oneShotResponse('{"commit":{"sha":"s1"}}'));
    await p1;
    const p2 = api.push('s2');
    eq(calls.length, before + 2, '第二笔必须真的新开一笔（被误判成并发时这里只会 +1）');
    ok(p1 !== p2, '不得复用上一笔的 Promise');
    eq(api.snap().again, false, '不应被误判成并发而登记补推');
    pendings[pendings.length - 1].res(oneShotResponse('{"commit":{"sha":"s2"}}'));
    await p2;
  });

  await ta('本笔结束后：消费补推标志 + 释放锁 + 触发一次补推', async () => {
    eq(api.snap().inflight, false, '锁未释放');
    eq(api.snap().again, false, '补推标志未被消费');
    eq(rePushes.length, 1, '应触发且只触发一次补推');
  });

  await ta('锁释放后新改动能开第二笔（不会永久堵死）', async () => {
    const before = calls.length;
    const p = api.push('m4');
    eq(calls.length, before + 1, '应开新的一笔');
    eq(api.snap().inflight, true);
    pendings[pendings.length - 1].res(oneShotResponse('{"commit":{"sha":"bbb"}}'));
    await settle(); await settle(); await settle();
    eq(api.snap().inflight, false);
    void p;
  });

  await ta('★ 失败也必须释放锁（否则一次 401 就永久堵死推送）', async () => {
    const before = calls.length;
    const p = api.push('m5');
    eq(calls.length, before + 1);
    pendings[pendings.length - 1].rej(new Error('PUT failed: 401 bad credentials'));
    let caught = null;
    await p.catch(e => { caught = e; });
    await settle(); await settle(); await settle();
    ok(caught && /401/.test(caught.message), '失败应向上抛出');
    eq(api.snap().inflight, false, '失败后锁必须释放');
    const p2 = api.push('m6');
    eq(calls.length, before + 2, '失败后应还能开新的一笔');
    pendings[pendings.length - 1].res(oneShotResponse('{"commit":{"sha":"ccc"}}'));
    await settle(); await settle(); await settle();
    void p2;
  });

  await ta('★ 响应代理可被重复读取（互斥后多个调用方共享同一响应）', async () => {
    const p = api.push('m7');
    pendings[pendings.length - 1].res(oneShotResponse('{"a":1,"commit":{"sha":"ddd"}}'));
    const r = await p;
    const t1 = await r.text(), t2 = await r.text();
    const j1 = await r.json(), j2 = await r.json();
    eq(t1, '{"a":1,"commit":{"sha":"ddd"}}');
    eq(t2, t1, '第二次 text() 必须命中缓存');
    eq(j1.a, 1); eq(j2.a, 1);
    eq(r.ok, true); eq(r.status, 200);
    await settle(); await settle();
  });

  await ta('代理保留 ok / status 语义（失败响应不被吞）', async () => {
    const p = api.push('m8');
    pendings[pendings.length - 1].res(oneShotResponse('nope', { ok: false, status: 409 }));
    const r = await p;
    eq(r.ok, false);
    eq(r.status, 409);
    await settle(); await settle();
  });

  console.log('\n=== ③ friendlyPushError：409 归类 ===');
  const friendlyPushError = eval('(' + extractFn('friendlyPushError') + ')');
  t('409 Conflict → 并发更新，将自动重试', () => {
    eq(friendlyPushError('PUT failed: 409 Conflict'),
       '云端数据有并发更新，将自动重试');
  });
  t('422 行为不变（_v2191_test.js 的既有断言）', () => {
    eq(friendlyPushError('PUT failed: 422 validation'),
       '云端数据有并发更新，将自动重试');
  });
  t('★ 409 的转译结果能命中 recoverable 正则（这才是「会不会重试」的判据）', () => {
    const classify = m => /网络|并发|重试/.test(m) && !/口令|Token|加密/.test(m);
    eq(classify(friendlyPushError('PUT failed: 409 Conflict')), true, '409 仍不可重试');
    eq(classify(friendlyPushError('PUT failed: 422 x')), true);
    eq(classify(friendlyPushError('Failed to fetch')), true);
    eq(classify(friendlyPushError('PUT failed: 401 bad credentials')), false, '鉴权类不该重试');
  });
  t('Token / 口令类不被并发分支抢走', () => {
    eq(friendlyPushError('GET SHA failed: 401'),
       'GitHub Token 已失效或权限不足，请到设置页重新配置 Token');
    const m = '云端数据无法解密（口令与其他设备不一致？），已阻止推送以免覆盖';
    eq(friendlyPushError(m), m);
    eq(friendlyPushError('some unknown error'), 'some unknown error');
  });

  console.log('\n=== ④ showToast 时长分档（老板「弹窗太快截不到图」） ===');
  const stSrc = extractFn('showToast');
  t('showToast 试真跑：时长按类型分档', () => {
    const delays = [];
    const el = () => ({ className: '', textContent: '', appendChild() {}, remove() {} });
    const fakeDoc = { getElementById: () => el(), createElement: () => el() };
    const showToast = new Function('document', 'setTimeout', stSrc + '\nreturn showToast;')(fakeDoc, (fn, ms) => delays.push(ms));
    showToast('x', 'error');    eq(delays[delays.length - 1], 8000, '错误应留 8 秒');
    showToast('x', 'warning');  eq(delays[delays.length - 1], 5000, '警告应留 5 秒');
    showToast('x', 'success');  eq(delays[delays.length - 1], 3000, '成功维持 3 秒');
    showToast('x', 'info');     eq(delays[delays.length - 1], 3000, '提示维持 3 秒');
    showToast('x');             eq(delays[delays.length - 1], 3000, '默认维持 3 秒');
    showToast('x', 'error', 1234); eq(delays[delays.length - 1], 1234, '显式 duration 应优先');
  });
  t('成功/提示类手感不变（仍是 3 秒）', () => {
    has(stSrc, "const ms = duration || (type === 'error' ? 8000 : (type === 'warning' ? 5000 : 3000));");
  });
  t('showToast 仍走 textContent（v2.8.1 的注入防护未被破坏）', () => {
    has(stSrc, 'bd.textContent = msg;');
    notHas(stSrc, 'bd.innerHTML');
  });

  console.log('\n=== 版本一致性（从 CACHE_NAME 反推，发版无需改本文件） ===');
  t('四处版本标记与 CACHE_NAME 一致', () => {
    ok(VER, 'sw.js 里没读到 CACHE_NAME');
    has(html, '<div class="login-version">' + VER + '</div>', '登录页版本');
    has(html, '<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>', '侧栏版本');
    has(html, '🏷️ ' + VER + '</span>', '设置徽标');
    has(html, '近版更新速览（' + VER + '）', '速览标题未跟版');
  });

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
