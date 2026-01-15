#!/bin/bash

echo "========================================"
echo "Cursor Audit Pro - WebAssembly 版本"
echo "========================================"
echo ""

echo "[1/3] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "未检测到依赖，正在安装..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 依赖安装失败，请检查网络连接"
        exit 1
    fi
fi

echo ""
echo "[2/3] 启动开发服务器..."
echo ""
echo "🚀 应用将在浏览器中自动打开"
echo "📱 如果没有自动打开，请访问: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

npm run dev
