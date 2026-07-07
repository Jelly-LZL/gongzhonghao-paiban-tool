$ErrorActionPreference = 'Stop'

Write-Host '属于自己的芝子 - 公众号排版台'
Write-Host '================================'
Write-Host ''
Write-Host '服务器地址: http://127.0.0.1:8765/'
Write-Host '按 Ctrl+C 停止服务器'
Write-Host '================================'
Write-Host ''

python -m http.server 8765
