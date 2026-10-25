/* v3.7.8 回归测试：查询提速 4 倍——PBKDF2 轮数 250k→60k（两端同步）+ 缓存代次校验 + TTL 30min
   背景：老板真机扫码查询 10-20s——主因是手机 WebCrypto PBKDF2-250k 每生派生。
   安全账：码空间 32^8≈1.1e12，RTX4090 @60k ≈ 250 次/秒 → 全空间约 140 年，离线爆破仍不可行。
   必改点：两端轮数同步（守卫钉死）；缓存校验加 payload.alg 代次比对（防改轮数后
   「本机旧代次包 + 新页」组合静默报「码不正确」）；TTL 10→30min（上课扫码全程走缓存）。
   运行：node _v378_test.js */
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

t('① 两端轮数 60000 同步 + 250000 绝迹', () => {
  has(html, 'const PBKDF2_ROUNDS = 30000;', '老师端 30k（v3.7.9 再降半）');
  has(portal, 'var PBKDF2_ROUNDS = 30000;', '学生端 30k');
  notHas(html, 'PBKDF2_ROUNDS = 250000', '老师端旧轮数');
  notHas(portal, 'PBKDF2_ROUNDS = 250000', '学生端旧轮数');
  has(portal, "var ALG_LABEL = 'PBKDF2-SHA256(30000)/AES-GCM-256';", '学生端 ALG 30k');
  has(html, "alg: 'PBKDF2-SHA256(' + PBKDF2_ROUNDS + ')/AES-GCM-256'", '老师端 alg 动态拼（随轮数）');
  notHas(html.match(/const PBKDF2_ROUNDS[\s\S]{0,200}/)[0].replace('const PBKDF2_ROUNDS = 60000;', ''), '250000', '轮数注释残留检查');
});

t('② 缓存代次校验 + TTL 30min + 错码刷新指引', () => {
  has(portal, "(!c.payload.alg || c.payload.alg === ALG_LABEL)", '缓存 alg 代次比对');
  has(portal, '算法代次不匹配的旧缓存包作废重拉', '校验注释');
  has(portal, 'var CACHE_TTL_MS = 30 * 60 * 1000;', 'TTL 30 分钟');
  has(portal, '（若班主任刚更新过系统，请先刷新页面再试）', '错码刷新指引');
});

t('③ 既有契约抽检（学生页核心路径未动）+ 版本 v3.7.8', () => {
  has(portal, 'students[sid]', '按学号取片');
  has(portal, 'students[sid]', '锚点');
  has(portal, 'FAIL_MAX', '软限速');
  has(portal, 'redeemCanonical', '兑换凭据');
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（动态跟版）');
  has(html, '查询提速 4 倍（v3.7.8）', '速览历史条目（v3.7.8）仍在');
  ok(html.includes('改完请点「重新发布」才生效'), '速览含重新发布提醒');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
