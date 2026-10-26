@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "JianpuUke.exe" (
  start "" "JianpuUke.exe"
  exit /b
)
if exist "dist\JianpuUke.exe" (
  start "" "dist\JianpuUke.exe"
  exit /b
)
where python >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Python 3.9 或更新版本，并勾选 Add Python to PATH。
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if not exist ".venv\Scripts\python.exe" (
  echo 创建 Python 环境失败。
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "from PIL import Image" >nul 2>nul
if errorlevel 1 (
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo 安装依赖失败，请检查网络。
    pause
    exit /b 1
  )
)
".venv\Scripts\python.exe" app.py
if errorlevel 1 pause
