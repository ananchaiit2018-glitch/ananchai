@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== ติดตั้งระบบทะเบียนหนังสือรับ-ส่ง =====
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ผิดพลาด] ยังไม่พบโปรแกรม Node.js บนเครื่องนี้
  echo กรุณาติดตั้ง Node.js เวอร์ชัน 22 ขึ้นไป จาก https://nodejs.org  ^(เลือก LTS^) แล้วรันไฟล์นี้ใหม่
  pause & exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set NV=%%v
set NV=%NV:v=%
if %NV% LSS 22 (
  echo [ผิดพลาด] Node.js เวอร์ชันเก่าเกินไป ต้องเป็นเวอร์ชัน 22 ขึ้นไป
  pause & exit /b 1
)
echo กำลังติดตั้งส่วนประกอบ ^(ต้องต่อเน็ตครั้งแรกครั้งเดียว^)...
call npm install --omit=dev
if errorlevel 1 ( echo [ผิดพลาด] ติดตั้งไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต & pause & exit /b 1 )
echo กำลังสร้างไอคอนบน Desktop...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\ทะเบียนหนังสือ.lnk'); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Save()"
echo.
echo ติดตั้งเสร็จแล้ว ดับเบิลคลิกไอคอน "ทะเบียนหนังสือ" บน Desktop เพื่อเปิดโปรแกรม
pause
