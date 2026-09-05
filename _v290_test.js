/* v2.9.0 回归测试：寝室管理（标签派生）+ 班委 8 岗标签联动 + 学分制度对齐
   从 index.html 抽取真实实现，锁死行为——防止后续改动把联动关系改坏。
   运行：node _v290_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + name);
  return eval('(' + m[0] + ')');
}
function extractConst(name) {
  // 单行 const 或跨行数组/对象：统一去掉声明头再 eval 表达式本身
  const single = html.match(new RegExp('const ' + name + ' = [^\\n]*;'));
  if (single) return eval('(' + single[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
  const multiArr = html.match(new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\n\\];'));
  if (multiArr) return eval('(' + multiArr[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
  const multiObj = html.match(new RegExp('const ' + name + ' = \\{[\\s\\S]*?\\n\\};'));
  if (multiObj) return eval('(' + multiObj[0].replace(/^const\s+\w+\s*=\s*/, '').replace(/;$/, '') + ')');
  throw new Error('未找到常量 ' + name);
}

const committeeConfig = extractConst('committeeConfig');
const COMMITTEE_TAG = '班委';
const COMMITTEE_POSITION_TAGS = committeeConfig.map(c => c.tag);
const DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
const defaultReasonScores = extractConst('defaultReasonScores');
const DAY_TAG = '走读';
const LEADER_TAG = '寝室长';
const DORM_RE = /^\d+栋-?\d+室$/;

const normalizeDormTag = extractFn('normalizeDormTag');
const isDormTag = extractFn('isDormTag');
const dormNoOf = extractFn('dormNoOf');
const studentGender = extractFn('studentGender');
const isDayBoarding = extractFn('isDayBoarding');
const buildDormMap = extractFn('buildDormMap');
const syncCommitteeTags = extractFn('syncCommitteeTags');
const creditLevel = extractFn('creditLevel');
const monthKeyOf = extractFn('monthKeyOf');
const monthlySettlePlan = extractFn('monthlySettlePlan');
const smartMergeData = extractFn('smartMergeData');

var state = {};

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; console.log('  ❌', name, '—', e.message); }
}
function eq(a, b) { if (a !== b) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function deepeq(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

function mkStudent(o) {
  return Object.assign({ id: o.id, sid: o.sid || '2026' + String(o.id).padStart(3, '0'), name: o.name, credit: 100, tags: o.tags || [], profile: { gender: o.gender || '' } }, {});
}

console.log('=== 1. 制度对齐：8 个班委岗位 ===');
t('常设岗位数量为 8（制度第二章）', () => eq(committeeConfig.length, 8));
t('岗位齐全且与制度一致', () => {
  deepeq(committeeConfig.map(c => c.title), ['班长', '副班长兼团支书', '纪律委员', '学习委员', '体育委员', '生活委员', '文艺委员', '心理委员']);
});
t('副班长岗位标签为「副班长」（团支书合并为一岗）', () => {
  eq(committeeConfig.filter(c => c.key === 'fubanzhang')[0].tag, '副班长');
});
t('每个岗位都有职责描述', () => {
  committeeConfig.forEach(c => { if (!c.desc || c.desc.length < 10) throw new Error(c.title + ' 职责缺失'); });
});
t('岗位颜色均在 CSS 中定义（blue/purple/green/orange/red/teal/pink/indigo）', () => {
  const ok = ['blue', 'purple', 'green', 'orange', 'red', 'teal', 'pink', 'indigo'];
  committeeConfig.forEach(c => { if (ok.indexOf(c.color) < 0) throw new Error(c.title + ' 色系未定义: ' + c.color); });
});

console.log('=== 2. 班委标签联动（任命表＝唯一真源） ===');
t('任命后自动打「班委」+岗位标签', () => {
  state = { students: [mkStudent({ id: 1, name: '张三', tags: [] })], committee: Object.assign({}, DEFAULT_COMMITTEE) };
  state.committee.jilv = 1;
  syncCommitteeTags();
  deepeq(state.students[0].tags.sort(), ['班委', '纪律委员'].sort());
});
t('免职后岗位标签与「班委」全部摘除', () => {
  state.committee.jilv = null;
  syncCommitteeTags();
  deepeq(state.students[0].tags, []);
});
t('兼任两岗：两个岗位标签都在，免一岗仍保留「班委」', () => {
  state.committee.banzhang = 1;
  state.committee.xuexi = 1;
  syncCommitteeTags();
  deepeq(state.students[0].tags.sort(), ['班长', '学习委员', '班委'].sort());
  state.committee.xuexi = null;
  syncCommitteeTags();
  deepeq(state.students[0].tags.sort(), ['班长', '班委'].sort());
});
t('换人任命：旧任自动摘牌，不会两人同时挂同一岗位', () => {
  state = { students: [mkStudent({ id: 1, name: '张三' }), mkStudent({ id: 2, name: '李四' })], committee: Object.assign({}, DEFAULT_COMMITTEE) };
  state.committee.banzhang = 1; syncCommitteeTags();
  state.committee.banzhang = 2; syncCommitteeTags();
  deepeq(state.students[0].tags, []);
  deepeq(state.students[1].tags.sort(), ['班长', '班委'].sort());
});
t('旧「团支书」标签自动清除（制度已合并为副班长）', () => {
  state.students[0].tags = ['团支书', '班委'];
  state.committee.fubanzhang = 1; syncCommitteeTags();
  deepeq(state.students[0].tags.sort(), ['副班长', '班委'].sort());
  state.committee.fubanzhang = null; syncCommitteeTags();
  deepeq(state.students[0].tags, []);
});
t('非班委标签（寝室号/走读/寝室长）不被误删', () => {
  state.students[0].tags = ['6栋-802室', '走读', '寝室长', '课代表'];
  state.committee.banzhang = 1; syncCommitteeTags();
  deepeq(state.students[0].tags.sort(), ['6栋-802室', '走读', '寝室长', '课代表', '班长', '班委'].sort());
});
t('重复调用不产生重复标签（幂等）', () => {
  syncCommitteeTags(); syncCommitteeTags();
  eq(state.students[0].tags.filter(x => x === '班长').length, 1);
  eq(state.students[0].tags.filter(x => x === '班委').length, 1);
});

console.log('=== 3. 寝室管理（标签派生） ===');
t('旧床号格式自动去床号', () => {
  eq(normalizeDormTag('6栋-802室-7床'), '6栋-802室');
  eq(normalizeDormTag('6栋802室2床'), '6栋802室');
  eq(normalizeDormTag('6栋-802室'), '6栋-802室');
});
t('寝室号标签识别（含无横杠写法）', () => {
  eq(isDormTag('6栋-802室'), true);
  eq(isDormTag('6栋802室'), true);
  eq(isDormTag('走读'), false);
  eq(isDormTag('班委'), false);
  eq(isDormTag('6栋-802'), false);
});
t('走读 / 寝室号提取正确', () => {
  const s = mkStudent({ id: 3, name: '王五', tags: ['走读', '课代表'] });
  eq(dormNoOf(s), '');
  eq(isDayBoarding(s), true);
  const s2 = mkStudent({ id: 4, name: '赵六', tags: ['7栋-214室-3床', '寝室长'] });
  eq(dormNoOf(s2), '7栋-214室');
  eq(isDayBoarding(s2), false);
});
t('按寝室聚合：人数、寝室长、楼栋房间号自然排序', () => {
  const students = [
    mkStudent({ id: 1, name: '甲', sid: '2026001', tags: ['6栋-802室'] }),
    mkStudent({ id: 2, name: '乙', sid: '2026002', tags: ['6栋-802室', '寝室长'] }),
    mkStudent({ id: 3, name: '丙', sid: '2026003', tags: ['6栋-801室'] }),
    mkStudent({ id: 4, name: '丁', sid: '2026004', tags: ['走读'] })
  ];
  const dorms = buildDormMap(students);
  eq(dorms.length, 2);
  eq(dorms[0].no, '6栋-801室');
  eq(dorms[1].no, '6栋-802室');
  eq(dorms[1].members.length, 2);
  eq(dorms[1].members.filter(m => m.leader)[0].name, '乙');
  eq(dorms[0].members.filter(m => m.leader).length, 0);
});
t('走读生不进寝室聚合', () => {
  const dorms = buildDormMap([mkStudent({ id: 1, name: '甲', tags: ['走读'] })]);
  eq(dorms.length, 0);
});

console.log('=== 4. 学分模块：制度对齐 ===');
t('学分等级判定（制度第六章）', () => {
  eq(creditLevel(105).label, '优秀');
  eq(creditLevel(100).label, '优秀');
  eq(creditLevel(95).label, '合格');
  eq(creditLevel(90).label, '合格');
  eq(creditLevel(85).label, '一般');
  eq(creditLevel(80).label, '一般');
  eq(creditLevel(79).label, '不合格');
});
t('制度分值：迟到-2 / 旷课-5 / 作弊-8 / 月度全勤+3 / 校级获奖+5', () => {
  eq(defaultReasonScores['迟到早退'], -2);
  eq(defaultReasonScores['旷课'], -5);
  eq(defaultReasonScores['作业抄袭考试作弊'], -8);
  eq(defaultReasonScores['月度全勤'], 3);
  eq(defaultReasonScores['校级获奖'], 5);
});
t('月度结算：本月无扣分者 +3，在任班委额外 +3', () => {
  const now = new Date('2026-09-15T10:00:00').getTime();
  state = {
    students: [mkStudent({ id: 1, name: '甲' }), mkStudent({ id: 2, name: '乙' }), mkStudent({ id: 3, name: '丙' })],
    operations: [],
    committee: Object.assign({}, DEFAULT_COMMITTEE)
  };
  state.committee.banzhang = 1;
  const plan = monthlySettlePlan(now);
  eq(plan.attend.length, 3);
  eq(plan.bonus.length, 1);
  eq(plan.bonus[0].name, '甲');
  eq(plan.attend[0].amount, 3);
});
t('月度结算：本月有违纪扣分者不参与', () => {
  const now = new Date('2026-09-15T10:00:00').getTime();
  state.operations = [{ id: 1, studentId: 3, studentName: '丙', amount: -2, reason: '迟到早退', time: new Date('2026-09-10T08:00:00').getTime() }];
  const plan = monthlySettlePlan(now);
  eq(plan.attend.filter(x => x.id === 3).length, 0);
  eq(plan.attend.length, 2);
});
t('月度结算：上月扣分不影响本月，跨月记录正确过滤', () => {
  const now = new Date('2026-09-15T10:00:00').getTime();
  state.operations = [{ id: 2, studentId: 1, studentName: '甲', amount: -5, reason: '旷课', time: new Date('2026-08-20T08:00:00').getTime() }];
  const plan = monthlySettlePlan(now);
  eq(plan.attend.filter(x => x.id === 1).length, 1);
});
t('月度结算幂等：已结算过的不再重复加分', () => {
  const now = new Date('2026-09-15T10:00:00').getTime();
  state.operations = [
    { id: 3, studentId: 1, studentName: '甲', amount: 3, reason: '月度全勤', time: new Date('2026-09-01T08:00:00').getTime() },
    { id: 4, studentId: 1, studentName: '甲', amount: 3, reason: '班委履职加分', time: new Date('2026-09-01T08:00:00').getTime() }
  ];
  const plan = monthlySettlePlan(now);
  eq(plan.attend.filter(x => x.id === 1).length, 0);
  eq(plan.bonus.filter(x => x.id === 1).length, 0);
});

console.log('=== 5. 云端合并：旧数据补齐新岗位键 ===');
t('本地 5 岗 + 远端 5 岗 → 合并后 8 键齐全', () => {
  const local = { students: [mkStudent({ id: 1, name: '甲' })], committee: { banzhang: 1, fubanzhang: null, xuexi: null, shenghuo: null, tiyu: null } };
  const remote = { students: [], committee: { banzhang: null, fubanzhang: null, xuexi: 1, shenghuo: null, tiyu: null } };
  const merged = smartMergeData(local, remote);
  eq(Object.keys(merged.committee).length, 8);
  eq(merged.committee.banzhang, 1);      // 本地任命保留
  eq(merged.committee.xuexi, 1);         // 远端补位
  eq(merged.committee.jilv, null);       // 新岗补 null
  eq(merged.committee.wenyi, null);
  eq(merged.committee.xinli, null);
});
t('合并后标签仍能正确重算（本地任命不被覆盖）', () => {
  const merged = smartMergeData(
    { students: [mkStudent({ id: 1, name: '甲' }), mkStudent({ id: 2, name: '乙' })], committee: { banzhang: 1, fubanzhang: null, xuexi: null, shenghuo: null, tiyu: null } },
    { students: [], committee: { banzhang: 2, fubanzhang: null, xuexi: null, shenghuo: null, tiyu: null } }
  );
  state = merged;
  state.committee = merged.committee;
  syncCommitteeTags();
  eq(state.students.filter(s => s.id === 1)[0].tags.indexOf('班长') >= 0, true);
});

console.log('\n' + (fail === 0 ? `✅ 全部通过（${pass} 项）` : `❌ ${fail} 项失败 / 共 ${pass + fail} 项`));
process.exit(fail === 0 ? 0 : 1);
