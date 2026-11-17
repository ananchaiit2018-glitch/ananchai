'use strict';
// สถิติรายเดือนของปีทะเบียน (ปีงบประมาณ ต.ค.–ก.ย. หรือปีปฏิทิน ม.ค.–ธ.ค. ตามที่ตั้งค่า)
const db = require('./db'), books = require('./books');
const MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function monthsOf(year, fiscal) {
  const out = []; const ce = year - 543;
  for (let i = 0; i < 12; i++) {
    const m0 = fiscal ? (9 + i) % 12 : i; const y = fiscal ? (i < 3 ? ce - 1 : ce) : ce;
    out.push({ key: `${y}-${String(m0 + 1).padStart(2, '0')}`, short: MS[m0], full: `${MF[m0]} ${y + 543}`, yy: String(y + 543).slice(-2), in: 0, out: 0 });
  }
  return out;
}

function forYear(yearParam) {
  const d = db.get(); const s = db.getSettings();
  const years = d.prepare('SELECT DISTINCT year FROM books ORDER BY year DESC').all().map(r => r.year);
  const cur = books.registrationYear(s);
  if (!years.includes(cur)) years.unshift(cur);
  const year = years.includes(+yearParam) ? +yearParam : cur;
  const fiscal = String(s.year_mode || 'fiscal') === 'fiscal';
  const months = monthsOf(year, fiscal);
  for (const r of d.prepare("SELECT kind, substr(reg_date,1,7) ym, COUNT(*) n FROM books WHERE year=? AND status='active' GROUP BY kind, ym").all(year)) {
    const m = months.find(x => x.key === r.ym); if (m) m[r.kind] += r.n;
  }
  const one = (sql, ...a) => d.prepare(sql).get(year, ...a).n;
  const totals = { in: one("SELECT COUNT(*) n FROM books WHERE year=? AND status='active' AND kind='in'"), out: one("SELECT COUNT(*) n FROM books WHERE year=? AND status='active' AND kind='out'"),
    cancelled: one("SELECT COUNT(*) n FROM books WHERE year=? AND status='cancelled'") };
  const urgency = {}; for (const u of ['ด่วน', 'ด่วนมาก', 'ด่วนที่สุด']) urgency[u] = one("SELECT COUNT(*) n FROM books WHERE year=? AND status='active' AND urgency=?", u);
  const today = new Date(); const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const due = { total: 0, on_time: 0, late: 0, pending: 0, overdue: 0 };
  for (const b of d.prepare("SELECT due_date, done_at FROM books WHERE year=? AND status='active' AND due_date<>''").all(year)) {
    due.total++;
    if (b.done_at) { const dl = new Date(b.done_at); const ds = `${dl.getFullYear()}-${String(dl.getMonth() + 1).padStart(2, '0')}-${String(dl.getDate()).padStart(2, '0')}`; if (ds <= b.due_date) due.on_time++; else due.late++; }
    else if (b.due_date < t) due.overdue++; else due.pending++;
  }
  const top = (kind, col) => d.prepare(`SELECT ${col} name, COUNT(*) n FROM books WHERE year=? AND status='active' AND kind='${kind}' AND ${col}<>'' GROUP BY ${col} ORDER BY n DESC, name LIMIT 8`).all(year);
  return { year, years, fiscal, months, totals, urgency, due, top_from: top('in', 'from_org'), top_to: top('out', 'to_org') };
}

module.exports = { forYear, monthsOf };
