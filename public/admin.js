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
  render();
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
      </div>`;
    wrap.appendChild(el);
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
