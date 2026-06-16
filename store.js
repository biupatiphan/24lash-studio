import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GITHUB } from './config.js';
import { commitFile, readFile, ensureBranch, githubEnabled } from './github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'bookings.json');
const REPO_PATH = 'data/bookings.json';
const BRANCH = GITHUB.dataBranch;

// สถานะคิว: pending(รอยืนยัน) -> confirmed(รอรับบริการ) -> done(เสร็จแล้ว) | noshow/cancelled
export const STATUS = { PENDING: 'pending', CONFIRMED: 'confirmed', DONE: 'done', NOSHOW: 'noshow', CANCELLED: 'cancelled' };

let cache = [];

function readLocal() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function writeLocal() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch { /* โฮสต์ read-only ไม่เป็นไร — GitHub เป็นตัวเก็บถาวรหลัก */ }
}

// ---------- persistence ไป GitHub (branch data) แบบหน่วงเวลา กันยิง API ถี่ ----------
let dirty = false;
let flushing = false;
let timer = null;

function scheduleFlush() {
  if (!githubEnabled()) return;
  dirty = true;
  if (timer || flushing) return;
  timer = setTimeout(flush, 1500);
}

async function flush() {
  timer = null;
  if (flushing || !dirty) return;
  flushing = true;
  dirty = false;
  try {
    await commitFile(REPO_PATH, JSON.stringify(cache, null, 2), `Update bookings (${cache.length} รายการ)`, BRANCH);
  } catch (e) {
    console.error('commit bookings ล้มเหลว:', e.message);
    dirty = true; // ลองใหม่รอบหน้า
  } finally {
    flushing = false;
    if (dirty && !timer) timer = setTimeout(flush, 3000);
  }
}

// โหลดข้อมูลตอนเซิร์ฟเวอร์เริ่มทำงาน: GitHub (ถาวร) ก่อน ถ้าไม่มีค่อยใช้ไฟล์ในเครื่อง
export async function init() {
  try {
    if (githubEnabled()) {
      await ensureBranch(BRANCH);
      const raw = await readFile(REPO_PATH, BRANCH);
      if (raw != null) {
        cache = JSON.parse(raw);
        writeLocal();
        console.log(`โหลดการจอง ${cache.length} รายการจาก GitHub (branch ${BRANCH})`);
        return;
      }
    }
  } catch (e) {
    console.error('โหลด bookings จาก GitHub ล้มเหลว ใช้ไฟล์ในเครื่องแทน:', e.message);
  }
  cache = readLocal();
}

export function getAll() {
  return cache;
}

// คิวที่ยัง "กินช่วงเวลา" อยู่ (ไม่นับยกเลิก/ไม่มา) — ใช้เช็คเวลาว่าง
export function getByDate(date) {
  return cache.filter((b) => b.date === date && b.status !== STATUS.CANCELLED && b.status !== STATUS.NOSHOW);
}

export function add(booking) {
  cache.push(booking);
  writeLocal();
  scheduleFlush();
  return booking;
}

export function setStatus(id, status) {
  const b = cache.find((x) => x.id === id);
  if (!b) return null;
  b.status = status;
  b.updatedAt = new Date().toISOString();
  writeLocal();
  scheduleFlush();
  return b;
}

// แก้ฟิลด์ของคิว (เช่น เปลี่ยนบริการ/ราคา ก่อนกดเสร็จ)
export function update(id, fields) {
  const b = cache.find((x) => x.id === id);
  if (!b) return null;
  Object.assign(b, fields);
  b.updatedAt = new Date().toISOString();
  writeLocal();
  scheduleFlush();
  return b;
}

// ลบคิวตามรหัส
export function remove(id) {
  const i = cache.findIndex((x) => x.id === id);
  if (i < 0) return false;
  cache.splice(i, 1);
  writeLocal();
  scheduleFlush();
  return true;
}

// ตรวจว่าช่วงเวลาทับซ้อนกับการจองที่มีอยู่หรือไม่
export function isSlotTaken(date, startMinutes, endMinutes) {
  return getByDate(date).some((b) => startMinutes < b.endMinutes && endMinutes > b.startMinutes);
}
