/* v2.17.30 回归测试：兑换商店学生选择器改造（无默认 + 点选候选名单）+ 学分操作「按寝室加减分」
   运行：node _v2181_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function extractFn(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return eval('(' + buf.join('\n') + ')');
}
const DORM_RE = /^\d+栋-?\d+室$/;
var state = { students: [] };
function normalizeDormTag(t){ return t; }
function isDormTag(t){ return typeof t === 'string' && DORM_RE.test(normalizeDormTag(t)); }
function dormNoOf(s){ var tags = (s && s.tags) || []; for (var i = 0; i < tags.length; i++){ if (isDormTag(tags[i])) return normalizeDormTag(tags[i]); } return ''; }
const dormRoomMap = extractFn('dormRoomMap');
const dormRoomSort = extractFn('dormRoomSort');

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.10（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.10</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.10 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.10')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== ① 兑换商店：无默认选中 + 点搜索框出候选名单 ===');
t('不再默认选中第一个学生（cbStoreSid 空起步，仅清无效残留）', () => {
  ok(/var cbStoreSid = '';/.test(html), '缺空默认');
  has(html, "if(cbStoreSid && !studs.some(function(x){ return String(x.id) === cbStoreSid; })) cbStoreSid = '';", '应为「有残留才清」，不得回填第一个');
});
t('未选学生时显示引导提示、不显示默认姓名', () => {
  has(html, '👆 点搜索框选择要兑换的学生', '缺未选引导');
  has(html, 'id="cbStoreSearch"', '缺搜索框');
  has(html, 'placeholder="点我选学生：姓名 / 学号 实时筛选…"', '缺新占位文案');
  has(html, "(selS ? cbEsc(selS.name) : '')", '值应为选中才回填（默认空）');
});
t('点搜索框（focus）→ 全体候选；输入实时筛选；回车选第一个', () => {
  has(html, 'onfocus="cbStoreFocus(this)"', '缺 focus 展开处理');
  has(html, 'onblur="setTimeout', '缺 blur 收起');
  has(html, ': cands.slice(0, 60);', '空关键词应列全体候选');
  has(html, 'function cbStoreFocus(el)', '缺 cbStoreFocus');
  has(html, "if(s && el.value === s.name) el.value = '';", 'focus 时应先清掉已选名字再列全体');
  has(html, 'cbStoreSearchKey(event)', '回车逻辑保留');
});
t('选中后可清除回未选态（✕ 清除按钮 + cbStoreClearSid）', () => {
  has(html, '✕ 清除', '缺清除按钮');
  has(html, 'cbStoreClearSid()', '缺清除入口');
  has(html, 'function cbStoreClearSid(){', '缺清除函数');
});
t('未选学生时兑换按钮禁用并提示「请先在上方选择学生」', () => {
  has(html, 'var can = !!selS && selCoin >= cost && remain > 0;', '缺未选锁定');
  has(html, "(!selS ? '请先在上方选择学生' : '币不足')", '缺禁用原因文案');
});
t('余额/档案只在选中后展示（selS 判空）', () => {
  has(html, "var selS = cbStoreSid ? studs.find(function(x){ return String(x.id) === cbStoreSid; }) : null;", '未选=null');
  has(html, "var selCoin = selS ? (coin[cbWalletKey(cbStoreSid)] || 0) : 0;", '未选币=0');
});

console.log('\n=== ② 学分操作：按寝室加减分 ===');
t('入口按钮在学分操作区（🏠 按寝室加减分）', () => {
  has(html, 'onclick="openDormCredit()">🏠 按寝室加减分</button>', '缺入口按钮');
});
t('弹窗 #dormCreditModal：寝室列表/原因选择器/分值/确认 字段齐', () => {
  const m = html.match(/<div class="modal-overlay" id="dormCreditModal">[\s\S]*?\n<\/div>\n\n/);
  ok(m, '未找到 dormCreditModal');
  has(m[0], 'id="dormCreditList"'); has(m[0], 'id="dormCreditRoomLbl"'); has(m[0], 'id="dormCreditMembers"');
  has(m[0], 'id="rp-dorm"'); has(m[0], 'id="dormReason"'); has(m[0], 'id="dormScore"');
  has(m[0], 'id="dormCreditApplyBtn"'); has(m[0], 'onclick="dormCreditConfirm()"');
});
t('dormReason 已接入原因选择器体系（选项渲染 + rp 实例 + 分值联动）', () => {
  has(html, "'creditReason','batchReason','dormReason'", '缺 dormReason 进 selects 列表');
  has(html, "initReasonPicker('rp-dorm', 'dormReason', 'dormScore')", '缺 rp-dorm 实例');
});
t('寝室成员派生纯逻辑：dormRoomMap 只收有寝室标签的学生、按房间分组', () => {
  state.students = [
    { id: 1, name: '甲', tags: ['6栋-801室'] },
    { id: 2, name: '乙', tags: ['6栋-801室'] },
    { id: 3, name: '丙', tags: ['6栋-802室'] },
    { id: 4, name: '丁', tags: ['走读'] },
    { id: 5, name: '戊', tags: [] }
  ];
  const m = dormRoomMap();
  const rooms = Object.keys(m).sort(dormRoomSort);
  ok(rooms.length === 2 && rooms[0] === '6栋-801室' && rooms[1] === '6栋-802室', '房间数/排序错误：' + rooms.join(','));
  ok(m['6栋-801室'].length === 2 && m['6栋-802室'].length === 1, '成员分组错误');
  ok(!m['走读'] && !m[''], '无寝室标签者不应入组');
});
t('确认加分走统一学分入口：applyCreditDelta 逐人 + saveData + refreshCreditViews', () => {
  const fn = html.match(/function dormCreditConfirm\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, 'applyCreditDelta(s, amount, reason)', '未走统一入口');
  has(fn, 'refreshCreditViews()', '缺全视图刷新');
  has(fn, 'cmMinusBlocked()', '扣分需过班委开关');
  const ren = html.match(/function dormCreditRenderSel\(\)\{[\s\S]*?\n\}/)[0];
  has(ren, '每人一条独立流水，可单独撤销', '选寝室实时预览缺独立流水提示');
});
t('选寝室后才可确认（确认钮联动）；再点一次取消选中；选中高亮边框', () => {
  has(html, "btn.disabled = !_dormCreditRoom;", '确认钮未联动');
  has(html, "_dormCreditRoom = (_dormCreditRoom === room) ? '' : room;", '缺再点取消');
  has(html, "(_dormCreditRoom === r ? 'var(--primary)' : 'var(--border)')", '缺选中高亮');
});
t('无寝室学生时给出引导（去学生管理加寝室标签）', () => {
  has(html, '还没有任何学生挂了寝室标签', '缺空态文案');
  has(html, '去「学生管理」', '缺引导指向');
});

console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
