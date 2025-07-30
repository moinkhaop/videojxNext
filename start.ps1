Write-Host "清理 Next.js 缓存..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "缓存已清理" -ForegroundColor Green
}

Write-Host "启动开发服务器..." -ForegroundColor Yellow
npm run dev
