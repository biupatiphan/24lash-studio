import 'dotenv/config';

// รายการบริการของร้าน (แก้ไขราคา/ระยะเวลาได้ตามจริง)
export const SERVICES = [
  { id: 'classic',  name: 'Classic Lash (ขนตาแบบธรรมชาติ)', duration: 90,  price: 690 },
  { id: 'volume',   name: 'Volume Lash (ขนตาฟูหนา)',         duration: 120, price: 990 },
  { id: 'hybrid',   name: 'Hybrid Lash (ผสมผสาน)',          duration: 105, price: 850 },
  { id: 'refill',   name: 'Refill (เติมขนตา)',               duration: 60,  price: 490 },
  { id: 'removal',  name: 'Removal (ถอดขนตา)',               duration: 30,  price: 200 },
];

// เวลาทำการของร้าน (รูปแบบ 24 ชั่วโมง)
export const BUSINESS_HOURS = {
  open: '10:00',
  close: '19:00',
  slotMinutes: 30, // ความถี่ของช่วงเวลาที่ให้เลือก
};

// ร้านปิดวันไหนบ้าง (0 = อาทิตย์ ... 6 = เสาร์) ; [] = เปิดทุกวัน
export const CLOSED_WEEKDAYS = [];

export const SHOP = {
  name: process.env.SHOP_NAME || '24Lash Studio',
  address: process.env.SHOP_ADDRESS || '',
  phone: process.env.SHOP_PHONE || '',
};

export const PAYMENT = {
  depositAmount: Number(process.env.DEPOSIT_AMOUNT || 300),
  bankName: process.env.BANK_NAME || '',
  bankAccountName: process.env.BANK_ACCOUNT_NAME || '',
  bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
  promptpayId: process.env.PROMPTPAY_ID || '',
};

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

export function getService(id) {
  return SERVICES.find((s) => s.id === id);
}
