const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const state = {
  config: null,
  serviceIds: [],
  date: null,
  time: null,
  endTime: null,
  slipFile: null,
  calMonth: null, // Date ที่ชี้เดือนที่กำลังแสดง
};

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const EN_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = { th: ['อา','จ','อ','พ','พฤ','ศ','ส'], en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] };

// ---------- i18n ----------
let lang = localStorage.getItem('lang') === 'en' ? 'en' : 'th';
const I18N = {
  th: {
    tagline:'จองคิวต่อขนตาออนไลน์','step.datetime':'เลือกวัน-เวลา','step.deposit':'ชำระมัดจำ','step.done':'เสร็จสิ้น',
    'h.service':'เลือกบริการ',multiHint:'เลือกได้มากกว่า 1 บริการ (เช่น ถอด + ต่อบน + ต่อล่าง)','h.date':'เลือกวันที่','h.time':'เลือกเวลา','h.info':'ข้อมูลของคุณ',
    'f.name':'ชื่อ / ชื่อเล่น','ph.name':'เช่น คุณมายด์','f.email':'อีเมล','note.email':'เราจะส่งคำเชิญ Google Calendar ไปที่อีเมลนี้','f.phone':'เบอร์โทรศัพท์',
    'btn.next':'ถัดไป · ชำระมัดจำ','h.summary':'สรุปการจอง','h.pay':'ชำระเงินมัดจำ','depositWord':'มัดจำ','baht':'บาท',
    'note.pay':'โอนแล้วแนบสลิปด้านล่างเพื่อยืนยันการจองค่ะ 💕','note.free':'บริการนี้ไม่ต้องมัดจำ กดยืนยันได้เลยค่ะ 💕','h.attach':'แนบหลักฐานการโอน','upload.text':'แตะเพื่อเลือกรูปสลิป (หรือ PDF)',
    'btn.back':'‹ ย้อนกลับ','btn.confirm':'ยืนยันการจอง','success.title':'ส่งคำขอจองแล้ว!',
    'success.note':'📩 เราได้รับการจองและสลิปของคุณแล้ว กำลัง <b>รอร้านยืนยัน</b><br>เมื่อร้านยืนยัน จะส่งอีเมลยืนยัน + คำเชิญปฏิทินไปที่อีเมลของคุณอีกครั้งค่ะ',
    'btn.again':'จองคิวอีกครั้ง','overlay':'กำลังดำเนินการ...',
    popular:'🔥 ยอดฮิต',gallery:'📸 ตัวอย่างผลงาน — แตะดูรูปใหญ่',galleryAlt:'ตัวอย่างผลงาน',
    'slot.pickDate':'กรุณาเลือกวันที่ก่อนค่ะ','slot.loading':'กำลังโหลดเวลาว่าง...','slot.closed':'วันนี้ร้านปิดทำการค่ะ','slot.pick':'เลือกเวลาที่ต้องการ','slot.full':'วันนี้คิวเต็มแล้ว ลองเลือกวันอื่นนะคะ 🥺',
    'pay.promptpay':'พร้อมเพย์','pay.bank':'ธนาคาร','pay.accName':'ชื่อบัญชี','pay.accNo':'เลขบัญชี',copy:'คัดลอก',copied:'คัดลอกแล้ว!',
    'v.service':'กรุณาเลือกบริการค่ะ','v.date':'กรุณาเลือกวันที่ค่ะ','v.time':'กรุณาเลือกเวลาค่ะ','v.name':'กรุณากรอกชื่อค่ะ','v.email':'กรุณากรอกอีเมลให้ถูกต้องค่ะ','v.phone':'กรุณากรอกเบอร์โทรให้ถูกต้องค่ะ',
    'sum.service':'บริการ','sum.date':'วันที่','sum.time':'เวลา','sum.name':'ชื่อ','sum.phone':'เบอร์โทร','sum.price':'ราคาบริการ',
    timeSuffix:' น.',changeFile:'เปลี่ยนไฟล์',slipAlt:'สลิป','err.generic':'เกิดข้อผิดพลาด','err.slip':'กรุณาแนบหลักฐานการโอนมัดจำค่ะ',
    'succ.id':'รหัสการจอง','succ.service':'บริการ','succ.date':'วันที่','succ.time':'เวลา','succ.deposit':'มัดจำที่ชำระ',
    metaPre:'ใช้เวลา ~',min:'นาที',thanks:'ขอบคุณคุณ {name} ที่จองคิวกับเรานะคะ 💕',
  },
  en: {
    tagline:'Online Lash Booking','step.datetime':'Date & Time','step.deposit':'Deposit','step.done':'Done',
    'h.service':'Choose a service',multiHint:'You can choose more than one service (e.g. removal + upper + lower)','h.date':'Choose a date','h.time':'Choose a time','h.info':'Your details',
    'f.name':'Name / Nickname','ph.name':'e.g. Mind','f.email':'Email','note.email':"We'll send a Google Calendar invite to this email",'f.phone':'Phone number',
    'btn.next':'Next · Deposit','h.summary':'Booking summary','h.pay':'Pay deposit','depositWord':'Deposit','baht':'THB',
    'note.pay':'After the transfer, attach your slip below to confirm 💕','note.free':'No deposit required for this service. Just confirm! 💕','h.attach':'Attach payment slip','upload.text':'Tap to choose slip image (or PDF)',
    'btn.back':'‹ Back','btn.confirm':'Confirm booking','success.title':'Booking request sent!',
    'success.note':"📩 We've received your booking and slip. <b>Waiting for shop confirmation.</b><br>Once confirmed, we'll email you a confirmation + calendar invite.",
    'btn.again':'Book again','overlay':'Processing...',
    popular:'🔥 Popular',gallery:'📸 Our work — tap to enlarge',galleryAlt:'Our work',
    'slot.pickDate':'Please choose a date first','slot.loading':'Loading available times...','slot.closed':'Closed on this day','slot.pick':'Choose a time','slot.full':'Fully booked — please try another day 🥺',
    'pay.promptpay':'PromptPay','pay.bank':'Bank','pay.accName':'Account name','pay.accNo':'Account no.',copy:'Copy',copied:'Copied!',
    'v.service':'Please choose a service','v.date':'Please choose a date','v.time':'Please choose a time','v.name':'Please enter your name','v.email':'Please enter a valid email','v.phone':'Please enter a valid phone number',
    'sum.service':'Service','sum.date':'Date','sum.time':'Time','sum.name':'Name','sum.phone':'Phone','sum.price':'Price',
    timeSuffix:'',changeFile:'Change file',slipAlt:'slip','err.generic':'Something went wrong','err.slip':'Please attach the deposit payment slip',
    'succ.id':'Booking ID','succ.service':'Service','succ.date':'Date','succ.time':'Time','succ.deposit':'Deposit paid',
    metaPre:'approx. ',min:'min',thanks:'Thank you {name} for booking with us 💕',
  },
};
function t(k) { const o = I18N[lang] || I18N.th; return (k in o) ? o[k] : (I18N.th[k] ?? k); }
function fmtDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return lang === 'en'
    ? d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
    : d.toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('#langSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  $('#calWeekdays').innerHTML = WEEKDAYS[lang].map((w) => `<span>${w}</span>`).join('');
  if (!state.config) return;
  Object.keys(galleryCache).forEach((k) => delete galleryCache[k]); // ล้างแคชเพื่อให้หัวข้อแกลเลอรีเป็นภาษาใหม่
  renderServices();
  state.serviceIds.forEach((id) => {
    const card = document.querySelector(`.service[data-id="${id}"]`);
    if (!card) return;
    card.classList.add('selected');
    const g = getGallery(id);
    if (g) card.appendChild(g);
  });
  updateTotalBar();
  renderCalendar();
  renderBankInfo();
  if (state.date) loadSlots(); else $('#slotHint').textContent = t('slot.pickDate');
  if ($('#screen2').classList.contains('active')) renderSummary();
}
function setLang(l) { lang = l === 'en' ? 'en' : 'th'; localStorage.setItem('lang', lang); applyLang(); }

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
  applyLang(); // ใช้ภาษาที่จำไว้ (ค่าเริ่มต้น ไทย)
  setTimeout(preloadPhotos, 600); // พรีโหลดรูปหลังหน้าโหลดเสร็จ
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
          <div class="s-name">${s.popular ? `<span class="s-badge">${t('popular')}</span> ` : ''}${s.name}</div>
          <div class="s-meta">${t('metaPre')}${s.duration} ${t('min')}</div>
        </div>
        <div class="s-price">${s.price.toLocaleString()} ฿</div>
      </div>`;
    if (state.serviceIds.includes(s.id)) el.classList.add('selected');
    // กดที่การ์ดตรงไหนก็เลือก/ยกเลิกได้ ยกเว้นโซนรูปตัวอย่าง (ที่ใช้เปิดดูรูปใหญ่)
    el.addEventListener('click', (e) => {
      if (e.target.closest('.s-gallery')) return;
      toggleService(s.id, el);
    });
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
  div.innerHTML = `<div class="s-gh">${t('gallery')}</div>
    <div class="s-scroll">${pics.map((u) => {
      const thumb = u.thumb || u.full || u;
      const full = u.full || u.thumb || u;
      return `<img class="s-photo" loading="lazy" decoding="async" src="${thumb}" data-full="${full}" alt="${t('galleryAlt')}" />`;
    }).join('')}</div>`;
  div.querySelectorAll('.s-photo').forEach((p) => {
    // ค่อยๆ โผล่เมื่อโหลดเสร็จ (กันขาววับ) — ถ้าแคชไว้แล้วถือว่าพร้อมเลย
    if (p.complete && p.naturalWidth) p.classList.add('loaded');
    else {
      p.addEventListener('load', () => p.classList.add('loaded'));
      p.addEventListener('error', () => p.classList.add('loaded'));
    }
    p.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(p.dataset.full); });
  });
  galleryCache[serviceId] = div;
  return div;
}

// พรีโหลดรูปย่อทั้งหมดไว้เงียบๆ หลังเปิดหน้า → กดเลือกบริการแล้วรูปขึ้นทันที
function preloadPhotos() {
  const map = state.config.photos || {};
  Object.values(map).forEach((arr) => (arr || []).forEach((u) => {
    const img = new Image();
    img.src = u.thumb || u.full || u;
  }));
}

// เลือกได้หลายบริการ — แตะเพื่อสลับเลือก/ยกเลิก
function toggleService(id, cardEl) {
  const i = state.serviceIds.indexOf(id);
  if (i >= 0) {
    state.serviceIds.splice(i, 1);
    cardEl.classList.remove('selected');
    const g = cardEl.querySelector('.s-gallery');
    if (g) g.remove();
  } else {
    state.serviceIds.push(id);
    cardEl.classList.add('selected');
    const g = getGallery(id);
    if (g) cardEl.appendChild(g);
  }
  updateTotalBar();
  if (state.date) loadSlots(); // โหลดเวลาใหม่ตามระยะเวลารวม
}

// แถบสรุปบริการที่เลือก (จำนวน · เวลารวม · ราคารวม)
function selectedServices() {
  return state.serviceIds.map((id) => state.config.services.find((s) => s.id === id)).filter(Boolean);
}
function updateTotalBar() {
  const el = $('#svcTotal');
  if (!el) return;
  const svcs = selectedServices();
  if (!svcs.length) { el.classList.add('hide'); el.innerHTML = ''; return; }
  const price = svcs.reduce((tt, s) => tt + s.price, 0);
  const dur = svcs.reduce((tt, s) => tt + s.duration, 0);
  el.classList.remove('hide');
  el.innerHTML = lang === 'en'
    ? `✓ ${svcs.length} selected · ~${dur} min · <b>฿${price.toLocaleString()}</b>`
    : `✓ เลือก ${svcs.length} รายการ · รวม ~${dur} นาที · <b>฿${price.toLocaleString()}</b>`;
}

// ---------- lightbox ดูรูปใหญ่ ----------
function openLightbox(url) {
  let lb = $('#lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = `<img id="lbImg" alt="${t('galleryAlt')}" /><button id="lbX" type="button">✕</button>`;
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => { if (e.target.id !== 'lbImg') lb.classList.remove('show'); });
  }
  $('#lbImg').src = url;
  lb.classList.add('show');
}

// ---------- calendar ----------
function renderCalendar() {
  const m = state.calMonth;
  $('#calLabel').textContent = lang === 'en'
    ? `${EN_MONTHS[m.getMonth()]} ${m.getFullYear()}`
    : `${THAI_MONTHS[m.getMonth()]} ${m.getFullYear() + 543}`;
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
  if (!state.date) { hint.textContent = t('slot.pickDate'); wrap.innerHTML = ''; return; }
  const idsParam = state.serviceIds.length ? state.serviceIds.join(',') : (state.config.services[0] && state.config.services[0].id);

  hint.textContent = t('slot.loading');
  wrap.innerHTML = '';
  const res = await fetch(`/api/availability?date=${state.date}&serviceIds=${encodeURIComponent(idsParam)}`);
  const data = await res.json();

  if (data.closed) { hint.textContent = t('slot.closed'); return; }

  const any = data.slots.some((s) => s.available);
  hint.textContent = any ? t('slot.pick') : t('slot.full');

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
  if (p.promptpayId) rows.push([t('pay.promptpay'), p.promptpayId, true]);
  if (p.bankName) rows.push([t('pay.bank'), p.bankName, false]);
  if (p.bankAccountName) rows.push([t('pay.accName'), p.bankAccountName, false]);
  if (p.bankAccountNumber) rows.push([t('pay.accNo'), p.bankAccountNumber, true]);
  $('#bankInfo').innerHTML = rows
    .map(([k, v, copyable]) => {
      const val = copyable
        ? `<b>${v}</b><button type="button" class="copy-btn" data-copy="${String(v).replace(/"/g, '&quot;')}">${t('copy')}</button>`
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
      btn.textContent = t('copied');
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
  if (!state.serviceIds.length) return t('v.service');
  if (!state.date) return t('v.date');
  if (!state.time) return t('v.time');

  const name = $('#name').value.trim();
  const email = $('#email').value.trim();
  const phone = $('#phone').value.trim();
  let bad = null;
  $('#name').classList.toggle('invalid', !name);
  $('#email').classList.toggle('invalid', !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  $('#phone').classList.toggle('invalid', !/^[0-9+\-\s]{8,}$/.test(phone));
  if (!name) bad = t('v.name');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad = t('v.email');
  else if (!/^[0-9+\-\s]{8,}$/.test(phone)) bad = t('v.phone');
  return bad;
}

// ราคารวม 0 = ไม่ต้องมัดจำ
function isFreeService() {
  const svcs = selectedServices();
  return svcs.length > 0 && svcs.reduce((tt, s) => tt + s.price, 0) === 0;
}
// ซ่อน/แสดงส่วนจ่ายมัดจำ + แนบสลิป ตามว่าบริการฟรีหรือไม่
function updatePayUI() {
  const free = isFreeService();
  ['#payTitle', '#payBox', '#attachTitle', '#uploadLabel', '#preview'].forEach((sel) => $(sel).classList.toggle('hide', free));
  $('#freeNote').classList.toggle('hide', !free);
}

function renderSummary() {
  const svcs = selectedServices();
  const totalPrice = svcs.reduce((tt, s) => tt + s.price, 0);
  const rows = [
    [t('sum.service'), svcs.map((s) => s.name).join(' + ')],
    [t('sum.date'), fmtDate(state.date)],
    [t('sum.time'), `${state.time}${t('timeSuffix')}`],
    [t('sum.name'), $('#name').value.trim()],
    [t('sum.phone'), $('#phone').value.trim()],
    [t('sum.price'), `${totalPrice.toLocaleString()} ${t('baht')}`],
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
    updatePayUI();
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
      preview.innerHTML = `<img src="${url}" alt="${t('slipAlt')}" />`;
    } else {
      preview.innerHTML = `<div class="file-chip">📄 ${file.name}</div>`;
    }
    $('#uploadInner').querySelector('.up-text').textContent = t('changeFile');
  });

  $('#submitBtn').addEventListener('click', submitBooking);
  $('#bookAgain').addEventListener('click', () => location.reload());

  $('#langSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setLang(b.dataset.lang);
  });
}

// ---------- submit ----------
async function submitBooking() {
  $('#submitErr').textContent = '';
  const free = isFreeService();
  if (!free && !state.slipFile) { $('#submitErr').textContent = t('err.slip'); return; }

  const fd = new FormData();
  fd.append('name', $('#name').value.trim());
  fd.append('email', $('#email').value.trim());
  fd.append('phone', $('#phone').value.trim());
  fd.append('date', state.date);
  fd.append('time', state.time);
  fd.append('serviceIds', JSON.stringify(state.serviceIds));
  if (state.slipFile) fd.append('slip', state.slipFile);

  $('#overlay').classList.add('show');
  $('#submitBtn').disabled = true;
  try {
    const res = await fetch('/api/bookings', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err.generic'));
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
  $('#successSub').textContent = t('thanks').replace('{name}', b.name);
  const rows = [
    [t('succ.id'), b.id],
    [t('succ.service'), b.serviceName],
    [t('succ.date'), state.date ? fmtDate(state.date) : b.dateLabel],
    [t('succ.time'), `${b.time} - ${b.endTime}${t('timeSuffix')}`],
    [t('succ.deposit'), `${b.depositAmount} ${t('baht')}`],
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
