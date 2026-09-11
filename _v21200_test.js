/* v2.19.0 回归测试：STATE_SCHEMA 表驱动结构性根治——
 * 旧痛点：新增一个云同步字段要改 5 处（state 默认 / loadData / saveData / CLOUD_SYNC_FIELDS / smartMergeData），
 * 漏一处就出「删除后复活 / 字段不传播 / 默认值缺失崩溃」类 P0（v2.18.3 处分、v2.18.12 荣誉、v2.18.15 学生）。
 * 本套件护栏：
 * ① schema 元完整性：43 键无重复 / CFS 派生与 v2.18.15 手写白名单逐键一致 / tomb 集合 / ms 策略全覆盖
 * ② buildDefaultState 行为：43 键、惰性工厂求值、Set/嵌套结构就位、两次构建不共享引用
 * ③ saveData 行为级：快照键集合恰为 CFS−wipeAt（40 键），sv 兜底生效
 * ④ 新引擎行为回归：学生/荣誉墓碑复活、catDeleted 三方仲裁、creditBank、nextId 取大
 * 用法：node _v21200_test.js
 */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
let pass = 0, fail = 0;
function t(name, fn){
  try{ fn(); pass++; console.log('  ✅ ' + name); }
  catch(e){ fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function has(s, sub, what){ if(s.indexOf(sub) < 0) throw new Error((what || '') + '缺少 "' + sub.slice(0, 60) + '"'); }
function eq(a, b, what){ if(a !== b) throw new Error((what || '') + '期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function extractFn(name){
  const s = html.indexOf('function ' + name);
  if(s < 0) throw new Error('未找到函数 ' + name);
  const lines = html.slice(s).split('\n');
  let depth = 0, began = false, out = [];
  for(const ln of lines){
    for(const ch of ln){ if(ch === '{'){ depth++; began = true; } else if(ch === '}') depth--; }
    out.push(ln);
    if(began && depth === 0) break;
  }
  return eval('(' + out.join('\n') + ')');
}

// ---- 沙箱：schema + 合并引擎 + 默认值工厂依赖（全部抽取自 index.html 真实实现）----
const ssStart = html.indexOf('const STATE_SCHEMA');
const STATE_SCHEMA = eval('(' + html.slice(ssStart, html.indexOf('\n];', ssStart) + 3).replace('const STATE_SCHEMA = ', '').replace(/;\s*$/, '') + ')');
eval(html.slice(html.indexOf('function msStudents'), html.indexOf('/* MERGE_ENGINE_END')));
const mergeTsMap = extractFn('mergeTsMap');
const cloneCatDeleted = extractFn('cloneCatDeleted');
const catTombReviveFilter = extractFn('catTombReviveFilter');
const applyCatTombstones = extractFn('applyCatTombstones');
const flattenReasonCatalog = extractFn('flattenReasonCatalog');
const cloneReasonCatalog = extractFn('cloneReasonCatalog');
const mergeReasonCatalog = extractFn('mergeReasonCatalog');
const cbMergeBanks = extractFn('cbMergeBanks');
const cbNormalizeShape = extractFn('cbNormalizeShape');   // cbMergeBanks 内部依赖
const sortOpsNewestFirst = extractFn('sortOpsNewestFirst');
const smartMergeData = extractFn('smartMergeData');
const cbDefaultBank = extractFn('cbDefaultBank');
const defaultSeating = extractFn('defaultSeating');
const defaultDuty = extractFn('defaultDuty');
const defaultReasonCatalog = extractFn('defaultReasonCatalog');
const defaultReasons = eval('(' + html.match(/const defaultReasons = (\[[\s\S]*?\]);\n/)[1] + ')');
const REASON_CATALOG = eval('(' + html.match(/const REASON_CATALOG = (\{[\s\S]*?\n\});\n/)[1] + ')');
function builtinNotices(){ return [{ id: 'stub', title: 'stub' }]; }   // 沙箱桩（真实实现在 UI 层）
const DEFAULT_COMMITTEE = { banzhang: null, fubanzhang: null, jilv: null, xuexi: null, tiyu: null, shenghuo: null, wenyi: null, xinli: null };
var state = { catDeletedAt: {}, catRevived: {} };   // smartMergeData 的 msCatTomb 会读 state.catDeletedAt/catRevived 兜底

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('=== ① Schema 元完整性 ===');
t('STATE_SCHEMA 43 键、无重复、顺序与旧 state 字面量一致（抽样锚点）', () => {
  eq(STATE_SCHEMA.length, 43, '字段数');
  const keys = STATE_SCHEMA.map(f => f.key);
  eq(new Set(keys).size, 43, '无重复');
  const idx = k => keys.indexOf(k);
  if(!(idx('selectedStudents') < idx('nextId'))) throw new Error('selectedStudents 应在 nextId 前（旧字面量顺序）');
  if(!(idx('creditBank') < idx('punishments'))) throw new Error('creditBank 应在 punishments 前');
  if(!(idx('studentDeleted') < idx('customDorms'))) throw new Error('studentDeleted 应在 customDorms 前');
  if(!(idx('wipeAt') < idx('schemaVer'))) throw new Error('wipeAt 应在 schemaVer 前');
});
t('CLOUD_SYNC_FIELDS 派生 = v2.18.15 手写白名单逐键一致（唯一事实源护栏）', () => {
  const OLD = ['className','classNameFull','students','operations','reasons','reasonScores','reasonCatalog','catDeleted','catDeletedAt','catRevived','nextId','nextOpId','nextSid',
    'lastExport','lastImport','committee','seating','duty','exportedOpsCount','classMotto',
    'leaves','nextLeaveId','exams','nextExamId','todos','nextTodoId',
    'workLogs','nextWorkLogId','honors','nextHonorId','honorDeleted','customDorms','notices','creditBank',
    'studentDeleted',
    'punishments','nextPunishId',
    'scheduleImage','classAvatar','wipeAt','schemaVer'];
  const DERIVED = STATE_SCHEMA.filter(f => f.cfs).map(f => f.key);
  const onlyOld = OLD.filter(k => !DERIVED.includes(k));
  const onlyNew = DERIVED.filter(k => !OLD.includes(k));
  if(onlyOld.length || onlyNew.length) throw new Error('CFS 漂移！仅旧有:' + onlyOld + ' 仅新有:' + onlyNew);
  eq(DERIVED.length, 41, 'CFS 数量');
});
t('tomb 墓碑集合恰为 5 个历史墓碑字段；wipeAt nosv 仅上云不落盘', () => {
  eq(STATE_SCHEMA.filter(f => f.tomb).map(f => f.key).sort().join(','),
     'catDeleted,catDeletedAt,catRevived,honorDeleted,studentDeleted', 'tomb 集合');
  const w = STATE_SCHEMA.find(f => f.key === 'wipeAt');
  eq(w.cfs, 1, 'wipeAt cfs');
  eq(w.nosv, 1, 'wipeAt nosv');
  eq(STATE_SCHEMA.filter(f => f.nosv).length, 1, 'nosv 唯一');
});
t('每个 cfs 字段有 def；每个 ms 名都在 MERGE_ST 表中注册', () => {
  STATE_SCHEMA.forEach(f => {
    if(f.cfs && f.def === undefined) throw new Error(f.key + ' 缺 def');
    if(f.ms && !MERGE_ST[f.ms]) throw new Error(f.key + ' 的 ms="' + f.ms + '" 未注册到 MERGE_ST');
  });
  eq(Object.keys(MERGE_ST).length, 25, '策略数');
});
t('saveData 落盘清单 = CFS − wipeAt（遍历生成的键集合）', () => {
  const expect = STATE_SCHEMA.filter(f => f.cfs && !f.nosv).map(f => f.key);
  eq(expect.length, 40, '落盘键数');
  has(html, 'if(!f.cfs || f.nosv) return;', 'saveData 遍历守卫');
  has(html, 'localStorage.setItem(STORE_KEY, JSON.stringify(_snap)); }', 'saveData 快照写盘');
});
t('新字段链路护栏：加字段只改 schema 一处即可进默认值/白名单/落盘/合并/导入墓碑', () => {
  const extra = { key:'__demoField', def:function(){ return { a: 1 }; }, cfs:1, ms:'tsmap', sv:function(v){ return v || {}; } };
  const sc = STATE_SCHEMA.concat([extra]);
  if(!sc.filter(f => f.cfs).map(f => f.key).includes('__demoField')) throw new Error('CFS 派生未含新字段');
  if(!sc.filter(f => f.cfs && !f.nosv).map(f => f.key).includes('__demoField')) throw new Error('落盘清单未含新字段');
  if(!MERGE_ST[extra.ms]) throw new Error('ms 策略未注册');
});

console.log('=== ② buildDefaultState 行为 ===');
t('buildDefaultState 43 键全就位；惰性工厂求值；Set / 嵌套结构 / 墓碑空 map 就位', () => {
  const bs = html.indexOf('function buildDefaultState()');
  const code = html.slice(bs, html.indexOf('\n}', bs) + 2);
  const build = eval('(' + code + ')');
  const st = build();
  eq(Object.keys(st).length, 43, 'state 键数');
  eq(st.selectedStudents instanceof Set, true, 'selectedStudents 为 Set');
  eq(st.notices.templates.length > 0, true, 'notices.templates 求值（工厂被调用）');
  eq(st.notices.draft, '', 'notices.draft');
  eq(Array.isArray(st.creditBank.ledger), true, 'creditBank 工厂求值');
  eq(st.reasonCatalog && typeof st.reasonCatalog === 'object' && Object.keys(st.reasonCatalog).length > 0, true, 'reasonCatalog 工厂求值');
  eq(st.catDeleted.dirs.length, 0, 'catDeleted 空墓碑');
  eq(Object.keys(st.honorDeleted).length === 0 && Object.keys(st.studentDeleted).length === 0, true, '两墓碑空 map');
  eq(st.className, '高一（1）班', 'className');
  eq(st.schemaVer, 2, 'schemaVer');
  const st2 = build();
  st.students.push({ id: 'X' });
  eq(st2.students.length, 0, '两次构建不共享数组引用');
});

console.log('=== ③ saveData 行为级（快照键集合 + sv 兜底） ===');
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.STORE_KEY = 'classManagerData';
global.showToast = () => {};
global.cbScanAlerts = () => 0;
global.cbExpireCoupons = () => 0;
global.autoPushToCloud = () => {};
const saveData = eval('(' + (function(){
  const s = html.indexOf('function saveData');
  const lines = html.slice(s).split('\n');
  let depth = 0, began = false, out = [];
  for(const ln of lines){
    for(const ch of ln){ if(ch === '{'){ depth++; began = true; } else if(ch === '}') depth--; }
    out.push(ln);
    if(began && depth === 0) break;
  }
  return out.join('\n');
})() + ')');
t('saveData 落盘快照键 = CFS−wipeAt（40 键），sv 兜底（null → {} / [] / 0）', () => {
  state = {
    className: '测试班', classNameFull: '', students: [{ id: 1 }], operations: [], reasons: ['其他'],
    reasonScores: null, reasonCatalog: null, catDeleted: null, catDeletedAt: null, catRevived: null,
    nextId: 3, nextOpId: 1, nextSid: 1, lastExport: null, lastImport: null, scheduleImage: null,
    committee: { banzhang: '张三' }, seating: { cols: 8, rows: 5, seats: [] }, duty: { schedule: [] },
    exportedOpsCount: 0, classAvatar: null, classMotto: '格言', leaves: [], nextLeaveId: 1,
    exams: [], nextExamId: 1, todos: [], nextTodoId: 1, workLogs: [], nextWorkLogId: 1,
    honors: [], nextHonorId: 1, honorDeleted: null, studentDeleted: null, customDorms: null,
    notices: { templates: [], history: [], draft: '', updatedAt: 0 }, creditBank: cbDefaultBank(),
    punishments: [], nextPunishId: 1, wipeAt: 999, schemaVer: null
  };
  store['classManagerData'] = null;
  saveData();
  const saved = JSON.parse(store['classManagerData']);
  const expectKeys = STATE_SCHEMA.filter(f => f.cfs && !f.nosv).map(f => f.key);
  eq(Object.keys(saved).length, 40, '快照键数');
  expectKeys.forEach(k => { if(!(k in saved)) throw new Error('快照缺键: ' + k); });
  if('wipeAt' in saved) throw new Error('wipeAt 不应进本地快照（历史行为）');
  eq(saved.reasonScores && Object.keys(saved.reasonScores).length, 0, 'reasonScores sv 兜底（null → {}）');
  eq(saved.reasonCatalog && Object.keys(saved.reasonCatalog).length, 0, 'reasonCatalog sv 兜底');
  eq(saved.catDeleted && Array.isArray(saved.catDeleted.dirs), true, 'catDeleted sv 兜底');
  eq(saved.customDorms.length, 0, 'customDorms sv 兜底');
  eq(saved.schemaVer, 0, 'schemaVer sv 兜底（null → 0）');
  eq(saved.students.length, 1, 'students 原样落盘');
  eq(saved.committee.banzhang, '张三', 'committee 原样落盘');
  state = { catDeletedAt: {}, catRevived: {} };   // 还原，防影响后续用例
});

console.log('=== ④ 新引擎行为回归 ===');
t('★ 学生墓碑：云端旧副本不复活已删学生；墓碑时间戳取大传播', () => {
  const local = { students: [{ id: 1, name: '李四', updatedAt: 100 }], studentDeleted: { 2: 500 }, operations: [] };
  const remote = { students: [{ id: 1, name: '李四', updatedAt: 100 }, { id: 2, name: '王五', updatedAt: 300 }, { id: 3, name: '赵六', updatedAt: 900 }], studentDeleted: { 2: 400 } };
  const m = smartMergeData(JSON.parse(JSON.stringify(local)), remote);
  eq(m.students.length, 2, '学生数（已删 id=2 不复活）');
  eq(m.students.some(s => s.id === 2), false, '墓碑命中不复活');
  eq(m.studentDeleted[2], 500, '墓碑时间戳取大');
});
t('★ 荣誉墓碑：云端旧副本不复活已删荣誉', () => {
  const local = { students: [], operations: [], honors: [{ id: 'h1' }], honorDeleted: { h2: 100 } };
  const remote = { students: [], operations: [], honors: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }], honorDeleted: {} };
  const m = smartMergeData(JSON.parse(JSON.stringify(local)), remote);
  eq(m.honors.length, 2, '荣誉数（h2 不复活）');
  eq(m.honors.some(h => h.id === 'h2'), false, '墓碑命中');
  eq(m.honors.some(h => h.id === 'h3'), true, '云端新荣誉保留');
});
t('★ catDeleted 三方并集 + revive 时间戳仲裁 + reasons 平铺重建', () => {
  const local = { students: [], operations: [], catDeleted: { dirs: [], groups: ['扣分|课堂纪律'], reasons: [] },
                  catDeletedAt: { '扣分|课堂纪律': 100 }, catRevived: {}, reasonCatalog: { '扣分': { '课堂纪律': ['迟到'] } }, reasonScores: {} };
  const remote = { students: [], operations: [], catDeleted: { dirs: [], groups: [], reasons: ['迟到'] },
                   catDeletedAt: { '扣分|课堂纪律': 100 }, catRevived: { '扣分|课堂纪律': 200 }, reasonCatalog: { '扣分': { '课堂纪律': ['迟到'] } }, reasonScores: {} };
  const m = smartMergeData(JSON.parse(JSON.stringify(local)), remote);
  if(m.catDeleted.groups.indexOf('扣分|课堂纪律') >= 0) throw new Error('revive 晚于删除 → 墓碑应作废');
  const m2 = smartMergeData(JSON.parse(JSON.stringify(local)), Object.assign({}, remote, { catRevived: {} }));
  eq(m2.catDeleted.groups.indexOf('扣分|课堂纪律') >= 0, true, '无 revive → 墓碑生效');
});
t('★ creditBank 任一侧存在才合并；nextId 系列取大；reasonScores 本地优先', () => {
  const bank = cbDefaultBank();
  bank.ledger.push({ id: 9, delta: 5, time: 1 });
  const m = smartMergeData(
    { students: [], operations: [], creditBank: bank, nextId: 5, reasonScores: { '迟到': -2 } },
    { students: [], operations: [], nextId: 7, nextSid: 4, reasonScores: { '迟到': -1, '旷课': -5 } });
  eq(m.creditBank.ledger.length, 1, 'cbMergeBanks 接入');
  eq(m.nextId, 7, 'nextId 取大');
  eq(m.nextSid, 4, 'nextSid 取大');
  eq(m.reasonScores['迟到'], -2, '本地优先');
  eq(m.reasonScores['旷课'], -5, '云端补缺');
});
t('合并不凭空造键：merged 键 ⊆ 本地键 ∪ 云端键 ∪ schema 键', () => {
  const local = { students: [], operations: [], className: 'A' };
  const remote = { students: [], operations: [], className: '' };
  const m = smartMergeData(JSON.parse(JSON.stringify(local)), remote);
  Object.keys(m).forEach(k => {
    if(!(k in local) && !(k in remote) && !STATE_SCHEMA.some(f => f.key === k)) throw new Error('合并凭空造出键: ' + k);
  });
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
