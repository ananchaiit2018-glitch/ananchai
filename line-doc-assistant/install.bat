@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== ติดตั้ง ผู้ช่วยรับเอกสาร LINE =====
where py >nul 2>nul || (echo [ผิดพลาด] ไม่พบ Python ให้ติดตั้ง Python 3.12 จาก python.org ก่อน ^(ติ๊ก Add to PATH^) & pause & exit /b 1)
if not exist .venv ( py -3 -m venv .venv || (echo สร้าง venv ไม่สำเร็จ & pause & exit /b 1) )
.venv\Scripts\python -m pip install --upgrade pip >nul
.venv\Scripts\pip install -r requirements.txt || (echo ติดตั้งแพ็กเกจไม่สำเร็จ ตรวจอินเทอร์เน็ต & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
if not exist "C:\Program Files\Tesseract-OCR\tesseract.exe" echo [แจ้งเตือน] ยังไม่พบ Tesseract OCR — ติดตั้งตามคู่มือ README หัวข้อ 2 ^(เลือกภาษาไทยด้วย^)
echo.
echo ติดตั้งเสร็จแล้ว ดับเบิลคลิก start-demo.bat เพื่อทดลอง
pause
