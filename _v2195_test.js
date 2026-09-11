/* v2.18.11 回归测试：设置页「📴 纯本地模式」开关 ——
 * 需求：一键停用自动云同步与全部同步弹窗；本地数据照常落 localStorage（关机重启不丢）；
 *       手动推送/拉取/恢复与推送安全检查（checkPushSafety 内部 autoSyncFromCloud）不受影响。
 * 实现：设备级偏好 cm_local_mode（localStorage，不参与云同步字段）；
 *       四个静音点 = autoPushToCloud 顶部拦截 / 页面加载自动拉取跳过（渲染链保留）/
 *       visibilitychange 自动拉取拦截 / 开关开启时清掉待重试定时器。
 * 断言：源码锚点 + new Function 沙箱行为级真跑 toggleLocalMode + 版本三处标记 + notes。
 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function has(s, sub, msg) {
  if (!s.includes(sub)) throw new Error(msg || ('缺少标记: ' + String(sub).slice(0, 80)));
}
function lineFn(src, sig) {
  const lines = src.split(/\r?\n/);
  const i = lines.findIndex(l => l.includes(sig));
  if (i < 0) throw new Error('找不到 ' + sig);
  return lines[i].trim();
}

console.log('\n=== v2.18.11 纯本地模式 ===');

t('helper 三件套就位（KEY / isLocalMode / setLocalMode）', () => {
  has(html, "const LOCAL_MODE_KEY = 'cm_local_mode';", '缺 KEY');
  has(html, "function isLocalMode(){ try{ return localStorage.getItem(LOCAL_MODE_KEY) === '1'; }catch(e){ return false; } }", '缺 isLocalMode');
  has(html, "function setLocalMode(v){ try{ if(v) localStorage.setItem(LOCAL_MODE_KEY, '1'); else localStorage.removeItem(LOCAL_MODE_KEY); }catch(e){} }", '缺 setLocalMode');
});

t('自动推送被拦截（isLocalMode 在 hasGHToken 检查之前，含未配置 Token 提醒一并静音）', () => {
  if (!/function autoPushToCloud\(\)\{\s*if\(isLocalMode\(\)\)\{/.test(html))
    throw new Error('autoPushToCloud 顶部无 isLocalMode 拦截');
});

t('页面加载自动拉取被跳过且渲染链保留', () => {
  has(html, '(isLocalMode() ? Promise.resolve(false) : autoSyncFromCloud()).then(function(){', '启动拉取未按本地模式分流');
});

t('visibilitychange 自动拉取被拦截', () => {
  has(html, "if(!isLocalMode()) autoSyncFromCloud().then(function(){ updateCloudSyncUI(); });", '切回标签页仍会自动拉取');
});

t('手动通路不受影响：pullFromCloud / checkPushSafety / 推送按钮原样', () => {
  has(html, 'function pullFromCloud()', '手动拉取函数丢失');
  has(html, 'onclick="pushToCloud()"', '手动推送按钮丢失');
  has(html, 'onclick="pullFromCloud()"', '手动拉取按钮丢失');
  has(html, 'onclick="restoreFromCloud()"', '恢复按钮丢失');
  has(html, 'return autoSyncFromCloud().then(function(){ throw new Error(chk.msg); });', 'checkPushSafety 安全检查丢失');
});

t('设置页 UI：开关按钮 + 状态位 + 说明文案', () => {
  has(html, 'id="localModeBtn" onclick="toggleLocalMode()"', '缺开关按钮');
  has(html, 'id="localModeStatus"', '缺状态位');
  has(html, '停用自动云同步与全部同步弹窗，数据只保存在本机浏览器（关机/重启后照常使用、不丢失）', '缺说明文案');
});

t('updateCloudSyncUI 本地模式分支 + 按钮状态回填', () => {
  has(html, '📴 纯本地模式已开启', '缺状态行');
  has(html, "if(lb) lb.textContent = isLocalMode() ? '📴 纯本地模式：开（点击关闭）' : '📴 纯本地模式：关（点击开启）';", '缺按钮回填');
  has(html, "renderSettings", '设置页渲染函数丢失');
});

t('★ 行为级：toggleLocalMode 开→关 全链路（沙箱真跑）', () => {
  const isLocalModeSrc = lineFn(html, 'function isLocalMode(){');
  const setLocalModeSrc = lineFn(html, 'function setLocalMode(');
  const lines = html.split(/\r?\n/);
  const ti = lines.findIndex(l => l.includes('function toggleLocalMode(){'));
  if (ti < 0) throw new Error('找不到 toggleLocalMode');
  let te = ti + 1;
  while (te < lines.length && lines[te] !== '}') te++;
  const toggleSrc = lines.slice(ti, te + 1).join('\n');
  const factory = new Function(
    'toasts', 'pushCalls', 'uiCalls',
    `  var cloudSyncTimer = 111, _pushRetryTimer = 222;
   const __store = {};
   const LOCAL_MODE_KEY = 'cm_local_mode';   // 沙箱需自带该常量（与 index.html 顶层一致）
   const localStorage = { getItem: k => (k in __store ? __store[k] : null),
                          setItem: (k, v) => { __store[k] = String(v); },
                          removeItem: k => { delete __store[k]; } };
   const cleared = [];
   const clearTimeout = id => cleared.push(id);
   const showToast = (m, t) => toasts.push({ m: m, t: t });
   const autoPushToCloud = () => pushCalls.n++;
   const updateCloudSyncUI = () => uiCalls.n++;
   ${isLocalModeSrc}
   ${setLocalModeSrc}
   ${toggleSrc}
   return { isLocalMode: isLocalMode, toggleLocalMode: toggleLocalMode, snap: () => ({ key: __store['cm_local_mode'] || null, cleared: cleared, timer: cloudSyncTimer, retry: _pushRetryTimer }) };`
  );
  const toasts = [], pushCalls = { n: 0 }, uiCalls = { n: 0 };
  const api = factory(toasts, pushCalls, uiCalls);
  // 初始：关
  if (api.isLocalMode() !== false) throw new Error('初始应为关');
  // 开：置位 + 清定时器 + toast + 刷 UI + 不补推
  api.toggleLocalMode();
  let sn = api.snap();
  if (sn.key !== '1') throw new Error('开启后 localStorage 未置位');
  if (!sn.cleared.includes(111) || !sn.cleared.includes(222)) throw new Error('开启后未清待推/重试定时器（cleared=' + JSON.stringify(sn.cleared) + '）');
  if (!toasts.some(x => /纯本地模式/.test(x.m) && /停用/.test(x.m))) throw new Error('开启缺提示');
  if (pushCalls.n !== 0) throw new Error('开启时不应触发推送');
  if (uiCalls.n !== 1) throw new Error('开启后未刷新同步 UI');
  // 关：清除 + 补推一次
  api.toggleLocalMode();
  sn = api.snap();
  if (sn.key !== null) throw new Error('关闭后 localStorage 未清除');
  if (!toasts.some(x => /恢复自动云同步/.test(x.m))) throw new Error('关闭缺提示');
  if (pushCalls.n !== 1) throw new Error('关闭后应补推一次');
});

t('本地保存链未受影响：saveData 仍写 localStorage 并触发（已拦截的）autoPushToCloud', () => {
  has(html, "try{ localStorage.setItem(STORE_KEY, JSON.stringify({", 'saveData 落盘语句丢失');
  has(html, 'autoPushToCloud();', 'saveData 内触发点丢失');
});

t('版本标记统一 v2.18.11', () => {
  has(html, '<div class="login-version">v2.18.11</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.18.11 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.18.11</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-v2.18.11'", 'SW');
});

t('设置页「近版更新速览」新增本版条目（旧条不删）', () => {
  has(html, '新增「📴 纯本地模式」', '缺 v2.18.11 notes 条目');
  has(html, '· 修复平板/矮窗口下侧栏导航「设置」显示不全且无法滑动', 'v2.18.10 旧条目被删');
  has(html, '· 修复：往新建大类里添加原因后刷新整组消失', 'v2.18.9 旧条目被删');
});

t('历史注释不被波及（v2.18.9 引入版注释保持原样）', () => {
  has(html, "catDelUndo('dirs', dir);   // v2.18.9 同步 revive 所在方向", '历史注释被改动');
  has(html, '// v2.18.9 隐式新建/使用大类与方向同样视为「重加」', '历史注释被改动');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
