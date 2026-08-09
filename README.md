# 班主任工作台 v2.0.0

> 移动端适配 + Git 云同步版

## ✨ v2.0.0 新特性

### 📱 移动端响应式适配
- 768px 以下自动切换为底部 Tab 栏导航（微信风格）
- 底部 Tab 栏支持水平滚动，11 个功能入口
- 登录页、卡片、表格、模态框全面适配手机屏幕
- 触摸优化的按钮和输入框（44px+ 触摸目标）

### ☁️ Git 云同步
- 页面加载时自动 fetch `./data.json` 并智能合并
- 设置页新增「☁️ Git 云同步」区块
- 智能合并策略：按 ID 合并、取最新、并集去重
- 推送/拉取数据，显示本地/云端数据量对比

### 🚀 GitHub Pages 部署
- 支持 `bash deploy.sh` 一键部署
- GitHub Pages 自动通过 HTTP 访问 data.json
- 无需服务器，纯静态部署

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

## 🔧 技术栈
- 纯 HTML/CSS/JavaScript（无框架）
- localStorage 本地存储
- fetch API 云端同步
- SHA-256 加盐哈希登录
- 响应式 CSS + 底部 Tab 栏

## 📂 文件结构
```
class-manager/
├── index.html      # 主应用（单文件）
├── data.json       # 云端数据（自动生成）
├── deploy.sh       # GitHub Pages 部署脚本
├── .gitignore
└── README.md
```
