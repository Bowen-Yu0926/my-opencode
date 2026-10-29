@echo off
title OpenCode Dev
cd /d "%~dp0"
set OPENCODE_CHANNEL=dev
bun run dev
