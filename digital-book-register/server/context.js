'use strict';
// เก็บชื่อผู้เข้าเวรที่ทำรายการ (ส่งมาจากหน้าจอทุกคำขอ) เพื่อบันทึกในประวัติ
const { AsyncLocalStorage } = require('async_hooks');
module.exports = new AsyncLocalStorage();
