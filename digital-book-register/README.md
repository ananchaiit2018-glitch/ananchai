# ระบบทะเบียนหนังสือรับ–ส่งอิเล็กทรอนิกส์ (Digital Book Register)

Local Web Application สำหรับหน่วยงานราชการไทย — Node.js + SQLite, ใช้งานผ่าน Chrome/Edge, ข้อมูลอยู่ในเครื่อง ไม่ส่งขึ้น Cloud
**คู่มือภาษาไทย: [docs/คู่มือการใช้งาน.md](docs/คู่มือการใช้งาน.md)**

## เริ่มใช้งาน (Windows)
`install.bat` (ครั้งเดียว) → `start.bat` หรือไอคอน "ทะเบียนหนังสือ" บน Desktop · ทดลองด้วยข้อมูลตัวอย่าง: `start-demo.bat` · สำรองด่วน: `backup-now.bat`

บน Linux/macOS: `npm install && npm start` แล้วเปิด http://localhost:3000 (ต้องใช้ Node.js ≥ 22.5)

## โครงสร้าง
```
server/   index.js (API) · books.js (ออกเลข/แก้ไข/ยกเลิก/ค้นหา) · db.js (SQLite) · pdf.js · export.js (PDF/xlsx/csv)
          fonts.js · backup.js · auth.js · config.js · util.js
public/   index.html · core.js · app.js · styles.css   (หน้าจอ ไม่ต้อง build)
scripts/  demo.js (ข้อมูลตัวอย่าง) · backup.js
test/     system.test.js   → npm test  (14 กลุ่มการทดสอบ)
data/     ฐานข้อมูลและไฟล์ของผู้ใช้ (สร้างอัตโนมัติ ไม่อยู่ใน git)
config.json  port / host / dataDir
```

## หลักการสำคัญ
- เลขทะเบียนออกในธุรกรรม `BEGIN IMMEDIATE` + `UNIQUE(kind, year, reg_no)` + ตัวนับที่ไม่ถอยหลัง → ไม่ซ้ำแม้บันทึกพร้อมกัน, ยกเลิกแล้วเลขไม่ถูกใช้ซ้ำ
- แยกชุดรับ/ส่ง และแยกปี พ.ศ.; แยกจาก "ที่" (เลขที่หนังสือราชการ) โดยสิ้นเชิง
- ฟอนต์: ใช้ไฟล์ที่ผู้ใช้นำเข้าเท่านั้น (อ่านชื่อฟอนต์จากไฟล์) ไม่มีไฟล์ = ไม่สร้าง PDF
- ลายเซ็นภาพ = หลักฐานภายในระบบเท่านั้น ไม่ใช่ลายมือชื่ออิเล็กทรอนิกส์ตามกฎหมาย
