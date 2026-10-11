# -*- coding: utf-8 -*-
"""v3.4.1 网页版停更横幅：顶部常驻横幅引导下载桌面版（桌面版构建内自动移除）+ 跟版五处 + sw.js。"""
import io, sys

P_HTML, P_SW = 'index.html', 'sw.js'

BANNER_HTML = (
    '<div id="eolBanner" role="note" aria-label="网页版停止更新公告">'
    '<span>\U0001F4E2 网页版已停止更新</span>'
    '<span class="eol-long">，新功能与维护请改用桌面版（数据完全兼容）</span>'
    '<a href="https://github.com/cheeeom/class-manager-desktop/releases/latest/download/ClassManager-Setup.exe" '
    'target="_blank" rel="noopener">\u2B07\uFE0F 免费下载桌面版</a></div>\n'
    '<script data-eol>if(window.__CM_DESKTOP){var __eolB=document.getElementById(\'eolBanner\');'
    'if(__eolB&&__eolB.parentNode)__eolB.parentNode.removeChild(__eolB);}</script>'
)

BANNER_CSS = (
    '/* ==================== v3.4.1 网页版停更横幅 ==================== */\n'
    '#eolBanner{position:fixed;top:0;left:0;right:0;z-index:900;min-height:44px;'
    'display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:2px 10px;'
    'padding:6px 16px;background:var(--primary);color:#fff;'
    'font-size:13px;letter-spacing:0.5px;text-align:center;box-sizing:border-box}\n'
    '#eolBanner a{color:#fff;font-weight:700;text-decoration:underline;'
    'text-underline-offset:3px;white-space:nowrap}\n'
    '@media (max-width:768px){#eolBanner{font-size:12px;padding:6px 10px}'
    '.eol-long{display:none}}\n'
    '.app{margin-top:44px;height:calc(100vh - 44px);height:calc(100dvh - 44px)}\n'
    '.login-overlay{top:44px}\n'
    '.side-panel{top:44px;height:calc(100vh - 44px)}\n'
)

NEW_NOTE_LINE = (
    '          \u00B7 \U0001F4E2 <b>\u7F51\u9875\u7248\u505C\u66F4\u00B7\u8F6C\u684C\u9762\u7248\uFF08v3.4.1\uFF09</b>'
    '\uFF1A\u7F51\u9875\u7248\u81EA\u672C\u7248\u8D77<b>\u505C\u6B62\u529F\u80FD\u66F4\u65B0</b>'
    '\uFF0C\u9876\u90E8\u65B0\u589E\u5E38\u9A7B\u6A2A\u5E45\u5F15\u5BFC\u4E0B\u8F7D\u684C\u9762\u7248'
    '\uFF08<b>ClassManager-Setup.exe</b>\uFF0C\u514D\u8D39\uFF0CGitHub Releases \u76F4\u94FE\uFF09'
    '\uFF1B\u684C\u9762\u7248\u4E0E\u7F51\u9875\u7248<b>\u6570\u636E\u5B8C\u5168\u517C\u5BB9</b>'
    '\uFF0C\u4E91\u540C\u6B65/\u5BFC\u5165\u5BFC\u51FA\u65E0\u7F1D\u8854\u63A5<br>'
)

def rd(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()

def wr(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)

def rep1(s, old, new, tag):
    n = s.count(old)
    assert n == 1, '%s: 锚点命中 %d 次（应为 1）' % (tag, n)
    return s.replace(old, new)

html = rd(P_HTML)
assert '\r\n' not in html, 'index.html 出现 CRLF，先归一'

# 1) 横幅 HTML：插在 <body> 之后、svg 精灵之前
old_body = '<body>\n<svg xmlns="http://www.w3.org/2000/svg"'
html = rep1(html, old_body, '<body>\n' + BANNER_HTML + '\n<svg xmlns="http://www.w3.org/2000/svg"', 'banner-html')

# 2) 横幅 CSS：插在 </style> 之前（源顺序最后，压过前面所有同特异性规则）
html = rep1(html, '\n</style>', '\n' + BANNER_CSS + '</style>', 'banner-css')

# 3-6) 跟版四处
html = rep1(html, '<div class="login-version">v3.4.0</div>', '<div class="login-version">v3.4.1</div>', 'login-ver')
html = rep1(html, '<div class="sidebar-footer">v3.4.0 \u00B7 班主任工作台</div>', '<div class="sidebar-footer">v3.4.1 \u00B7 班主任工作台</div>', 'side-ver')
html = rep1(html, '\U0001F3F7\uFE0F v3.4.0</span>', '\U0001F3F7\uFE0F v3.4.1</span>', 'badge')

# 7) 速览：标题改版本 + 内容行整行替换（只留当版）
html = rep1(html, '近版更新速览（v3.4.0）', '近版更新速览（v3.4.1）', 'note-title')
lines = html.split('\n')
hit = [i for i, ln in enumerate(lines) if '皮肤系统上线（v3.4.0）' in ln]
assert len(hit) == 1, '速览内容行命中 %d 处' % len(hit)
lines[hit[0]] = NEW_NOTE_LINE
html = '\n'.join(lines)

# 8) sw.js CACHE_NAME
sw = rd(P_SW)
sw = rep1(sw, "const CACHE_NAME = 'class-manager-v3.4.0';", "const CACHE_NAME = 'class-manager-v3.4.1';", 'cache-name')
assert '\r\n' not in sw

wr(P_HTML, html)
wr(P_SW, sw)

# 自检
html2, sw2 = rd(P_HTML), rd(P_SW)
checks = [
    ('eolBanner div', html2.count('id="eolBanner"') == 1),
    ('desktop removal', html2.count('__CM_DESKTOP') == 1),
    ('banner css', html2.count('v3.4.1 网页版停更横幅') == 1),
    ('app reflow', html2.count('.app{margin-top:44px') == 1),
    ('login reflow', html2.count('.login-overlay{top:44px}') == 1),
    ('side-panel reflow', html2.count('.side-panel{top:44px') == 1),
    ('v3.4.1 count', html2.count('v3.4.1') == 6),
    ('v3.4.0 residue', html2.count('v3.4.0') == 4),
    ('cache name', "class-manager-v3.4.1" in sw2),
]
bad = [k for k, ok in checks if not ok]
for k, ok in checks:
    print(('OK ' if ok else 'FAIL ') + k)
if bad:
    sys.exit('自检失败: ' + ', '.join(bad))
print('v3.4.1 补丁完成，自检全过')
