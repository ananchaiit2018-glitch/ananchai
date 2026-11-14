'use strict';
const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

const pad = (n, l = 2) => String(n).padStart(l, '0');

function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowLocal(d = new Date()) { return `${todayISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function isLocalDateTime(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && isISODate(s.slice(0, 10)); }

// 2026-11-14 -> "14 พ.ย. 2569"
function thaiDate(iso, full = false) {
  if (!iso || !isISODate(iso.slice(0, 10))) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${(full ? MONTHS : MONTHS_SHORT)[m - 1]} ${y + 543}`;
}
function thaiDateTime(iso) {
  if (!iso) return '';
  const date = thaiDate(iso.slice(0, 10));
  return iso.length >= 16 ? `${date} ${iso.slice(11, 16)} น.` : date;
}
function currentBuddhistYear(d = new Date()) { return d.getFullYear() + 543; }

function formatRegNo(no, year, fmt, padLen) {
  return String(fmt || '{no}/{year}').replace('{no}', pad(no, padLen)).replace('{year}', String(year));
}

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

module.exports = { MONTHS, MONTHS_SHORT, pad, todayISO, nowLocal, stamp, isISODate, isLocalDateTime, thaiDate, thaiDateTime, currentBuddhistYear, formatRegNo, HttpError };
