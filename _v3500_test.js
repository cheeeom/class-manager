// [版本无关化 v1] 当版版本号从 sw.js 的 CACHE_NAME 反推；跟版时本文件无需改动。
const V = (function () {
  try {
    var m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(require('fs').readFileSync(require('path').join(__dirname, 'sw.js'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
if (!V) throw new Error('[版本无关化] 未能从 sw.js 反推版本号（CACHE_NAME 缺失或路径不对）');
/* v3.5.0 回归测试：学期结算重置——数据层契约 + 合并策略 + 币豁免（命门）+ 公示口径。
   运行：node _v3500_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function has(a, b, msg) { if (a.indexOf(b) < 0) throw new Error((msg || '') + ` 缺少 ${JSON.stringify(b)}`); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

function extractFn(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('找不到 function ' + name);
  let end = start;
  while (end < lines.length && lines[end] !== '}') end++;
  if (end >= lines.length) throw new Error('function ' + name + ' 找不到闭合');
  return lines.slice(start, end + 1).join('\n');
}
function sandbox(fnSources, extra) {
  const body = fnSources.join('\n\n') + '\n' + (extra || '');
  return new Function(body + '\nreturn { ' + fnSources.map(s => /function\s+(\w+)\(/.exec(s)[1]).join(', ') + ' };')();
}

/* ── 1. 静态契约 ── */
t('★ STATE_SCHEMA：semester / semesterHistory 进同步白名单（cfs:1）', () => {
  has(html, "{ key:'semester', def:function(){ return { name:'', startAt:0 }; }, cfs:1, ms:'semester'", 'semester 缺失或未入同步');
  has(html, "{ key:'semesterHistory', def:function(){ return []; }, cfs:1, ms:'semesterHist'", 'semesterHistory 缺失或未入同步');
});
t('★ 合并策略：msSemester / msSemesterHist 注册进 MERGE_ST', () => {
  has(html, 'semester:msSemester, semesterHist:msSemesterHist', 'MERGE_ST 注册缺失');
  has(html, 'function msSemester(', 'msSemester 实现缺失');
  has(html, 'function msSemesterHist(', 'msSemesterHist 实现缺失');
});
t('★ 公示口径：settle 划界流水不进周期统计', () => {
  has(html, "filter(function(o){ return o && !o.settle && !(o.state === 'revoked')", 'computePublicityData 未过滤 settle');
});
t('★ 命门：币重算迁移豁免 settle（防 coin=0 被重算 = 凭空生币）', () => {
  const fn = extractFn('cbRecomputeOpCoins');
  has(fn, 'if(o.settle) continue;', 'cbRecomputeOpCoins 缺 settle 豁免');
});
t('★ 撤销守卫：划界流水不可撤销', () => {
  has(html, "showToast('学期结算划界流水不可撤销（往期数据见设置 → 学期存档）', 'warning');", 'revokeCreditOp 缺 settle 守卫');
});
t('★ UI：学期状态条 / 结算弹窗 / 存档卡 三处挂载', () => {
  has(html, 'id="semesterStripHost"', '学分页学期条挂载点缺失');
  has(html, 'id="semesterResetModal"', '结算弹窗缺失');
  has(html, 'id="semesterNewName"', '新学期名输入缺失');
  has(html, 'id="semesterClearCoins"', '清币勾选缺失');
  has(html, 'id="semesterResetConfirmBtn"', '确认按钮缺失');
  has(html, 'id="settingsSemester"', '设置页存档卡缺失');
  has(html, 'id="semesterArchiveList"', '存档列表缺失');
  has(html, 'updateSemesterStrip();   // v3.5.0 学期状态条', 'renderCreditsPage 未挂学期条');
  has(html, 'renderSemesterArchive();   // v3.5.0 学期存档卡', 'renderSettings 未挂存档卡');
});
t('★ 权限：班主任专属（班委守卫 + teacher-only 裁剪）', () => {
  has(html, "class=\"btn btn-outline btn-sm teacher-only\" onclick=\"openSemesterReset()\"", '按钮缺 teacher-only');
  const guard = 'if(window.__cmRole === \'committee\'){ showToast(\'学期结算仅班主任可用\', \'warning\'); return; }';
  eq((html.match(new RegExp(guard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 2, 'open/confirm 班委守卫应为 2 处');
});

/* ── 2. 功能：合并策略（真跑） ── */
t('msSemester：startAt 新者胜；remote 无效不动本机', () => {
  const { msSemester } = sandbox([extractFn('msSemester')]);
  let m = { semester: { name: 'A', startAt: 100 } };
  msSemester(m, m, { semester: { name: 'B', startAt: 200 } }, 'semester');
  eq(m.semester.name, 'B', '新学期应胜出');
  m = { semester: { name: 'A', startAt: 300 } };
  msSemester(m, m, { semester: { name: 'B', startAt: 200 } }, 'semester');
  eq(m.semester.name, 'A', '本机较新应保留');
  m = { semester: { name: 'A', startAt: 100 } };
  msSemester(m, m, { semester: { name: '', startAt: 0 } }, 'semester');
  eq(m.semester.name, 'A', 'remote 无效应不动');
});
t('msSemesterHist：按 id 并集、不重复、不复活', () => {
  const { msSemesterHist } = sandbox([extractFn('msSemesterHist')]);
  const m = { semesterHistory: [{ id: 1, name: 'A' }] };
  msSemesterHist(m, m, { semesterHistory: [{ id: 2, name: 'B' }, { id: 1, name: 'A-dup' }] }, 'semesterHistory');
  eq(m.semesterHistory.length, 2, '并集后应为 2 条');
  eq(m.semesterHistory[1].name, 'B', '新档应追加');
});

/* ── 3. 功能：币重算豁免 settle（真跑，含不变式） ── */
t('cbRecomputeOpCoins：settle 划界流水 coin 恒 0；后续流水「当时总分」含结算跳变', () => {
  // 依赖链补齐（补沙箱不改产品）：cbCoinOfAmount → cbRewardEligible → 两个常量
  has(html, 'const CB_REWARD_MIN = 100;', '发币门槛常量');
  has(html, 'const CB_COIN_DISCOUNT = 0.5;', '打折常量');
  const sb = sandbox(
    [extractFn('cbRecomputeOpCoins'), extractFn('cbCoinOfAmount'), extractFn('cbRewardEligible')],
    'var CB_REWARD_MIN = 100, CB_COIN_DISCOUNT = 0.5;'
  );
  const student = { id: 5, creditBase: 100 };
  const ops = [
    { id: 1, studentId: 5, amount: 10, time: 100, coin: 10 },
    { id: 2, studentId: 5, amount: 15, time: 200, coin: 0, settle: true },   // 85→100 的划界（示意）
    { id: 3, studentId: 5, amount: 5, time: 300, coin: 0 },
  ];
  const changed = sb.cbRecomputeOpCoins(student, ops);
  eq(ops[1].coin, 0, 'settle 流水 coin 不得被重算');
  eq(ops[0].coin, sb.cbCoinOfAmount(10, 110), 'o1 应按当时总分 110 重算');
  eq(ops[2].coin, sb.cbCoinOfAmount(5, 130), 'o3 应按含结算后的 130 重算');
  eq(changed, 1, '改动笔数应为 1（o1 本就正确不动、settle 跳过，仅 o3 补算）');
  eq(100 + 10 + 15 + 5, 130, 'credit = creditBase + Σ流水 不变式');
});
t('cbCoinOfOp：settle（coin=0）不产生币；撤销流水不产生币', () => {
  const { cbCoinOfOp } = sandbox([extractFn('cbCoinOfOp')]);
  eq(cbCoinOfOp({ amount: 15, coin: 0, settle: true }), 0, 'settle coin=0 应为 0 币');
  eq(cbCoinOfOp({ amount: 15, coin: 10, state: 'revoked' }), 0, '撤销应为 0 币');
  eq(cbCoinOfOp({ amount: 15 }), 15, '缺 coin 兜底 1:1');
});

console.log(`\n结果：${pass} 通过，${fail} 失败（当版 ${V}）`);
if (fail) process.exit(1);
