import { getSettings } from './settings.js';
import * as store from './store.js';
import { pushMessage, lineEnabled } from './line.js';
import { REMINDER_HOUR } from './config.js';

const TZ = 'Asia/Bangkok';

// วันที่ปัจจุบันเขตเวลาไทย -> 'YYYY-MM-DD'
function bangkokToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// ชั่วโมงปัจจุบัน (0-23) เขตเวลาไทย
function bangkokHour() {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', hourCycle: 'h23',
  }).format(new Date()));
}

// บวกวันจากสตริง 'YYYY-MM-DD' (คำนวณแบบ UTC ล้วน — ไทยไม่มี DST จึงปลอดภัย)
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ประกอบข้อความเตือน (ล่วงหน้า 1 วัน)
function buildReminder(b, shop) {
  const shopName = shop.name || 'ร้านของเรา';
  const lines = [
    '🔔 แจ้งเตือนคิวพรุ่งนี้ค่ะ',
    '',
    `คุณ${b.name} มีนัดต่อขนตากับ ${shopName} พรุ่งนี้นะคะ 💚`,
    '',
    `📅 ${b.dateLabel}`,
    `⏰ เวลา ${b.time} น.`,
    `💅 ${b.serviceName}`,
  ];
  if (shop.address) lines.push(`📍 ${shop.address}`);
  lines.push('', `รหัสคิว: ${b.id}`, 'หากไม่สะดวก รบกวนแจ้งล่วงหน้านะคะ 🙏');
  if (shop.address) {
    lines.push(`🗺️ แผนที่ร้าน: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`);
  }
  return lines.join('\n');
}

// เช็คคิวที่ถึงกำหนดเตือน (คิวของ "พรุ่งนี้") แล้วส่ง push ทาง LINE
// force=true : ส่งโดยไม่สนใจว่าถึงชั่วโมง REMINDER_HOUR หรือยัง (ใช้ทดสอบจากหลังบ้าน)
export async function runDueReminders({ force = false } = {}) {
  if (!lineEnabled()) return { sent: 0, skipped: 0, reason: 'LINE ยังไม่ได้ตั้งค่า' };

  const hour = bangkokHour();
  if (!force && hour < REMINDER_HOUR) {
    return { sent: 0, skipped: 0, reason: `ยังไม่ถึงเวลาส่ง (ตอนนี้ ${hour}:00 · เริ่มส่ง ${REMINDER_HOUR}:00)` };
  }

  const shop = getSettings().shop || {};
  const targetDate = addDays(bangkokToday(), 1); // คิวของพรุ่งนี้
  const active = new Set([store.STATUS.PENDING, store.STATUS.CONFIRMED]);

  let sent = 0;
  let skipped = 0;
  for (const b of store.getAll()) {
    if (b.date !== targetDate) continue;
    if (!active.has(b.status)) continue;
    if (!b.lineUserId) { skipped++; continue; }               // ยังไม่ผูก LINE
    if (Array.isArray(b.remindersSent) && b.remindersSent.includes('1d')) continue; // ส่งไปแล้ว

    try {
      await pushMessage(b.lineUserId, buildReminder(b, shop));
      store.markReminded(b.id, '1d');
      sent++;
    } catch (e) {
      console.error(`ส่งเตือนคิว ${b.id} ล้มเหลว:`, e.message);
      skipped++;
    }
  }
  return { sent, skipped, targetDate };
}
