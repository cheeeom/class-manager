/* v3.7.6 回归测试：B 二维码卡 + C 查询页「记住我」
   B：老师端「🪪 二维码卡」导出——每生一张（姓名/学号/查询码/直达二维码），QR 内容 =
   学生入口链接 + &s=学号&c=码（扫码自动填充直接查询）；复用 portal/qrcode.js 懒加载；
   需先发布（用 portalStudentUrl）。
   C：学生页「记住我」勾选→成功后存本机（明文学号+码，RM_KEY）；横幅一键进入/清除；
   直达参数 s/c 自动填充 + 自动查询。公共设备不勾不存（默认不勾）。
   运行：node _v376_test.js */
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
function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不该出现 ' + JSON.stringify(k)); }

t('① B：二维码卡导出（老师端）', () => {
  has(html, 'function exportPortalQrCards()', '导出函数');
  has(html, "onclick=\"exportPortalQrCards()\">🪪 二维码卡</button>' +", '面板按钮');
  has(html, "sc.src = './portal/qrcode.js';", '复用 portal QR 库懒加载');
  has(html, "'&s=' + encodeURIComponent(sid) + '&c=' + encodeURIComponent(normalizePortalCode(code))", 'QR 内容含 s/c 参数');
  has(html, '请先「发布」——二维码卡需要学生入口链接', '未发布拦截');
  has(html, 'window.print()', '打印按钮');
  has(html, 'break-inside:avoid;page-break-inside:avoid', '卡片不跨页');
  // v3.9.2 修 bug：导出整版原先根本没加载 qrcode.js，卡片静默缺图 —— 两条路径必须共用懒加载
  has(html, 'function cmLoadQrLib(ok, fail){', '共用 QR 库懒加载（单一入口）');
  has(html, 'cmLoadQrLib(function(){\n    openPortalPrint(portalCardsHtml(studs));', '导出整版走懒加载后再建卡');
  has(html, 'cmLoadQrLib(run, function()', '补印单张同款懒加载');
  notHas(html, '}catch(e){}\n      return \'<div class="pcard">\'', '构造二维码不得空捕获');
});

t('② C：学生页记住我 + 直达参数', () => {
  has(portal, "var RM_KEY = 'cm_portal_remember';", '存储键');
  has(portal, 'function readRemember()', '读');
  has(portal, 'function saveRemember(sid, code)', '存');
  has(portal, "id=\"rmChk\"", '勾选框');
  has(portal, '公共设备请勿勾选', '公共设备警示');
  has(portal, "if($('rmChk') && $('rmChk').checked) saveRemember(sid, code)", '成功后按勾选保存');
  has(portal, 'window.useRemember', '一键进入');
  has(portal, 'window.forgetRemember', '清除');
  has(portal, 'id="rmBanner"', '横幅');
  has(portal, 'renderRememberBanner();', 'init 渲染横幅');
  has(portal, 'if(!_data) return;   // v3.8.1 防御：查询未成功前不可操作', '加购防御');
  has(portal, "var PSID = qsp('s');", '直达参数 s');
  has(portal, "var PCODE = qsp('c');", '直达参数 c');
  has(portal, 'setTimeout(submit, 150)', '参数齐→自动查询');
  has(portal, 'renderRememberBanner();\n    if(PSID && PCODE){', 'init 顺序：横幅→参数');
  // 默认不勾（公共设备不存）
  ok(/id="rmChk"\s*>/.test(portal.replace('<input type="checkbox" id="rmChk"', '<input type="checkbox" id="rmChk">')), 'checkbox 无 checked 默认');
});

t('③ v3.7.0 守卫锚点仍全（学生页未破坏既有契约）', () => {
  has(portal, 'students[sid]', '按学号取片');
  notHas(portal, 'Object.keys(p.students)', '不得遍历');
  has(portal, 'FAIL_MAX', '软限速');
  ['学号未找到', '查询码不正确', '查询服务未开放'].forEach(k => has(portal, k, '错误态'));
  has(portal, 'PBKDF2_ROUNDS = 30000', '派生轮数（v3.7.9 起动态跟随，勿写死数值）');
});

t('④ 版本一致性（动态跟版）+ 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（从 CACHE 反推）');
  has(html, '二维码卡 + 记住我（v3.7.6）', '速览历史条目（v3.7.6）仍在');
  has(sw, './portal/qrcode.js', 'QR 库仍在离线清单');
});

function notHas(s, k, msg) { if (s.indexOf(k) >= 0) throw new Error((msg || '') + ' 不应出现 ' + JSON.stringify(k)); }

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
