import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  SERVICES, BUSINESS_HOURS, CLOSED_WEEKDAYS, SHOP, PAYMENT, TIMEZONE, PORT, getService,
} from './config.js';
import * as store from './store.js';
import { sendBookingEmails, verifyMail } from './mailer.js';

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

    const booking = {
      id: 'BK' + crypto.randomBytes(3).toString('hex').toUpperCase(),
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
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    store.add(booking);

    // ส่งอีเมล (ถ้าล้มเหลวก็ยังคงบันทึกการจองไว้)
    let emailWarning = null;
    try {
      await sendBookingEmails(booking, req.file);
    } catch (e) {
      console.error('ส่งอีเมลล้มเหลว:', e.message);
      emailWarning = 'จองสำเร็จ แต่ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าอีเมลในไฟล์ .env';
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

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, mail: await verifyMail() });
});

app.listen(PORT, () => {
  console.log(`\n🌸 ${SHOP.name} กำลังทำงานที่ http://localhost:${PORT}\n`);
});
