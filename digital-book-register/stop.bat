@echo off
chcp 65001 >nul
echo กำลังปิดโปรแกรมทะเบียนหนังสือ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
echo ปิดโปรแกรมแล้ว
timeout /t 2 >nul
