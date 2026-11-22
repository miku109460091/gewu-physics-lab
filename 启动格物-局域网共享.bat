@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY="
where py >nul 2>nul
if not errorlevel 1 set "PY=py"
if not defined PY (
  where python >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  if exist "C:\Users\10946\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" (
    set "PY=C:\Users\10946\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
  )
)

if not defined PY (
  echo.
  echo   没有找到 Python，无法启动局域网共享。
  echo   可以改为直接双击 index.html，或把整个文件夹复制到其他电脑离线打开。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在以局域网模式启动格物物理...
echo   启动后终端会显示局域网访问地址。
echo.
"%PY%" server.py --lan
if errorlevel 1 pause
