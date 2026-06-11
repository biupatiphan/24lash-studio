import crypto from 'crypto';
import { GITHUB } from './config.js';
import { commitFile, commitBinary, readFile, githubEnabled } from './github.js';

const BRANCH = GITHUB.dataBranch;
const INDEX_PATH = 'data/photos.json';

// index = { [serviceId]: [ { id, path } ] }
let index = {};

// ---------- persistence ของ index (หน่วงเวลา กันยิงถี่) ----------
let dirty = false;
let flushing = false;
let timer = null;

function scheduleFlush() {
  if (!githubEnabled()) return;
  dirty = true;
  if (timer || flushing) return;
  timer = setTimeout(flush, 1200);
}
async function flush() {
  timer = null;
  if (flushing || !dirty) return;
  flushing = true;
  dirty = false;
  try {
    await commitFile(INDEX_PATH, JSON.stringify(index, null, 2), 'Update photos index', BRANCH);
  } catch (e) {
    console.error('commit photos index ล้มเหลว:', e.message);
    dirty = true;
  } finally {
    flushing = false;
    if (dirty && !timer) timer = setTimeout(flush, 3000);
  }
}

export async function init() {
  try {
    if (githubEnabled()) {
      const raw = await readFile(INDEX_PATH, BRANCH);
      if (raw != null) { index = JSON.parse(raw); return; }
    }
  } catch (e) {
    console.error('โหลด photos index ล้มเหลว:', e.message);
  }
  index = {};
}

// URL สาธารณะ (repo เป็น public โหลดรูปตรงจาก GitHub ได้เลย)
export function publicUrl(p) {
  return `https://raw.githubusercontent.com/${GITHUB.repo}/${BRANCH}/${p}`;
}

export function getForService(serviceId) {
  return (index[serviceId] || []).map((ph) => ({ id: ph.id, url: publicUrl(ph.path) }));
}

// แผนผังทั้งหมดสำหรับ /api/config : { serviceId: [url, ...] }
export function asUrlMap() {
  const out = {};
  for (const sid of Object.keys(index)) out[sid] = (index[sid] || []).map((ph) => publicUrl(ph.path));
  return out;
}

// แผนผังพร้อม id (สำหรับหลังบ้าน ใช้ลบรูป) : { serviceId: [{id,url}] }
export function adminMap() {
  const out = {};
  for (const sid of Object.keys(index)) out[sid] = getForService(sid);
  return out;
}

export async function addPhoto(serviceId, buffer, ext = 'jpg') {
  const id = crypto.randomBytes(5).toString('hex');
  const filePath = `photos/${serviceId}/${id}.${ext}`;
  await commitBinary(filePath, buffer, `Add photo for ${serviceId}`, BRANCH);
  if (!index[serviceId]) index[serviceId] = [];
  index[serviceId].push({ id, path: filePath });
  scheduleFlush();
  return { id, url: publicUrl(filePath) };
}

export function removePhoto(serviceId, photoId) {
  if (!index[serviceId]) return false;
  const before = index[serviceId].length;
  index[serviceId] = index[serviceId].filter((ph) => ph.id !== photoId);
  if (!index[serviceId].length) delete index[serviceId];
  scheduleFlush();
  return index[serviceId] ? before !== index[serviceId].length : true;
}
