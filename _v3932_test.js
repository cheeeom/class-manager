/* v3.9.32 回归：设置页「更新速览」从累积式改为只留当版
 *
 * 背景：这个块从 v2.17.30 就在维护约定里写着「整体替换、不做追加」，但每版都在往下追加，
 *       攒到 v3.9.32 时展开要翻到两年前（v3.6.0 起 100+ 条）。老板要求只显示当前版本。
 *
 * 本测试钉的是**新契约**（版本无关，当版号从 sw.js 的 CACHE_NAME 反推）：
 *   ① 速览块存在且非空、标题版本 = 当版
 *   ② 块内出现过的 `（vX.Y.Z）` 只能是当版号——任何历史版本号都是「又追加了」的铁证
 *   ③ 抽样几个历史条目文案，必须已被清理（反向守卫，防止回潮）
 *   ④ 维护注释里必须留着「严禁追加」的告诫（下次别又攒起来）
 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

const VER = (function () {
  const m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(fs.readFileSync('sw.js', 'utf8'));
  return m ? m[1] : '';
})();
if (!VER) throw new Error('[版本无关化] 未能从 sw.js 反推版本号');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function ok(c, m) { if (!c) throw new Error(m || '断言失败'); }
function has(s, sub, m) { if (String(s).indexOf(sub) < 0) throw new Error(m || ('缺少 ' + sub)); }
function notHas(s, sub, m) { if (String(s).indexOf(sub) >= 0) throw new Error(m || ('不该出现 ' + sub)); }

/* 切出速览块：从 id="settingsReleaseNotes" 到它自己的闭合 </div> */
const START = 'id="settingsReleaseNotes"';
const iStart = html.indexOf(START);
ok(iStart >= 0, '缺 settingsReleaseNotes 容器');
const iClose = html.indexOf('</div>', iStart);
ok(iClose > iStart, '速览块未闭合');
const BLOCK = html.slice(iStart, iClose);
const PLAIN = BLOCK.replace(/<[^>]+>/g, '');

t('① 速览块存在、非空，标题版本 = 当版 ' + VER, () => {
  has(html, '📝 近版更新速览（' + VER + '）', '速览标题未跟版');
  ok(PLAIN.trim().length >= 30, '速览块内容过短：' + PLAIN.trim().length);
});

t('② 块内只许出现当版号 ' + VER + '（出现历史版本号 = 又开始累积了）', () => {
  const all = (BLOCK.match(/（v\d+\.\d+\.\d+）/g) || []).map(s => s.slice(1, -1));
  const bad = all.filter(v => v !== VER);
  ok(bad.length === 0, '速览里出现历史版本号：' + Array.from(new Set(bad)).join(' / '));
  ok(all.length >= 1, '速览里连当版号都没有');
});

t('③ 抽样历史条目必须已被清理（反向守卫，防止回潮）', () => {
  const gone = [
    '数据分析图表引擎 + 学期报告引擎上线',
    '学生自助兑换（v3.7.1）',
    '学号续号与批量配学号（v3.7.5）',
    '点名与请假口径对齐（',
    '成绩页看得全、收得拢（v3.9.29）',
    '考试科目与满分可继承可改（v3.9.30）',
    '已建的考试可以直接改（v3.9.31）'
  ];
  const alive = gone.filter(s => BLOCK.indexOf(s) >= 0);
  ok(alive.length === 0, '这些历史条目还在速览块里：' + alive.join(' / '));
});

t('④ 维护注释保留「严禁追加」告诫（下次别再攒）', () => {
  const i = html.indexOf('维护约定（v2.20.0 起');
  ok(i >= 0, '维护约定注释不见了');
  const seg = html.slice(i, i + 520);
  has(seg, '整块替换', '约定里没有「整块替换」');
  has(seg, '严禁在旧条目后面追加', '约定里没有「严禁追加」');
});

t('⑤ 速览默认收起（点标题展开，v3.0.2 契约不变）', () => {
  has(BLOCK, 'style="display:none;margin-top:8px', '速览块默认未收起');
  has(html, 'function toggleReleaseNotes(){', 'toggleReleaseNotes 缺失');
});

t('⑥ 条目数控制在 1-3 条（老板要的是「只看当前版本」，不是又一坨）', () => {
  const n = (BLOCK.match(/<br>/g) || []).length;
  ok(n >= 1 && n <= 3, '速览条目数应在 1-3 条，实际 ' + n + ' 条');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
