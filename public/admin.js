const $ = (s) => document.querySelector(s);
const WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

let password = '';
let settings = null;

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
      <div class="pop-toggle ${s.popular ? 'on' : ''}" data-pop="${i}">${s.popular ? '🔥 ยอดฮิต (กดเพื่อเอาออก)' : '☆ ตั้งเป็นยอดฮิต'}</div>`;
    wrap.appendChild(el);
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

const STLABEL = { pending: '🌸 รอยืนยัน', confirmed: '⏳ รอรับบริการ', done: '✅ เสร็จแล้ว', noshow: '🚫 ไม่มา', cancelled: '🚫 ยกเลิก' };

function todayStr() { return new Date().toLocaleDateString('en-CA'); }
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
      if (currentRange === 'day') {
        $('#repDate').classList.remove('hide');
        if (!$('#repDate').value) $('#repDate').value = todayStr();
      } else {
        $('#repDate').classList.add('hide');
      }
      loadReport();
    });
  });
  $('#repDate').addEventListener('change', () => { currentRange = 'day'; loadReport(); });

  $('#openWalkin').addEventListener('click', () => {
    const card = $('#walkinCard');
    card.classList.toggle('hide');
    if (!card.classList.contains('hide')) initWalkinForm();
  });
  $('#wkService').addEventListener('change', autoPrice);
  $('#wkSave').addEventListener('click', saveWalkin);
}

function switchTab(tab) {
  $('#tab-report').classList.toggle('hide', tab !== 'report');
  $('#tab-settings').classList.toggle('hide', tab !== 'settings');
  document.querySelectorAll('#bottomNav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo({ top: 0 });
  if (tab === 'report') loadReport();
}

function rangeQuery() {
  if (currentRange === 'month') return `month=${todayStr().slice(0, 7)}`;
  if (currentRange === 'day') return `date=${$('#repDate').value || todayStr()}`;
  return `date=${todayStr()}`;
}
function rangeLabel() {
  if (currentRange === 'month') return `เดือนนี้ · ${thaiMonthLabel(todayStr())}`;
  if (currentRange === 'day') return thaiDateFull($('#repDate').value || todayStr());
  return `วันนี้ · ${thaiDateFull(todayStr())}`;
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
    renderByService(rep.byService);
    renderBookings(bookings || []);
  } catch (e) {
    $('#kpis').innerHTML = '<div class="muted-empty">โหลดข้อมูลไม่สำเร็จ</div>';
  }
}

function renderKpis(r) {
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="k-label">💰 ยอดขาย (เสร็จแล้ว)</div><div class="k-val">${baht(r.totalSales)}</div></div>
    <div class="kpi"><div class="k-label">📅 คิวเสร็จแล้ว</div><div class="k-val">${r.doneCount} คิว</div><div class="k-sub">รอรับ ${r.counts.confirmed} · รอยืนยัน ${r.counts.pending}</div></div>
    <div class="kpi"><div class="k-label">🎫 มัดจำรับล่วงหน้า</div><div class="k-val">${baht(r.depositTotal)}</div></div>
    <div class="kpi"><div class="k-label">🏪 รับหน้าร้าน</div><div class="k-val">${baht(r.onSiteTotal)}</div></div>`;
}

const DONUT_COLORS = ['#e75a8a', '#ff9ec4', '#ffc2d8', '#ff7b54', '#ffb347', '#c77dff', '#7ec8e3', '#8ad6a0', '#f78fb3', '#b5a0e0'];
function renderByService(list) {
  const wrap = $('#byService');
  if (!list || !list.length) {
    wrap.innerHTML = '<div class="muted-empty">ยังไม่มีคิวที่เสร็จในช่วงนี้ — กราฟจะขึ้นเมื่อมีคิวกด "✅ เสร็จแล้ว"</div>';
    return;
  }
  const total = list.reduce((t, s) => t + (Number(s.sales) || 0), 0) || 1;
  let acc = 0;
  const stops = list.map((s, i) => {
    const from = (acc / total) * 360;
    acc += Number(s.sales) || 0;
    const to = (acc / total) * 360;
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}deg ${to}deg`;
  }).join(', ');
  const rows = list.map((s, i) =>
    `<div class="bs-row"><span><span class="bs-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>${escapeAttr(s.name)} <span class="bs-cnt">· ${s.count} คิว</span></span><span class="bs-sales">${baht(s.sales)}</span></div>`).join('');
  wrap.innerHTML = `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div></div>${rows}`;
}

function renderBookings(list) {
  const wrap = $('#bookingList');
  if (!list.length) { wrap.innerHTML = '<div class="muted-empty">ไม่มีคิวในช่วงนี้</div>'; return; }
  wrap.innerHTML = '';
  list.forEach((b) => {
    const remain = (Number(b.price) || 0) - (Number(b.depositAmount) || 0);
    const el = document.createElement('div');
    el.className = 'bk' + (openId === b.id ? ' open' : '');
    const manualTag = b.source === 'manual' ? '<span class="bdg tag-manual">🚶 เพิ่มเอง</span>' : '';
    el.innerHTML = `
      <div class="bk-top">
        <div>
          <span class="bk-time">${b.time}</span> &nbsp;${escapeAttr(b.name || '')}
          <div class="bk-svc">${manualTag}${escapeAttr(b.serviceName || '')} · ฿${(Number(b.price) || 0).toLocaleString()}</div>
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
      renderBookings(list);
    });
    if (openId === b.id) wireEdit(el, b);
    wrap.appendChild(el);
  });
}

function editPanel(b) {
  const opts = settings.services.map((s) =>
    `<option value="${s.id}" ${s.id === b.serviceId ? 'selected' : ''}>${escapeAttr(shortName(s.name))} — ฿${s.price.toLocaleString()}</option>`).join('');
  return `
    <div class="bk-edit">
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
      <div style="height:8px"></div>
      <button class="btn-ghost ed-reschedule" type="button" style="width:100%">🔄 ยืนยันเลื่อนนัด + แจ้งอีเมล</button>
      <p class="note" style="text-align:center">ระบบจะส่งวัน-เวลาใหม่ให้ลูกค้า + ร้านอัตโนมัติ</p>
      <p class="msg hide ed-rmsg"></p>
    </div>`;
}

function wireEdit(el, b) {
  const svcSel = el.querySelector('.ed-svc');
  const priceInp = el.querySelector('.ed-price');
  svcSel.addEventListener('change', () => {
    const s = settings.services.find((x) => x.id === svcSel.value);
    if (s) priceInp.value = s.price;
  });

  // เลื่อนนัด
  const timeSel = el.querySelector('.ed-time');
  if (timeSel) {
    timeSel.innerHTML = genSlots().map((t) => `<option value="${t}" ${t === b.time ? 'selected' : ''}>${t} น.</option>`).join('');
  }
  const rBtn = el.querySelector('.ed-reschedule');
  if (rBtn) {
    rBtn.addEventListener('click', async () => {
      const dateInp = el.querySelector('.ed-date');
      const rmsg = el.querySelector('.ed-rmsg');
      const label = rBtn.textContent;
      rBtn.disabled = true;
      rBtn.textContent = 'กำลังเลื่อนนัด...';
      rmsg.classList.add('hide');
      try {
        const res = await fetch(`/api/admin/bookings/${b.id}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
          body: JSON.stringify({ date: dateInp.value, time: timeSel.value }),
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
  $('#wkTime').innerHTML = genSlots().map((t) => `<option value="${t}">${t} น.</option>`).join('');
  if (!$('#wkDate').value) $('#wkDate').value = todayStr();
  autoPrice();
}
function autoPrice() {
  const s = settings.services.find((x) => x.id === $('#wkService').value);
  if (s) $('#wkPrice').value = s.price;
}
async function saveWalkin() {
  const body = {
    name: $('#wkName').value.trim(),
    serviceId: $('#wkService').value,
    date: $('#wkDate').value,
    time: $('#wkTime').value,
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
    msg.className = 'msg ok';
    msg.textContent = '✅ เพิ่มคิวเรียบร้อย';
    msg.classList.remove('hide');
    $('#wkName').value = '';
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
