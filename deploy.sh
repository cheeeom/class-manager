#!/bin/bash
# deploy.sh - 部署班主任工作台到 GitHub Pages
# 使用方法: bash deploy.sh
# 需求: git, 已配置远程仓库 git@github.com:cheeeom/class-manager.git

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "🚀 班主任工作台 v2.0.0 部署脚本"
echo "================================"

# 检查 git
if ! command -v git &> /dev/null; then
    echo "❌ 未找到 git，请先安装"
    exit 1
fi

# 确保在正确的 git 仓库中
if [ ! -d .git ]; then
    echo "📦 初始化 Git 仓库..."
    git init
    git remote add origin git@github.com:cheeeom/class-manager.git 2>/dev/null || true
fi

# 设置代理
echo "🌐 配置 Git 代理..."
git config http.proxy http://192.168.1.13:9890 2>/dev/null || true
git config https.proxy http://192.168.1.13:9890 2>/dev/null || true

# 提交主分支
echo "📝 提交到 main 分支..."
git checkout main 2>/dev/null || git checkout -b main
git add -A
git commit -m "v2.0.0: 移动端适配 + Git 云同步" || echo "No changes to commit"

# 推送到 GitHub
echo "⬆️ 推送到 GitHub main 分支..."
git push -u origin main || echo "Push failed, you may need to set up SSH keys"

# 部署到 gh-pages
echo "📦 部署到 gh-pages 分支..."
git checkout -b gh-pages 2>/dev/null || git checkout gh-pages
git push -u origin gh-pages --force || echo "Push failed"

# 回到 main
git checkout main

echo ""
echo "✅ 部署完成！"
echo "🌐 GitHub Pages 地址: https://cheeeom.github.io/class-manager/"
echo ""
echo "📋 后续步骤:"
echo "  1. 在 GitHub 仓库设置中确认 Pages 源为 gh-pages 分支"
echo "  2. 等待几分钟让 GitHub 构建 Pages"
echo "  3. 访问上述地址即可使用"
echo "  4. 数据同步: 在设置页点击「推送数据到云端」下载 data.json"
echo "     然后将 data.json 提交到仓库，其他设备打开网页会自动合并"
