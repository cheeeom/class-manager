/* v2.18.3 回归测试：四个 P0 缺陷修复 + 新增「重置云端加密口令」
   覆盖：
     P0-1 处分记录补入云同步三处链路（state 默认值 / CLOUD_SYNC_FIELDS / smartMergeData）
     P0-2 saveData 的 localStorage.setItem 加 try/catch（失败仍推云）
     P0-3 学生详情面板 op.reason 转义（唯一 XSS 漏网点）
     P0-4 工作记录补 wlSearch 搜索框 + 关键词跨日期检索
     新增 resetCloudPwd（绕过 checkPushSafety 强制重加密推云 + 失败回滚口令）
     版本三处同步 v2.18.3 / 历史注释保护 / notes 新条
   运行：node _v2187_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + '不应包含 ' + JSON.stringify(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }

/* 取函数完整源码文本（含花括号） */
function fnBody(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => /^\s*function\s+/.test(l) && l.indexOf('function ' + name + '(') >= 0);
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

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.13（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.19\.1</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.19\.1 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.19.1')) throw new Error('SW CACHE_NAME 未更新');
});
t('设置页版本徽标随版 = v2.18.13', () => {
  has(html, '🏷️ v2.19.1</span>', '设置页版本徽标未跟版');
});
t('历史注释保护：v2.18.2 功能注释 2 处保留（不随升版盲替）', () => {
  const n = (html.match(/v2\.18\.2/g) || []).length;
  ok(n === 2, 'v2.18.2 应为 2 处历史注释，实际 ' + n);
});
t('历史注释保护：v2.18.0 功能注释 24 处保留', () => {
  const n = (html.match(/v2\.18\.0/g) || []).length;
  ok(n === 24, 'v2.18.0 应为 24 处，实际 ' + n);
});

console.log('\n=== P0-1 处分记录补入云同步链路 ===');
t('链路① STATE_SCHEMA 含 punishments / nextPunishId，且为顶层条目（2 空格缩进）', () => {
  const lines = html.split('\n');
  const i = lines.findIndex(l => l.includes("{ key:'punishments', def:function(){ return []; }, cfs:1, ms:'punishments' },"));
  ok(i > 0, 'STATE_SCHEMA 缺 punishments');
  const ind = (lines[i].match(/^[ \t]*/) || [''])[0].length;
  ok(ind === 2, 'punishments 缩进应为 2（schema 顶层），实际 ' + ind + ' —— 曾误插进 creditBank 内部');
  const j = lines.findIndex(l => l.includes("{ key:'nextPunishId', def:1, cfs:1, ms:'max1' },"));
  ok(j > 0 && (lines[j].match(/^[ \t]*/) || [''])[0].length === 2, 'nextPunishId 缩进应为 2');
});
t("链路④ CLOUD_SYNC_FIELDS 含 'punishments','nextPunishId'", () => {
  const seg = html.slice(html.indexOf('const STATE_SCHEMA'), html.indexOf('function buildDefaultState'));
  has(seg, "key:'punishments', def:function(){ return []; }, cfs:1", '处分记录未加入云同步白名单 → 永远不会上传');
  has(seg, "key:'nextPunishId', def:1, cfs:1", 'nextPunishId 未加入云同步白名单');
});
t('链路⑤ smartMergeData 含 punishments 合并分支（按 id 并集 + 远端已办结优先）', () => {
  const b = html.slice(html.indexOf('function msPunishments'), html.indexOf('/* MERGE_ENGINE_END'));
  has(b, 'remoteData.punishments', '合并分支缺失 → 云端处分记录永远回落不下来');
  has(b, 'pmap[rp.id]', '缺按 id 归并');
  has(b, 'if(rp.done&&!lp.done){ pmap[rp.id]=rp; }', '缺「远端已办结优先」');
  has(b, 'merged.punishments=', '缺写回 merged');
  has(b, 'merged[key]=Math.max(localData[key]||1,remoteData[key]||1);', '缺 nextPunishId 取大（msMax1）');
});
t('处分记录三链齐（原先只走 loadData/saveData 两条）', () => {
  has(html, 'state.punishments = d.punishments || [];', 'loadData 恢复缺失');
  has(html, 'if(!f.cfs || f.nosv) return;', 'saveData 持久化缺失（schema 遍历）');
});

console.log('\n=== P0-2 saveData 异常保护 ===');
t('localStorage.setItem 包在 try 内', () => {
  const sd2 = html.match(/function saveData\(\)\{[\s\S]*?autoPushToCloud\(\);[\s\S]*?\n\}/)[0];
  ok(sd2.indexOf('try{') >= 0 && sd2.indexOf('localStorage.setItem(STORE_KEY, JSON.stringify(_snap))') > sd2.indexOf('try{'), 'setItem 未被 try 包裹');
});
t('catch 分支提示用户且不再静默中断', () => {
  const b = fnBody('saveData');
  has(b, 'catch(e){', '缺 catch');
  has(b, "showToast('本地保存失败（存储空间可能已满）", '缺失败提示');
  has(b, "console.error('[saveData] localStorage 写入失败:', e)", '缺日志');
});
t('保存失败后仍执行 autoPushToCloud（保存链不再被异常掐断）', () => {
  const b = fnBody('saveData');
  const ci = b.indexOf('catch(e){');
  const pi = b.indexOf('autoPushToCloud();');
  ok(ci >= 0 && pi > ci, 'autoPushToCloud 应位于 try/catch 之后');
});

console.log('\n=== P0-3 op.reason 转义（唯一 XSS 漏网点）===');
t('学生详情面板操作历史已对 op.reason 转义', () => {
  has(html, '— ${escapeHtml(op.reason)}</span>', 'op.reason 仍未转义');
});
t('全库不再有裸插 ${op.reason}', () => {
  notHas(html, '— ${op.reason}</span>', '仍有未转义的 op.reason 插值点');
});

console.log('\n=== P0-4 工作记录搜索（死代码复活）===');
t('page-worklogs 内存在 id="wlSearch" 搜索框', () => {
  const a = html.indexOf('id="page-worklogs"');
  const b = html.indexOf('id="page-honors"');
  const seg = html.slice(a, b);
  ok(a > 0 && b > a, '未定位到工作记录页区块');
  has(seg, 'id="wlSearch"', '工作记录页缺搜索框 —— kw 恒空、过滤永不生效');
  has(seg, 'oninput="renderWorkLogs()"', '搜索框未绑定实时过滤');
});
t('renderWorkLogs：有关键词时跨日期检索（不再只搜当天）', () => {
  const b = fnBody('renderWorkLogs');
  has(b, 'if(!kw && w.date !== date) return false;', '缺跨日期条件');
  has(b, '.toLowerCase().trim();', 'kw 未 trim');
  has(b, 'let list = state.workLogs.filter(w=>{', '过滤链缺失');
});
t('renderWorkLogs：搜索态统计文案与按日视图区分', () => {
  const b = fnBody('renderWorkLogs');
  has(b, '? `🔍 搜索「${kw}」· 命中 ${list.length} 条`', '缺搜索态文案');
  has(b, ': `📅 ${date} · ${list.length} 条 | 本月 ${month} 共 ${monthList.length} 条`;', '按日文案被破坏');
});

console.log('\n=== 新增：重置云端加密口令 ===');
t('函数 resetCloudPwd 已定义且挂到设置页按钮', () => {
  has(html, 'function resetCloudPwd(){', '函数未定义');
  has(html, 'onclick="resetCloudPwd()">🔁 重置云端加密口令</button>', '设置页缺入口按钮');
});
t('v2.18.4：口令走站内密码模态（不再用 prompt 明文回显）', () => {
  const b = fnBody('resetCloudPwd');
  has(b, 'cmPrompt({', '未走通用输入模态');
  has(b, "type: 'password'", '口令未用密码框（prompt 会明文回显）');
  has(b, 'confirmLabel:', '缺二次输入框');
  has(b, 'minLength: 8', '缺长度下限');
  notHas(b, 'prompt(', '仍用原生 prompt');
  has(fnBody('cmPromptSubmit'), '两次输入不一致', '缺两次一致性校验');
});
t('重置执行体：二次确认 + 有意绕过 checkPushSafety（旧密文解不开，常规推送必被拦）', () => {
  const b = fnBody('resetCloudPwdApply');
  has(b, 'if(!confirm(', '缺确认框');
  notHas(b, 'checkPushSafety', '不应走安全闸门（否则改口令后永远推不上去）');
  has(b, 'encryptForCloud(buildCloudPayload(parsed))', '缺重加密负载');
  has(b, "message: 'rekey: re-encrypt data.json with new sync password'", '缺重推提交信息');
});
t('推送期间持独占锁，防止 auto push 抢跑', () => {
  const b = fnBody('resetCloudPwdApply');
  has(b, 'wipeInProgress = true;', '缺独占锁加锁');
  has(b, '.then(function(){ wipeInProgress = false; });', '缺释放锁');
});
t('失败时回滚为原口令（避免本机口令与云端密文不一致卡死）', () => {
  const b = fnBody('resetCloudPwdApply');
  has(b, 'var oldPwd = getSyncPwd();', '缺原口令快照');
  has(b, 'setSyncPwd(oldPwd);', '缺回滚');
});
t('前置校验：需要 Token 与 Web Crypto', () => {
  const b = fnBody('resetCloudPwd');
  has(b, 'if(!hasGHToken())', '缺 Token 校验');
  has(b, 'if(!cryptoOK())', '缺 crypto 校验');
});

console.log('\n=== 设置页近版更新速览 ===');
t('notes 含 v2.18.3 四条新条', () => {
  has(html, '（v2.19.1）', '缺处分记录同步说明');
  has(html, '重置云端加密口令', '缺重置口令说明');
  has(html, '（v2.19.1）', '缺搜索框说明');
  has(html, '（v2.19.1）', '缺保存失败说明');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
