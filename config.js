import 'dotenv/config';

// หมายเหตุ: บริการ/เวลาทำการ/วันปิด/ข้อมูลร้าน/บัญชี ย้ายไปแก้ผ่านหลังบ้าน (settings.js)
// ค่าเริ่มต้นและการโหลด/บันทึกอยู่ใน settings.js แล้ว

export const MAIL = {
  apiKey: process.env.BREVO_API_KEY,
  senderEmail: process.env.SENDER_EMAIL || process.env.SMTP_USER,
  fromName: process.env.MAIL_FROM_NAME || '24Lash Studio',
  ownerEmail: process.env.OWNER_EMAIL || 'patiphan.tan@gmail.com',
};

export const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';
export const PORT = Number(process.env.PORT || 3000);

// URL ของเว็บ (Render ใส่ RENDER_EXTERNAL_URL ให้อัตโนมัติ) ใช้สร้างลิงก์ปุ่มยืนยันในอีเมล
export const BASE_URL =
  process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
// กุญแจเซ็นลิงก์ยืนยันกันปลอม (ใช้ค่าเดิมที่มีอยู่แล้วเพื่อไม่ต้องตั้งค่าเพิ่ม)
export const CONFIRM_SECRET =
  process.env.CONFIRM_SECRET || process.env.BREVO_API_KEY || 'dev-confirm-secret';

// รหัสผ่านเข้าหลังบ้าน — ถ้าไม่ตั้ง = ปิดหลังบ้าน (กันคนอื่นแก้)
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ตั้งค่า GitHub สำหรับบันทึก settings ถาวร (commit -> Render redeploy)
export const GITHUB = {
  token: process.env.GITHUB_TOKEN || '',
  repo: process.env.GITHUB_REPO || 'biupatiphan/24lash-studio',
  branch: process.env.GITHUB_BRANCH || 'main',
  // branch แยกสำหรับเก็บข้อมูลจอง/ยอดขาย — commit ที่นี่ "ไม่" ทำให้ Render redeploy
  dataBranch: process.env.GITHUB_DATA_BRANCH || 'data',
};
