/* v2.17.19 回归测试：档案详情新版式 + 拼音排序 + 寝室→性别补写 + 德育记录本学期/折叠
   + 荣誉墙类型筛选 + 证书导出。运行：node _v2177_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + `缺少 ${JSON.stringify(b)}`); }

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
// 模块级绑定：eval 出来的函数闭包在 test 模块顶端，统一提供 _pyCollator / DORM_GENDER_RULES / dormNoOf
var _pyCollator = (typeof Intl !== 'undefined' && Intl.Collator)
  ? new Intl.Collator('zh-Hans-CN', { sensitivity: 'variant', numeric: true })
  : null;
const _m = html.match(/var DORM_GENDER_RULES = (\[[\s\S]*?\n\]);/);
var DORM_GENDER_RULES = _m ? eval('(' + _m[1] + ')') : [];
var dormNoOf = extractFn('dormNoOf');
var normalizeDormTag = extractFn('normalizeDormTag');
var isDormTag = extractFn('isDormTag');
// v2.17.19 注入 const 常量依赖（DORM_RE 是 const，eval 抽函数没法闭包到）
const _dormReMatch = html.match(/const DORM_RE = (\/[\s\S]*?\/);/);
var DORM_RE = _dormReMatch ? eval(_dormReMatch[1]) : null;
const dormGenderOf = extractFn('dormGenderOf');
const fillStudentGenderFromDorm = extractFn('fillStudentGenderFromDorm');
const pinyinNameCmp = extractFn('pinyinNameCmp');
const sortStudentsByPinyin = extractFn('sortStudentsByPinyin');
const names = ['王小明','陈晨','赵敏','李雷','孙悦','张伟'];

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== v2.17.19 版本三处同步 ===');
t('登录页 / 侧栏 / SW CACHE_NAME = v2.17.19', () => {
  if (!/login-version">v2\.17\.19</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.17\.19 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!fs.readFileSync('sw.js', 'utf8').includes('class-manager-v2.17.19')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 拼音排序（左侧学生名单） ===');
t('Intl.Collator zh 拼接 + sortStudentsByPinyin 已就位', () => {
  has(html, "new Intl.Collator('zh-Hans-CN'", '缺拼音 collator');
  has(html, 'function sortStudentsByPinyin(', '缺排序函数');
});
t('renderProfileList 改用拼音排序（不再直传 state.students）', () => {
  if (!/function renderProfileList\(\)[\s\S]*?sortStudentsByPinyin\(state\.students/.test(html)) throw new Error('未接入排序');
});
t('拼音排序：陈晨<李雷<孙悦<王小明<张伟<赵敏（按 zh 字典序）', () => {
  const sorted = sortStudentsByPinyin(names.map(n => ({ name: n, sid: '' }))).map(x => x.name);
  eq(JSON.stringify(sorted), JSON.stringify(['陈晨','李雷','孙悦','王小明','张伟','赵敏']));
});

t('DORM_GENDER_RULES 两条规则就位', () => {
  has(html, '7栋-?214室', '缺男寝规则');
  has(html, '6栋-?80[1-6]室', '缺女寝规则');
});
t('dormGenderOf：男寝 7栋214 → 男；女寝 6栋801/802/806 → 女；其他 → 空', () => {
  eq(dormGenderOf('7栋214室'), '男');
  eq(dormGenderOf('7栋-214室'), '男');
  eq(dormGenderOf('6栋-801室'), '女');
  eq(dormGenderOf('6栋802室'), '女');
  eq(dormGenderOf('6栋-806室'), '女');
  eq(dormGenderOf('6栋-807室'), '');
  eq(dormGenderOf('7栋-215室'), '');
  eq(dormGenderOf('走读'), '');
});
t('fillStudentGenderFromDorm：仅在档案性别为空时补写，已设置不覆盖', () => {
  var s1 = { id: 1, tags: ['6栋-802室'] };   // 无 profile → 创建并补写
  eq(fillStudentGenderFromDorm(s1), true);
  eq(s1.profile.gender, '女');
  var s2 = { id: 2, tags: ['6栋-802室'], profile: { gender: '男', timeline: [] } };   // 已填「男」不覆盖
  eq(fillStudentGenderFromDorm(s2), false);
  eq(s2.profile.gender, '男');
  var s3 = { id: 3, tags: ['7栋-215室'], profile: { gender: '' } };   // 规则不命中
  eq(fillStudentGenderFromDorm(s3), false);
  eq(s3.profile.gender, '');
  var s4 = { id: 4, tags: [] };   // 无寝室号
  eq(fillStudentGenderFromDorm(s4), false);
});
t('renderProfiles 启动时调 fillAllDormGenders 全校兜底', () => {
  if (!/function renderProfiles\(\)\{[\s\S]*?fillAllDormGenders\(\)/.test(html)) throw new Error('未挂载全校补写');
});

console.log('\n=== 档案详情新版式 ===');
t('新版 CSS 类齐：.pf-summary/.pf-credit/.pf-chip/.pf-notes/.pf-section/.deyu-scroll 等', () => {
  ['.pf-summary{', '.pf-avatar{', '.pf-name{', '.pf-credit{', '.pf-chip.male', '.pf-chip.female',
   '.pf-notes{', '.pf-section{', '.pf-section-head{', '.deyu-scroll{', '.deyu-row{',
   '.pf-honor-row{', '.pf-empty{'].forEach(m => has(html, m, '缺样式 ' + m));
});
t('renderProfileDetail 头部概要 + 备注卡 + 三段折叠卡结构', () => {
  const fn = html.match(/function renderProfileDetail\([\s\S]*?\n\}/)[0];
  if (!fn.includes('pf-summary')) throw new Error('缺头部概要');
  if (!fn.includes('pf-credit')) throw new Error('缺学分大字号');
  if (!fn.includes('pf-chip')) throw new Error('缺性别芯片');
  if (!fn.includes('pf-notes')) throw new Error('缺备注卡');
  if (!fn.includes('📊 德育记录')) throw new Error('缺德育卡');
  if (!fn.includes('🌱 成长记录')) throw new Error('缺成长记录卡');
  if (!fn.includes('🏅 学生荣誉')) throw new Error('缺学生荣誉卡');
  if (!fn.includes('exportHonorCert(')) throw new Error('学生荣誉卡未接证书导出');
  if (!html.includes('function pfSemesterStartTs')) throw new Error('德育卡未启用学期过滤');
});
t('德育记录可折叠 + 滚动容器限高', () => {
  if (!html.includes('max-height:250px;overflow-y:auto')) throw new Error('缺滚动限高');
  has(html, 'function pfSectionToggle(', '缺折叠切换函数');
});

console.log('\n=== 荣誉墙类型筛选 + 证书导出 ===');
t('_honorScope 默认「全部」 + setHonorScope 函数 + 等级 first chip 文案「不限」', () => {
  if (!/var _honorScope = '全部';/.test(html)) throw new Error('缺默认类型筛选变量');
  if (!html.includes('function setHonorScope(')) throw new Error('缺 setHonorScope');
  if (!/l==='全部'\?'不限'/.test(html)) throw new Error('缺「不限」等级文案');
});
t('renderHonors 列表过滤包含类型（_honorScope）', () => {
  const fn = html.match(/function renderHonors\(\)\{[\s\S]*?\n\}/)[0];
  if (!fn.includes('_honorScope')) throw new Error('renderHonors 未按类型筛选');
});
t('每张荣誉卡含「📄 证书」按钮（点导出证书图片）', () => {
  if (!html.includes('exportHonorCert(${h.id})')) throw new Error('缺证书按钮');
});
t('证书画布生成函数 + 导出函数就位', () => {
  ['function drawHonorCertCanvas(', 'function exportHonorCert(', 'function honorCertEntity('].forEach(m => has(html, m, '缺' + m));
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);