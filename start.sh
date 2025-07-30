#!/bin/bash
echo "清理构建缓存..."
rm -rf .next
echo "启动开发服务器..."
npm run dev
