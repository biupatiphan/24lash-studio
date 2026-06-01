import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'data', 'settings.json');

// path ในรีโป (ใช้ตอน commit ขึ้น GitHub)
export const SETTINGS_PATH = 'data/settings.json';

// ค่าเริ่มต้น — ใช้ตอนยังไม่เคยบันทึกจากหลังบ้าน (อ่าน env เป็น fallback ครั้งแรก)
export const DEFAULTS = {
  services: [
    { id: 'classic', name: 'Classic Lash (ขนตาแบบธรรมชาติ)', duration: 90,  price: 690 },
    { id: 'volume',  name: 'Volume Lash (ขนตาฟูหนา)',         duration: 120, price: 990 },
    { id: 'hybrid',  name: 'Hybrid Lash (ผสมผสาน)',          duration: 105, price: 850 },
    { id: 'refill',  name: 'Refill (เติมขนตา)',               duration: 60,  price: 490 },
    { id: 'removal', name: 'Removal (ถอดขนตา)',               duration: 30,  price: 200 },
  ],
  businessHours: { open: '10:00', close: '19:00', slotMinutes: 30 },
  closedWeekdays: [],   // 0=อาทิตย์ ... 6=เสาร์
  closedDates: [],      // วันที่ปิดเฉพาะกิจ ['YYYY-MM-DD']
  blockedTimes: [],     // ปิดเฉพาะช่วงเวลาของบางวัน [{ date:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM' }]
  shop: {
    name: process.env.SHOP_NAME || '24Lash Studio',
    address: process.env.SHOP_ADDRESS || '',
    phone: process.env.SHOP_PHONE || '',
  },
  payment: {
    depositAmount: Number(process.env.DEPOSIT_AMOUNT || 300),
    bankName: process.env.BANK_NAME || '',
    bankAccountName: process.env.BANK_ACCOUNT_NAME || '',
    bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
    promptpayId: process.env.PROMPTPAY_ID || '',
  },
};

// รวมค่าที่อ่านมากับ defaults กันฟิลด์หาย
function merge(raw = {}) {
  return {
    services: Array.isArray(raw.services) && raw.services.length ? raw.services : DEFAULTS.services,
    businessHours: { ...DEFAULTS.businessHours, ...(raw.businessHours || {}) },
    closedWeekdays: Array.isArray(raw.closedWeekdays) ? raw.closedWeekdays : DEFAULTS.closedWeekdays,
    closedDates: Array.isArray(raw.closedDates) ? raw.closedDates : DEFAULTS.closedDates,
    blockedTimes: Array.isArray(raw.blockedTimes) ? raw.blockedTimes : DEFAULTS.blockedTimes,
    shop: { ...DEFAULTS.shop, ...(raw.shop || {}) },
    payment: { ...DEFAULTS.payment, ...(raw.payment || {}) },
  };
}

function load() {
  try {
    return merge(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    return merge({});
  }
}

let current = load();

export function getSettings() {
  return current;
}

export function getService(id) {
  return current.services.find((s) => s.id === id);
}

// อัปเดตในหน่วยความจำ + เขียนไฟล์ในเครื่อง ; คืน JSON string ไว้ commit ขึ้น GitHub
export function saveSettings(next) {
  current = merge(next);
  const json = JSON.stringify(current, null, 2);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, json);
  } catch {
    // เขียนไฟล์ในเครื่องไม่ได้ (เช่น โฮสต์ read-only) ไม่เป็นไร — commit GitHub เป็นตัวเก็บถาวรหลัก
  }
  return json;
}
