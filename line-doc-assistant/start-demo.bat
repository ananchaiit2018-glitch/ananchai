@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ผู้ช่วยรับเอกสาร LINE - เซิร์ฟเวอร์ (ห้ามปิดหน้าต่างนี้)
start "" "http://localhost:8800"
.venv\Scripts\python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8800
pause
