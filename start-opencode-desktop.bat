@echo off
title OpenCode
cd /d E:\myopencode
set "PATH=C:\Users\18141\.bun\bin;%PATH%"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
call "C:\Users\18141\.bun\bin\bun.exe" run dev:desktop
if errorlevel 1 pause
