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
  echo   没有找到 Python，无法启动本地服务器。
  echo   你仍然可以用 VS Code Live Server、Node.js serve 等静态服务器打开。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动格物物理学习空间...
echo.
"%PY%" server.py
if errorlevel 1 pause
