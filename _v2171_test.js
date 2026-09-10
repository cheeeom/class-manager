/* v2.17.1 回归测试：学分体检（基准/流水/快照三账核对）
   背景：公示「最低分」与扣分流水疑似矛盾（两生都无加分、扣得多的反而分高）
   → 根因 = creditBase 反推值可能≠100 且从不展示；本套件验证体检纯函数与修复入口。
   运行：node _v2171_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function grab(sig) {
  const m = html.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('未找到函数: ' + sig);
  return m[0];
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（新增体检代码无语法错误）', () => {
  let n = 0;
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => { new Function(m[1]); n++; });
  if (!n) throw new Error('未找到主脚本块');
});

console.log('\n=== v2.18.2 版本三处同步 ===');
t('登录页 / 侧栏 / SW CACHE_NAME = v2.18.2', () => {
  if (!/login-version">v2\.18\.2</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.2 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!fs.readFileSync('sw.js', 'utf8').includes('class-manager-v2.18.2')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 体检纯函数 computeCreditAudit ===');
const liveOps = eval('(' + grab('function liveOps(ops)') + ')');   // v2.17.30
const sumCreditsByStudent = eval('(' + grab('function sumCreditsByStudent(operations)') + ')');
const computeCreditAudit = eval('(' + grab('function computeCreditAudit(students, operations)') + ')');
const applyCreditBaseFix = eval('(' + grab('function applyCreditBaseFix(student, newBase, operations)') + ')');

// 复刻老板反馈场景：余长青(基准60,扣10)、罗雪(基准100,扣40)——都无加分
const storyStudents = [
  { id: 1, sid: 'A01', name: '余长青', credit: 50, creditBase: 60 },
  { id: 2, sid: 'A02', name: '罗雪', credit: 60, creditBase: 100 },
  { id: 3, sid: 'A03', name: '张三', credit: 80, creditBase: 100 }
];
const storyOps = [
  { id: 101, studentId: 1, amount: -10 },
  { id: 102, studentId: 2, amount: -30 },
  { id: 103, studentId: 2, amount: -10 },
  { id: 104, studentId: 3, amount: -20 }
];

t('逐生核对：基准+流水=应得分；一致者 ok=true', () => {
  const rows = computeCreditAudit(storyStudents, storyOps);
  eq(rows.length, 3);
  eq(rows[0].name, '余长青'); eq(rows[0].base, 60); eq(rows[0].sum, -10);
  eq(rows[0].expect, 50); eq(rows[0].ok, true); eq(rows[0].baseOk, false);
  eq(rows[1].name, '罗雪'); eq(rows[1].sum, -40); eq(rows[1].expect, 60);
  eq(rows[1].ok, true); eq(rows[1].baseOk, true);
});

t('复现场景：罗雪扣得多(40>10)但余长青当前分更低(50<60) → 最低分=余长青，基准≠100 是根因', () => {
  const rows = computeCreditAudit(storyStudents, storyOps);
  const sorted = rows.slice().sort((a, b) => (a.credit - b.credit));
  eq(sorted[0].name, '余长青');
  const minRow = sorted[0];
  eq(minRow.base !== 100, true);           // 最低分者基准被反推成 60（老数据/导入遗留）
});

t('快照漂移检出：credit ≠ 基准+流水 → ok=false', () => {
  const rows = computeCreditAudit([{ id: 9, sid: 'B09', name: '漂移生', credit: 70, creditBase: 100 }], [{ studentId: 9, amount: -20 }]);
  eq(rows[0].ok, false);                    // 应得分 80，快照 70 → 漂移
  eq(rows[0].expect, 80);
});

t('未设基准(null)兜底：expect=null、ok=false，不抛错', () => {
  const rows = computeCreditAudit([{ id: 7, sid: 'C07', name: '新导入', credit: 80 }], []);
  eq(rows[0].base, null); eq(rows[0].expect, null); eq(rows[0].ok, false);
});

t('computeCreditAudit 纯函数不改动入参（学生对象零变化）', () => {
  const s0 = JSON.stringify(storyStudents);
  const o0 = JSON.stringify(storyOps);
  computeCreditAudit(storyStudents, storyOps);
  eq(JSON.stringify(storyStudents), s0);
  eq(JSON.stringify(storyOps), o0);
});

console.log('\n=== 受控修正 applyCreditBaseFix ===');
t('基准 60→100：快照重算为 100+流水合计，版本戳自增，返回新快照', () => {
  const s = { id: 1, sid: 'A01', name: '余长青', credit: 50, creditBase: 60, creditVer: 3 };
  const ret = applyCreditBaseFix(s, 100, storyOps);
  eq(ret, 90);                               // 100 + (-10)
  eq(s.creditBase, 100);
  eq(s.credit, 90);
  eq(s.creditVer, 4);
  eq(typeof s.updatedAt, 'number');
});

t('入参兜底：无学生 / 基准非法 → null', () => {
  eq(applyCreditBaseFix(null, 100, storyOps), null);
  eq(applyCreditBaseFix({ id: 1 }, NaN, storyOps), null);
});

console.log('\n=== 体检 UI 接线 ===');
t('设置页「数据管理」有体检按钮', () => {
  if (!html.includes('onclick="openCreditAudit()"')) throw new Error('按钮未接线');
  if (!html.includes('🔍 学分体检')) throw new Error('按钮文案缺失');
});
t('体检弹窗骨架存在（creditAuditModal + 容器）', () => {
  if (!html.includes('id="creditAuditModal"')) throw new Error('弹窗缺失');
  if (!html.includes('id="creditAuditBody"')) throw new Error('内容容器缺失');
});
['openCreditAudit', 'renderCreditAudit', 'creditAuditReconcileAll', 'creditAuditReconcileOne', 'creditAuditFixBase'].forEach(fn => {
  t('函数已定义：' + fn, () => {
    if (!new RegExp('function ' + fn + '\\(').test(html)) throw new Error(fn + ' 未定义');
  });
});
t('体检说明中点名 v2.15.0 基准反推机制与「基准→100」纠正入口', () => {
  if (!html.includes('基准→100')) throw new Error('纠正按钮文案缺失');
  if (!html.includes('反推')) throw new Error('机制说明缺失');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
