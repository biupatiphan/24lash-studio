import crypto from 'crypto';
import { LINE } from './config.js';

const API = 'https://api.line.me/v2/bot';

// พร้อมใช้งานเมื่อมี token + secret ครบ
export function lineEnabled() {
  return Boolean(LINE.channelAccessToken && LINE.channelSecret);
}

// ตรวจลายเซ็น webhook (X-Line-Signature) — กันคนปลอมยิง endpoint
// rawBody ต้องเป็น Buffer/สตริงของ body ดิบ (ก่อน JSON.parse)
export function verifySignature(rawBody, signature) {
  if (!LINE.channelSecret || !signature || rawBody == null) return false;
  const expected = crypto
    .createHmac('sha256', LINE.channelSecret)
    .update(rawBody)
    .digest('base64');
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// แปลงข้อความ string เดี่ยว/หลายอัน เป็นรูปแบบ messages ของ LINE
function toMessages(messages) {
  const arr = Array.isArray(messages) ? messages : [messages];
  return arr.map((m) => (typeof m === 'string' ? { type: 'text', text: m } : m));
}

// ตอบกลับด้วย replyToken จาก event — "ฟรี ไม่นับโควตา" (ใช้ผูกคิว)
export async function replyMessage(replyToken, messages) {
  if (!lineEnabled()) return;
  const res = await fetch(`${API}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE.channelAccessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: toMessages(messages) }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}

// ส่งเชิงรุกไปยัง userId — "นับโควตา" (เตรียมไว้ใช้เตือนคิวในเฟส 2)
export async function pushMessage(to, messages) {
  if (!lineEnabled()) return;
  const res = await fetch(`${API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE.channelAccessToken}`,
    },
    body: JSON.stringify({ to, messages: toMessages(messages) }),
  });
  if (!res.ok) throw new Error(`LINE push ${res.status}: ${await res.text()}`);
}
