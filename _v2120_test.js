/* v2.12.0 回归测试：学分原因多级选择器（方向→大类→原因）
   从 index.html 抽取真实实现。运行：node _v2120_test.js */
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
function extractConst(name, re) {
  const m = html.match(re || new RegExp('const ' + name + ' = ([\\s\\S]*?);\\n'));
  if (!m) throw new Error('未找到常量 ' + name);
  return eval('(' + m[1] + ')');
}

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== 原因目录完整性 ===');
const defaultReasons = extractConst('defaultReasons', /const defaultReasons = (\[[\s\S]*?\]);\n/);
const defaultReasonScores = extractConst('defaultReasonScores', /const defaultReasonScores = (\{[\s\S]*?\});\n/);
const REASON_CATALOG = extractConst('REASON_CATALOG', /const REASON_CATALOG = (\{[\s\S]*?\n\});\n/);
const flat = Object.values(REASON_CATALOG).flatMap(g => Object.values(g).flat());

t('目录覆盖全部 27 项制度原因（不多不少）', () => {
  const missing = defaultReasons.filter(r => !flat.includes(r));
  const extra = flat.filter(r => !defaultReasons.includes(r));
  if (missing.length) throw new Error('目录缺少: ' + missing.join(','));
  if (extra.length) throw new Error('目录多余: ' + extra.join(','));
  eq(flat.length, defaultReasons.length);
});
t('每个目录原因在制度分值表中都有分值（除「其他」）', () => {
  const noScore = flat.filter(r => r !== '其他' && typeof defaultReasonScores[r] !== 'number');
  if (noScore.length) throw new Error('缺分值: ' + noScore.join(','));
});
t('「其他」无制度分值（手动填），且单独成方向', () => {
  eq(typeof defaultReasonScores['其他'], 'undefined');
  eq(JSON.stringify(Object.keys(REASON_CATALOG)), JSON.stringify(['加分','扣分','其他']));
});
t('目录键为纯中文（escapeAttr 白名单无 emoji，emoji 只能进显示文本）', () => {
  Object.keys(REASON_CATALOG).concat(Object.values(REASON_CATALOG).flatMap(g => Object.keys(g))).concat(flat).forEach(k => {
    if (!/^[a-zA-Z0-9_\-一-龥 ]+$/.test(k)) throw new Error('键含白名单外字符: ' + k);
  });
});
t('方向/大类结构：加分 4 类、扣分 6 类', () => {
  eq(Object.keys(REASON_CATALOG['加分']).length, 4);
  eq(Object.keys(REASON_CATALOG['扣分']).length, 6);
});
t('v2.17.8「违禁品烟酒手机」预设：扣分→课堂纪律 末位，制度分值 -10（模板不含旧名「违禁品」）', () => {
  if (defaultReasons.indexOf('违禁品烟酒手机') < 0) throw new Error('defaultReasons 缺违禁品烟酒手机');
  if (defaultReasons.indexOf('违禁品') >= 0) throw new Error('旧模板项「违禁品」仍残留');
  if (defaultReasonScores['违禁品烟酒手机'] !== -10) throw new Error('违禁品烟酒手机分值应为 -10');
  const gj = REASON_CATALOG['扣分']['课堂纪律'];
  if (gj[gj.length - 1] !== '违禁品烟酒手机') throw new Error('违禁品烟酒手机应为课堂纪律末位');
});

console.log('\n=== v2.17.6 自定义分值防覆盖（onCreditReasonChange） ===');
// stub DOM：creditReason 只读 value、customCredit 读写 value
const els = { creditReason: { value: '' }, customCredit: { value: '' } };
global.document = { getElementById: id => els[id] || null };
global.state = {};
global.updateCreditBtnStates = () => {};
global._creditAutofillMark = null;
const onCreditReasonChange = eval('(' + grab('function onCreditReasonChange()') + ')');
function resetEls(reason, custom){ els.creditReason.value = reason; els.customCredit.value = custom; global._creditAutofillMark = null; }
t('先手输自定义分值再选原因 → 不被制度分值覆盖（记的就是自定义分）', () => {
  global.state.reasonScores = { '课堂违纪': -3 };
  resetEls('课堂违纪', '-10');
  onCreditReasonChange();
  eq(els.customCredit.value, '-10');
});
t('输入框为空选原因 → 正常带出制度分值', () => {
  global.state.reasonScores = { '课堂违纪': -3 };
  resetEls('课堂违纪', '');
  onCreditReasonChange();
  eq(els.customCredit.value, '-3');
});
t('未手改（仍是旧原因预设）换原因 → 旧预设换新预设', () => {
  global.state.reasonScores = { '课堂违纪': -3, '扰乱课堂顶撞老师': -6 };
  resetEls('课堂违纪', '');
  onCreditReasonChange();                 // 自动带出 -3，标记 {课堂违纪,-3}
  els.creditReason.value = '扰乱课堂顶撞老师';   // 换原因，分值框未被手改
  onCreditReasonChange();
  eq(els.customCredit.value, '-6');
});
t('手改过分值再换原因 → 保留自定义值不覆盖', () => {
  global.state.reasonScores = { '课堂违纪': -3, '扰乱课堂顶撞老师': -6 };
  resetEls('课堂违纪', '');
  onCreditReasonChange();                 // 带出 -3
  els.customCredit.value = '-10';         // 老师手改为 -10（等效 onCreditInputChange 清标记）
  global._creditAutofillMark = null;
  els.creditReason.value = '扰乱课堂顶撞老师';
  onCreditReasonChange();
  eq(els.customCredit.value, '-10');
});

console.log('\n=== v2.17.6 老目录一次性补齐（backfillReasons2176） ===');
const _bfCalls = { sync: 0, save: 0 };
global.syncReasonsFromCatalog = () => { _bfCalls.sync++; };
global.saveData = () => { _bfCalls.save++; };
const backfillReasons2176 = eval('(' + grab('function backfillReasons2176()') + ')');
t('老目录（schemaVer 缺失）补齐「违禁品烟酒手机」入 扣分→课堂纪律，分值 -10，并落盘', () => {
  global.state = {
    reasonCatalog: { '加分': { '学习表现': ['月度全勤'] }, '扣分': { '课堂纪律': ['课堂违纪'] }, '其他': { '通用': ['其他'] } },
    reasonScores: { '课堂违纪': -3 }
  };
  _bfCalls.sync = 0; _bfCalls.save = 0;
  const changed = backfillReasons2176();
  eq(changed, true);
  const gj = global.state.reasonCatalog['扣分']['课堂纪律'];
  eq(gj.join(','), '课堂违纪,违禁品烟酒手机');
  eq(global.state.reasonScores['违禁品烟酒手机'], -10);
  eq(_bfCalls.sync, 1); eq(_bfCalls.save, 1);
});
t('补齐幂等：二次执行不再改动也不再落盘', () => {
  _bfCalls.sync = 0; _bfCalls.save = 0;
  const changed = backfillReasons2176();
  eq(changed, false);
  eq(_bfCalls.save, 0);
});
t('无课堂纪律大类的老目录 → 自动创建并补入违禁品烟酒手机', () => {
  global.state = {
    reasonCatalog: { '扣分': { '宿舍': ['宿舍违纪'] } },
    reasonScores: {}
  };
  _bfCalls.sync = 0; _bfCalls.save = 0;
  const changed = backfillReasons2176();
  eq(changed, true);   // 目录/分值缺失 → 仍会补齐（含用户从未有过的场景）
  eq(global.state.reasonCatalog['扣分']['课堂纪律'].join(','), '违禁品烟酒手机');
  eq(global.state.reasonScores['违禁品烟酒手机'], -10);
});

console.log('\n=== v2.17.8 原因去重（removeWeijinpinDupe） ===');
const removeWeijinpinDupe = eval('(' + grab('function removeWeijinpinDupe(cat, scores)') + ')');
t('同组已有「违禁品烟酒手机」→ 删旧名；同组只有旧名 → 就地改名；分值表归并', () => {
  const r = removeWeijinpinDupe(
    { '扣分': { '课堂纪律': ['课堂违纪','违禁品','违禁品烟酒手机'], '宿舍': ['违禁品'] }, '其他': { '通用': ['其他'] } },
    { '违禁品': -10, '违禁品烟酒手机': -10, '课堂违纪': -3 }
  );
  eq(r.changed, true);
  eq(JSON.stringify(r.cat['扣分']['课堂纪律']), JSON.stringify(['课堂违纪','违禁品烟酒手机']), '同组已有新名应只删旧名');
  eq(JSON.stringify(r.cat['扣分']['宿舍']), JSON.stringify(['违禁品烟酒手机']), '同组只有旧名应就地改名');
  eq('违禁品' in r.scores, false);
  eq(r.scores['违禁品烟酒手机'], -10);
  eq(r.scores['课堂违纪'], -3);
});
t('只有旧名且分值表无新名 → 改名并把分值带过去（v2.17.6 老数据不丢制度项）', () => {
  const r = removeWeijinpinDupe(
    { '扣分': { '课堂纪律': ['课堂违纪','违禁品'] } },
    { '违禁品': -6, '课堂违纪': -3 }
  );
  eq(r.changed, true);
  eq(JSON.stringify(r.cat['扣分']['课堂纪律']), JSON.stringify(['课堂违纪','违禁品烟酒手机']));
  eq('违禁品' in r.scores, false);
  eq(r.scores['违禁品烟酒手机'], -6, '旧分值应转移到新名');
  eq(r.scores['课堂违纪'], -3);
});
t('无旧项时返回原目录分值且 changed=false（幂等）；纯函数不改入参', () => {
  const cat = { '扣分': { '课堂纪律': ['课堂违纪','违禁品烟酒手机'] } };
  const r = removeWeijinpinDupe(cat, { '违禁品烟酒手机': -10 });
  eq(r.changed, false);
  eq(JSON.stringify(r.cat), JSON.stringify(cat));
  const cat2 = { '扣分': { '课堂纪律': ['违禁品'] } };
  const r2 = removeWeijinpinDupe(cat2, { '违禁品': -10 });
  eq(r2.changed, true);
  eq(cat2['扣分']['课堂纪律'].length, 1, '入参不应被改');
  eq(cat2['扣分']['课堂纪律'][0], '违禁品', '入参元素不应被改');
  eq(r2.cat['扣分']['课堂纪律'][0], '违禁品烟酒手机', '改名作用于返回副本');
});


console.log('\n=== 组件结构断言 ===');
t('两处容器 + 隐藏 select（rp-credit/rp-batch，creditReason/batchReason display:none）', () => {
  eq(/id="rp-credit" class="rp"/.test(html), true);
  eq(/id="rp-batch" class="rp"/.test(html), true);
  eq(/id="creditReason" style="display:none"/.test(html), true);
  eq(/id="batchReason" style="display:none"/.test(html), true);
});
t('renderReasonSelects 负责幂等初始化两个选择器', () => {
  const fn = html.match(/function renderReasonSelects\([\s\S]*?\n\}/)[0];
  ['initReasonPicker(\'rp-credit\', \'creditReason\', \'customCredit\')',
   'initReasonPicker(\'rp-batch\', \'batchReason\', \'batchCredit\')'].forEach(s => {
    if (!fn.includes(s)) throw new Error('缺少: ' + s);
  });
});
t('既有加减分逻辑仍读隐藏 select（quickCredit/customCreditApply/confirmBatchCredit 未破坏）', () => {
  ['function quickCredit(amount){', 'function customCreditApply(){', 'function confirmBatchCredit(){'].forEach(f => {
    if (!html.includes(f)) throw new Error('缺少: ' + f);
  });
  eq((html.match(/getElementById\('creditReason'\)\.value/g) || []).length >= 3, true);
});
t('.rp-panel 等 CSS 已就位', () => {
  ['.rp-panel{', '.rp-chip.rp-on', '.rp-head'].forEach(s => { if (!html.includes(s)) throw new Error('缺少 CSS: ' + s); });
});
t('rcScoreOf：有分值返回分值，0 分/无分值返回 null（不自动填分值）', () => {
  const m = html.match(/function rcScoreOf\(name\)\{[\s\S]*?\n\}/);
  global.state = { reasonScores: { '课堂违纪': -3, '零分项': 0 } };
  const rcScoreOf = eval('(' + m[0] + ')');
  eq(rcScoreOf('课堂违纪'), -3);
  eq(rcScoreOf('零分项'), null);
  eq(rcScoreOf('不存在'), null);
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
