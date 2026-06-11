import { GITHUB } from './config.js';

const API = 'https://api.github.com';

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB.token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': '24lash-admin',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function githubEnabled() {
  return Boolean(GITHUB.token && GITHUB.repo);
}

// commit ไฟล์เดียวขึ้น GitHub ผ่าน Contents API
// branch = GITHUB.branch (main) -> ทำให้ Render auto-deploy   | branch = data -> ไม่ deploy (ใช้เก็บข้อมูล)
export async function commitFile(filePath, content, message, branch = GITHUB.branch) {
  if (!githubEnabled()) {
    throw new Error('ยังไม่ได้ตั้งค่า GITHUB_TOKEN / GITHUB_REPO บนเซิร์ฟเวอร์');
  }

  const url = `${API}/repos/${GITHUB.repo}/contents/${filePath}`;
  const headers = ghHeaders();

  // หา sha ของไฟล์เดิม (ถ้ามี) เพื่ออัปเดตทับ
  let sha;
  const getRes = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    sha = (await getRes.json()).sha;
  } else if (getRes.status !== 404) {
    throw new Error(`GitHub อ่านไฟล์ ${getRes.status}: ${await getRes.text()}`);
  }

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
      sha,
    }),
  });

  if (!putRes.ok) {
    throw new Error(`GitHub commit ${putRes.status}: ${await putRes.text()}`);
  }
  return putRes.json();
}

// commit ไฟล์ binary (รูปภาพ) — รับ Buffer แล้วแปลงเป็น base64 ตรงๆ
export async function commitBinary(filePath, buffer, message, branch = GITHUB.branch) {
  if (!githubEnabled()) throw new Error('ยังไม่ได้ตั้งค่า GITHUB_TOKEN');
  const url = `${API}/repos/${GITHUB.repo}/contents/${filePath}`;
  const headers = ghHeaders();
  let sha;
  const getRes = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) sha = (await getRes.json()).sha;
  else if (getRes.status !== 404) throw new Error(`GitHub อ่านไฟล์ ${getRes.status}: ${await getRes.text()}`);

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: buffer.toString('base64'), branch, sha }),
  });
  if (!putRes.ok) throw new Error(`GitHub commit รูป ${putRes.status}: ${await putRes.text()}`);
  return putRes.json();
}

// อ่านเนื้อหาไฟล์จาก branch ที่ระบุ — คืน string หรือ null ถ้าไม่มีไฟล์
export async function readFile(filePath, branch = GITHUB.branch) {
  if (!githubEnabled()) return null;
  const url = `${API}/repos/${GITHUB.repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub อ่านไฟล์ ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

// สร้าง branch (ถ้ายังไม่มี) โดยแตกจาก HEAD ของ branch หลัก — ใช้ครั้งแรกสำหรับ branch ข้อมูล
export async function ensureBranch(branch) {
  if (!githubEnabled()) return false;
  const headers = ghHeaders();

  const check = await fetch(`${API}/repos/${GITHUB.repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
  if (check.ok) return true;
  if (check.status !== 404) throw new Error(`GitHub ref ${check.status}: ${await check.text()}`);

  // หา sha ปลายทางของ branch หลักไว้แตก branch ใหม่
  const baseRes = await fetch(`${API}/repos/${GITHUB.repo}/git/ref/heads/${encodeURIComponent(GITHUB.branch)}`, { headers });
  if (!baseRes.ok) throw new Error(`GitHub base ref ${baseRes.status}: ${await baseRes.text()}`);
  const baseSha = (await baseRes.json()).object.sha;

  const createRes = await fetch(`${API}/repos/${GITHUB.repo}/git/refs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!createRes.ok && createRes.status !== 422) {
    throw new Error(`GitHub สร้าง branch ${createRes.status}: ${await createRes.text()}`);
  }
  return true;
}
