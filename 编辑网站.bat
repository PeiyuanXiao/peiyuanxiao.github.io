@echo off
rem Double-click to open the website editor in your browser.
rem Keep this window open while editing; close it to stop the editor.
title Website editor
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0editor\start.ps1"
if errorlevel 1 pause
