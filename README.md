# 班主任工作台 v2.4.0

> 完整的班级管理解决方案：学生/学分/值日/座次/班委/请假/成绩/待办 + 云同步 + PWA

## ✨ v2.4.0 新特性（2026-08-15）

### 🎨 UI/UX 全面升级
- **移动端底部导航重设计**：11 个 tab 精简为 5 常驻（首页/学生/待办/学分/设置）+「更多」抽屉（班委/座次/值日/请假/成绩/分析），告别横向滑动
- **iOS 15+ 风格 Tabbar**：毛玻璃背景 + 激活态浅青圆角底衬 + 图标放大上浮，图标文字不再重叠
- **无障碍达标（WCAG AA）**：次要文字/辅助文字/导航激活态对比度全部 ≥4.5:1；全站键盘焦点环；「全部 ›」等触摸目标提升至 44px
- **细节优化**：PWA 安装按钮美化、logo/页脚小字号提升

### 🐛 关键修复
- **Service Worker 语法错误修复**：原 sw.js 注释吞行导致 SW 注册失败、离线缓存从未生效，现已重写为 UTF-8 并修复（PWA 离线功能真正可用）
- 修复 PWA 安装提示遮挡「更多」抽屉问题（开抽屉自动隐藏提示）

## ✨ v2.3.12 新特性（2026-08-13）

### 🐛 关键修复
- **移动端头像同步修复**：解决 data.json 因 1.5MB 课程表导致手机端下载超时的问题
- **图片压缩优化**：课程表从 1.5MB 压缩至 255KB（JPEG 0.7），云端 data.json 从 1.5MB 降至 275KB
- **图片合并策略**：merge 逻辑改为"prefer smaller image"，避免旧大图复发
- **启动自动压缩**：电脑端打开旧数据时自动压缩超大课程表

### 📱 PWA 支持
- Service Worker 缓存优化（index.html 改为网络优先，避免旧代码缓存）
- iOS 添加主屏幕图标修复（不透明蓝底，解决灰色图标问题）
- 离线可用：课程表/头像/数据文件均可缓存

### 🎯 v2.3.11 新特性
- 移动端循环空白 BUG 修复：使用 Blob URL 渲染图片，提升移动端解码稳定性
- 顶部栏 safe-area-inset-top 偶发异常修复

### 🎨 v2.3.10 新特性
- 课程表图片压缩（PNG 强制转 JPEG 0.7，200KB 内）
- 头像图片压缩（PNG 转 JPEG 0.7，400px 宽度）
- PWA 首次加载性能优化（data.json 从 100 秒+ 降至 2-8 秒）

### 📱 v2.3.9 新特性
- PWA 基础支持：manifest.json + sw.js
- iOS 添加主屏幕提示逻辑
- icon_192.png / icon_512.png（PowerShell 生成）

## 📖 使用方法

### 本地使用
1. 直接双击 `index.html` 打开
2. 所有数据存储在 localStorage
3. 在设置页导出/导入数据进行备份

### GitHub Pages 在线版
1. `bash deploy.sh` 部署到 GitHub Pages
2. 访问 `https://cheeeom.github.io/class-manager/`
3. 在设置页点击「推送数据到云端」下载 data.json
4. 将 data.json 提交到仓库
5. 其他设备打开网页自动合并数据

### 数据同步流程
```
设备A操作 → 推送数据到云端(下载data.json) → 提交到Git → 设备B打开网页 → 自动合并
```

### PWA 安装（移动端）
1. 访问网站
2. Safari：「分享 → 添加到主屏幕」
3. 图标自动生成（蓝底班级头像）
4. 可离线使用

## 🔧 技术栈
- 纯 HTML/CSS/JavaScript（无框架）
- localStorage 本地存储
- fetch API 云端同步
- SHA-256 加盐哈希登录
- Service Worker PWA 支持
- Canvas 图片压缩
- GitHub API 部署

## 📂 文件结构
```
class-manager/
├── index.html      # 主应用（单文件，v2.3.12）
├── manifest.json   # PWA 配置
├── sw.js           # Service Worker
├── icon_192.png    # PWA 图标（192x192）
├── icon_512.png    # PWA 图标（512x512）
├── data.json       # 云端数据（自动生成，275KB）
├── deploy.sh       # GitHub Pages 部署脚本
├── .gitignore
└── README.md
```

## 🚀 版本历史

### v2.3.12 (2026-08-13)
- 移动端头像同步修复
- 图片压缩优化
- PWA 缓存策略优化

### v2.3.11 (2026-08-13)
- 移动端循环空白修复
- 顶部栏 safe-area 修复

### v2.3.10 (2026-08-13)
- PWA 图片压缩
- 首次加载性能优化

### v2.3.9 (2026-08-13)
- PWA 基础支持

### v2.0.0 (2026-08-09)
- 移动端响应式适配
- Git 云同步
- GitHub Pages 部署
