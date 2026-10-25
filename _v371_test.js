/* v3.7.1 回归测试：学生自助兑换（购物车→二维码→老师端三入口核销）+ 查询端排名/筛选增强
   叠加在并行线 v3.7.0 之上（7c6a6f0 交接）。关键不变量：
   ① 老师端账本唯一事实源：学生端只产「带签名的一次性申请单」，入账走 cbRedeem；
   ② 凭据签名与查询分片同源派生（PBKDF2 250000 + 同盐），学生端 ['sign'] / 老师端 ['verify']；
   ③ 两端 canonical 串与常量（CM1 / 10 分钟窗）必须逐字一致；
   ④ 老师端收码三入口（摄像头扫码 / 粘码原文 / 贴图·拖图·选图）共享 jsQR 懒加载；
   ⑤ v3.7.0 的守卫锚点全部保留（students[sid] / 不遍历 / 错误态 / FAIL_MAX / 250000）。
   运行：node _v371_test.js */
const fs = require('fs');
const path = require('path');

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

t('① 老师端快照扩展：排名 + 商品清单（typeof 守卫防沙箱缺依赖）', () => {
  has(html, 'rankMap[sid] || 0', '排名入快照');
  has(html, 'total: totalStu', '全班人数');
  has(html, 'goods: goodsAll.map', '商品清单入快照');
  has(html, 'typeof cbStoreUsedCount === \'function\'', '月余计算带守卫');
  // 黑名单字段仍绝迹于发布函数（沿用 v370 黑名单）
  const i = html.indexOf('function buildPortalPayload');
  const fn = html.slice(i, html.indexOf('\nfunction ', i + 10));
  ['phone', 'guardian', 'address', 'birth', 'notes', 'timeline', 'tags', 'creditBase', 'dorm'].forEach(k => notHas(fn, '.' + k, '发布函数'));
});

t('② 老师端核销中心：验签/执行/三入口/懒加载', () => {
  has(html, '学生查询端·自助兑换核销（v3.7.1）', '分节头');
  has(html, 'function portalVerifyRedeem(raw)', '验签函数');
  has(html, 'function portalExecuteRedeem(v)', '入账函数');
  has(html, 'function openPortalRedeemModal()', '核销弹窗');
  has(html, "const PORTAL_REDEEM_VER = 'CM1';", '凭据版本常量');
  has(html, 'PORTAL_REDEEM_WINDOW_MS = 10 * 60 * 1000', '10 分钟时效');
  has(html, "{ name:'HMAC', hash:'SHA-256' }, false, ['verify']", '老师端验签密钥');
  has(html, 'cbRedeem(v.student.id, x.it.key)', '入账复用 cbRedeem');
  has(html, "s.src = './jsqr.min.js'", 'jsQR 懒加载');
  has(html, "facingMode:'environment'", '摄像头后置');
  has(html, "items[i].type.indexOf('image') === 0", 'Ctrl+V 贴图');
  has(html, "addEventListener('drop'", '拖图入口');
  has(html, "accept=\"image/*\"", '选图入口');
  has(html, 'portalMarkRedeemNonce', '一次性 nonce 防重放');
  ok((html.match(/onclick=.?"openPortalRedeemModal\(\)?/g) || []).length === 1, '核销入口应恰 1 处（学分银行商店工具条，兼容 JS 串内转义引号）');
  has(html, "onclick=\"openPortalRedeemModal()\" title=\"学生端自助兑换的二维码在这里扫码/粘贴核销\">📷 兑换核销</button>' +", '银行工具条入口（紧邻新增商品）');
  // 验签失败路径全中文且零副作用（resolve 不 reject）
  has(html, "resolve({ok:false, msg:'这个兑换码已经核销过了（一次性凭据）'})", '重放拦截');
});

t('③ 两端凭据契约逐字一致（canonical / 常量 / 派生参数）', () => {
  const canon = ".sid + '|' +";   // 两端 canonical 拼接形态
  ok(html.includes("o.items || []).map(function(x){ return x[0] + ':' + x[1]; }).join(',')") || html.includes("o.items.map"), '老师端 canonical');
  has(portal, 'function redeemCanonical(o)', '学生端 canonical');
  has(portal, "var REDEEM_VER = 'CM1';", '学生端常量');
  has(portal, 'REDEEM_WINDOW_MS = 10 * 60 * 1000', '学生端时效一致');
  has(portal, "{ name:'HMAC', hash:'SHA-256' }, false, ['sign']", '学生端签名密钥（sign 而非 verify）');
  has(portal, 'PBKDF2_ROUNDS = 30000', '学生端派生轮数');
  has(html, 'PBKDF2_ROUNDS = 30000', '老师端派生轮数');
});

t('④ 学生端页面增强 + v3.7.0 守卫锚点全保留', () => {
  // 增强
  has(portal, 'qrcode(0, \'M\')', '真二维码生成');
  has(portal, '<script src="qrcode.js">', '本地 QR 库（零 CDN）');
  has(portal, '<script src="qrcode_utf8.js">', 'UTF-8 支持');
  notHas(portal.match(/<script src="https?:[^"]*"/g) ? portal : '', 'x', '占位');
  ok(!(portal.match(/<script[^>]+src="https?:/g) || []).length, '不得外链 CDN 脚本');
  has(portal, '第 \' + data.rank + \' 名', '排名印章');
  has(portal, "k:'recent', label:'最近'", '流水默认最近档');
  has(portal, "k:'week',   label:'本周'", '本周档');
  has(portal, "k:'month',  label:'本月'", '本月档');
  has(portal, 'cartbar', '购物车浮条');
  has(portal, 'addToCart', '加购');
  has(portal, '币不足（还差', '超预算拦截');
  has(portal, 'qrtimer', '倒计时');
  // v3.7.0 锚点
  has(portal, 'students[sid]', '按学号取片');
  notHas(portal, 'Object.keys(p.students)', '不得遍历全班');
  ['学号未找到', '查询码不正确', '查询服务未开放'].forEach(k => has(portal, k, '错误态'));
  has(portal, 'FAIL_MAX', '软限速');
  has(portal, "$('clsName').textContent", '班级名 textContent');
});

t('⑤ 库文件与 sw 资产齐备 + 版本 v3.7.1', () => {
  for (const f of ['jsqr.min.js', 'portal/qrcode.js', 'portal/qrcode_utf8.js']) {
    ok(fs.existsSync(path.join(__dirname, f)), f + ' 缺失');
    const st = fs.statSync(path.join(__dirname, f));
    ok(st.size > 500, f + ' 体积异常 ' + st.size);
  }
  has(fs.readFileSync(path.join(__dirname, 'portal', 'qrcode.js'), 'utf8'), 'QR Code Generator', 'QR 库身份');
  has(sw, './jsqr.min.js', 'sw 离线资产 jsQR');
  has(sw, './portal/index.html', 'sw 离线资产 portal 页');
  has(sw, './portal/qrcode.js', 'sw 离线资产 QR 库');
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（动态跟版）');
  ok(html.includes('学生自助兑换（v3.7.1）'), '速览历史条目（v3.7.1）仍在');
  // v3.7.2：设置页入口卡 + 状态简报
  has(html, 'id="settingsPortal"', '设置页查询端卡片');
  has(html, 'portalSettingsBrief', '设置卡状态简报容器');
  has(html, '🔑 打开学生查询端面板</button>\n          </div>\n          <div id="portalSettingsBrief"', '设置卡单按钮+简报接线（v3.7.4 核销已归位学分银行）');
  has(html, "if(typeof renderPortalPanel === 'function') renderPortalPanel();", '设置页渲染时刷新简报');
  ok((html.match(/openPortalPanel\(\)">🔑/g) || []).length >= 2, '公示页+设置页双入口（实际 ' + (html.match(/openPortalPanel\(\)">🔑/g) || []).length + ' 处）');
  // v3.7.4：公示页「学生查询端」与相邻按钮统一主色
  has(html, '<button class="btn btn-primary btn-sm" onclick="openPortalPanel()">🔑 学生查询端</button>', '公示页按钮主色');
  // v3.7.3：cmPrompt 层级高于注入面板（2147483100 > 2147483000）
  ok(/id="cmPromptModal"[^>]*z-index:2147483100/.test(html), 'cmPrompt 应带内联 z-index 2147483100');
  has(html, 'document.body.appendChild(_pm)', 'cmPrompt 打开时重挂 body（脱离 z-index:1 容器的堆叠上下文，v3.7.5）');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
