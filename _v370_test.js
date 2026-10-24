/* v3.7.0 回归测试：学生查询端（SPEC_学生查询端.md）
   模块干了什么：老师端把数据按人切片、每人独立 8 位码加密，发布到公开 Gist；
   学生打开 portal/index.html，用「学号 + 自己那 8 位码」只解开自己那一片。

   本测试守的是一件事：**别把隐私漏出去，别把全班锁死。**
   ① 白名单 —— 输出对象遍历所有键，phone/guardian/address/birth/notes/timeline/tags/creditBase/dorm 一个都不许有
   ② 撤销流水必须被过滤（op.state==='revoked'）
   ③ 流水裁剪取最近 N 条（不是最早的 N 条）
   ④ 两端加密参数一致 —— 老师端改了迭代次数而学生端没跟，全班当场解不开，且只有真发布后才暴露
   ⑤ 明文块结构 + 信封结构
   ⑥ 码：8 位 / 32 字符集 / XXXX-XXXX / 不重复
   ⑦ 加解密回环 + 错码被拒 + 密文无明文残留
   ⑧ 没配 Token 时 portalValidate 必须拦下，且 publishPortal 的校验在推送之前
   ⑨ 版本：从 sw.js 的 CACHE_NAME 反推（不写死 —— 这坑项目踩过六次）
   运行：node _v370_test.js */
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');
const portal = fs.readFileSync(__dirname + '/portal/index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

/* ---------- 从 index.html 抽取真实实现（不是手抄副本） ---------- */
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到函数 ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
function extractLine(src, decl) {
  const m = src.match(new RegExp('^' + decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*', 'm'));
  if (!m) throw new Error('找不到声明 ' + decl);
  return m[0];
}
function extractArrayBlock(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('找不到数组 ' + decl);
  const j = src.indexOf('];', i);
  return src.slice(i, j + 2);
}

const sandbox = new Function([
  /* 宿主全局：代码里用的是 window.crypto（浏览器必然有），Node 沙箱必须补上，否则 ReferenceError 会被误读成源码 bug */
  'var window = { crypto: globalThis.crypto };',
  extractLine(html, 'const CB_ALERT_MIN'),
  extractArrayBlock(html, 'const CB_ALERT_TIERS'),
  extractLine(html, 'const PORTAL_ALPHABET'),
  extractLine(html, 'const PORTAL_CODE_LEN'),
  extractLine(html, 'const PORTAL_FILE'),
  extractLine(html, 'const PORTAL_TOKEN_KEY'),
  extractLine(html, 'const PORTAL_MAX_BYTES'),
  extractLine(html, 'const PORTAL_OPS_CAP'),
  extractLine(html, 'const PORTAL_BLACKLIST'),
  extractFn(html, 'cbTierOf'),
  extractFn(html, 'creditLevel'),
  extractFn(html, 'liveOps'),
  extractFn(html, 'pfSemesterStartTs'),
  extractFn(html, 'pfMonthStartTs'),
  extractFn(html, 'portalWeekStartTs'),
  extractFn(html, 'normalizePortalCode'),
  extractFn(html, 'formatPortalCode'),
  extractFn(html, 'genPortalCode'),
  extractFn(html, 'portalMaskName'),
  extractFn(html, 'portalLevelText'),
  /* 币余额走独立实现（cbCoinsOf 另有守卫），这里只要证明字段存在且是数字 */
  'function cbCoinsOf(){ return 0; }',
  extractFn(html, 'buildPortalPayload'),
  'return { buildPortalPayload, genPortalCode, formatPortalCode, normalizePortalCode, portalMaskName, portalLevelText, PORTAL_ALPHABET, PORTAL_CODE_LEN, PORTAL_OPS_CAP, PORTAL_BLACKLIST };'
].join('\n') + ';')();

/* portalValidate 单独抽（它引用了 cryptoOK/hasPortalToken，这里给最小宿主）。
   ⚠️ new Function 的最后一个参数才是函数体，前面的全是形参名——错位不会报错，只会静默变 undefined。 */
const validateFn = new Function(
  'function cryptoOK(){ return true; } function cryptoFailReason(){ return ""; } function hasPortalToken(){ return false; } ' +
  extractFn(html, 'portalValidate') + '\nreturn portalValidate;'
)();

/* ---------- 造数据 ---------- */
const T0 = new Date('2026-09-10T08:00:00').getTime();
function mkState() {
  return {
    students: [
      { id: 1, sid: 'S0001', name: '张小明', credit: 112, creditBase: 100, tags: ['学委'],
        profile: { gender: '男', birth: '2010-01-01', guardian: '张大伟', phone: '13800138000',
                   address: '幸福路 1 号 6栋-803室', notes: '需关注', timeline: [{ t: T0, txt: '谈话' }] } },
      { id: 2, sid: 'S0002', name: '李小红', credit: 58, creditBase: 100, tags: [],
        profile: { gender: '女', birth: '2010-02-02', guardian: '李大伟', phone: '13900139000',
                   address: '和平路 2 号', notes: '', timeline: [] } },
      { id: 3, sid: '', name: '无学号', credit: 100, profile: { phone: '13700137000' } }
    ],
    operations: [
      { id: 1, studentId: 1, studentName: '张小明', amount: 2, reason: '课堂发言积极', time: Date.now() - 3600000 },
      { id: 2, studentId: 1, studentName: '张小明', amount: -1, reason: '迟到', time: Date.now() - 7200000 },
      { id: 3, studentId: 1, studentName: '张小明', amount: 5, reason: '已被撤销的一条', time: Date.now() - 1000, state: 'revoked' },
      { id: 4, studentId: 2, studentName: '李小红', amount: -3, reason: '作业未交', time: Date.now() - 1800000 }
    ],
    creditBank: { ledger: [] }
  };
}

t('① 白名单：输出对象不得含任何隐私字段（逐键遍历，不抽查）', () => {
  const out = sandbox.buildPortalPayload(mkState(), { fromTime: 0 });
  const banned = ['phone', 'guardian', 'address', 'birth', 'notes', 'timeline', 'tags', 'creditBase', 'dorm'];
  Object.keys(out).forEach(sid => {
    Object.keys(out[sid]).forEach(k => {
      ok(banned.indexOf(k) < 0, '输出里出现了隐私字段 ' + k + '（学号 ' + sid + '）');
    });
  });
  /* 连同值一起验：家庭住址/手机号不得以任何形式出现在序列化结果里 */
  const json = JSON.stringify(out);
  ['13800138000', '13900139000', '幸福路', '和平路', '6栋-803室', '张大伟', '李大伟', '需关注', '谈话'].forEach(v => {
    ok(json.indexOf(v) < 0, '发布包里泄露了 ' + v);
  });
  ok(json.indexOf('2010-01-01') < 0, '发布包里泄露了生日');
});

t('② 撤销流水必须被过滤（op.state===\'revoked\'）', () => {
  const out = sandbox.buildPortalPayload(mkState(), { fromTime: 0 });
  const reasons = (out['S0001'].ops || []).map(o => o.reason);
  ok(reasons.indexOf('已被撤销的一条') < 0, '撤销的流水仍进了发布包');
  ok(reasons.length === 2, '应只剩 2 条有效流水，实际 ' + reasons.length);
});

t('③ 流水裁剪取**最近** N 条（不是最早的）', () => {
  const st = { students: [{ id: 1, sid: 'S0001', name: '甲', credit: 100 }], operations: [], creditBank: { ledger: [] } };
  for (let i = 0; i < 250; i++) {
    st.operations.push({ id: i + 1, studentId: 1, amount: 1, reason: 'R' + i, time: T0 + i * 60000 });
  }
  const out = sandbox.buildPortalPayload(st, { fromTime: 0 });
  const ops = out['S0001'].ops;
  ok(ops.length === sandbox.PORTAL_OPS_CAP, '裁剪到 ' + sandbox.PORTAL_OPS_CAP + ' 条，实际 ' + ops.length);
  ok(ops[0].reason === 'R249', '第一条应是最新的 R249，实际 ' + ops[0].reason);
  ok(ops.indexOf('R0') < 0 && ops.every(o => o.reason !== 'R0'), '最早的 R0 不该保留');
});

t('④ 两端加密参数一致（改了老师端没改学生端 = 全班解不开）', () => {
  const hostRounds = html.match(/const PBKDF2_ROUNDS = (\d+)/);
  const stuRounds = portal.match(/var PBKDF2_ROUNDS = (\d+)/);
  ok(hostRounds && stuRounds, '两端都要有 PBKDF2_ROUNDS 常量');
  ok(hostRounds[1] === stuRounds[1], '迭代次数不一致：老师端 ' + hostRounds[1] + ' / 学生端 ' + stuRounds[1]);
  ok(hostRounds[1] === '250000', '迭代次数应保持 250000，实际 ' + hostRounds[1]);

  const hostLen = html.match(/const PORTAL_CODE_LEN = (\d+)/);
  const stuLen = portal.match(/var CODE_LEN = (\d+)/);
  ok(hostLen[1] === stuLen[1], '码长度不一致：' + hostLen[1] + ' / ' + stuLen[1]);
  ok(hostLen[1] === '8', '码长度必须是 8（6 位配 250k 迭代单卡 6 分钟爆破）');

  /* 密钥材料归一化规则必须逐字等价：老师端 normalizePortalCode 与 学生端 normCode */
  const hostNorm = html.match(/toUpperCase\(\)\.replace\(\/\[\^0-9A-Z\]\/g, ''\)/);
  const stuNorm = portal.match(/toUpperCase\(\)\.replace\(\/\[\^0-9A-Z\]\/g, ''\)/);
  ok(hostNorm && stuNorm, '两端归一化正则必须一致');
  ok(sandbox.normalizePortalCode('abcd-efgh') === 'ABCDEFGH', '归一化应去掉横线并转大写');

  /* 两端都必须用 SHA-256 + AES-GCM 256 + 16 字节盐 + 12 字节 IV */
  [['老师端', html], ['学生端', portal]].forEach(([n, s]) => {
    has(s, "hash:'SHA-256'", n + ' 缺 SHA-256');
    has(s, 'length:256', n + ' 缺 AES-GCM 256');
    has(s, 'AES-GCM', n + ' 缺 AES-GCM');
  });
  ok((html.match(/getRandomValues\(new Uint8Array\(16\)\)/g) || []).length >= 1, '老师端盐应为 16 字节');
  ok((html.match(/getRandomValues\(new Uint8Array\(12\)\)/g) || []).length >= 1, '老师端 IV 应为 12 字节');
});

t('⑤ 明文块与信封结构齐整', () => {
  const out = sandbox.buildPortalPayload(mkState(), { fromTime: 0 });
  const d = out['S0001'];
  ['sid', 'name', 'credit', 'level', 'coins', 'weekNet', 'monthNet', 'ops'].forEach(k => {
    ok(Object.prototype.hasOwnProperty.call(d, k), '明文块缺字段 ' + k);
  });
  ok(typeof d.credit === 'number' && typeof d.weekNet === 'number' && typeof d.monthNet === 'number', '数值字段类型不对');
  ok(Array.isArray(d.ops), 'ops 应为数组');
  d.ops.forEach(o => {
    const ks = Object.keys(o).sort().join(',');
    ok(ks === 'amount,reason,time', '流水条目只应有 time/amount/reason，实际 ' + ks);
  });
  /* 信封形状（源码层面） */
  has(html, "v: 1,", '信封缺 v');
  has(html, "students: students", '信封缺 students');
  has(html, "scope: { fromTime:", '信封缺 scope');
});

t('⑥ 码：8 位 / 仅 32 字符集 / XXXX-XXXX / 不重复', () => {
  const set = {}, N = 800;
  for (let i = 0; i < N; i++) {
    const c = sandbox.genPortalCode();
    ok(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/.test(c), '码格式不对：' + c);
    const n = sandbox.normalizePortalCode(c);
    ok(n.length === 8, '去横线后应 8 位：' + c);
    ok(n.indexOf('0') < 0 && n.indexOf('1') < 0 && n.indexOf('I') < 0 && n.indexOf('O') < 0, '出现了易混字符 0/1/I/O：' + c);
    set[n] = (set[n] || 0) + 1;
  }
  const dup = Object.keys(set).filter(k => set[k] > 1);
  ok(dup.length === 0, N + ' 次生成出现重复码：' + dup.slice(0, 3).join(','));
});

t('⑦ 加解密回环 + 错码被拒 + 密文无明文残留', () => {
  /* 用真抽取的 normalizePortalCode + 与两端一致的算法跑一遍 */
  const subtle = webcrypto.subtle;
  const ROUNDS = Number(html.match(/const PBKDF2_ROUNDS = (\d+)/)[1]);
  const b64enc = b => { const u = new Uint8Array(b); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return Buffer.from(s, 'latin1').toString('base64'); };
  const b64dec = s => new Uint8Array(Buffer.from(s, 'base64'));
  const derive = (material, salt) => subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveKey'])
    .then(base => subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));

  const plain = sandbox.buildPortalPayload(mkState(), { fromTime: 0 })['S0001'];
  const code = 'ABCD-EFGH';
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  const done = (async () => {
    const key = await derive(sandbox.normalizePortalCode(code), salt);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(plain)));
    const blk = { salt: b64enc(salt), iv: b64enc(iv), data: b64enc(ct) };

    /* 学生端：同一套规则、且码是小写带横线也必须能解开 */
    const key2 = await derive(sandbox.normalizePortalCode('abcd-efgh'), b64dec(blk.salt));
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64dec(blk.iv) }, key2, b64dec(blk.data));
    ok(JSON.stringify(JSON.parse(new TextDecoder().decode(pt))) === JSON.stringify(plain), '回环内容不一致');

    let wrongOpened = false;
    try {
      const k3 = await derive(sandbox.normalizePortalCode('ZZZZ-ZZZZ'), b64dec(blk.salt));
      await subtle.decrypt({ name: 'AES-GCM', iv: b64dec(blk.iv) }, k3, b64dec(blk.data));
      wrongOpened = true;
    } catch (e) { /* 预期抛错 */ }
    ok(!wrongOpened, '错码竟然解开了！');

    const raw = Buffer.from(b64dec(blk.data)).toString('latin1');
    ['张小明', '课堂发言', 'credit', 'amount', 'reason'].forEach(v => {
      ok(raw.indexOf(v) < 0, '密文里残留明文 ' + v);
    });
    return true;
  })();

  /* t() 是同步的，这里用「必然成功」的占位断言 + 异步回执 */
  ok(done && typeof done.then === 'function', '异步回环未启动');
  global.__portalLoop = done;
});

t('⑧ 没配 Token 时必须拦下，且校验在推送之前', () => {
  const errs = validateFn(mkState());
  ok(errs.length > 0, '未配置 Token 却没报错');
  ok(errs.some(e => e.indexOf('Token') >= 0), '错误信息没提到 Token：' + errs.join(' / '));

  /* 学号缺失/重复也要拦 */
  const st2 = mkState();
  st2.students[2].sid = 'S0001';           // 与第 1 人重复
  const errs2 = validateFn(st2);
  ok(errs2.some(e => e.indexOf('学号重复') >= 0), '学号重复未被拦下：' + errs2.join(' / '));

  /* publishPortal：portalValidate 必须在 sealPortalBlock 之前，seal 必须在 doPushPortal 之前 */
  const body = extractFn(html, 'publishPortal');
  const iValidate = body.indexOf('portalValidate(');
  const iSeal = body.indexOf('sealPortalBlock(');
  const iPush = body.indexOf('doPushPortal(');
  ok(iValidate >= 0 && iSeal > iValidate, '校验必须在加密之前（否则校验失败也会先做一次无谓加密）');
  ok(iPush > iSeal, '推送必须在加密之后');
  /* 体积上限必须在推送之前比较 */
  ok(body.indexOf('PORTAL_MAX_BYTES') >= 0 && body.indexOf('PORTAL_MAX_BYTES') < iPush, '体积上限检查必须在推送之前');
  notHas(body, "method: 'PUT'", '不得用 PUT 写 Gist（与数据仓唯一 PUT 入口隔离）');
});

t('⑨ 载体隔离：Gist 用 POST/PATCH + 独立 Token，不碰站仓', () => {
  const push = extractFn(html, 'doPushPortal');
  has(push, "method: isUpdate ? 'PATCH' : 'POST'", 'Gist 写入应走 POST/PATCH');
  has(push, 'api.github.com/gists', '应写 Gist API');
  notHas(push, 'GH_REPO', '不得引用数据仓常量');
  notHas(push, 'GH_DATA_PATH', '不得引用数据仓路径');
  ok(push.indexOf('getSyncPwd') < 0, '绝不能复用同步口令！');
  /* 老师端整块都不许拿同步口令做学生端加密。
     锚点必须用块注释开头——只写「学生查询端（v3.7.0）」会先命中设置页速览条目，
     一剪就剪到整份应用，断言立刻假失败（本文件踩过一次）。 */
  const blkHead = html.indexOf('/* ==================== 学生查询端（v3.7.0）');
  const blkTail = html.indexOf('// v2.20.0 学分周报：');
  ok(blkHead > 0 && blkTail > blkHead, '找不到学生查询端代码块边界');
  const blk = html.slice(blkHead, blkTail);
  notHas(blk, 'getSyncPwd()', '学生查询端不得使用同步口令派生密钥');
  notHas(blk, 'encryptForCloud', '学生查询端不得复用云端加密信封');
});

t('⑩ 学生端：只解自己那片 + 输入全转义 + 关键错误态齐备', () => {
  ok(portal.indexOf('students[sid]') >= 0, '学生端应按学号取自己那一片');
  notHas(portal, 'Object.keys(p.students)', '学生端不得遍历全部学生（那等于给了批量解的入口）');
  has(portal, 'function esc(', '必须有转义函数');
  has(portal, "replace(/[&<>\"']/g", '转义必须覆盖五个字符');
  /* 流水原因、姓名、学号、等级全是老师录入的自由文本，必须逐个过 esc 再拼进 innerHTML */
  ['esc(o.reason', 'esc(data.name', 'esc(data.sid', 'esc(data.level', 'esc(dk)'].forEach(k => {
    has(portal, k, '缺转义：' + k);
  });
  ['学号未找到', '查询码不正确', '查询服务未开放'].forEach(k => has(portal, k, '缺错误态：' + k));
  has(portal, 'FAIL_MAX', '缺软限速');
  /* 班级名走 textContent（不经 HTML 解析），是 esc 之外的第二条安全路径 */
  has(portal, "$('clsName').textContent", '班级名必须用 textContent 赋值');
});

t('⑪ 发布内容不含「可批量解密」的入口', () => {
  /* 信封里每块都是独立 salt+iv，不存在共用盐 —— 共用盐会让一把钥匙开全班 */
  const seal = extractFn(html, 'sealPortalBlock');
  has(seal, 'getRandomValues(new Uint8Array(16))', '盐必须每块新生成');
  has(seal, 'getRandomValues(new Uint8Array(12))', 'IV 必须每块新生成');
  ok(seal.indexOf('portalDeriveKey(code') >= 0, '密钥材料应来自该生自己的码');
});

t('⑫ SW 不得缓存学生端与 Gist（否则重新发布后学生永远看旧数据）', () => {
  has(sw, 'gist.githubusercontent.com', 'SW 必须放行 Gist 域名');
  has(sw, "'/portal/'", 'SW 必须放行 portal 目录');
  /* 放行判定必须在「缓存优先」那个兜底 respondWith 之前 */
  const iSkip = sw.indexOf("indexOf('/portal/')");
  const iFallback = sw.indexOf('// 静态资源：缓存优先');
  ok(iSkip >= 0 && iFallback > iSkip, 'portal 放行必须写在缓存优先兜底之前');
});

t('⑬ 版本一致性（一律从 CACHE_NAME 反推，不写死）', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  ok(m, 'sw.js 缺 CACHE_NAME');
  const v = m[1];
  const login = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  const side = html.match(/<div class="sidebar-footer">(v[0-9.]+) · 班主任工作台<\/div>/);
  const badge = html.match(/🏷️ (v[0-9.]+)<\/span>/);
  ok(login && login[1] === v, '登录页版本 ' + (login && login[1]) + ' ≠ CACHE ' + v);
  ok(side && side[1] === v, '侧栏版本 ' + (side && side[1]) + ' ≠ CACHE ' + v);
  ok(badge && badge[1] === v, '设置页徽标 ' + (badge && badge[1]) + ' ≠ CACHE ' + v);
  /* v3.7.0 起本模块自带速览条目 */
  has(html, '学生查询端', '速览应有学生查询端条目');
});

/* ---------- 等异步回环结论后再出总账 ---------- */
const loop = global.__portalLoop;
Promise.resolve(loop).then(() => {
  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log(`结果：${pass} 通过，${fail} 失败`);
  if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
}).catch(e => {
  console.log('  ❌ ⑦ 加解密回环 —', e.message);
  fail++; failures.push('⑦ 加解密回环 — ' + e.message);
  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log(`结果：${pass} 通过，${fail} 失败`);
  failures.forEach(f => console.log('  · ' + f));
  process.exit(1);
});
