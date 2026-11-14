@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ระบบทะเบียนหนังสือรับ-ส่ง ^(ห้ามปิดหน้าต่างนี้ขณะใช้งาน^)
echo ระบบทะเบียนหนังสือรับ-ส่ง กำลังเริ่มทำงาน...
echo *** ห้ามปิดหน้าต่างสีดำนี้ขณะใช้งาน เมื่อเลิกใช้ให้ปิดหน้าต่างนี้ ***
start "" "http://localhost:3000"
node --disable-warning=ExperimentalWarning server\index.js
echo.
echo โปรแกรมหยุดทำงาน ดูข้อความด้านบน แล้วกดปุ่มใดก็ได้เพื่อปิด
pause
