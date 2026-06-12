const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const state = {
  config: null,
  serviceId: null,
  date: null,
  time: null,
  endTime: null,
  slipFile: null,
  calMonth: null, // Date ที่ชี้เดือนที่กำลังแสดง
};

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ---------- init ----------
async function init() {
  const res = await fetch('/api/config');
  state.config = await res.json();
  const c = state.config;

  $('#shopName').textContent = c.shop.name;
  $('#footShop').textContent = c.shop.name;
  $('#footContact').textContent = [c.shop.address, c.shop.phone].filter(Boolean).join(' · ');
  $('#depositAmt').textContent = c.payment.depositAmount;

  renderServices();
  state.calMonth = startOfMonth(new Date());
  renderCalendar();
  renderBankInfo();
  bindEvents();
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ---------- services ----------
function renderServices() {
  const wrap = $('#services');
  wrap.innerHTML = '';
  // เรียงให้บริการยอดฮิตขึ้นก่อน (คงลำดับเดิมในแต่ละกลุ่ม)
  const ordered = state.config.services
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.popular ? 1 : 0) - (a.s.popular ? 1 : 0) || a.i - b.i)
    .map((x) => x.s);
  // สร้างการ์ดครั้งเดียว (ไม่ rebuild ทั้งหมดตอนสลับ)
  ordered.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'service' + (s.popular ? ' popular' : '');
    el.dataset.id = s.id;
    el.innerHTML = `
      <div class="s-row">
        <div>
          <div class="s-name">${s.popular ? '<span class="s-badge">🔥 ยอดฮิต</span> ' : ''}${s.name}</div>
          <div class="s-meta">ใช้เวลา ~${s.duration} นาที</div>
        </div>
        <div class="s-price">${s.price.toLocaleString()} ฿</div>
      </div>`;
    el.querySelector('.s-row').addEventListener('click', () => selectService(s.id, el));
    wrap.appendChild(el);
  });
}

// แคชแกลเลอรีที่สร้างแล้ว (รูปจะไม่ถูกโหลดซ้ำเมื่อสลับบริการไปมา)
const galleryCache = {};
function getGallery(serviceId) {
  if (galleryCache[serviceId] !== undefined) return galleryCache[serviceId];
  const pics = (state.config.photos || {})[serviceId] || [];
  if (!pics.length) { galleryCache[serviceId] = null; return null; }
  const div = document.createElement('div');
  div.className = 's-gallery';
  div.innerHTML = `<div class="s-gh">📸 ตัวอย่างผลงาน — แตะดูรูปใหญ่</div>
    <div class="s-scroll">${pics.map((u) => {
      const thumb = u.thumb || u.full || u;
      const full = u.full || u.thumb || u;
      return `<img class="s-photo" loading="lazy" decoding="async" src="${thumb}" data-full="${full}" alt="ตัวอย่างผลงาน" />`;
    }).join('')}</div>`;
  div.querySelectorAll('.s-photo').forEach((p) => {
    p.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(p.dataset.full); });
  });
  galleryCache[serviceId] = div;
  return div;
}

function selectService(id, cardEl) {
  if (state.serviceId === id) return; // กดอันเดิมซ้ำ ไม่ต้องทำอะไร
  state.serviceId = id;
  // ย้ายแกลเลอรีออกจากการ์ดเดิม + อัปเดตไฮไลต์
  document.querySelectorAll('.service .s-gallery').forEach((g) => g.remove());
  $$('.service').forEach((x) => x.classList.toggle('selected', x.dataset.id === id));
  const g = getGallery(id);
  if (g) cardEl.appendChild(g);
  if (state.date) loadSlots(); // โหลดเวลาใหม่ตามระยะเวลาบริการ
}

// ---------- lightbox ดูรูปใหญ่ ----------
function openLightbox(url) {
  let lb = $('#lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = '<img id="lbImg" alt="ตัวอย่างผลงาน" /><button id="lbX" type="button">✕</button>';
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => { if (e.target.id !== 'lbImg') lb.classList.remove('show'); });
  }
  $('#lbImg').src = url;
  lb.classList.add('show');
}

// ---------- calendar ----------
function renderCalendar() {
  const m = state.calMonth;
  $('#calLabel').textContent = `${THAI_MONTHS[m.getMonth()]} ${m.getFullYear() + 543}`;
  const grid = $('#calGrid');
  grid.innerHTML = '';

  const firstDay = new Date(m.getFullYear(), m.getMonth(), 1).getDay();
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const todayStr = ymd(new Date());
  const closed = state.config.closedWeekdays || [];
  const closedDates = state.config.closedDates || [];

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(m.getFullYear(), m.getMonth(), d);
    const dateStr = ymd(dateObj);
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    const isPast = dateStr < todayStr;
    const isClosed = closed.includes(dateObj.getDay()) || closedDates.includes(dateStr);

    if (dateStr === todayStr) cell.classList.add('today');

    if (isPast || isClosed) {
      cell.classList.add('disabled');
    } else {
      cell.classList.add('selectable');
      if (dateStr === state.date) cell.classList.add('selected');
      cell.addEventListener('click', () => {
        state.date = dateStr;
        state.time = null;
        renderCalendar();
        loadSlots();
      });
    }
    grid.appendChild(cell);
  }
}

// ---------- slots ----------
async function loadSlots() {
  const hint = $('#slotHint');
  const wrap = $('#slots');
  if (!state.date) { hint.textContent = 'กรุณาเลือกวันที่ก่อนค่ะ'; wrap.innerHTML = ''; return; }
  const svc = state.serviceId || (state.config.services[0] && state.config.services[0].id);

  hint.textContent = 'กำลังโหลดเวลาว่าง...';
  wrap.innerHTML = '';
  const res = await fetch(`/api/availability?date=${state.date}&serviceId=${svc}`);
  const data = await res.json();

  if (data.closed) { hint.textContent = 'วันนี้ร้านปิดทำการค่ะ'; return; }

  const any = data.slots.some((s) => s.available);
  hint.textContent = any ? 'เลือกเวลาที่ต้องการ' : 'วันนี้คิวเต็มแล้ว ลองเลือกวันอื่นนะคะ 🥺';

  data.slots.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'slot' + (s.available ? '' : ' taken');
    el.textContent = s.time;
    if (s.available) {
      el.addEventListener('click', () => {
        state.time = s.time;
        $$('.slot').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
      });
    }
    wrap.appendChild(el);
  });
}

// ---------- bank info ----------
function renderBankInfo() {
  const p = state.config.payment;
  const rows = [];
  if (p.promptpayId) rows.push(['พร้อมเพย์', p.promptpayId, true]);
  if (p.bankName) rows.push(['ธนาคาร', p.bankName, false]);
  if (p.bankAccountName) rows.push(['ชื่อบัญชี', p.bankAccountName, false]);
  if (p.bankAccountNumber) rows.push(['เลขบัญชี', p.bankAccountNumber, true]);
  $('#bankInfo').innerHTML = rows
    .map(([k, v, copyable]) => {
      const val = copyable
        ? `<b>${v}</b><button type="button" class="copy-btn" data-copy="${String(v).replace(/"/g, '&quot;')}">คัดลอก</button>`
        : `<b>${v}</b>`;
      return `<div class="brow"><span>${k}</span><span class="bval">${val}</span></div>`;
    })
    .join('');
  $$('#bankInfo .copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const old = btn.textContent;
      btn.textContent = 'คัดลอกแล้ว!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = old;
        btn.classList.remove('copied');
      }, 1500);
    });
  });
}

// ---------- navigation ----------
function goStep(n) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $('#screen' + n).classList.add('active');
  $$('.step').forEach((s) => {
    const step = Number(s.dataset.step);
    s.classList.toggle('active', step === n);
    s.classList.toggle('done', step < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep1() {
  if (!state.serviceId) return 'กรุณาเลือกบริการค่ะ';
  if (!state.date) return 'กรุณาเลือกวันที่ค่ะ';
  if (!state.time) return 'กรุณาเลือกเวลาค่ะ';

  const name = $('#name').value.trim();
  const email = $('#email').value.trim();
  const phone = $('#phone').value.trim();
  let bad = null;
  $('#name').classList.toggle('invalid', !name);
  $('#email').classList.toggle('invalid', !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  $('#phone').classList.toggle('invalid', !/^[0-9+\-\s]{8,}$/.test(phone));
  if (!name) bad = 'กรุณากรอกชื่อค่ะ';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad = 'กรุณากรอกอีเมลให้ถูกต้องค่ะ';
  else if (!/^[0-9+\-\s]{8,}$/.test(phone)) bad = 'กรุณากรอกเบอร์โทรให้ถูกต้องค่ะ';
  return bad;
}

function renderSummary() {
  const svc = state.config.services.find((s) => s.id === state.serviceId);
  const dateLabel = new Date(`${state.date}T00:00:00`)
    .toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const rows = [
    ['บริการ', svc.name],
    ['วันที่', dateLabel],
    ['เวลา', `${state.time} น.`],
    ['ชื่อ', $('#name').value.trim()],
    ['เบอร์โทร', $('#phone').value.trim()],
    ['ราคาบริการ', `${svc.price.toLocaleString()} บาท`],
  ];
  $('#summary').innerHTML = rows
    .map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`)
    .join('');
}

// ---------- events ----------
function bindEvents() {
  $('#prevMonth').addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#nextMonth').addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  $('#toStep2').addEventListener('click', () => {
    const err = validateStep1();
    if (err) { alert(err); return; }
    renderSummary();
    goStep(2);
  });

  $('#backTo1').addEventListener('click', () => goStep(1));

  // upload
  $('#slip').addEventListener('change', (e) => {
    const file = e.target.files[0];
    state.slipFile = file || null;
    const preview = $('#preview');
    if (!file) { preview.innerHTML = ''; return; }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="สลิป" />`;
    } else {
      preview.innerHTML = `<div class="file-chip">📄 ${file.name}</div>`;
    }
    $('#uploadInner').querySelector('.up-text').textContent = 'เปลี่ยนไฟล์';
  });

  $('#submitBtn').addEventListener('click', submitBooking);
  $('#bookAgain').addEventListener('click', () => location.reload());
}

// ---------- submit ----------
async function submitBooking() {
  $('#submitErr').textContent = '';
  if (!state.slipFile) { $('#submitErr').textContent = 'กรุณาแนบหลักฐานการโอนมัดจำค่ะ'; return; }

  const fd = new FormData();
  fd.append('name', $('#name').value.trim());
  fd.append('email', $('#email').value.trim());
  fd.append('phone', $('#phone').value.trim());
  fd.append('date', state.date);
  fd.append('time', state.time);
  fd.append('serviceId', state.serviceId);
  fd.append('slip', state.slipFile);

  $('#overlay').classList.add('show');
  $('#submitBtn').disabled = true;
  try {
    const res = await fetch('/api/bookings', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
    showSuccess(data.booking, data.emailWarning);
    goStep(3);
  } catch (e) {
    $('#submitErr').textContent = e.message;
  } finally {
    $('#overlay').classList.remove('show');
    $('#submitBtn').disabled = false;
  }
}

function showSuccess(b, warning) {
  $('#successSub').textContent = `ขอบคุณคุณ ${b.name} ที่จองคิวกับเรานะคะ 💕`;
  const rows = [
    ['รหัสการจอง', b.id],
    ['บริการ', b.serviceName],
    ['วันที่', b.dateLabel],
    ['เวลา', `${b.time} - ${b.endTime} น.`],
    ['มัดจำที่ชำระ', `${b.depositAmount} บาท`],
  ];
  $('#successCard').innerHTML = rows
    .map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`)
    .join('');
  if (warning) {
    $('#successCard').insertAdjacentHTML('afterend',
      `<p class="err">${warning}</p>`);
  }
}

init();
