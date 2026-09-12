/* v2.18.13 回归测试：批量导入学生表格（.xlsx / .csv，按表头自动识别） ——
 * ① CSV 解析（RFC4180）② 内置 ZIP + DEFLATE 解压 ③ xlsx 网格读取（sharedStrings）
 * ④ 表头自动识别（姓名/性别/家长电话/家长/学号/寝室同义词）⑤ planStudentImport 纯函数
 * 夹具：openpyxl 生成的真实 xlsx（ZIP_DEFLATED + sharedStrings），base64 内嵌。
 * 运行：node _v2197_test.js */
const fs = require('fs');
const zlib = require('zlib');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

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
const parseCSVGrid = extractFn('parseCSVGrid');
const decodeTableText = extractFn('decodeTableText');
const inflateRaw = extractFn('inflateRaw');
const unzipEntries = extractFn('unzipEntries');
const readXlsxGrid = extractFn('readXlsxGrid');
const normHeader = extractFn('normHeader');
const detectStudentCols = extractFn('detectStudentCols');
const planStudentImport = extractFn('planStudentImport');

console.log('=== 语法检查 ===');
t('index.html 主 <script> 块可被完整编译（无语法错误）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});

console.log('\n=== ① CSV 解析 ===');
t('基础解析：逗号/引号内逗号/转义引号/CRLF', () => {
  const g = parseCSVGrid('姓名,性别,家长电话\r\n张三,男,"138,0000,0001"\r\n"李""四",女,139\r\n');
  eq(g.length, 3, '行数');
  eq(g[0].join('|'), '姓名|性别|家长电话');
  eq(g[1][2], '138,0000,0001', '引号内逗号');
  eq(g[2][0], '李"四', '转义引号');
});
t('全空行被过滤；无引号字段正常', () => {
  const g = parseCSVGrid('a,b\n\n\nc,d\n');
  eq(g.length, 2);
  eq(g[1].join('|'), 'c|d');
});
t('decodeTableText：UTF-8 正常解码', () => {
  const u8 = new TextEncoder().encode('姓名,性别\n张三,男');
  eq(decodeTableText(u8), '姓名,性别\n张三,男');
});

console.log('\n=== ② DEFLATE 解压（对标准 zlib 压缩器交叉验证） ===');
t('inflateRaw 解开 zlib.deflateRawSync 的流（含重复片段）', () => {
  const plain = '班主任工作台 v2.18.13 '.repeat(50) + '寝室管理-荣誉墙-学分银行-纯本地模式 '.repeat(30);
  const deflated = zlib.deflateRawSync(Buffer.from(plain, 'utf8'));
  const out = Buffer.from(inflateRaw(new Uint8Array(deflated))).toString('utf8');
  eq(out, plain);
});
t('stored 块（不压缩）也能解', () => {
  const plain = Buffer.from('STORED BLOCK 1234567890');
  const zlibRaw = zlib.deflateRawSync(plain, { level: 0 });
  eq(Buffer.from(inflateRaw(new Uint8Array(zlibRaw))).toString('utf8'), plain.toString('utf8'));
});

console.log('\n=== ③ xlsx 端到端（openpyxl 真实夹具） ===');
const FIXTURE_B64 = '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';
t('readXlsxGrid 解析出表头与全部数据行（sharedStrings + inflate 全链路）', () => {
  const u8 = new Uint8Array(Buffer.from(FIXTURE_B64, 'base64'));
  const grid = readXlsxGrid(u8);
  eq(grid[0].join('|'), '姓名|性别|家长电话|家长姓名|学号|寝室', '表头');
  eq(grid[1][0], '张三'); eq(grid[1][2], '13800000001'); eq(grid[1][5], '6栋-801室');
  eq(grid[2][0], '李四'); eq(grid[2][5], '7栋-202室');
  const wang = grid.find(r => (r[0] || '').trim() === '王五');
  if (!wang) throw new Error('王五行缺失');
  eq(wang[1] || '', '', '王五性别为空');
});

console.log('\n=== ④ 表头自动识别 ===');
t('中文全列：家长姓名不被误认成姓名、家长电话归电话列', () => {
  const c = detectStudentCols(['姓名', '性别', '家长电话', '家长姓名', '学号', '寝室']);
  eq(c.name, 0); eq(c.gender, 1); eq(c.phone, 2); eq(c.guardian, 3); eq(c.sid, 4); eq(c.dorm, 5);
});
t('同义词与英文表头', () => {
  eq(detectStudentCols(['学生', '联系方式']).name, 0);
  eq(detectStudentCols(['学生', '联系方式']).phone, 1);
  const e = detectStudentCols(['name', 'gender', 'phone', 'guardian', 'sid']);
  eq(e.name, 0); eq(e.phone, 2); eq(e.guardian, 3); eq(e.sid, 4);
  eq(detectStudentCols(['学生姓名', '监护人电话', '宿舍号']).phone, 1, '监护人电话归电话');
  eq(detectStudentCols(['学生姓名', '监护人电话', '宿舍号']).guardian, -1, '监护人电话不应归家长');
  eq(detectStudentCols(['学生姓名', '监护人电话', '宿舍号']).dorm, 2);
});
t('缺姓名列返回 -1（导入流程会拒绝）', () => {
  eq(detectStudentCols(['性别', '电话']).name, -1);
});

console.log('\n=== ⑤ planStudentImport 行为级 ===');
t('新增/更新/跳过/寝室归一化 全链路', () => {
  const existing = [
    { id: 1, name: '张三', sid: 'S001', credit: 100, tags: [], profile: { gender: '', phone: '', guardian: '', birth: '', address: '', notes: '', timeline: [] } },
    { id: 2, name: '李四', sid: '', credit: 100, tags: [], profile: { gender: '女', phone: '旧号', guardian: '', birth: '', address: '', notes: '', timeline: [] } }
  ];
  const cols = { name: 0, gender: 1, phone: 2, guardian: 3, sid: 4, dorm: 5 };
  const rows = [
    ['张三', '男', '13800000001', '张爸爸', 'S001', ''],          // 命中（按学号）→ 更新
    ['李四', '', '13900000002', '李妈妈', '', '6栋901'],          // 命中（按姓名）→ 更新 + 寝室归一
    ['王五', '男', '', '', 'S003', ''],                            // 新建
    ['赵六', '男', '', '', '', '7-202'],                           // 新建 + 寝室 7-202 归一
    ['钱七', '男', '', '', '', '无效寝室'],                        // 新建 + 非法寝室忽略
    ['', '男', '13600000004', '', '', ''],                          // 无姓名 → 跳过
  ];
  const plan = planStudentImport(existing, rows, cols, 10, 7);
  eq(plan.updates.length, 2, '更新数');
  eq(plan.creates.length, 3, '新建数');
  eq(plan.skipped, 1, '跳过数');
  eq(plan.updates[0].chg.phone, '13800000001');
  eq(plan.updates[0].chg.gender, '男');
  eq(plan.updates[1].dorm, '6栋-901室', '6栋901 应归一为 6栋-901室');
  const wang = plan.creates.find(c => c.name === '王五');
  eq(wang.sid, 'S003', '带学号新建用表内学号');
  eq(wang.credit, 100, '新建默认 100 分');
  const zhao = plan.creates.find(c => c.name === '赵六');
  eq(zhao.tags[0], '7栋-202室', '7-202 归一为 7栋-202室');
  const qian = plan.creates.find(c => c.name === '钱七');
  eq(qian.tags.length, 0, '非法寝室不进标签');
  eq(plan.nextId, 13, 'id 计数推进');
  eq(plan.nextSid, 9, 'sid 计数推进（赵六/钱七各占一个）');
});
t('计划阶段不改 existing（取消导入零副作用）', () => {
  const existing = [{ id: 1, name: '张三', sid: 'S001', credit: 100, tags: [], profile: { gender: '', phone: '', guardian: '', birth: '', address: '', notes: '', timeline: [] } }];
  const cols = { name: 0, gender: 1, phone: 2, guardian: 3, sid: 4, dorm: 5 };
  planStudentImport(existing, [['张三', '男', '13800000001', '', 'S001', '']], cols, 5, 5);
  eq(existing[0].profile.phone, '', '计划阶段不应改写已有人物');
});

console.log('\n=== ⑥ UI 入口与版本 ===');
t('设置页入口：accept 扩展、按钮、路由、预览模态', () => {
  has(html, 'accept=".json,.xlsx,.csv"', '文件选择器扩展名');
  has(html, 'onclick="pickStudentTableFile()"', '批量导入按钮');
  has(html, 'if(/\\.(xlsx|csv)$/i.test(file.name)){ handleStudentTableFile(file); event.target.value = \'\'; return; }', '扩展名分流');
  has(html, 'id="studentImportModal"', '预览模态');
  has(html, 'onclick="confirmStudentImport()"', '确认按钮');
});
t('版本标记统一 v2.18.13', () => {
  has(html, '<div class="login-version">v2.19.1</div>', '登录页');
  has(html, '<div class="sidebar-footer">v2.19.1 · 班主任工作台</div>', '侧栏');
  has(html, '🏷️ v2.19.1</span>', '设置徽标');
  has(sw, "CACHE_NAME = 'class-manager-v2.19.1'", 'SW');
});
t('设置页「近版更新速览」新增本版条目（旧条不删）', () => {
  has(html, '（v2.19.1）', '缺 v2.18.13 notes 条目');
  has(html, '（v2.19.1）', 'v2.18.12 旧条被删');
  has(html, '（v2.19.1）', 'v2.18.11 旧条被删');
});
t('历史注释不被波及', () => {
  has(html, "catDelUndo('dirs', dir);   // v2.18.9 同步 revive 所在方向", '历史注释被改动');
  has(html, '// v2.18.11 纯本地模式：停用自动推送与全部同步弹窗', '历史注释被改动');
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
