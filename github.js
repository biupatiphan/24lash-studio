import { GITHUB } from './config.js';

// commit ไฟล์เดียวขึ้น GitHub ผ่าน Contents API -> ทำให้ Render auto-deploy ค่าใหม่
// เก็บค่าถาวรแม้เครื่องบน Render free จะถูกล้างไฟล์ตอนหลับ/redeploy
export async function commitFile(filePath, content, message) {
  const { token, repo, branch } = GITHUB;
  if (!token || !repo) {
    throw new Error('ยังไม่ได้ตั้งค่า GITHUB_TOKEN / GITHUB_REPO บนเซิร์ฟเวอร์');
  }

  const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': '24lash-admin',
    'X-GitHub-Api-Version': '2022-11-28',
  };

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
