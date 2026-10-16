@echo off
title OpenCode
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
call "%USERPROFILE%\.bun\bin\bun.exe" run dev:desktop
if errorlevel 1 pause
