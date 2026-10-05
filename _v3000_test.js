// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
const V = (function () {
  try {
    var m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(require('fs').readFileSync(require('path').join(__dirname, 'sw.js'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
if (!V) throw new Error('[版本无关化] 未能从 sw.js 反推版本号（CACHE_NAME 缺失或路径不对）');
const VR = V.replace(/\./g, '\\.');
/* 本版 回归测试：关闭/协作/档案/德育/留痕/请假墓碑六大件 ——
 * ① 请假删除墓碑（bug#7：本地删掉后刷新/拉取又复活 —— 根因 msLeaves 按 id 并集无墓碑）
 * ② 删学生自动清请假记录（两条删除路径 + 墓碑）
 * ③ 班委协作收紧：仅班长/副班长/纪律委员；课表只读；请假页只读（白名单含 attendance）
 * ④ 登录密码仅限本机：pwdDeviceLock（at 新者胜）+ cmDeviceId + 管理员密码授权闸
 * ⑤ 底部导航 待办→请假；档案详情右上角关闭；德育记录默认折叠 20 条 + 本月筛选；工作留痕配图
 * 运行：node _v3000_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }
function notHas(a, b, msg) { if (a.indexOf(b) >= 0) throw new Error((msg || '') + `不应出现 ${JSON.stringify(b)}`); }

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
  return buf.join('\n');
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== ① 请假删除墓碑（bug#7）===');
eval(html.slice(html.indexOf('function msStudents'), html.indexOf('/* MERGE_ENGINE_END')));
global.mergeTsMap = eval('(' + extractFn('mergeTsMap') + ')');
const msLeavesSrc = extractFn('msLeaves');
t('msLeaves 已墓碑化：并集跳过墓碑 + 双向防御剔除', () => {
  has(msLeavesSrc, 'merged.leaveDeleted = mergeTsMap(', '墓碑并集缺失');
  has(msLeavesSrc, 'if(_lvDel[rl.id]) return;', '云端副本跳过墓碑缺失');
  has(msLeavesSrc, '!_lvDel[l.id]', '双向防御剔除缺失');
});
t('★ 复活场景：本机已删（墓碑）+ 云端旧副本仍有 → 合并后不复活', () => {
  const local = { leaves: [], leaveDeleted: { 7: 1700000000000 } };
  const remote = { leaves: [{ id: 7, studentId: 3, type: 'sick', createdAt: '2026-01-01' }], leaveDeleted: {} };
  const merged = JSON.parse(JSON.stringify(local));   // 与 smartMergeData 同构：merged 以本机为底
  MERGE_ST.leaves(merged, local, remote);
  eq(merged.leaves.length, 0, '★ 已删请假复活了！');
  eq(merged.leaveDeleted[7], 1700000000000, '墓碑应保留');
});
t('正常合并不受影响：云端独有请假照常并入；无墓碑时行为与旧版一致', () => {
  const local = { leaves: [{ id: 1, createdAt: '2026-01-01' }] };
  const remote = { leaves: [{ id: 1, createdAt: '2026-01-01' }, { id: 2, createdAt: '2026-02-02' }] };
  const merged = JSON.parse(JSON.stringify(local));
  MERGE_ST.leaves(merged, local, remote);
  eq(merged.leaves.length, 2, '两条都在');
  eq(merged.leaveDeleted && Object.keys(merged.leaveDeleted).length, 0, '无墓碑产生');
});
t('deleteLeave：写墓碑 + 过滤 + 班委拦截', () => {
  const src = extractFn('deleteLeave');
  has(src, 'state.leaveDeleted[id] = Date.now();', '删除未写墓碑');
  has(src, "window.__cmRole === 'committee'", '缺班委只读拦截');
  const st = { leaves: [{ id: 9, studentId: 1 }], leaveDeleted: {} };
  new Function('state', 'confirm', 'saveData', 'renderAttendance', 'showToast', 'window',
    extractFn('deleteLeave') + '\nreturn deleteLeave;')(st, () => true, () => {}, () => {}, () => {}, { __cmRole: null })(9);
  eq(st.leaves.length, 0, '记录未移除');
  if (!st.leaveDeleted[9]) throw new Error('删除未写墓碑');
});
t('STATE_SCHEMA：leaveDeleted 墓碑字段在 leaves 附近', () => {
  const i = html.indexOf("key:'leaves'");
  const k = html.indexOf("key:'nextLeaveId'");
  const j = html.indexOf("key:'leaveDeleted'");
  if(!(i > 0 && k > i && j > k)) throw new Error('schema 顺序应为 leaves → nextLeaveId → leaveDeleted');
  has(html.slice(j, j + 120), 'tomb:1, ms:\'tsmap\'', 'leaveDeleted 应为 tsmap 墓碑字段');
});
t('删学生/名单同步两条路径都清请假（记墓碑）', () => {
  const ds = extractFn('deleteStudent');
  has(ds, 'state.leaveDeleted[l.id] = Date.now();', '删学生未清请假墓碑');
  has(ds, "l.studentId !== id", '删学生未移除请假');
  const rs = html.slice(html.indexOf('plan.removes.forEach'), html.indexOf('// 2) 学号更新'));
  has(rs, 'state.leaveDeleted[l.id] = Date.now();', '名单同步移除未清请假墓碑');
});

console.log('\n=== ② 班委协作收紧 ===');
t('白名单 7 页含 attendance（v3.2.0 起移除 todo）；CM_COLLAB_KEYS 恰为三岗', () => {
  const m = html.match(/const COMMITTEE_PAGES = (\[[^\]]*\])/);
  const pages = eval(m[1]);
  eq(pages.length, 7, '白名单页数');
  eq(pages.includes('attendance'), true, 'attendance 应在白名单（只读）');
  eq(pages.includes('todo'), false, 'todo 应移出白名单（v3.2.0 班委取消待办）');
  const m2 = html.match(/const CM_COLLAB_KEYS = (\[[^\]]*\])/);
  eq(JSON.stringify(eval(m2[1])), JSON.stringify(['banzhang', 'fubanzhang', 'jilv']), '三岗 key');
});
t('身份面板只列三岗 + 通用班委匿名入口已下线', () => {
  const fn = html.match(/function openCmIdentityPanel\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, 'CM_COLLAB_KEYS.indexOf(cfg.key) < 0', '身份面板未按三岗过滤');
  notHas(html, '以「通用班委」进入', '匿名入口应已移除');
});
t('请假页对班委只读：登记/续假/销假/删除全部拦截或隐藏', () => {
  ['function openLeaveModal(){', 'function extendLeave(id){', 'function returnLeave(id){', 'function deleteLeave(id){'].forEach(f => {
    const seg = html.slice(html.indexOf(f), html.indexOf(f) + 300);
    has(seg, '班委模式只可查看请假记录', f + ' 缺只读拦截');
  });
  has(html, "const isCm = window.__cmRole === 'committee';", 'renderAttendance 缺 isCm');
  has(html, "(l.status !== 'returned' && !isCm)", '续假/销假按钮未按 isCm 隐藏');
  has(html, "'addLeaveBtn'", 'applyCommitteeRestrictions 未隐藏登记按钮');
});
t('课表对班委只读：工具条清空 + 格子编辑拦截', () => {
  const tools = html.match(/function tsRenderTools\(\)\{[\s\S]*?\n\}/)[0];
  has(tools, "window.__cmRole === 'committee'", '工具条缺只读分支');
  const edit = html.slice(html.indexOf('function openTsEdit('), html.indexOf('function openTsEdit(') + 300);
  has(edit, '班委模式课表只读', '格子编辑缺拦截');
});

console.log('\n=== ③ 登录密码仅限本机 ===');
t('schema 有 pwdDeviceLock（pwdLock 策略，at 新者胜）', () => {
  has(html, "key:'pwdDeviceLock', def:function(){ return { enabled:false, devices:[], at:0 }; }, cfs:1, ms:'pwdLock'", 'schema 字段缺');
  const ms = extractFn('msPwdLock');
  has(ms, '(r.at||0)>(l.at||0)', '合并未按 at 仲裁');
});
t('msPwdLock 行为：新者胜 / 本机无取云端 / 云端无保留本机', () => {
  const m1 = { pwdDeviceLock: null };
  MERGE_ST.pwdLock(m1, { pwdDeviceLock: { enabled: true, devices: ['a'], at: 100 } }, { pwdDeviceLock: { enabled: true, devices: ['a', 'b'], at: 200 } }, 'pwdDeviceLock');
  eq(m1.pwdDeviceLock.devices.join(','), 'a,b', '云端较新应取云端');
  const m2 = { pwdDeviceLock: null };
  m2.pwdDeviceLock = { enabled: true, devices: ['x'], at: 300 };
  MERGE_ST.pwdLock(m2, { pwdDeviceLock: { enabled: true, devices: ['x'], at: 300 } }, { pwdDeviceLock: { enabled: true, devices: ['a', 'b'], at: 200 } }, 'pwdDeviceLock');
  eq(m2.pwdDeviceLock.devices.join(','), 'x', '本机较新应保留本机');
  const m3 = { pwdDeviceLock: null };
  MERGE_ST.pwdLock(m3, {}, { pwdDeviceLock: { enabled: false, devices: [], at: 5 } }, 'pwdDeviceLock');
  eq(m3.pwdDeviceLock.enabled, false, '本机无应取云端');
  const m4 = { pwdDeviceLock: null };
  m4.pwdDeviceLock = { enabled: true, devices: ['x'], at: 9 };
  MERGE_ST.pwdLock(m4, { pwdDeviceLock: { enabled: true, devices: ['x'], at: 9 } }, {}, 'pwdDeviceLock');
  eq(m4.pwdDeviceLock.devices.join(','), 'x', '云端无应保留本机');
});
t('登录闸：密码对了还要过设备授权，管理员密码可授权', () => {
  const fn = html.match(/function loginSubmit\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, 'indexOf(cmDeviceId()) < 0', '缺设备授权判断');
  has(fn, 'verifyAdminPwd(_ap)', '缺管理员密码授权');
  has(fn, '_lock.devices.push(cmDeviceId())', '授权未写设备列表');
});
t('设置页开关 + 设备指纹函数就位', () => {
  has(html, 'id="pwdLocalOnlyChk"', '缺开关');
  has(html, 'id="pwdLocalOnlyHint"', '缺说明');
  has(html, 'function cmDeviceId(){', '缺设备指纹');
  has(html, 'function onPwdLocalOnlyChange(){', '缺开关处理');
  has(html, 'renderPwdLocalOnlyUI();', '设置回填未接');
});

console.log('\n=== ④ 底部导航 / 档案关闭 ===');
t('底部 tab：请假进底栏、待办挪进更多抽屉', () => {
  const bar = html.match(/<nav class="mobile-tabbar"[\s\S]*?<\/nav>/)[0];
  has(bar, 'data-page="attendance"', '底栏缺请假');
  notHas(bar, 'data-page="todo"', '待办不应还在底栏');
  const drawer = html.match(/<div class="more-drawer"[\s\S]*?<\/div>\n<\/div>/);
  has(html.slice(html.indexOf('id="moreGrid"'), html.indexOf('id="moreGrid"') + 2500), 'data-page="todo"', '抽屉缺待办入口');
});
t('档案详情右上角关闭：closeProfileDetail + 按钮 + 列表选中态复位', () => {
  const fn = html.match(/function closeProfileDetail\(\)\{[\s\S]*?\n\}/)[0];
  has(fn, '_profileSelectedId = null', '未清选中态');
  has(fn, 'renderProfileList()', '未刷列表');
  has(html, 'onclick="closeProfileDetail()" title="关闭档案详情"', '缺关闭按钮');
});

console.log('\n=== ⑤ 德育记录折叠 + 本月筛选 ===');
t('筛选三档：本月在最前，默认仍是本学期', () => {
  const seg = html.slice(html.indexOf("setPfOpScope('month')"), html.indexOf("setPfOpScope('all')"));
  const term = html.indexOf("setPfOpScope('term')");
  ok2(html.indexOf("setPfOpScope('month')") < term && term < html.indexOf("setPfOpScope('all')"), '按钮顺序应为 本月 → 本学期 → 全部');
  function ok2(c, m) { if (!c) throw new Error(m); }
  eq(/var _pfOpScope = 'term';/.test(html), true, '默认筛选应保持本学期');
});
t('默认折叠：_pfDevyOpen=false，体挂 display:none，箭头 ▸', () => {
  has(html, 'var _pfDevyOpen = false;', '缺折叠默认值');
  has(html, "id=\"pfDevyBody\" style=\"${_pfDevyOpen ? '' : 'display:none'}\"", '德育体未按折叠态挂 display');
  has(html, "${_pfDevyOpen?'▾':'▸'}", '箭头未随折叠态');
});
t('折叠态只显 20 条 + 展开全部/收起按钮', () => {
  const rows = extractFn('pfOpRowsHtml');
  has(rows, 'ops.slice(0, 20)', '缺 20 条截断');
  has(rows, '展开全部 ', '缺展开按钮');
  has(rows, '收起（只显前 20 条）', '缺收起按钮');
  has(html, 'function pfDevyExpand(){', '缺展开处理');
  has(html, 'onclick="pfDevyToggle()"', '德育段头未接专用折叠');
});
t('切换筛选/换人后回到折叠态', () => {
  const sp = html.match(/function setPfOpScope\(sc\)\{[\s\S]*?\n\}/)[0];
  has(sp, '_pfDevyAll = false', '切筛选未重置展开');
  const sel = html.match(/function selectProfile\(id\)\{[\s\S]*?\n\}/)[0];
  has(sel, '_pfDevyOpen = false; _pfDevyAll = false;', '换人未重置折叠');
});
t('month 过滤链 + 空文案', () => {
  const rows = extractFn('pfOpRowsHtml');
  has(rows, "_pfOpScope === 'month' && !(Number(o.time) >= pfMonthStartTs())", '缺本月过滤');
  has(html, 'function pfMonthStartTs(){', '缺本月起点');
  has(rows, '本月暂无学分变动', '缺本月空文案');
});

console.log('\n=== ⑥ 工作留痕配图 ===');
t('弹窗有图片选择组（file input + 预览容器）', () => {
  has(html, 'id="wlImgInput"', '缺 file input');
  has(html, 'id="wlImgPreview"', '缺预览容器');
  has(html, 'id="wlImgCount"', '缺张数提示');
});
t('配图链路：选图压缩 / 预览删除 / 点击放大 / 落盘 images', () => {
  has(html, 'function wlAddImages(files){', '缺选图处理');
  has(html, 'compressImage(rd.result, 1000, 0.7,', '选图未走压缩');
  has(html, 'function wlRemoveImg(i){', '缺移除');
  has(html, 'function wlRenderImgPreview(){', '缺预览渲染');
  has(html, 'function wlZoom(src){', '缺放大查看');
  has(html, 'w.images=_wlPicked.slice()', 'saveWorkLog 未落 images');
  has(html, "_wlPicked = (w.images || []).slice(); wlRenderImgPreview();", '编辑未回填图片');
  has(html, "onclick=\"wlZoom(this.getAttribute('src'))\"", '列表缩略图未接放大');
  has(html, "wlAddImages(this.files)", 'file input 未接处理函数');
});
t('文本导出带图片数标记', () => {
  has(html, "' [图' + w.images.length + ']'", '复制/导出未标记图片数');
});
t('既有契约：renderWorkLogs 过滤链与搜索逻辑未动', () => {
  const b = extractFn('renderWorkLogs');
  has(b, 'let list = state.workLogs.filter(w=>{', '过滤链缺失');
  has(b, "w.date !== date", '按日视图缺失');
});

console.log('\n=== ⑦ 版本与速览 ===');
t('版本标记统一 ' + V, () => {
  has(html, '<div class="login-version">' + V + '</div>', '登录页');
  has(html, '<div class="sidebar-footer">' + V + ' · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ ' + V + '</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-" + V + "'", 'SW');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
