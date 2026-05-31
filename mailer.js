import nodemailer from 'nodemailer';
import ical from 'ical-generator';
import { MAIL, SHOP, TIMEZONE } from './config.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: MAIL.host,
    port: MAIL.port,
    secure: MAIL.secure,
    auth: { user: MAIL.user, pass: MAIL.pass },
  });
  return transporter;
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
    organizer: { name: SHOP.name, email: MAIL.user },
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
  const from = `"${MAIL.fromName}" <${MAIL.user}>`;

  const calendarAttachment = {
    filename: 'appointment.ics',
    content: icsContent,
    contentType: 'text/calendar; charset=utf-8; method=REQUEST',
  };

  const slipAttachment = slip
    ? [{ filename: slip.originalname || 'payment-slip', content: slip.buffer }]
    : [];

  const tx = getTransporter();

  // อีเมลถึงลูกค้า
  await tx.sendMail({
    from,
    to: booking.email,
    subject: `✅ ยืนยันการจองคิว ${SHOP.name} - ${booking.dateLabel} ${booking.time} น.`,
    html: customerHtml(booking),
    icalEvent: { method: 'REQUEST', content: icsContent },
    attachments: [calendarAttachment],
  });

  // อีเมลถึงเจ้าของร้าน (แนบสลิป)
  await tx.sendMail({
    from,
    to: MAIL.ownerEmail,
    subject: `📥 จองใหม่: ${booking.name} - ${booking.dateLabel} ${booking.time} น.`,
    html: ownerHtml(booking),
    icalEvent: { method: 'REQUEST', content: icsContent },
    attachments: [calendarAttachment, ...slipAttachment],
  });
}

export async function verifyMail() {
  try {
    await getTransporter().verify();
    return true;
  } catch (e) {
    return e.message;
  }
}
