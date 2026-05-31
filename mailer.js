import ical from 'ical-generator';
import { MAIL, SHOP, TIMEZONE } from './config.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

// ส่งอีเมลผ่าน Brevo API (HTTPS) — ใช้แทน SMTP เพราะโฮสต์บางเจ้าบล็อกพอร์ต SMTP
async function sendViaBrevo(message) {
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': MAIL.apiKey,
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status}: ${text}`);
  }
  return res.json();
}

// สร้างไฟล์ปฏิทิน (.ics) สำหรับนัดหมาย — เปิดได้กับ Google Calendar / Apple Calendar
function buildIcs(booking) {
  const cal = ical({ name: `${SHOP.name} Booking`, timezone: TIMEZONE });
  cal.method('REQUEST');
  cal.createEvent({
    start: new Date(booking.startISO),
    end: new Date(booking.endISO),
    summary: `${SHOP.name} - ${booking.serviceName}`,
    description:
      `นัดหมายต่อขนตา\n\n` +
      `บริการ: ${booking.serviceName}\n` +
      `ลูกค้า: ${booking.name}\n` +
      `เบอร์โทร: ${booking.phone}\n` +
      `อีเมล: ${booking.email}\n` +
      `ค่ามัดจำที่ชำระ: ${booking.depositAmount} บาท\n` +
      `รหัสการจอง: ${booking.id}`,
    location: SHOP.address || SHOP.name,
    organizer: { name: SHOP.name, email: MAIL.senderEmail },
    attendees: [
      { name: booking.name, email: booking.email, rsvp: true },
      { name: SHOP.name, email: MAIL.ownerEmail, rsvp: true },
    ],
  });
  return cal.toString();
}

function customerHtml(booking) {
  return `
  <div style="font-family:'Prompt',Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ffd9e6">
    <div style="background:linear-gradient(135deg,#ff9ec4,#ffc2d8);padding:24px;text-align:center;color:#fff">
      <h1 style="margin:0;font-size:22px">${SHOP.name}</h1>
      <p style="margin:6px 0 0">ยืนยันการจองคิวเรียบร้อยแล้ว</p>
    </div>
    <div style="padding:24px;color:#5a4a52">
      <p>สวัสดีค่ะคุณ <b>${booking.name}</b> 🌸</p>
      <p>เราได้รับการจองและหลักฐานการโอนมัดจำของคุณแล้ว นี่คือรายละเอียดนัดหมายค่ะ</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('บริการ', booking.serviceName)}
        ${row('วันที่', booking.dateLabel)}
        ${row('เวลา', `${booking.time} - ${booking.endTime} น.`)}
        ${row('ค่ามัดจำ', `${booking.depositAmount} บาท`)}
        ${row('รหัสการจอง', booking.id)}
      </table>
      <p style="background:#fff0f6;padding:12px 16px;border-radius:12px;font-size:14px">
        📅 ไฟล์ปฏิทินแนบมาในอีเมลนี้แล้ว — กดเปิดเพื่อเพิ่มนัดหมายลง Google Calendar ของคุณได้เลยค่ะ
      </p>
      <p style="font-size:13px;color:#9b8b92">หากต้องการเปลี่ยนแปลงนัดหมาย กรุณาติดต่อร้าน ${SHOP.phone || ''}</p>
    </div>
  </div>`;
}

function ownerHtml(booking) {
  return `
  <div style="font-family:'Prompt',Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#e75a8a">📥 มีการจองใหม่!</h2>
    <table style="width:100%;border-collapse:collapse">
      ${row('ลูกค้า', booking.name)}
      ${row('เบอร์โทร', booking.phone)}
      ${row('อีเมล', booking.email)}
      ${row('บริการ', booking.serviceName)}
      ${row('วันที่', booking.dateLabel)}
      ${row('เวลา', `${booking.time} - ${booking.endTime} น.`)}
      ${row('ค่ามัดจำ', `${booking.depositAmount} บาท`)}
      ${row('รหัสการจอง', booking.id)}
    </table>
    <p>สลิปการโอนแนบมาในอีเมลนี้ และนัดหมายถูกเพิ่มในไฟล์ปฏิทินแนบแล้ว</p>
  </div>`;
}

function row(k, v) {
  return `<tr>
    <td style="padding:8px 0;color:#9b8b92;font-size:14px;width:38%">${k}</td>
    <td style="padding:8px 0;color:#5a4a52;font-size:14px;font-weight:600">${v}</td>
  </tr>`;
}

export async function sendBookingEmails(booking, slip) {
  const icsContent = buildIcs(booking);
  const sender = { name: MAIL.fromName, email: MAIL.senderEmail };

  const calendarAttachment = {
    name: 'appointment.ics',
    content: Buffer.from(icsContent, 'utf-8').toString('base64'),
  };

  const slipAttachment = slip
    ? [{ name: slip.originalname || 'payment-slip', content: slip.buffer.toString('base64') }]
    : [];

  // อีเมลถึงลูกค้า
  await sendViaBrevo({
    sender,
    to: [{ email: booking.email, name: booking.name }],
    subject: `✅ ยืนยันการจองคิว ${SHOP.name} - ${booking.dateLabel} ${booking.time} น.`,
    htmlContent: customerHtml(booking),
    attachment: [calendarAttachment],
  });

  // อีเมลถึงเจ้าของร้าน (แนบสลิป)
  await sendViaBrevo({
    sender,
    to: [{ email: MAIL.ownerEmail, name: SHOP.name }],
    subject: `📥 จองใหม่: ${booking.name} - ${booking.dateLabel} ${booking.time} น.`,
    htmlContent: ownerHtml(booking),
    attachment: [calendarAttachment, ...slipAttachment],
  });
}

export async function verifyMail() {
  if (!MAIL.apiKey) return 'ยังไม่ได้ตั้งค่า BREVO_API_KEY';
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { accept: 'application/json', 'api-key': MAIL.apiKey },
    });
    if (!res.ok) return `Brevo ${res.status}: ${await res.text()}`;
    return true;
  } catch (e) {
    return e.message;
  }
}
