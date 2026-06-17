import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  TIMEZONE, PORT, BASE_URL, CONFIRM_SECRET, ADMIN_PASSWORD,
} from './config.js';
import {
  getSettings, getService, saveSettings, SETTINGS_PATH,
} from './settings.js';
import { commitFile } from './github.js';
import * as store from './store.js';
import * as photos from './photos.js';
import { sendBookingEmails, sendConfirmationEmails, sendRescheduleEmails, sendWalkinEmail, verifyMail, googleCalUrl } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '6mb' })); // เผื่อรูป base64 ที่ย่อแล้ว
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // สูงสุด 8MB
  fileFilter: (req, file, cb) => {
    if (/^image\/|application\/pdf/.test(file.mimetype)) cb(null, true);
    else cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพหรือ PDF เท่านั้น'));
  },
});

// ---------- helpers ----------
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function generateSlots() {
  const { businessHours } = getSettings();
  const slots = [];
  const open = toMin(businessHours.open);
  const close = toMin(businessHours.close);
  for (let t = open; t < close; t += businessHours.slotMinutes) {
    slots.push(toHHMM(t));
  }
  return slots;
}

function thaiDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// แปลง YYYY-MM-DD + HH:MM (เวลาไทย) เป็น ISO ที่มี offset +07:00
function bangkokISO(dateStr, minutes) {
  return `${dateStr}T${toHHMM(minutes)}:00+07:00`;
}

// สร้าง object การจองแบบเต็มจากข้อมูลหลัก (ใช้ทั้งตอนจองและตอนยืนยัน)
// รองรับหลายบริการ: ส่ง serviceIds (array) หรือ serviceId (เดี่ยว) ก็ได้
function makeBooking({ id, name, email, phone, serviceId, serviceIds, date, time, status, price, depositAmount, source }) {
  const ids = (Array.isArray(serviceIds) && serviceIds.length) ? serviceIds : [serviceId];
  const svcs = ids.map((sid) => getService(sid)).filter(Boolean);
  const totalDuration = svcs.reduce((t, s) => t + s.duration, 0);
  const totalPrice = svcs.reduce((t, s) => t + s.price, 0);
  const startMinutes = toMin(time);
  const endMinutes = startMinutes + totalDuration;
  return {
    id,
    name: String(name).trim(),
    email: String(email || '').trim(),
    phone: String(phone || '').trim(),
    serviceId: ids[0],
    serviceIds: ids,
    serviceName: svcs.map((s) => s.name).join(' + '),
    date,
    dateLabel: thaiDateLabel(date),
    time,
    endTime: toHHMM(endMinutes),
    startMinutes,
    endMinutes,
    startISO: bangkokISO(date, startMinutes),
    endISO: bangkokISO(date, endMinutes),
    price: Number.isFinite(Number(price)) ? Math.round(Number(price)) : totalPrice,
    depositAmount: Number.isFinite(Number(depositAmount)) ? Math.round(Number(depositAmount)) : getSettings().payment.depositAmount,
    status,
    source: source || 'online',
    createdAt: new Date().toISOString(),
  };
}

// ---------- ลิงก์ยืนยันแบบมีลายเซ็น (ไม่ต้องพึ่งฐานข้อมูล ใช้ได้แม้เซิร์ฟเวอร์รีสตาร์ท) ----------
function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', CONFIRM_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  const [data, sig] = String(token || '').split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', CONFIRM_SECRET).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// ---------- หลังบ้าน (admin) ----------
// ตรวจรหัสผ่านแบบ timing-safe ; ถ้าไม่ได้ตั้ง ADMIN_PASSWORD = ปิดหลังบ้าน
function checkAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const pw = req.get('x-admin-password') || (req.body && req.body.password) || '';
  const a = Buffer.from(String(pw));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ตรวจ/ทำความสะอาดค่าที่ส่งมาจากหลังบ้านก่อนบันทึก
function sanitizeSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('ข้อมูลไม่ถูกต้อง');

  const services = (Array.isArray(input.services) ? input.services : [])
    .map((s, i) => {
      const name = String(s.name || '').trim();
      if (!name) throw new Error(`บริการลำดับที่ ${i + 1} ต้องมีชื่อ`);
      const duration = Math.round(Number(s.duration));
      const price = Math.round(Number(s.price));
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`ระยะเวลาของ "${name}" ไม่ถูกต้อง`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`ราคาของ "${name}" ไม่ถูกต้อง`);
      const id = (s.id && slug(s.id)) || slug(name) || `svc-${i + 1}`;
      return { id, name, duration, price, popular: !!s.popular };
    });
  if (!services.length) throw new Error('ต้องมีบริการอย่างน้อย 1 รายการ');
  // กัน id ซ้ำ
  const ids = new Set();
  services.forEach((s) => {
    let id = s.id, n = 2;
    while (ids.has(id)) id = `${s.id}-${n++}`;
    s.id = id;
    ids.add(id);
  });
  // จำกัด "ยอดฮิต" ไม่เกิน 3 รายการ (เกินมาให้ตัดออก)
  let popularCount = 0;
  services.forEach((s) => {
    if (s.popular && popularCount < 3) popularCount++;
    else s.popular = false;
  });

  const bh = input.businessHours || {};
  if (!HHMM_RE.test(bh.open) || !HHMM_RE.test(bh.close)) throw new Error('เวลาทำการต้องเป็นรูปแบบ HH:MM');
  if (toMin(bh.open) >= toMin(bh.close)) throw new Error('เวลาเปิดต้องมาก่อนเวลาปิด');
  const slotMinutes = Math.round(Number(bh.slotMinutes));
  if (!Number.isFinite(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) throw new Error('ความถี่ช่วงเวลาไม่ถูกต้อง');

  const closedWeekdays = (Array.isArray(input.closedWeekdays) ? input.closedWeekdays : [])
    .map(Number).filter((n) => n >= 0 && n <= 6);
  const closedDates = (Array.isArray(input.closedDates) ? input.closedDates : [])
    .map((d) => String(d).trim()).filter((d) => DATE_RE.test(d));

  const blockedTimes = (Array.isArray(input.blockedTimes) ? input.blockedTimes : [])
    .map((b) => ({
      date: String(b?.date || '').trim(),
      start: String(b?.start || '').trim(),
      end: String(b?.end || '').trim(),
    }))
    .filter((b) => DATE_RE.test(b.date) && HHMM_RE.test(b.start) && HHMM_RE.test(b.end) && toMin(b.start) < toMin(b.end));

  const shop = input.shop || {};
  const payment = input.payment || {};
  const deposit = Math.round(Number(payment.depositAmount));

  return {
    services,
    businessHours: { open: bh.open, close: bh.close, slotMinutes },
    closedWeekdays: [...new Set(closedWeekdays)],
    closedDates: [...new Set(closedDates)].sort(),
    blockedTimes: blockedTimes.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    shop: {
      name: String(shop.name || '').trim() || '24Lash Studio',
      address: String(shop.address || '').trim(),
      phone: String(shop.phone || '').trim(),
    },
    payment: {
      depositAmount: Number.isFinite(deposit) && deposit >= 0 ? deposit : 0,
      bankName: String(payment.bankName || '').trim(),
      bankAccountName: String(payment.bankAccountName || '').trim(),
      bankAccountNumber: String(payment.bankAccountNumber || '').trim(),
      promptpayId: String(payment.promptpayId || '').trim(),
    },
  };
}

// หน้าเว็บผลลัพธ์ (โทนชมพูให้เข้ากับเว็บ) สำหรับร้านหลังกดลิงก์ยืนยัน
function resultPage(title, message, ok = true) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600&display=swap" rel="stylesheet" />
  <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fff0f6,#ffe7f0);font-family:'Prompt',sans-serif;color:#5a4a52}
  .box{background:#fff;max-width:420px;margin:20px;padding:32px;border-radius:20px;text-align:center;border:1px solid #ffd9e6;box-shadow:0 10px 40px rgba(231,90,138,.12)}
  .ic{font-size:48px}h1{color:${ok ? '#e75a8a' : '#c0392b'};font-size:22px;margin:12px 0}p{font-size:15px;line-height:1.6}</style>
  </head><body><div class="box"><div class="ic">${ok ? '🌷' : '⚠️'}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

// ---------- API ----------
app.get('/api/config', (req, res) => {
  const s = getSettings();
  res.json({
    shop: s.shop,
    payment: s.payment,
    services: s.services,
    businessHours: s.businessHours,
    closedWeekdays: s.closedWeekdays,
    closedDates: s.closedDates,
    photos: photos.asUrlMap(),
  });
});

// คืนช่วงเวลาที่ว่าง/ไม่ว่างของวันนั้น สำหรับบริการที่เลือก
app.get('/api/availability', (req, res) => {
  const { date, serviceId, serviceIds } = req.query;
  if (!date) return res.status(400).json({ error: 'ต้องระบุวันที่' });

  const s = getSettings();
  // รองรับหลายบริการ: ?serviceIds=a,b,c (รวมเวลา) หรือ ?serviceId=a (เดี่ยว)
  const ids = serviceIds ? String(serviceIds).split(',').filter(Boolean) : (serviceId ? [serviceId] : []);
  const chosen = ids.map((id) => getService(id)).filter(Boolean);
  const totalDuration = chosen.length ? chosen.reduce((t, x) => t + x.duration, 0) : (s.services[0] ? s.services[0].duration : 60);
  const day = new Date(`${date}T00:00:00`).getDay();
  const closeMin = toMin(s.businessHours.close);

  // วันปิดร้าน (วันประจำสัปดาห์ หรือ วันปิดเฉพาะกิจ)
  if (s.closedWeekdays.includes(day) || s.closedDates.includes(date)) {
    return res.json({ closed: true, slots: [] });
  }

  // ไม่ให้จองย้อนหลัง
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const nowMin = (() => {
    const n = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
    const d = new Date(n);
    return d.getHours() * 60 + d.getMinutes();
  })();

  // ช่วงเวลาที่ร้านปิดเฉพาะวันนี้ (เป็นนาที)
  const blocks = (s.blockedTimes || [])
    .filter((b) => b.date === date)
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end) }));

  const slots = generateSlots().map((time) => {
    const start = toMin(time);
    const end = start + totalDuration;
    let available = end <= closeMin && !store.isSlotTaken(date, start, end);
    // ตัดช่วงเวลาที่ร้านปิดเฉพาะกิจ (จองทับช่วงไม่ว่างไม่ได้)
    if (blocks.some((bl) => start < bl.end && end > bl.start)) available = false;
    // ตัดเวลาที่ผ่านไปแล้วของวันนี้ออก
    if (date < todayStr) available = false;
    if (date === todayStr && start <= nowMin + 30) available = false;
    return { time, available };
  });

  res.json({ closed: false, serviceDuration: totalDuration, slots });
});

// สร้างการจอง + ส่งอีเมล + ปฏิทิน
app.post('/api/bookings', upload.single('slip'), async (req, res) => {
  try {
    const { name, email, phone, date, time } = req.body;
    // รองรับหลายบริการ: serviceIds (JSON array string) หรือ serviceId เดี่ยว
    let ids = [];
    try { ids = JSON.parse(req.body.serviceIds || '[]'); } catch { ids = []; }
    if (!Array.isArray(ids) || !ids.length) ids = req.body.serviceId ? [req.body.serviceId] : [];

    if (!name || !email || !phone || !date || !time || !ids.length) {
      return res.status(400).json({ error: 'กรอกข้อมูลไม่ครบถ้วน' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    const svcs = ids.map((id) => getService(id)).filter(Boolean);
    if (!svcs.length) return res.status(400).json({ error: 'ไม่พบบริการที่เลือก' });

    const totalPrice = svcs.reduce((tt, s) => tt + s.price, 0);
    const totalDuration = svcs.reduce((tt, s) => tt + s.duration, 0);

    // ราคารวม 0 (เช่น เคลมฟรีล้วน) ไม่ต้องมัดจำ/แนบสลิป
    const isFree = totalPrice === 0;
    if (!isFree && !req.file) {
      return res.status(400).json({ error: 'กรุณาแนบหลักฐานการโอนมัดจำ' });
    }

    const startMinutes = toMin(time);
    const endMinutes = startMinutes + totalDuration;

    if (store.isSlotTaken(date, startMinutes, endMinutes)) {
      return res.status(409).json({ error: 'ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกเวลาอื่นค่ะ' });
    }

    // กันจองทับช่วงเวลาที่ร้านปิดเฉพาะกิจ
    const blockedHit = (getSettings().blockedTimes || []).some(
      (b) => b.date === date && startMinutes < toMin(b.end) && endMinutes > toMin(b.start),
    );
    if (blockedHit) {
      return res.status(409).json({ error: 'ช่วงเวลานี้ร้านไม่ว่าง กรุณาเลือกเวลาอื่นค่ะ' });
    }

    const booking = makeBooking({
      id: 'BK' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      name, email, phone, serviceIds: ids, date, time,
      depositAmount: isFree ? 0 : getSettings().payment.depositAmount,
      status: 'pending',
    });

    store.add(booking);

    // ลิงก์ยืนยันสำหรับร้าน (ฝังข้อมูลการจองไว้ในลายเซ็น)
    const token = signToken({
      id: booking.id,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      serviceIds: booking.serviceIds,
      date: booking.date,
      time: booking.time,
    });
    const confirmUrl = `${BASE_URL}/api/bookings/confirm?token=${token}`;

    // ส่งอีเมล (ถ้าล้มเหลวก็ยังคงบันทึกการจองไว้)
    let emailWarning = null;
    try {
      await sendBookingEmails(booking, req.file, confirmUrl);
    } catch (e) {
      console.error('ส่งอีเมลล้มเหลว:', e.message);
      emailWarning = 'จองสำเร็จ แต่ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าอีเมล';
    }

    res.json({
      ok: true,
      booking: {
        id: booking.id,
        name: booking.name,
        serviceName: booking.serviceName,
        dateLabel: booking.dateLabel,
        time: booking.time,
        endTime: booking.endTime,
        depositAmount: booking.depositAmount,
        email: booking.email,
      },
      emailWarning,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// ร้านกดลิงก์จากอีเมลเพื่อยืนยันการจอง -> ส่งอีเมลยืนยัน + ปฏิทินให้ทั้งสองฝ่าย
app.get('/api/bookings/confirm', async (req, res) => {
  const payload = verifyToken(req.query.token);
  const tokenIds = payload ? (payload.serviceIds || (payload.serviceId ? [payload.serviceId] : [])) : [];
  if (!payload || !tokenIds.some((id) => getService(id))) {
    return res.status(400).send(resultPage('ลิงก์ไม่ถูกต้อง', 'ลิงก์ยืนยันไม่ถูกต้องหรือเสียหาย กรุณาตรวจสอบอีเมลอีกครั้งค่ะ', false));
  }

  // กันกดยืนยันซ้ำ (เท่าที่ข้อมูลในเครื่องยังอยู่)
  const existing = store.getAll().find((b) => b.id === payload.id);
  if (existing && existing.status === 'confirmed') {
    return res.send(resultPage('ยืนยันแล้ว', `การจอง <b>${payload.id}</b> ถูกยืนยันไปก่อนหน้านี้แล้วค่ะ ✅`));
  }

  const booking = makeBooking({ ...payload, status: 'confirmed' });

  try {
    await sendConfirmationEmails(booking);
  } catch (e) {
    console.error('ส่งอีเมลยืนยันล้มเหลว:', e.message);
    return res.status(500).send(resultPage('ส่งอีเมลไม่สำเร็จ', 'ยืนยันไม่สำเร็จ ลองกดลิงก์อีกครั้งนะคะ', false));
  }

  store.setStatus(booking.id, 'confirmed');

  const calBtn =
    `<a href="${googleCalUrl(booking)}" target="_blank" rel="noopener" ` +
    `style="display:inline-block;margin-top:16px;background:#e75a8a;color:#fff;text-decoration:none;` +
    `font-weight:600;font-size:15px;padding:13px 28px;border-radius:999px">📅 เพิ่มลง Google Calendar ของร้าน</a>`;

  res.send(resultPage(
    'ยืนยันการจองเรียบร้อย!',
    `ยืนยันการจอง <b>${booking.id}</b> ของคุณ ${booking.name} แล้วค่ะ<br>` +
    `${booking.dateLabel} เวลา ${booking.time} น.<br><br>` +
    `ส่งอีเมลยืนยันให้ลูกค้าแล้ว 💌<br>` +
    `กดปุ่มด้านล่างเพื่อเพิ่มนัดนี้ลงปฏิทินร้านได้เลยค่ะ` +
    calBtn,
  ));
});

// โหลดค่าปัจจุบันเข้าหลังบ้าน (ต้องใส่รหัสผ่าน)
app.get('/api/admin/settings', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  res.json({ settings: getSettings() });
});

// บันทึกค่าจากหลังบ้าน -> เขียนในเครื่อง + commit ขึ้น GitHub (Render redeploy ให้ค่าถาวร)
app.post('/api/admin/settings', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  try {
    const clean = sanitizeSettings(req.body.settings);
    const json = saveSettings(clean);

    let committed = false;
    let warning = null;
    try {
      await commitFile(SETTINGS_PATH, json, 'Update shop settings via admin panel');
      committed = true;
    } catch (e) {
      console.error('commit settings ล้มเหลว:', e.message);
      warning = 'บันทึกในเครื่องแล้ว แต่บันทึกถาวรขึ้น GitHub ไม่สำเร็จ: ' + e.message;
    }

    res.json({ ok: true, committed, warning, settings: getSettings() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- หลังบ้าน: จัดการคิว + รายงานยอดขาย ----------

// กรองคิวตามช่วงเวลา: ?date=YYYY-MM-DD | ?month=YYYY-MM | ?from=&to=
function filterByRange(all, q) {
  if (q.date && DATE_RE.test(q.date)) return all.filter((b) => b.date === q.date);
  if (q.month && /^\d{4}-\d{2}$/.test(q.month)) return all.filter((b) => b.date && b.date.startsWith(q.month));
  if (q.from && q.to && DATE_RE.test(q.from) && DATE_RE.test(q.to)) {
    return all.filter((b) => b.date >= q.from && b.date <= q.to);
  }
  return all;
}

// รายการคิว (เรียงตามวัน-เวลา)
app.get('/api/admin/bookings', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const list = filterByRange(store.getAll(), req.query)
    .slice()
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json({ bookings: list });
});

// รายงานยอดขาย: นับเฉพาะคิวที่ "เสร็จแล้ว" เป็นรายได้จริง
app.get('/api/admin/report', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const list = filterByRange(store.getAll(), req.query);

  const done = list.filter((b) => b.status === store.STATUS.DONE);
  // มัดจำ = เงินที่รับเข้ามาแล้วตั้งแต่ตอนจอง (ไม่นับคิวที่ยกเลิก/ไม่มา)
  const depositList = list.filter((b) => b.status !== store.STATUS.CANCELLED && b.status !== store.STATUS.NOSHOW);
  const sum = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);

  const byService = {};
  done.forEach((b) => {
    const k = b.serviceName || b.serviceId || 'อื่นๆ';
    if (!byService[k]) byService[k] = { name: k, count: 0, sales: 0 };
    byService[k].count += 1;
    byService[k].sales += Number(b.price) || 0;
  });

  res.json({
    totalSales: sum(done, (b) => b.price),
    doneCount: done.length,
    depositTotal: sum(depositList, (b) => b.depositAmount),
    onSiteTotal: sum(done, (b) => (Number(b.price) || 0) - (Number(b.depositAmount) || 0)),
    counts: {
      pending: list.filter((b) => b.status === store.STATUS.PENDING).length,
      confirmed: list.filter((b) => b.status === store.STATUS.CONFIRMED).length,
      done: done.length,
      noshow: list.filter((b) => b.status === store.STATUS.NOSHOW).length,
      cancelled: list.filter((b) => b.status === store.STATUS.CANCELLED).length,
    },
    byService: Object.values(byService).sort((a, b) => b.sales - a.sales),
  });
});

// เพิ่มคิวเอง (walk-in / นัดปากเปล่า) — ไม่ต้องแนบสลิป/ส่งเมล
app.post('/api/admin/bookings', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  try {
    const { name, phone, email, serviceId, date, time, price, depositAmount, status } = req.body;
    if (!serviceId || !getService(serviceId)) return res.status(400).json({ error: 'กรุณาเลือกบริการ' });
    if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
    if (!time || !HHMM_RE.test(time)) return res.status(400).json({ error: 'เวลาไม่ถูกต้อง' });
    const allowed = [store.STATUS.CONFIRMED, store.STATUS.DONE];
    const st = allowed.includes(status) ? status : store.STATUS.DONE;

    const booking = makeBooking({
      id: 'WK' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      name: name || 'Walk-in',
      email: (email || '').trim(), phone: phone || '',
      serviceId, date, time,
      price, depositAmount: depositAmount === undefined ? 0 : depositAmount,
      status: st, source: 'manual',
    });
    store.add(booking);

    // ส่งรายละเอียดให้ลูกค้าถ้ากรอกอีเมล
    let emailWarning = null;
    if (booking.email) {
      try {
        await sendWalkinEmail(booking);
      } catch (e) {
        console.error('ส่งอีเมล walk-in ล้มเหลว:', e.message);
        emailWarning = 'บันทึกคิวแล้ว แต่ส่งอีเมลไม่สำเร็จ: ' + e.message;
      }
    }
    res.json({ ok: true, booking, emailWarning });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// แก้ไขคิว: เปลี่ยนสถานะ / เปลี่ยนบริการ / แก้ราคา-มัดจำ
app.post('/api/admin/bookings/:id', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const current = store.getAll().find((b) => b.id === req.params.id);
  if (!current) return res.status(404).json({ error: 'ไม่พบคิวนี้' });

  const fields = {};
  const { serviceId, price, depositAmount, status, name, phone } = req.body;

  // เปลี่ยนบริการ -> คำนวณชื่อ/ระยะเวลา/เวลาสิ้นสุด/ราคาใหม่
  if (serviceId && serviceId !== current.serviceId) {
    const svc = getService(serviceId);
    if (!svc) return res.status(400).json({ error: 'ไม่พบบริการที่เลือก' });
    fields.serviceId = serviceId;
    fields.serviceName = svc.name;
    const endMinutes = current.startMinutes + svc.duration;
    fields.endMinutes = endMinutes;
    fields.endTime = toHHMM(endMinutes);
    fields.endISO = bangkokISO(current.date, endMinutes);
    fields.price = svc.price; // เด้งราคาตามบริการใหม่ (จะถูก override ด้านล่างถ้าส่ง price มา)
  }
  if (price !== undefined && Number.isFinite(Number(price))) fields.price = Math.round(Number(price));
  if (depositAmount !== undefined && Number.isFinite(Number(depositAmount))) fields.depositAmount = Math.round(Number(depositAmount));
  if (name !== undefined) fields.name = String(name).trim();
  if (phone !== undefined) fields.phone = String(phone).trim();
  if (status && Object.values(store.STATUS).includes(status)) fields.status = status;

  const updated = store.update(req.params.id, fields);
  res.json({ ok: true, booking: updated });
});

// เลื่อนนัด: เปลี่ยนวัน-เวลา (เช็คว่าว่างจริง) + ส่งอีเมลแจ้งลูกค้า/ร้าน
app.post('/api/admin/bookings/:id/reschedule', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const b = store.getAll().find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบคิวนี้' });

  const { date, time } = req.body;
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
  if (!time || !HHMM_RE.test(time)) return res.status(400).json({ error: 'เวลาไม่ถูกต้อง' });

  const s = getSettings();
  // ใช้ระยะเวลาเดิมของคิวเป็นหลัก (กันเพี้ยนถ้าบริการถูกลบไปแล้ว) fallback ไปที่บริการ/ค่าเริ่มต้น
  const svc = getService(b.serviceId);
  const duration = (b.endMinutes - b.startMinutes) || (svc && svc.duration) || 60;
  const start = toMin(time);
  const end = start + duration;
  const day = new Date(`${date}T00:00:00`).getDay();

  if (s.closedWeekdays.includes(day) || s.closedDates.includes(date)) {
    return res.status(400).json({ error: 'วันนั้นร้านปิด เลือกวันอื่นค่ะ' });
  }
  if (end > toMin(s.businessHours.close)) {
    return res.status(400).json({ error: 'เวลาที่เลือกเลยเวลาปิดร้าน' });
  }
  const blocked = (s.blockedTimes || []).some((bl) => bl.date === date && start < toMin(bl.end) && end > toMin(bl.start));
  if (blocked) return res.status(400).json({ error: 'ช่วงเวลานี้ร้านปิด เลือกเวลาอื่นค่ะ' });

  // ชนกับคิวอื่น (ไม่นับตัวเอง)
  const conflict = store.getByDate(date).some((x) => x.id !== b.id && start < x.endMinutes && end > x.startMinutes);
  if (conflict) return res.status(409).json({ error: 'เวลานี้มีคิวอื่นอยู่แล้ว เลือกเวลาอื่นค่ะ' });

  const updated = store.update(b.id, {
    date,
    time,
    dateLabel: thaiDateLabel(date),
    startMinutes: start,
    endMinutes: end,
    endTime: toHHMM(end),
    startISO: bangkokISO(date, start),
    endISO: bangkokISO(date, end),
  });

  let emailWarning = null;
  try {
    await sendRescheduleEmails(updated);
  } catch (e) {
    console.error('ส่งอีเมลเลื่อนนัดล้มเหลว:', e.message);
    emailWarning = 'เลื่อนนัดแล้ว แต่ส่งอีเมลไม่สำเร็จ: ' + e.message;
  }

  res.json({ ok: true, booking: updated, emailWarning });
});

// ---------- หลังบ้าน: รูปตัวอย่างบริการ ----------
// อัปรูป (รับ base64 ที่ย่อขนาดจากเบราว์เซอร์แล้ว)
app.post('/api/admin/services/:id/photos', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  if (!getService(req.params.id)) return res.status(404).json({ error: 'ไม่พบบริการนี้' });
  try {
    const strip = (v) => String(v || '').replace(/^data:image\/\w+;base64,/, '');
    const raw = strip(req.body.image);
    if (!raw) return res.status(400).json({ error: 'ไม่พบรูปภาพ' });
    const fullBuf = Buffer.from(raw, 'base64');
    const thumbRaw = strip(req.body.thumb);
    const thumbBuf = thumbRaw ? Buffer.from(thumbRaw, 'base64') : fullBuf;
    if (fullBuf.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'ไฟล์ใหญ่เกินไป' });
    const photo = await photos.addPhoto(req.params.id, fullBuf, thumbBuf, 'jpg');
    res.json({ ok: true, photo, photos: photos.getForService(req.params.id) });
  } catch (e) {
    console.error('อัปรูปล้มเหลว:', e.message);
    res.status(500).json({ error: 'อัปรูปไม่สำเร็จ: ' + e.message });
  }
});

// ดูรูปของบริการ (สำหรับหลังบ้าน)
app.get('/api/admin/services/:id/photos', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  res.json({ photos: photos.getForService(req.params.id) });
});

// รูปทั้งหมด (พร้อม id) สำหรับหลังบ้าน
app.get('/api/admin/photos', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  res.json({ photos: photos.adminMap() });
});

// ลบรูป
app.delete('/api/admin/services/:id/photos/:photoId', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  photos.removePhoto(req.params.id, req.params.photoId);
  res.json({ ok: true, photos: photos.getForService(req.params.id) });
});

// ลบคิว — อนุญาตเฉพาะคิวที่ "ไม่มา/ยกเลิก"
app.delete('/api/admin/bookings/:id', (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  const b = store.getAll().find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบคิวนี้' });
  if (b.status !== store.STATUS.NOSHOW && b.status !== store.STATUS.CANCELLED) {
    return res.status(400).json({ error: 'ลบได้เฉพาะคิวที่ "ไม่มา/ยกเลิก" เท่านั้น' });
  }
  store.remove(req.params.id);
  res.json({ ok: true });
});

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, mail: await verifyMail() });
});

// โหลดข้อมูลจอง + รูปตัวอย่าง จาก GitHub (ถาวร) ก่อนเปิดรับ request
await store.init();
await photos.init();

app.listen(PORT, () => {
  console.log(`\n🌸 ${getSettings().shop.name} กำลังทำงานที่ http://localhost:${PORT}\n`);
});
