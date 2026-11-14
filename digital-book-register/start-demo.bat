@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ทดลองใช้ ^(ข้อมูลตัวอย่าง^)
echo โหมดทดลองใช้: ข้อมูลตัวอย่างแยกจากข้อมูลจริง ^(โฟลเดอร์ demo-data^)
start "" "http://localhost:3001"
node --disable-warning=ExperimentalWarning scripts\demo.js
pause
