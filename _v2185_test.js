/* v2.18.1 回归测试：登录页标注开发者 chee + 座次表默认可安排（去查看/编辑模式）+ 候选按学分排序 + 一键按学分排座
   覆盖：login-credit 三处（CSS×2+HTML）/ 版本 v2.18.1 三处同步 / 模式切换 UI 与代码移除 /
        工具栏三排座按钮 / seatClick 去模式门槛 + 候选学分降序 / autoSeat 策略参数化（去 prompt）/
        座次操作提示 / 主 script 语法。
   运行：node _v2185_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + '不应包含 ' + JSON.stringify(b)); }
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

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译（改动后无语法错）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.5（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.5</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.5 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.5')) throw new Error('SW CACHE_NAME 未更新');
});
t('设置页版本徽标随版 = v2.18.5', () => {
  has(html, '🏷️ v2.18.5</span>', '设置页版本徽标未跟版');
});

console.log('\n=== 登录页开发者标注 ===');
t('login-credit 三处就位（桌面 CSS / 移动 CSS / HTML）', () => {
  const c = (html.match(/login-credit/g) || []).length;
  ok(c === 3, 'login-credit 出现 ' + c + ' 次（期望 3：CSS×2 + HTML×1）');
});
t('桌面样式：左下角版本号上方小字（仿 login-version 半透明）', () => {
  has(html, '.login-credit{position:absolute;bottom:40px;left:36px;font-size:11px;opacity:0.45;letter-spacing:1px;z-index:1', '缺桌面 credit 样式');
});
t('移动端样式：居中堆叠于版本号上方', () => {
  has(html, '.login-credit{position:static;margin-top:10px;text-align:center;font-size:11px;opacity:0.5', '缺移动端 credit 样式');
  has(html, '.login-version{position:static;margin-top:4px;text-align:center}', '版本号移动端未让位');
});
t('HTML：credit 行位于版本号正上方，文案含 chee', () => {
  const iC = html.indexOf('<div class="login-credit">开发者 · chee</div>');
  const iV = html.indexOf('<div class="login-version">v2.18.5</div>');
  ok(iC > 0 && iV > iC, 'credit 应在 version 之前（credit=' + iC + ' version=' + iV + '）');
});

console.log('\n=== 座次：查看/编辑模式移除 ===');
t('模式切换 UI 已移除（无 data-seat-mode / 无模式 tab）', () => {
  notHas(html, 'data-seat-mode', '模式 tab 残留');
  notHas(html, '查看模式', '查看模式 tab 残留');
  notHas(html, 'seatTabIndicator', 'tab 指示器残留');
});
t('模式代码已移除（let seatMode / setSeatMode / initSeatIndicator 无定义）', () => {
  notHas(html, 'let seatMode', 'seatMode 变量残留');
  notHas(html, 'function setSeatMode', 'setSeatMode 残留');
  notHas(html, 'function initSeatIndicator', 'initSeatIndicator 残留');
  notHas(html, 'initSeatIndicator()', '调用残留');
});
t('工具栏三排座按钮就位（随机 / 按学分 / 按姓名）', () => {
  has(html, "onclick=\"autoSeat('random')\"", '缺随机按钮');
  has(html, "onclick=\"autoSeat('credit')\"", '缺按学分按钮');
  has(html, "onclick=\"autoSeat('name')\"", '缺按姓名按钮');
  has(html, '🎓 按学分排座', '缺学分排座按钮文案');
});
t('座次操作提示文案', () => {
  has(html, '点座位卡片即可安排 / 更换学生', '缺操作提示');
});

console.log('\n=== 座次：seatClick 默认可安排 + 候选学分降序 ===');
t('seatClick 去模式门槛：不再引用 seatMode、不弹 toast 后 return', () => {
  const fn = extractFn('seatClick');
  const src = fn.toString().replace(/\s+/g, ' ');
  notHas(src, 'seatMode', 'seatClick 仍引用 seatMode');
  notHas(src, "showToast(`${s.name}", '仍保留查看模式 toast 分支');
});
t('seatClick 保留编辑链路断言（候选注入剔除已占座 + 学分降序 + 刷新 + 弹窗）', () => {
  const fn = extractFn('seatClick');
  has(fn.toString(), '_studentPickerPool = state.students.filter', '未注入剔除已占座候选');
  has(fn.toString(), '_studentPickerPool.sort((a,b)=>(Number(b.credit)||0)-(Number(a.credit)||0))', '候选未按学分降序');
  has(fn.toString(), 'refreshStudentPicker();', '未刷新列表');
  has(fn.toString(), "openModal('studentSelectModal')", '未弹窗');
  has(fn.toString(), "modal.dataset.context = 'seating'", '未标座位上下文');
});

console.log('\n=== 座次：autoSeat 策略参数化 ===');
t('autoSeat(strategy) 签名 + 三策略 map + 无 prompt', () => {
  const fn = extractFn('autoSeat');
  const src = fn.toString().replace(/\s+/g, ' ');
  has(src, 'function autoSeat(strategy){', '签名未带 strategy');
  has(src, "mode === 'credit'", '缺 credit 分支');
  has(src, "mode === 'name'", '缺 name 分支');
  has(src, "{'random':'随机','credit':'按学分从高到低','name':'按姓名拼音'}", '缺策略名 map');
  notHas(src, 'prompt(', '仍用 prompt');
});
t('credit 分支按学分降序、name 分支拼音、random 洗牌（纯逻辑抽取验证）', () => {
  const fn = extractFn('autoSeat');
  const src = fn.toString();
  has(src, "sorted.sort((a,b) => (Number(b.credit)||0) - (Number(a.credit)||0))", '学分排序实现缺失');
  has(src, "String(a.name||'').localeCompare(String(b.name||''), 'zh')", '拼音排序实现缺失');
  has(src, 'Math.floor(Math.random()', '随机洗牌实现缺失');
});

console.log('\n=== 设置页 notes（v2.18.1 本期条目） ===');
t('notes 含 v2.18.3 新条（处分记录同步 / 重置加密口令）', () => {
  has(html, '处分记录此前不参与云同步', '缺处分记录同步说明');
  has(html, '重置云端加密口令', '缺重置口令说明');
});

console.log('\n=== 历史注释保护 ===');
t('v2.18.0 功能注释保留（24 处，不随升版盲替）', () => {
  const n = (html.match(/v2\.18\.0/g) || []).length;
  ok(n === 24, 'v2.18.0 应为 24 处功能注释，实际 ' + n);
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
