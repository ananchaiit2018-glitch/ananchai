@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ผู้ช่วยรับเอกสาร LINE - ตัวรับงานคอมสำนักงาน (ห้ามปิดหน้าต่างนี้)
.venv\Scripts\python agent\office_agent.py
pause
