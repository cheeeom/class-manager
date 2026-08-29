# 班主任工作台 v2.6.1

> 完整的班级管理解决方案：学生/学分/值日/座次/班委/请假/成绩/待办 + 学生档案 + 工作留痕 + 荣誉墙 + 通知模板 + 云同步 + PWA

## ✨ v2.6.1 新特性（2026-08-29）

### 🔐 云同步安全改造
- **移除源码内置 GitHub Token**：此前 token 硬编码在 index.html 中并随公开仓库泄露，现已改为仅保存在各设备本地（localStorage），源码中不再出现任何凭据
- **Token 配置即验证**：设置页「配置 GitHub Token」保存前会先调用 GitHub API 验证有效性及本仓库读写权限，避免静默同步失败
- **未配置提醒**：未配置 Token 时设置页显示醒目提示，数据修改时每会话提醒一次（此时数据仅存本地、不上云）
- **推荐 fine-grained token**：仅授权 `cheeeom/class-manager` 单仓库的 Contents: Read and write，泄露影响面最小
- ⚠️ **升级须知**：旧版本设备升级后需在「设置 → 配置 GitHub Token」重新配置一次，云同步才会恢复

### ☁️ 云同步字段补全（数据丢失修复）
- **工作留痕 / 荣誉墙 / 通知模板此前不会同步到云端**（推送白名单遗漏），换设备即丢，现已全部纳入同步
- 学生档案（v2.6.0 新增）随学生数据一并同步
- 推送前自动剥离通知历史中的图片 base64（单张近 1MB），防止 data.json 膨胀导致移动端拉取超时；历史图片仅保留在生成它的设备本地
- 修复合并逻辑：honors/workLogs/notices 的合并不再依赖远端 exams 字段存在；补齐 nextWorkLogId/nextHonorId 的合并

### 🐛 其他修复
- 修复请假登记弹窗重复定义导致「不通过搜索选人就无法确认」的问题
- 学分原因分值（reasonScores）现在会持久化并同步
- sw.js 缓存版本更新至 v2.6.1

## ✨ v2.6.0 新特性
- 🌙 **暗夜模式**：跟随系统 / 亮色 / 暗色，三档切换
- 📁 **学生档案**：性别、出生日期、监护人、联系电话、住址、备注 + 成长记录（谈心/表扬/批评/联系家长/其他）
- 📋 **工作留痕**：按日期/分类（常规/班会/谈话/活动/事务）记录班级工作，一键复制/导出本月台账
- 🏆 **荣誉墙**：集体/个人荣誉 × 校/区/市/省/国家级，统计卡片 + 等级筛选

## ✨ v2.5.0 新特性
- 📢 **通知模块**：12 个内置模板（请假/放假/安全/考试/家长会/活动/常规）、`{变量}` 一键插入与输入联想、实时预览、Canvas 生成通知图片、历史记录存档

## ✨ v2.4.x
- 移动端底部导航重设计：5 常驻 tab（首页/学生/待办/学分/设置）+「更多」抽屉
- WCAG AA 无障碍达标：对比度 ≥4.5:1、aria-label 补全、44px 触摸目标、键盘焦点环
- Service Worker 语法修复，PWA 离线缓存真正可用

## 📖 使用方法

### 本地使用
1. 直接双击 `index.html` 打开
2. 所有数据存储在 localStorage
3. 在设置页导出/导入数据进行备份

### GitHub Pages 在线版
1. `bash deploy.sh` 部署到 GitHub Pages
2. 访问 https://cheeeom.github.io/class-manager/
3. 按下节配置 GitHub Token 开启云同步
4. 之后每次修改数据 2 秒后自动推送到仓库 `data.json`
5. 其他设备打开网页（或切回前台）自动拉取合并

### ☁️ 云同步配置（v2.6.1 起必须）
1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token
2. Repository access 选「Only select repositories」→ 勾选 `cheeeom/class-manager`
3. Permissions → Repository permissions → Contents → **Read and write**
4. 打开工作台 → 设置 → ☁️ Git 云同步 → 「配置 GitHub Token」→ 粘贴保存（会自动验证）
5. 每台需要同步的设备都配置一次；token 只存在各设备本地，不进入代码

### 数据同步流程
```
设备A修改 → 2秒后自动推送 data.json 到仓库 → 设备B打开/切回页面 → 自动拉取智能合并
```

### PWA 安装（移动端）
1. 访问网站
2. Safari：「分享 → 添加到主屏幕」；Android/Chrome：使用安装提示
3. 可离线使用，数据在恢复联网后自动同步

## 🔧 技术栈
- 纯 HTML/CSS/JavaScript（无框架、无构建、零依赖，单文件应用）
- localStorage 本地存储 + GitHub Contents API 云同步（自动推送/智能合并）
- SHA-256 加盐哈希登录（纯 JS 实现，兼容 file:// 协议）
- Service Worker PWA 支持（导航/数据网络优先，静态资源缓存优先）
- Canvas 图片压缩（课程表/头像/通知图片）与手绘图表
- GitHub Actions 无 —— 部署即 push main，Pages 自动构建

## 📂 文件结构
```
class-manager/
├── index.html      # 主应用（单文件，v2.6.1，CSS+HTML+JS 全在内）
├── manifest.json   # PWA 配置
├── sw.js           # Service Worker（cache v2.6.1）
├── icon_*.png      # PWA 图标（192/256/512）
├── data.json       # 云端数据（应用自动读写，勿手动编辑）
├── AGENTS.md       # 开发者接手指南（架构地图/数据模型/云同步机制/已知问题）
├── deploy.sh       # GitHub Pages 部署脚本
├── .gitignore
└── README.md
```

## 🚀 版本历史

### v2.6.1 (2026-08-29)
- 云同步安全改造：移除源码内置 token，配置即验证，未配置醒目提醒
- 云同步字段补全：工作留痕/荣誉墙/通知模板/原因分值纳入同步；剥离通知历史图片
- 修复：请假弹窗重复定义、合并逻辑嵌套 bug、closeMoreDrawer 重复定义

### v2.6.0
- 暗夜模式 / 学生档案 / 工作留痕 / 荣誉墙四大模块

### v2.5.0
- 通知模块上线（模板库 + 编辑器 + 历史记录，12 内置模板/变量填充/图片生成/云同步）

### v2.4.0 / v2.4.1 (2026-08-15)
- 移动端底部导航重设计 + WCAG AA 无障碍达标
- Service Worker 语法修复，离线可用

### v2.3.9 ~ v2.3.12 (2026-08-13)
- PWA 基础支持、图片压缩、首屏性能优化（100s+ → 2-8s）、移动端空白修复

### v2.0.0 (2026-08-08)
- 移动端响应式适配 + Git 云同步 + GitHub Pages 部署
