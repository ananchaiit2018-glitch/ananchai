@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ล้างรหัสผ่าน - ทะเบียนหนังสือรับ-ส่ง
echo ===== ลืมรหัสผ่าน: ล้างรหัสผ่านเข้าโปรแกรมทะเบียนหนังสือ =====
echo.
echo  - ลบเฉพาะรหัสผ่าน ข้อมูลทะเบียน ไฟล์แนบ และการตั้งค่าอื่นอยู่ครบ
echo  - หลังล้างแล้ว เข้าโปรแกรมได้โดยไม่ต้องใช้รหัส แล้วค่อยตั้งรหัสใหม่
echo.
set /p ok=พิมพ์ Y แล้วกด Enter เพื่อยืนยัน (กด Enter เฉยๆ = ยกเลิก):
if /i not "%ok%"=="Y" (
  echo ยกเลิกแล้ว ไม่มีอะไรเปลี่ยน
  pause
  exit /b
)
node --disable-warning=ExperimentalWarning scripts\reset-password.js
echo.
pause
