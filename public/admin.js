const $ = (s) => document.querySelector(s);
const WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
// ประเภทบริการ: main(ทรง) / addon(เสริม) — ถ้ายังไม่กำหนด เดาจากชื่อ
function svcType(s) {
  if (s.type === 'addon' || s.type === 'main') return s.type;
  return /ถอด|removal|ล่าง|lower/i.test(s.name || '') ? 'addon' : 'main';
}

let password = '';
let settings = null;
let photosMap = {}; // { serviceId: [{id,url}] }

// ---------- login ----------
$('#loginBtn').addEventListener('click', login);
$('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

async function login() {
  const pw = $('#pw').value;
  $('#loginErr').classList.add('hide');
  const res = await fetch('/api/admin/settings', { headers: { 'x-admin-password': pw } });
  if (!res.ok) {
    $('#loginErr').textContent = 'รหัสผ่านไม่ถูกต้องค่ะ';
    $('#loginErr').classList.remove('hide');
    return;
  }
  password = pw;
  settings = (await res.json()).settings;
  try {
    const pr = await fetch('/api/admin/photos', { headers: { 'x-admin-password': pw } });
    if (pr.ok) photosMap = (await pr.json()).photos || {};
  } catch { /* ไม่มีรูปก็ไม่เป็นไร */ }
  $('#loginCard').classList.add('hide');
  $('#panel').classList.remove('hide');
  $('#bottomNav').classList.remove('hide');
  render();
  setupBackoffice();
  loadReport();
}

// ---------- render ----------
function render() {
  renderServices();
  $('#open').value = settings.businessHours.open;
  $('#close').value = settings.businessHours.close;
  $('#slot').value = settings.businessHours.slotMinutes;
  renderWeekdays();
  renderClosedDates();
  renderBlockedTimes();
  $('#shopName').value = settings.shop.name || '';
  $('#shopAddress').value = settings.shop.address || '';
  $('#shopPhone').value = settings.shop.phone || '';
  $('#deposit').value = settings.payment.depositAmount;
  $('#promptpay').value = settings.payment.promptpayId || '';
  $('#bankName').value = settings.payment.bankName || '';
  $('#bankAccountName').value = settings.payment.bankAccountName || '';
  $('#bankAccountNumber').value = settings.payment.bankAccountNumber || '';
}

function renderServices() {
  const wrap = $('#services');
  wrap.innerHTML = '';
  settings.services.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'service-item';
    el.innerHTML = `
      <label>ชื่อบริการ</label>
      <input type="text" data-i="${i}" data-k="name" value="${escapeAttr(s.name)}" />
      <div class="svc-grid" style="margin-top:8px">
        <div><label>ระยะเวลา (นาที)</label><input type="number" data-i="${i}" data-k="duration" min="1" value="${s.duration}" /></div>
        <div><label>ราคา (บาท)</label><input type="number" data-i="${i}" data-k="price" min="0" value="${s.price}" /></div>
        <button class="btn-del" data-del="${i}" type="button">ลบ</button>
      </div>
      <div class="pop-toggle ${s.popular ? 'on' : ''}" data-pop="${i}">${s.popular ? '🔥 ยอดฮิต (กดเพื่อเอาออก)' : '☆ ตั้งเป็นยอดฮิต'}</div>
      <div class="type-row">
        <div class="type-opt ${svcType(s) === 'main' ? 'on' : ''}" data-type="main" data-ti="${i}">🎀 ทรงต่อขนตา</div>
        <div class="type-opt ${svcType(s) === 'addon' ? 'on' : ''}" data-type="addon" data-ti="${i}">➕ บริการเสริม</div>
      </div>
      ${s.id
        ? `<div class="photos-box">
             <div class="lbl-sm">📸 รูปตัวอย่าง (ให้ลูกค้าดูตอนเลือกบริการ)</div>
             <div class="thumbs" id="thumbs-${s.id}"></div>
             <label class="btn-upload">+ อัปรูป<input type="file" accept="image/*" data-up="${s.id}" hidden /></label>
           </div>`
        : `<div class="photo-hint">💡 กดบันทึกก่อน แล้วเปิดหน้านี้ใหม่จึงจะอัปรูปได้</div>`}`;
    wrap.appendChild(el);
    if (s.id) renderThumbs(s.id);
  });

  wrap.querySelectorAll('[data-up]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      if (e.target.files[0]) uploadPhoto(inp.dataset.up, e.target.files[0]);
      e.target.value = '';
    });
  });

  wrap.querySelectorAll('[data-type]').forEach((el) => {
    el.addEventListener('click', () => {
      settings.services[Number(el.dataset.ti)].type = el.dataset.type;
      renderServices();
    });
  });

  wrap.querySelectorAll('[data-pop]').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.pop);
      const turningOn = !settings.services[i].popular;
      if (turningOn && settings.services.filter((s) => s.popular).length >= 3) {
        alert('เลือกยอดฮิตได้สูงสุด 3 บริการค่ะ — เอาอันเดิมออกก่อนนะคะ');
        return;
      }
      settings.services[i].popular = turningOn;
      renderServices();
    });
  });

  wrap.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = Number(inp.dataset.i);
      const k = inp.dataset.k;
      settings.services[i][k] = k === 'name' ? inp.value : Number(inp.value);
    });
  });
  wrap.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.services.splice(Number(btn.dataset.del), 1);
      renderServices();
    });
  });
}

// ---------- รูปตัวอย่างบริการ ----------
function renderThumbs(sid) {
  const wrap = document.getElementById('thumbs-' + sid);
  if (!wrap) return;
  const list = photosMap[sid] || [];
  if (!list.length) { wrap.innerHTML = '<span class="no-photo">ยังไม่มีรูป</span>'; return; }
  wrap.innerHTML = list.map((p) =>
    `<div class="thumb" style="background-image:url('${p.thumb || p.url}')"><button type="button" data-del="${p.id}" data-sid="${sid}">×</button></div>`).join('');
  wrap.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => deletePhoto(b.dataset.sid, b.dataset.del));
  });
}

// ย่อรูปในเบราว์เซอร์ก่อนอัป (กันไฟล์ใหญ่)
function compressImage(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadPhoto(sid, file) {
  const wrap = document.getElementById('thumbs-' + sid);
  if (wrap) wrap.innerHTML = '<span class="no-photo">กำลังอัป...</span>';
  try {
    const full = await compressImage(file, 1200, 0.78);  // รูปใหญ่ (ดูเต็มจอ)
    const thumb = await compressImage(file, 420, 0.6);   // รูปเล็ก (โชว์ในแถบ โหลดเร็ว)
    const res = await fetch(`/api/admin/services/${sid}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify({ image: full, thumb }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'อัปไม่สำเร็จ');
    photosMap[sid] = data.photos;
    renderThumbs(sid);
  } catch (e) {
    alert('อัปรูปไม่สำเร็จ: ' + e.message);
    renderThumbs(sid);
  }
}

async function deletePhoto(sid, photoId) {
  if (!confirm('ลบรูปนี้?')) return;
  try {
    const res = await fetch(`/api/admin/services/${sid}/photos/${photoId}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
    photosMap[sid] = data.photos;
    renderThumbs(sid);
  } catch (e) {
    alert(e.message);
  }
}

$('#addService').addEventListener('click', () => {
  settings.services.push({ id: '', name: '', duration: 60, price: 0 });
  renderServices();
});

function renderWeekdays() {
  const wrap = $('#weekdays');
  wrap.innerHTML = '';
  WEEKDAY_NAMES.forEach((name, day) => {
    const el = document.createElement('div');
    el.className = 'wd' + (settings.closedWeekdays.includes(day) ? ' on' : '');
    el.textContent = name;
    el.addEventListener('click', () => {
      const idx = settings.closedWeekdays.indexOf(day);
      if (idx >= 0) settings.closedWeekdays.splice(idx, 1);
      else settings.closedWeekdays.push(day);
      renderWeekdays();
    });
    wrap.appendChild(el);
  });
}

function renderClosedDates() {
  const wrap = $('#closedDates');
  wrap.innerHTML = '';
  settings.closedDates.slice().sort().forEach((d) => {
    const chip = document.createElement('span');
    chip.className = 'date-chip';
    chip.innerHTML = `${d} <button type="button" data-d="${d}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      settings.closedDates = settings.closedDates.filter((x) => x !== d);
      renderClosedDates();
    });
    wrap.appendChild(chip);
  });
}

$('#addDate').addEventListener('click', () => {
  const v = $('#closedDateInput').value;
  if (!v) return;
  if (!settings.closedDates.includes(v)) settings.closedDates.push(v);
  $('#closedDateInput').value = '';
  renderClosedDates();
});

function thaiDate(d) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return d; }
}

function renderBlockedTimes() {
  if (!Array.isArray(settings.blockedTimes)) settings.blockedTimes = [];
  const wrap = $('#blockedTimes');
  wrap.innerHTML = '';
  settings.blockedTimes
    .slice()
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .forEach((b) => {
      const chip = document.createElement('span');
      chip.className = 'date-chip';
      chip.innerHTML = `${thaiDate(b.date)} · ${b.start}–${b.end} <button type="button">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        settings.blockedTimes = settings.blockedTimes.filter(
          (x) => !(x.date === b.date && x.start === b.start && x.end === b.end),
        );
        renderBlockedTimes();
      });
      wrap.appendChild(chip);
    });
}

$('#addBlock').addEventListener('click', () => {
  const date = $('#blockDate').value;
  const start = $('#blockStart').value;
  const end = $('#blockEnd').value;
  if (!date || !start || !end) {
    alert('กรุณาเลือกวันที่ เวลาเริ่ม และเวลาสิ้นสุดให้ครบ');
    return;
  }
  if (start >= end) {
    alert('เวลาเริ่มต้องมาก่อนเวลาสิ้นสุด');
    return;
  }
  if (!Array.isArray(settings.blockedTimes)) settings.blockedTimes = [];
  const exists = settings.blockedTimes.some((x) => x.date === date && x.start === start && x.end === end);
  if (!exists) settings.blockedTimes.push({ date, start, end });
  $('#blockStart').value = '';
  $('#blockEnd').value = '';
  renderBlockedTimes();
});

// ---------- save ----------
$('#saveBtn').addEventListener('click', save);

async function save() {
  // ดึงค่าฟิลด์ทั่วไปเข้า settings
  settings.businessHours = {
    open: $('#open').value,
    close: $('#close').value,
    slotMinutes: Number($('#slot').value),
  };
  settings.shop = {
    name: $('#shopName').value.trim(),
    address: $('#shopAddress').value.trim(),
    phone: $('#shopPhone').value.trim(),
  };
  settings.payment = {
    depositAmount: Number($('#deposit').value),
    promptpayId: $('#promptpay').value.trim(),
    bankName: $('#bankName').value.trim(),
    bankAccountName: $('#bankAccountName').value.trim(),
    bankAccountNumber: $('#bankAccountNumber').value.trim(),
  };

  const msg = $('#saveMsg');
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';
  msg.classList.add('hide');

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify({ password, settings }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

    settings = data.settings;
    render();
    if (data.warning) {
      msg.className = 'msg err';
      msg.textContent = '⚠️ ' + data.warning;
    } else {
      msg.className = 'msg ok';
      msg.textContent = data.committed
        ? '✅ บันทึกเรียบร้อย! ค่าใหม่จะอัปเดตเต็มที่ภายใน 1-2 นาที'
        : '✅ บันทึกแล้ว';
    }
    msg.classList.remove('hide');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = e.message;
    msg.classList.remove('hide');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 บันทึกการเปลี่ยนแปลง';
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===================== หลังบ้าน: รายงาน + จัดการคิว =====================
let boSetup = false;
let currentRange = 'today';
let openId = null;
let bookingsCache = [];
let statusFilter = 'all';
let searchQuery = '';
let rangeFrom = '';
let rangeTo = '';

const STLABEL = { pending: '🌸 รอยืนยัน', confirmed: '⏳ รอรับบริการ', done: '✅ เสร็จแล้ว', noshow: '🚫 ไม่มา', cancelled: '🚫 ยกเลิก' };

function todayStr() { return new Date().toLocaleDateString('en-CA'); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); }
function baht(n) { return '฿' + (Number(n) || 0).toLocaleString(); }
function shortName(name) { return String(name).split(/\s*(?:ไม่จำกัด|\/)/)[0].trim() || name; }
function thaiDateFull(d) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }); } catch { return d; }
}
function thaiMonthLabel(d) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }); } catch { return d; }
}
function genSlots() {
  const bh = settings.businessHours;
  const toMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const pad = (n) => String(n).padStart(2, '0');
  const out = [];
  for (let t = toMin(bh.open); t < toMin(bh.close); t += bh.slotMinutes) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}

function setupBackoffice() {
  if (boSetup) return;
  boSetup = true;

  document.querySelectorAll('#bottomNav button').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  $('#rangeSeg').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      $('#rangeSeg').querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      currentRange = b.dataset.range;
      // โชว์ช่องกรอกให้ตรงโหมด
      $('#repDate').classList.toggle('hide', currentRange !== 'day');
      $('#repMonth').classList.toggle('hide', currentRange !== 'monthPick');
      $('#repRange').classList.toggle('hide', currentRange !== 'month');
      if (currentRange === 'day' && !$('#repDate').value) $('#repDate').value = todayStr();
      if (currentRange === 'monthPick' && !$('#repMonth').value) $('#repMonth').value = todayStr().slice(0, 7);
      if (currentRange === 'month') { // เดือนนี้ = 1 ค่ำเดือน → วันนี้ (แก้ช่วงได้)
        rangeFrom = todayStr().slice(0, 8) + '01';
        rangeTo = todayStr();
        updateRangeLabels();
      }
      loadReport();
    });
  });
  $('#repDate').addEventListener('change', () => { currentRange = 'day'; loadReport(); });
  $('#repMonth').addEventListener('change', () => { currentRange = 'monthPick'; loadReport(); });
  const markMonthChip = () => $('#rangeSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.range === 'month'));
  $('#rangeFromBtn').addEventListener('click', () => openPinkCal(rangeFrom, (d) => {
    rangeFrom = d; if (rangeTo && rangeFrom > rangeTo) rangeTo = rangeFrom;
    updateRangeLabels(); currentRange = 'month'; markMonthChip(); loadReport();
  }));
  $('#rangeToBtn').addEventListener('click', () => openPinkCal(rangeTo, (d) => {
    rangeTo = d; if (rangeFrom && rangeTo < rangeFrom) rangeFrom = rangeTo;
    updateRangeLabels(); currentRange = 'month'; markMonthChip(); loadReport();
  }));
  $('#pcPrev').addEventListener('click', () => { pcView.setMonth(pcView.getMonth() - 1); renderPinkCal(); });
  $('#pcNext').addEventListener('click', () => { pcView.setMonth(pcView.getMonth() + 1); renderPinkCal(); });
  $('#pcOverlay').addEventListener('click', (e) => { if (e.target.id === 'pcOverlay') e.currentTarget.classList.add('hide'); });

  $('#openWalkin').addEventListener('click', () => {
    const card = $('#walkinCard');
    card.classList.toggle('hide');
    if (!card.classList.contains('hide')) initWalkinForm();
  });
  $('#wkService').addEventListener('change', autoPrice);
  $('#wkTime').addEventListener('change', () => {
    $('#wkTimeCustomWrap').classList.toggle('hide', $('#wkTime').value !== '__custom__');
  });
  $('#wkSave').addEventListener('click', saveWalkin);

  // ค้นหาในรายการคิว
  $('#bkSearch').addEventListener('input', () => {
    searchQuery = $('#bkSearch').value.trim().toLowerCase();
    openId = null;
    renderBookings();
  });

  // filter รายการคิวตามสถานะ
  $('#bkFilter').querySelectorAll('.fchip').forEach((b) => {
    b.addEventListener('click', () => {
      $('#bkFilter').querySelectorAll('.fchip').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      statusFilter = b.dataset.st;
      openId = null;
      renderBookings();
    });
  });
}

function switchTab(tab) {
  $('#tab-report').classList.toggle('hide', tab !== 'report');
  $('#tab-settings').classList.toggle('hide', tab !== 'settings');
  document.querySelectorAll('#bottomNav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo({ top: 0 });
  if (tab === 'report') loadReport();
}

function rangeQuery() {
  if (currentRange === 'yesterday') return `date=${yesterdayStr()}`;
  if (currentRange === 'tomorrow') return `date=${tomorrowStr()}`;
  if (currentRange === 'month') return `from=${rangeFrom || todayStr()}&to=${rangeTo || todayStr()}`;
  if (currentRange === 'monthPick') return `month=${$('#repMonth').value || todayStr().slice(0, 7)}`;
  if (currentRange === 'day') return `date=${$('#repDate').value || todayStr()}`;
  return `date=${todayStr()}`;
}
function rangeLabel() {
  if (currentRange === 'yesterday') return `เมื่อวาน · ${thaiDateFull(yesterdayStr())}`;
  if (currentRange === 'tomorrow') return `พรุ่งนี้ · ${thaiDateFull(tomorrowStr())}`;
  if (currentRange === 'month') return `${thaiDateFull(rangeFrom || todayStr())} – ${thaiDateFull(rangeTo || todayStr())}`;
  if (currentRange === 'monthPick') return thaiMonthLabel(($('#repMonth').value || todayStr().slice(0, 7)) + '-01');
  if (currentRange === 'day') return thaiDateFull($('#repDate').value || todayStr());
  return `วันนี้ · ${thaiDateFull(todayStr())}`;
}
function updateRangeLabels() {
  $('#rangeFromLbl').textContent = thaiDate(rangeFrom || todayStr());
  $('#rangeToLbl').textContent = thaiDate(rangeTo || todayStr());
}

// ---------- ปฏิทินชมพู (เลือกช่วงวันที่) ----------
let pcView = new Date();
let pcSel = '';
let pcOnPick = null;
const PC_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
function openPinkCal(dateStr, onPick) {
  pcSel = dateStr || todayStr();
  pcView = new Date(pcSel + 'T00:00:00');
  pcView.setDate(1);
  pcOnPick = onPick;
  $('#pcOverlay').classList.remove('hide');
  renderPinkCal();
}
function renderPinkCal() {
  $('#pcMonth').textContent = `${PC_MONTHS[pcView.getMonth()]} ${pcView.getFullYear() + 543}`;
  const grid = $('#pcGrid');
  const y = pcView.getFullYear(); const m = pcView.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = todayStr();
  let html = '';
  for (let i = 0; i < first; i++) html += '<div class="pc-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = 'pc-day' + (ds === pcSel ? ' sel' : '') + (ds === today ? ' today' : '');
    html += `<div class="${cls}" data-d="${ds}">${d}</div>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('[data-d]').forEach((el) => {
    el.addEventListener('click', () => {
      $('#pcOverlay').classList.add('hide');
      if (pcOnPick) pcOnPick(el.dataset.d);
    });
  });
}

async function loadReport() {
  const q = rangeQuery();
  $('#repLabel').textContent = rangeLabel();
  const h = { 'x-admin-password': password };
  try {
    const [repRes, listRes] = await Promise.all([
      fetch(`/api/admin/report?${q}`, { headers: h }),
      fetch(`/api/admin/bookings?${q}`, { headers: h }),
    ]);
    const rep = await repRes.json();
    const { bookings } = await listRes.json();
    renderKpis(rep);
    renderForecast(rep);
    renderSalesBars(bookings || []);
    renderByService(rep.byService);
    bookingsCache = bookings || [];
    renderBookings();
  } catch (e) {
    $('#kpis').innerHTML = '<div class="muted-empty">โหลดข้อมูลไม่สำเร็จ</div>';
  }
}

// การ์ดคาดการณ์ยอดวันนี้ (โชว์เฉพาะ "วันนี้")
function renderForecast(r) {
  const card = $('#forecastCard');
  if (currentRange !== 'today') { card.classList.add('hide'); return; }
  card.classList.remove('hide');
  const forecast = Number(r.forecast) || 0;
  const done = Number(r.totalSales) || 0;
  const remaining = Math.max(0, forecast - done);
  const pct = forecast > 0 ? Math.round((done / forecast) * 100) : 0;
  const remainCount = (r.forecastCount || 0) - (r.doneCount || 0);
  $('#fcVal').textContent = baht(forecast);
  $('#fcSub').textContent = `จากคิวทั้งหมดวันนี้ ${r.forecastCount || 0} คิว (ไม่นับ ไม่มา/ยกเลิก)`;
  $('#fcBar').style.width = pct + '%';
  $('#fcDone').textContent = `✅ ทำแล้ว ${baht(done)}`;
  $('#fcLeft').textContent = `⏳ รออีก ${baht(remaining)} (${remainCount} คิว)`;
}

function renderKpis(r) {
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="k-label">💰 ยอดขาย (เสร็จแล้ว)</div><div class="k-val">${baht(r.totalSales)}</div></div>
    <div class="kpi"><div class="k-label">📅 คิวเสร็จแล้ว</div><div class="k-val">${r.doneCount} คิว</div><div class="k-sub">รอรับ ${r.counts.confirmed} · รอยืนยัน ${r.counts.pending}</div></div>
    <div class="kpi"><div class="k-label">🎫 มัดจำรับล่วงหน้า</div><div class="k-val">${baht(r.depositTotal)}</div></div>
    <div class="kpi"><div class="k-label">🏪 รับหน้าร้าน</div><div class="k-val">${baht(r.onSiteTotal)}</div></div>`;
}

// กราฟแท่งยอดขายรายวัน — โชว์ตอนดูแบบหลายวัน (เดือนนี้/เลือกเดือน/ช่วงวันที่)
function renderSalesBars(list) {
  const card = $('#salesBarsCard');
  // สร้างรายการวันที่ที่จะแสดงเป็นแท่ง
  const dates = [];
  if (currentRange === 'monthPick') {
    const ym = $('#repMonth').value || todayStr().slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const n = new Date(y, m, 0).getDate();
    for (let d = 1; d <= n; d++) dates.push(`${ym}-${String(d).padStart(2, '0')}`);
  } else if (currentRange === 'month') {
    let from = rangeFrom, to = rangeTo;
    if (from && to) {
      if (from > to) { const t = from; from = to; to = t; }
      let cur = new Date(from + 'T00:00:00'); const end = new Date(to + 'T00:00:00'); let guard = 0;
      while (cur <= end && guard < 120) { dates.push(cur.toLocaleDateString('en-CA')); cur.setDate(cur.getDate() + 1); guard++; }
    }
  }
  if (dates.length < 2) { card.classList.add('hide'); return; }
  card.classList.remove('hide');

  const byDate = {};
  list.forEach((b) => { if (b.status === 'done') byDate[b.date] = (byDate[b.date] || 0) + (Number(b.price) || 0); });
  const max = Math.max(1, ...dates.map((d) => byDate[d] || 0));
  const today = todayStr();
  const last = dates.length - 1;

  const bars = dates.map((date, i) => {
    const v = byDate[date] || 0;
    const h = Math.round((v / max) * 100);
    const dnum = Number(date.slice(8, 10));
    const lbl = (i === 0 || i === last || i % 5 === 0) ? dnum : '';
    const val = v > 0 ? `<span class="bar-v">${compactBaht(v)}</span>` : '';
    return `<div class="bar-col" title="${thaiDate(date)} · ${baht(v)}">${val}<div class="bar ${date === today ? 'bar-today' : ''}" style="height:${h}%"></div><span class="bar-x">${lbl}</span></div>`;
  }).join('');
  $('#salesBars').innerHTML = bars;
}

// ย่อยอดให้สั้น กันเลขล้นบนแท่ง: 594 -> "594", 1093 -> "1.1k", 1350 -> "1.4k"
function compactBaht(n) {
  n = Number(n) || 0;
  if (n >= 1000) {
    const k = n / 1000;
    return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }
  return String(n);
}

const DONUT_COLORS = ['#e75a8a', '#ff9ec4', '#ffc2d8', '#ff7b54', '#ffb347', '#c77dff', '#7ec8e3', '#8ad6a0', '#f78fb3', '#b5a0e0'];
function renderByService(list) {
  const wrap = $('#byService');
  if (!list || !list.length) {
    wrap.innerHTML = '<div class="muted-empty">ยังไม่มีคิวที่เสร็จในช่วงนี้ — กราฟจะขึ้นเมื่อมีคิวกด "✅ เสร็จแล้ว"</div>';
    return;
  }
  const segs = list.map((s, i) => ({ ...s, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  const total = segs.reduce((t, s) => t + (Number(s.sales) || 0), 0);

  let donut = '';
  const paid = segs.filter((s) => (Number(s.sales) || 0) > 0);
  if (total > 0 && paid.length) {
    const GAP = paid.length > 1 ? 4 : 0; // เส้นคั่นขาวระหว่างชิ้น
    let acc = 0;
    const parts = [];
    paid.forEach((s) => {
      const from = (acc / total) * 360;
      acc += Number(s.sales) || 0;
      const to = (acc / total) * 360;
      const cut = Math.max(from, to - GAP);
      parts.push(`${s.color} ${from}deg ${cut}deg`);
      if (GAP) parts.push(`#ffffff ${cut}deg ${to}deg`);
    });
    donut = `<div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(${parts.join(',')})"></div>
      <div class="donut-center"><div class="dc-val">${baht(total)}</div><div class="dc-lbl">ยอดขายรวม</div></div>
    </div>`;
  }

  const rows = segs.map((s) => {
    const pct = total > 0 ? Math.round((Number(s.sales) || 0) / total * 100) : 0;
    return `<div class="bs-row"><span><span class="bs-dot" style="background:${s.color}"></span>${escapeAttr(s.name)} <span class="bs-cnt">· ${s.count} คิว</span></span><span class="bs-sales">${baht(s.sales)}${total > 0 ? ` · ${pct}%` : ''}</span></div>`;
  }).join('');
  wrap.innerHTML = donut + rows;
}

function renderBookings() {
  const wrap = $('#bookingList');
  let list = statusFilter === 'all' ? bookingsCache : bookingsCache.filter((b) => b.status === statusFilter);
  if (searchQuery) {
    const q = searchQuery;
    list = list.filter((b) => (b.id || '').toLowerCase().includes(q) || (b.name || '').toLowerCase().includes(q) || (b.phone || '').toLowerCase().includes(q));
  }
  if (!bookingsCache.length) { wrap.innerHTML = '<div class="muted-empty">ไม่มีคิวในช่วงนี้</div>'; return; }
  if (!list.length) { wrap.innerHTML = `<div class="muted-empty">${searchQuery ? 'ไม่พบคิวที่ค้นหา' : 'ไม่มีคิวสถานะนี้ในช่วงที่เลือก'}</div>`; return; }
  wrap.innerHTML = '';
  list.forEach((b) => {
    const remain = (Number(b.price) || 0) - (Number(b.depositAmount) || 0);
    const el = document.createElement('div');
    el.className = 'bk' + (openId === b.id ? ' open' : '');
    const manualTag = b.source === 'manual' ? '<span class="bdg tag-manual">🚶 เพิ่มเอง</span>' : '';
    const phoneLine = b.phone
      ? `<div class="bk-phone">📞 <a href="tel:${escapeAttr(b.phone)}" onclick="event.stopPropagation()">${escapeAttr(b.phone)}</a></div>`
      : '';
    el.innerHTML = `
      <div class="bk-top">
        <div>
          <span class="bk-date">📅 ${thaiDate(b.date)} · <span class="bk-id">#${b.id}</span></span>
          <div><span class="bk-time">${b.time}</span> &nbsp;${escapeAttr(b.name || '')}</div>
          <div class="bk-svc">${manualTag}${escapeAttr(b.serviceName || '')} · ฿${(Number(b.price) || 0).toLocaleString()}</div>
          ${phoneLine}
        </div>
        <span class="bdg bdg-${b.status}">${STLABEL[b.status] || b.status}</span>
      </div>
      <div class="bk-money">
        <div>ราคาเต็ม<b>฿${(Number(b.price) || 0).toLocaleString()}</b></div>
        <div class="dep">มัดจำ<b>฿${(Number(b.depositAmount) || 0).toLocaleString()}</b></div>
        <div class="rem">เก็บหน้าร้าน<b>฿${remain.toLocaleString()}</b></div>
      </div>
      ${openId === b.id ? editPanel(b) : ''}`;
    el.querySelector('.bk-top').addEventListener('click', () => {
      openId = (openId === b.id) ? null : b.id;
      renderBookings();
    });
    if (openId === b.id) wireEdit(el, b);
    wrap.appendChild(el);
  });
}

function editPanel(b) {
  let opts = settings.services.map((s) =>
    `<option value="${s.id}" ${s.id === b.serviceId ? 'selected' : ''}>${escapeAttr(shortName(s.name))} — ฿${s.price.toLocaleString()}</option>`).join('');
  // ถ้าบริการเดิมของคิวถูกลบไปแล้ว — ใส่ option ของมันไว้ (ล็อกไว้ไม่ให้เด้งไปบริการอื่นตอนกดบันทึก)
  const exists = settings.services.some((s) => s.id === b.serviceId);
  if (!exists) {
    opts = `<option value="${escapeAttr(b.serviceId || '')}" selected>${escapeAttr(shortName(b.serviceName || 'บริการเดิม'))} — ฿${(Number(b.price) || 0).toLocaleString()} (บริการเดิม)</option>` + opts;
  }
  return `
    <div class="bk-edit">
      <div class="lbl">ข้อมูลลูกค้า (เพิ่ม/แก้ได้):</div>
      <input type="text" class="ed-name" value="${escapeAttr(b.name || '')}" placeholder="ชื่อลูกค้า" />
      <div style="height:6px"></div>
      <input type="tel" class="ed-phone" value="${escapeAttr(b.phone || '')}" placeholder="เบอร์โทร" />
      <div style="height:8px"></div>
      <button class="btn-ghost ed-contact" type="button" style="width:100%">💾 บันทึกชื่อ/เบอร์</button>
      <p class="msg hide ed-cmsg"></p>

      <div class="lbl">บริการจริงที่ทำ (แก้ได้):</div>
      <div class="svc-grid2">
        <select class="ed-svc">${opts}</select>
        <input type="number" class="ed-price" value="${Number(b.price) || 0}" min="0" />
      </div>
      <div class="lbl">กดเพื่อบันทึก + เปลี่ยนสถานะ:</div>
      <div class="st-pills">
        <button class="ed-st ${b.status === 'confirmed' ? 'on-confirmed' : ''}" data-st="confirmed">⏳ รอรับบริการ</button>
        <button class="ed-st ${b.status === 'done' ? 'on-done' : ''}" data-st="done">✅ เสร็จแล้ว</button>
        <button class="ed-st ${b.status === 'noshow' ? 'on-noshow' : ''}" data-st="noshow">🚫 ไม่มา/ยกเลิก</button>
      </div>
      <p class="msg hide ed-msg"></p>

      <div class="lbl">🔄 เลื่อนนัด (เปลี่ยนวัน-เวลา):</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <input type="date" class="ed-date" value="${b.date}" />
        <select class="ed-time"></select>
      </div>
      <input type="time" class="ed-time-custom hide" style="margin-top:8px" />
      <div style="height:8px"></div>
      <button class="btn-ghost ed-reschedule" type="button" style="width:100%">🔄 ยืนยันเลื่อนนัด + แจ้งอีเมล</button>
      <p class="note" style="text-align:center">ระบบจะส่งวัน-เวลาใหม่ให้ลูกค้า + ร้านอัตโนมัติ</p>
      <p class="msg hide ed-rmsg"></p>
      ${(b.status === 'noshow' || b.status === 'cancelled') ? `
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #f3dbe6">
          <button class="btn-del ed-delete" type="button" style="width:100%">🗑️ ลบคิวนี้ถาวร</button>
        </div>` : ''}
    </div>`;
}

function wireEdit(el, b) {
  const svcSel = el.querySelector('.ed-svc');
  const priceInp = el.querySelector('.ed-price');
  svcSel.addEventListener('change', () => {
    const s = settings.services.find((x) => x.id === svcSel.value);
    if (s) priceInp.value = s.price;
  });

  // บันทึกชื่อ/เบอร์ (เก็บ panel เปิดไว้)
  const contactBtn = el.querySelector('.ed-contact');
  if (contactBtn) {
    contactBtn.addEventListener('click', async () => {
      const cmsg = el.querySelector('.ed-cmsg');
      const label = contactBtn.textContent;
      contactBtn.disabled = true;
      contactBtn.textContent = 'กำลังบันทึก...';
      cmsg.classList.add('hide');
      try {
        const res = await fetch(`/api/admin/bookings/${b.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
          body: JSON.stringify({ name: el.querySelector('.ed-name').value.trim(), phone: el.querySelector('.ed-phone').value.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        loadReport(); // panel ยังเปิดอยู่ (openId เดิม) จะแสดงค่าใหม่
      } catch (e) {
        contactBtn.disabled = false;
        contactBtn.textContent = label;
        cmsg.className = 'msg err ed-cmsg';
        cmsg.textContent = e.message;
        cmsg.classList.remove('hide');
      }
    });
  }

  // ลบคิว (เฉพาะไม่มา/ยกเลิก)
  const delBtn = el.querySelector('.ed-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('ลบคิวนี้ถาวร? (กู้คืนไม่ได้)')) return;
      delBtn.disabled = true;
      delBtn.textContent = 'กำลังลบ...';
      try {
        const res = await fetch(`/api/admin/bookings/${b.id}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': password },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
        openId = null;
        loadReport();
      } catch (e) {
        delBtn.disabled = false;
        delBtn.textContent = '🗑️ ลบคิวนี้ถาวร';
        alert(e.message);
      }
    });
  }

  // เลื่อนนัด
  const timeSel = el.querySelector('.ed-time');
  const timeCustom = el.querySelector('.ed-time-custom');
  if (timeSel) {
    const slots = genSlots();
    timeSel.innerHTML = slots.map((t) => `<option value="${t}" ${t === b.time ? 'selected' : ''}>${t} น.</option>`).join('')
      + '<option value="__custom__">⏰ กำหนดเวลาเอง…</option>';
    // ถ้าเวลาปัจจุบันไม่อยู่ใน slot -> เลือกกำหนดเอง + เติมค่าเดิม
    if (!slots.includes(b.time)) {
      timeSel.value = '__custom__';
      timeCustom.value = b.time;
      timeCustom.classList.remove('hide');
    }
    timeSel.addEventListener('change', () => {
      timeCustom.classList.toggle('hide', timeSel.value !== '__custom__');
    });
  }
  const rBtn = el.querySelector('.ed-reschedule');
  if (rBtn) {
    rBtn.addEventListener('click', async () => {
      const dateInp = el.querySelector('.ed-date');
      const rmsg = el.querySelector('.ed-rmsg');
      const newTime = timeSel.value === '__custom__' ? timeCustom.value : timeSel.value;
      if (!newTime) { rmsg.className = 'msg err ed-rmsg'; rmsg.textContent = 'กรุณาเลือกหรือกำหนดเวลา'; rmsg.classList.remove('hide'); return; }
      const label = rBtn.textContent;
      rBtn.disabled = true;
      rBtn.textContent = 'กำลังเลื่อนนัด...';
      rmsg.classList.add('hide');
      try {
        const res = await fetch(`/api/admin/bookings/${b.id}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
          body: JSON.stringify({ date: dateInp.value, time: newTime }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เลื่อนนัดไม่สำเร็จ');
        openId = null;
        loadReport();
        if (data.emailWarning) alert('⚠️ ' + data.emailWarning);
        else alert('✅ เลื่อนนัดเรียบร้อย ส่งอีเมลแจ้งลูกค้า/ร้านแล้ว');
      } catch (e) {
        rBtn.disabled = false;
        rBtn.textContent = label;
        rmsg.className = 'msg err ed-rmsg';
        rmsg.textContent = e.message;
        rmsg.classList.remove('hide');
      }
    });
  }
  el.querySelectorAll('.ed-st').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const msg = el.querySelector('.ed-msg');
      const label = btn.textContent;
      btn.textContent = '...';
      try {
        const res = await fetch(`/api/admin/bookings/${b.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
          body: JSON.stringify({ serviceId: svcSel.value, price: Number(priceInp.value), status: btn.dataset.st }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        openId = null;
        loadReport();
      } catch (e) {
        btn.textContent = label;
        msg.className = 'msg err ed-msg';
        msg.textContent = e.message;
        msg.classList.remove('hide');
      }
    });
  });
}

// ---------- เพิ่มคิวเอง ----------
function initWalkinForm() {
  $('#wkService').innerHTML = settings.services.map((s) =>
    `<option value="${s.id}">${escapeAttr(shortName(s.name))} — ฿${s.price.toLocaleString()}</option>`).join('');
  $('#wkTime').innerHTML = genSlots().map((t) => `<option value="${t}">${t} น.</option>`).join('')
    + '<option value="__custom__">⏰ กำหนดเวลาเอง…</option>';
  $('#wkTimeCustomWrap').classList.add('hide');
  if (!$('#wkDate').value) $('#wkDate').value = todayStr();
  autoPrice();
}
function autoPrice() {
  const s = settings.services.find((x) => x.id === $('#wkService').value);
  if (s) $('#wkPrice').value = s.price;
}
async function saveWalkin() {
  const time = $('#wkTime').value === '__custom__' ? $('#wkTimeCustom').value : $('#wkTime').value;
  if (!time) { alert('กรุณาเลือกหรือกำหนดเวลา'); return; }
  const body = {
    name: $('#wkName').value.trim(),
    phone: $('#wkPhone').value.trim(),
    email: $('#wkEmail').value.trim(),
    serviceId: $('#wkService').value,
    date: $('#wkDate').value,
    time,
    price: Number($('#wkPrice').value),
    depositAmount: Number($('#wkDeposit').value),
    status: $('#wkStatus').value,
  };
  const msg = $('#wkMsg');
  const btn = $('#wkSave');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';
  msg.classList.add('hide');
  try {
    const res = await fetch('/api/admin/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
    msg.className = data.emailWarning ? 'msg err' : 'msg ok';
    msg.textContent = data.emailWarning ? '⚠️ ' + data.emailWarning : (body.email ? '✅ เพิ่มคิวแล้ว + ส่งอีเมลให้ลูกค้าแล้ว' : '✅ เพิ่มคิวเรียบร้อย');
    msg.classList.remove('hide');
    $('#wkName').value = '';
    $('#wkPhone').value = '';
    $('#wkEmail').value = '';
    loadReport();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = e.message;
    msg.classList.remove('hide');
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึกคิว';
  }
}
