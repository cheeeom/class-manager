/* 新皮肤设计稿数值验证器：三套候选 × 明暗，按 _v3400 同款 WCAG 口径全对真算 */
function lum(hex) {
  const m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex.trim());
  if (!m) throw new Error('bad hex ' + hex);
  const f = v => { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

const SKINS = {
  '藤黄·杏坛 (tenghuang)': {
    light: { card: '#FFFDF4', bg: '#F7F3E7', bg2: '#EFE9D5', row: '#FAF6E9',
             text: '#33301F', ts: '#5E5945', tm: '#8B8468', border: '#E2DCC4',
             pri: '#8A6210', pl: '#A67E1F', plr: '#E3D3A6', pd: '#6B4A0C', pdr: '#523807', pb: '#9C7412' },
    dark: { card: '#211D12', bg: '#1A170F', bg2: '#262216', row: '#262216',
            text: '#EDE7D2', ts: '#B0A88C', tm: '#7E7860', border: '#3A3420',
            pri: '#B08A2E', pl: '#C9A23E', plr: '#4A3A10', pd: '#7A5A10', pdr: '#5C4408', pb: '#B08A2E' }
  },
  '紫檀·暮山 (zitan)': {
    light: { card: '#FDFCFF', bg: '#F3F1F5', bg2: '#EAE7EE', row: '#F7F5FA',
             text: '#2E2A38', ts: '#5B5566', tm: '#87819A', border: '#DCD8E4',
             pri: '#5A4470', pl: '#73618A', plr: '#D4CBDE', pd: '#463557', pdr: '#342743', pb: '#675084' },
    dark: { card: '#1E1A24', bg: '#17141B', bg2: '#221E2A', row: '#221E2A',
            text: '#E8E4EE', ts: '#ADA5BC', tm: '#7C748E', border: '#373044',
            pri: '#9B7FC0', pl: '#B29CD1', plr: '#3E3050', pd: '#3E3050', pdr: '#2C2138', pb: '#9B7FC0' }
  },
  '松烟·墨池 (songyan)': {
    light: { card: '#FDFEFD', bg: '#F1F2F1', bg2: '#E8EAE8', row: '#F6F7F6',
             text: '#2B2E33', ts: '#565B63', tm: '#82888F', border: '#D9DCDF',
             pri: '#3D4450', pl: '#59626F', plr: '#C8CDD4', pd: '#2C313A', pdr: '#1F232A', pb: '#4A525E' },
    dark: { card: '#191C20', bg: '#131518', bg2: '#1D2025', row: '#1D2025',
            text: '#E5E9EC', ts: '#A6AEB8', tm: '#737B85', border: '#2E343C',
            pri: '#76839A', pl: '#93A0B3', plr: '#2E343C', pd: '#2A2F38', pdr: '#1C2027', pb: '#76839A' }
  }
};

let fail = 0;
for (const [name, v] of Object.entries(SKINS)) {
  console.log('== ' + name + ' ==');
  const L = v.light, D = v.dark;
  const pairsL = [
    ['text/card', L.text, L.card, 4.5],
    ['text-secondary/card', L.ts, L.card, 4.5],
    ['text-muted/card', L.tm, L.card, 3.0],
    ['white/primary 按钮', '#FFFFFF', L.pri, 4.5],
    ['text/bg', L.text, L.bg, 4.5],
    ['white/primary-bright', '#FFFFFF', L.pb, 4.0],
  ];
  const pairsD = [
    ['text/card', D.text, D.card, 7.0],
    ['text-secondary/card', D.ts, D.card, 4.5],
    ['text-muted/card', D.tm, D.card, 3.0],
    ['white/primary 按钮', '#FFFFFF', D.pri, 3.0],
    ['text/bg', D.text, D.bg, 7.0],
  ];
  for (const [n, fg, bg, min] of pairsL) {
    const c = contrast(fg, bg);
    const pass = c >= min;
    if (!pass) fail++;
    console.log('  ' + (pass ? '✓' : '✗') + ' 浅 ' + n + ' = ' + c.toFixed(2) + '（需 ≥' + min + '）');
  }
  for (const [n, fg, bg, min] of pairsD) {
    const c = contrast(fg, bg);
    const pass = c >= min;
    if (!pass) fail++;
    console.log('  ' + (pass ? '✓' : '✗') + ' 暗 ' + n + ' = ' + c.toFixed(2) + '（需 ≥' + min + '）');
  }
}
console.log(fail === 0 ? '\n全部达标 ✓' : '\n有 ' + fail + ' 项不达标，需调色');
