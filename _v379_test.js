/* v3.7.9 回归测试：查询再提速至 1-2 秒——轮数 60k→30k + 一次派生两用（AES/HMAC 分段）
   安全账：32^8≈1.1e12 @30k 全空间约 2.6 年（均摊 1.3 年/人）。
   结构：PBKDF2 deriveBits 512 → 前 32B AES-GCM 解密钥（与旧方案逐位一致，兼容已发布数据）
   + 后 32B HMAC-SHA256 兑换签名钥（位段变更 → 新旧凭据不兼容，10 分钟时效内自洽）。
   学生端 makeQr 复用会话派生（出兑换码零等待）；老师端验签派生同位段对齐。
   运行：node _v379_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const portal = fs.readFileSync(__dirname + '/portal/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

t('① 两端轮数 30000 + 60k/250k 绝迹（代码处）', () => {
  has(html, 'const PBKDF2_ROUNDS = 30000;', '老师端 30k');
  has(portal, 'var PBKDF2_ROUNDS = 30000;', '学生端 30k');
  notHas(html, 'PBKDF2_ROUNDS = 60000', '老师端 60k 残留');
  notHas(portal, 'PBKDF2_ROUNDS = 60000', '学生端 60k 残留');
  notHas(portal, 'PBKDF2_ROUNDS = 250000', '250k 残留');
  has(portal, "var ALG_LABEL = 'PBKDF2-SHA256(30000)/AES-GCM-256';", 'ALG 30k');
});

t('② 一次派生两用：512 位分段（AES 前 32B / HMAC 后 32B）', () => {
  has(portal, 'function deriveSessionKeys(code, salt)', '统一派生');
  has(portal, "deriveBits(\n          { name:'PBKDF2', salt:salt, iterations:PBKDF2_ROUNDS, hash:'SHA-256' },\n          base, 512\n        )", '512 位派生');
  has(portal, "new Uint8Array(bits, 0, 32), { name:'AES-GCM' }", '前 32B AES');
  has(portal, "new Uint8Array(bits, 32, 32), { name:'HMAC', hash:'SHA-256' }", '后 32B HMAC');
  has(portal, 'AES 密钥材料与旧方案逐位一致', '兼容注释');
  has(portal, 'var _keys = null;', '会话派生缓存');
  has(portal, '_keys.saltB64 === blk.salt', 'openBlock 复用判定');
  notHas(portal, 'function redeemHmacKey', '旧独立 HMAC 派生已删');
  has(portal, 'Promise.resolve(_keys.hmacKey)', 'makeQr 用现成 hmacKey');
  has(portal, "if(!_keys || _keys.saltB64 !== _blkSalt){ alert('会话已过期，请返回重新查询'); return; }", '会话过期守卫');
});

t('③ 老师端验签位段对齐 + 核销链路完整', () => {
  has(html, 'deriveBits 512 取后 32B 作 HMAC（前 32B 是 AES 解密钥）', '对齐注释');
  has(html, "new Uint8Array(bits, 32, 32), { name:'HMAC', hash:'SHA-256' }, false, ['verify']", '验签 HMAC 后 32B');
  has(html, "['verify']", 'verify 权限');
  has(html, 'portalVerifyRedeem(raw)', '验签入口仍在');
  has(html, 'cbRedeem(v.student.id, x.it.key)', '入账仍走 cbRedeem');
});

t('④ 版本一致性（动态跟版）+ 速览条目 + 重新发布提醒', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（从 CACHE 反推）');
  has(html, '查询再提速至 1-2 秒（v3.7.9）', '速览历史条目（v3.7.9）仍在');
  has(html, '请再点一次「重新发布」', '重新发布提醒');
  has(portal, 'PBKDF2 30000', 'portal 头注释跟版');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
