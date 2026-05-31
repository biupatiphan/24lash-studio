import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'bookings.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
}

export function getAll() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

export function getByDate(date) {
  return getAll().filter((b) => b.date === date && b.status !== 'cancelled');
}

export function add(booking) {
  ensure();
  const all = getAll();
  all.push(booking);
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  return booking;
}

// ตรวจว่าช่วงเวลาทับซ้อนกับการจองที่มีอยู่หรือไม่
export function isSlotTaken(date, startMinutes, endMinutes) {
  return getByDate(date).some((b) => {
    return startMinutes < b.endMinutes && endMinutes > b.startMinutes;
  });
}
