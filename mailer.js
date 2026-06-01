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

// อีเมลถึงลูกค้าตอนเพิ่งจอง — แจ้งว่ารับเรื่องแล้ว กำลังรอร้านยืนยัน (ยังไม่แนบปฏิทิน)
function pendingCustomerHtml(booking) {
  return `
  <div style="font-family:'Prompt',Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ffd9e6">
    <div style="background:linear-gradient(135deg,#ff9ec4,#ffc2d8);padding:24px;text-align:center;color:#fff">
      <h1 style="margin:0;font-size:22px">${SHOP.name}</h1>
      <p style="margin:6px 0 0">ได้รับการจองแล้ว · กำลังรอร้านยืนยัน</p>
    </div>
    <div style="padding:24px;color:#5a4a52">
      <p>สวัสดีค่ะคุณ <b>${booking.name}</b> 🌸</p>
      <p>เราได้รับการจองและหลักฐานการโอนมัดจำของคุณแล้วค่ะ ทางร้านกำลังตรวจสอบ เมื่อยืนยันเรียบร้อยจะส่งอีเมลยืนยัน <b>พร้อมไฟล์ปฏิทินนัดหมาย</b> ให้อีกครั้งนะคะ</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('บริการ', booking.serviceName)}
        ${row('วันที่', booking.dateLabel)}
        ${row('เวลา', `${booking.time} - ${booking.endTime} น.`)}
        ${row('ค่ามัดจำ', `${booking.depositAmount} บาท`)}
        ${row('รหัสการจอง', booking.id)}
      </table>
      <p style="background:#fff0f6;padding:12px 16px;border-radius:12px;font-size:14px">⏳ สถานะ: <b>รอร้านยืนยัน</b></p>
      <p style="font-size:13px;color:#9b8b92">หากต้องการเปลี่ยนแปลงนัดหมาย กรุณาติดต่อร้าน ${SHOP.phone || ''}</p>
    </div>
  </div>`;
}

// อีเมลถึงร้าน — แจ้งจองใหม่ + แนบสลิป + ปุ่มยืนยัน
function ownerNotifyHtml(booking, confirmUrl) {
  return `
  <div style="font-family:'Prompt',Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#e75a8a">📥 มีการจองใหม่! (รอยืนยัน)</h2>
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
    <p style="font-size:14px;color:#5a4a52">สลิปการโอนแนบมาในอีเมลนี้แล้ว — ตรวจสอบแล้วกดปุ่มด้านล่างเพื่อ <b>ยืนยันการจองและเพิ่มลงปฏิทิน</b></p>
    <div style="text-align:center;margin:24px 0">
      <a href="${confirmUrl}" style="display:inline-block;background:#e75a8a;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 32px;border-radius:999px">✅ ยืนยันการจอง + เพิ่มลงปฏิทิน</a>
    </div>
    <p style="font-size:12px;color:#9b8b92;text-align:center;word-break:break-all">ถ้าปุ่มกดไม่ได้ ก๊อปลิงก์นี้เปิดในเบราว์เซอร์:<br>${confirmUrl}</p>
  </div>`;
}

// อีเมลถึงลูกค้าหลังร้านยืนยัน — แนบไฟล์ปฏิทิน
function confirmedCustomerHtml(booking) {
  return `
  <div style="font-family:'Prompt',Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ffd9e6">
    <div style="background:linear-gradient(135deg,#ff9ec4,#ffc2d8);padding:24px;text-align:center;color:#fff">
      <h1 style="margin:0;font-size:22px">${SHOP.name}</h1>
      <p style="margin:6px 0 0">ยืนยันการจองคิวเรียบร้อยแล้ว ✅</p>
    </div>
    <div style="padding:24px;color:#5a4a52">
      <p>สวัสดีค่ะคุณ <b>${booking.name}</b> 🌸</p>
      <p>ทางร้านยืนยันการจองของคุณเรียบร้อยแล้วค่ะ นี่คือรายละเอียดนัดหมาย</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('บริการ', booking.serviceName)}
        ${row('วันที่', booking.dateLabel)}
        ${row('เวลา', `${booking.time} - ${booking.endTime} น.`)}
        ${row('ค่ามัดจำ', `${booking.depositAmount} บาท`)}
        ${row('รหัสการจอง', booking.id)}
      </table>
      <p style="background:#fff0f6;padding:12px 16px;border-radius:12px;font-size:14px;text-align:center">
        📅 กดปุ่มด้านล่างเพื่อเพิ่มนัดหมายลงปฏิทินของคุณได้เลยค่ะ
      </p>
      ${gcalButton(booking)}
      <p style="font-size:12px;color:#9b8b92;text-align:center">หรือเปิดไฟล์ <b>appointment.ics</b> ที่แนบมา (สำหรับ Apple Calendar)</p>
      <p style="font-size:13px;color:#9b8b92">หากต้องการเปลี่ยนแปลงนัดหมาย กรุณาติดต่อร้าน ${SHOP.phone || ''}</p>
    </div>
  </div>`;
}

// อีเมลถึงร้านหลังยืนยัน — แนบไฟล์ปฏิทินให้กดเพิ่มลงปฏิทินของร้าน
function ownerCalendarHtml(booking) {
  return `
  <div style="font-family:'Prompt',Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#e75a8a">✅ ยืนยันการจองแล้ว</h2>
    <table style="width:100%;border-collapse:collapse">
      ${row('ลูกค้า', booking.name)}
      ${row('เบอร์โทร', booking.phone)}
      ${row('บริการ', booking.serviceName)}
      ${row('วันที่', booking.dateLabel)}
      ${row('เวลา', `${booking.time} - ${booking.endTime} น.`)}
      ${row('รหัสการจอง', booking.id)}
    </table>
    <p style="background:#fff0f6;padding:12px 16px;border-radius:12px;font-size:14px;text-align:center">📅 กดปุ่มด้านล่างเพื่อเพิ่มนัดหมายลง Google Calendar ของร้านได้เลยค่ะ</p>
    ${gcalButton(booking)}
    <p style="font-size:12px;color:#9b8b92;text-align:center">หรือเปิดไฟล์ <b>appointment.ics</b> ที่แนบมา (สำหรับ Apple Calendar)</p>
  </div>`;
}

// แปลงเวลา ISO -> รูปแบบ UTC แบบกระชับสำหรับลิงก์ Google Calendar (YYYYMMDDTHHMMSSZ)
function gcalDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// สร้างลิงก์ "เพิ่มลง Google Calendar" ที่กดแล้วเปิดปฏิทินพร้อมข้อมูลครบ กด Save ได้เลย
function googleCalUrl(booking) {
  const dates = `${gcalDate(booking.startISO)}/${gcalDate(booking.endISO)}`;
  const text = encodeURIComponent(`${SHOP.name} - ${booking.serviceName}`);
  const details = encodeURIComponent(
    `บริการ: ${booking.serviceName}\n` +
    `ลูกค้า: ${booking.name}\n` +
    `เบอร์โทร: ${booking.phone}\n` +
    `อีเมล: ${booking.email}\n` +
    `รหัสการจอง: ${booking.id}`
  );
  const location = encodeURIComponent(SHOP.address || SHOP.name);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
}

// ปุ่มสีชมพูสำหรับเพิ่มลง Google Calendar
function gcalButton(booking) {
  return `
    <div style="text-align:center;margin:8px 0 16px">
      <a href="${googleCalUrl(booking)}" style="display:inline-block;background:#e75a8a;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:999px">📅 เพิ่มลง Google Calendar</a>
    </div>`;
}

function row(k, v) {
  return `<tr>
    <td style="padding:8px 0;color:#9b8b92;font-size:14px;width:38%">${k}</td>
    <td style="padding:8px 0;color:#5a4a52;font-size:14px;font-weight:600">${v}</td>
  </tr>`;
}

// ตอนลูกค้าจอง: แจ้งลูกค้าว่ารอยืนยัน + ส่งให้ร้าน (แนบสลิป + ปุ่มยืนยัน)
export async function sendBookingEmails(booking, slip, confirmUrl) {
  const sender = { name: MAIL.fromName, email: MAIL.senderEmail };

  const slipAttachment = slip
    ? [{ name: slip.originalname || 'payment-slip', content: slip.buffer.toString('base64') }]
    : [];

  // อีเมลถึงลูกค้า (รอยืนยัน)
  await sendViaBrevo({
    sender,
    to: [{ email: booking.email, name: booking.name }],
    subject: `📩 ได้รับการจองแล้ว ${SHOP.name} - ${booking.dateLabel} ${booking.time} น. (รอยืนยัน)`,
    htmlContent: pendingCustomerHtml(booking),
  });

  // อีเมลถึงเจ้าของร้าน (แนบสลิป + ปุ่มยืนยัน)
  await sendViaBrevo({
    sender,
    to: [{ email: MAIL.ownerEmail, name: SHOP.name }],
    subject: `📥 จองใหม่ (รอยืนยัน): ${booking.name} - ${booking.dateLabel} ${booking.time} น.`,
    htmlContent: ownerNotifyHtml(booking, confirmUrl),
    attachment: slipAttachment.length ? slipAttachment : undefined,
  });
}

// หลังร้านกดยืนยัน: ส่งอีเมลยืนยัน + ไฟล์ปฏิทินให้ทั้งลูกค้าและร้าน
export async function sendConfirmationEmails(booking) {
  const sender = { name: MAIL.fromName, email: MAIL.senderEmail };
  const calendarAttachment = {
    name: 'appointment.ics',
    content: Buffer.from(buildIcs(booking), 'utf-8').toString('base64'),
  };

  // ลูกค้า — ยืนยัน + ปฏิทิน
  await sendViaBrevo({
    sender,
    to: [{ email: booking.email, name: booking.name }],
    subject: `✅ ยืนยันการจองคิว ${SHOP.name} - ${booking.dateLabel} ${booking.time} น.`,
    htmlContent: confirmedCustomerHtml(booking),
    attachment: [calendarAttachment],
  });

  // ร้าน — ปฏิทินเข้าเมลร้าน
  await sendViaBrevo({
    sender,
    to: [{ email: MAIL.ownerEmail, name: SHOP.name }],
    subject: `📅 ยืนยันแล้ว: ${booking.name} - ${booking.dateLabel} ${booking.time} น.`,
    htmlContent: ownerCalendarHtml(booking),
    attachment: [calendarAttachment],
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
