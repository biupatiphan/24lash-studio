import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  SERVICES, BUSINESS_HOURS, CLOSED_WEEKDAYS, SHOP, PAYMENT, TIMEZONE, PORT,
  BASE_URL, CONFIRM_SECRET, getService,
} from './config.js';
import * as store from './store.js';
import { sendBookingEmails, sendConfirmationEmails, verifyMail } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
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
  const slots = [];
  const open = toMin(BUSINESS_HOURS.open);
  const close = toMin(BUSINESS_HOURS.close);
  for (let t = open; t < close; t += BUSINESS_HOURS.slotMinutes) {
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
function makeBooking({ id, name, email, phone, serviceId, date, time, status }) {
  const svc = getService(serviceId);
  const startMinutes = toMin(time);
  const endMinutes = startMinutes + svc.duration;
  return {
    id,
    name: String(name).trim(),
    email: String(email).trim(),
    phone: String(phone).trim(),
    serviceId,
    serviceName: svc.name,
    date,
    dateLabel: thaiDateLabel(date),
    time,
    endTime: toHHMM(endMinutes),
    startMinutes,
    endMinutes,
    startISO: bangkokISO(date, startMinutes),
    endISO: bangkokISO(date, endMinutes),
    depositAmount: PAYMENT.depositAmount,
    status,
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
  res.json({
    shop: SHOP,
    payment: PAYMENT,
    services: SERVICES,
    businessHours: BUSINESS_HOURS,
    closedWeekdays: CLOSED_WEEKDAYS,
  });
});

// คืนช่วงเวลาที่ว่าง/ไม่ว่างของวันนั้น สำหรับบริการที่เลือก
app.get('/api/availability', (req, res) => {
  const { date, serviceId } = req.query;
  if (!date) return res.status(400).json({ error: 'ต้องระบุวันที่' });

  const svc = getService(serviceId) || SERVICES[0];
  const day = new Date(`${date}T00:00:00`).getDay();
  const closeMin = toMin(BUSINESS_HOURS.close);

  // วันปิดร้าน
  if (CLOSED_WEEKDAYS.includes(day)) {
    return res.json({ closed: true, slots: [] });
  }

  // ไม่ให้จองย้อนหลัง
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const nowMin = (() => {
    const n = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
    const d = new Date(n);
    return d.getHours() * 60 + d.getMinutes();
  })();

  const slots = generateSlots().map((time) => {
    const start = toMin(time);
    const end = start + svc.duration;
    let available = end <= closeMin && !store.isSlotTaken(date, start, end);
    // ตัดเวลาที่ผ่านไปแล้วของวันนี้ออก
    if (date < todayStr) available = false;
    if (date === todayStr && start <= nowMin + 30) available = false;
    return { time, available };
  });

  res.json({ closed: false, serviceDuration: svc.duration, slots });
});

// สร้างการจอง + ส่งอีเมล + ปฏิทิน
app.post('/api/bookings', upload.single('slip'), async (req, res) => {
  try {
    const { name, email, phone, date, time, serviceId } = req.body;

    if (!name || !email || !phone || !date || !time || !serviceId) {
      return res.status(400).json({ error: 'กรอกข้อมูลไม่ครบถ้วน' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาแนบหลักฐานการโอนมัดจำ' });
    }

    const svc = getService(serviceId);
    if (!svc) return res.status(400).json({ error: 'ไม่พบบริการที่เลือก' });

    const startMinutes = toMin(time);
    const endMinutes = startMinutes + svc.duration;

    if (store.isSlotTaken(date, startMinutes, endMinutes)) {
      return res.status(409).json({ error: 'ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกเวลาอื่นค่ะ' });
    }

    const booking = makeBooking({
      id: 'BK' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      name, email, phone, serviceId, date, time,
      status: 'pending',
    });

    store.add(booking);

    // ลิงก์ยืนยันสำหรับร้าน (ฝังข้อมูลการจองไว้ในลายเซ็น)
    const token = signToken({
      id: booking.id,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      serviceId: booking.serviceId,
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
  if (!payload || !getService(payload.serviceId)) {
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

  res.send(resultPage(
    'ยืนยันการจองเรียบร้อย!',
    `ยืนยันการจอง <b>${booking.id}</b> ของคุณ ${booking.name} แล้วค่ะ<br>` +
    `${booking.dateLabel} เวลา ${booking.time} น.<br><br>` +
    `ส่งอีเมลยืนยัน + ไฟล์ปฏิทินให้ลูกค้าและร้านแล้ว 📅`,
  ));
});

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, mail: await verifyMail() });
});

app.listen(PORT, () => {
  console.log(`\n🌸 ${SHOP.name} กำลังทำงานที่ http://localhost:${PORT}\n`);
});
