// ============================================================
// OnTiltVault — frontend
// ============================================================

const CONFIG = {
  // Cloudflare Worker URL — replace with your deployed Worker.
  workerUrl: 'https://ontiltvault-data.schmidt-allen.workers.dev/',

  // Series config
  seriesName: 'June giveaway',
  startDate: '2026-06-01',   // YYYY-MM-DD
  daysInSeries: 30,
  numWinners: 3,
  dailyGamble: 1000,

  // External links
  channelUrl: 'https://www.youtube.com/@TheOnTiltBoys',
  spinquestUrl: 'https://spinquest.com/?u=cybertruck',
  merchUrl: 'https://3coin.co/',

  // localStorage key
  cacheKey: 'ontiltvault.cache.v1',
};

// All possible wheel outcomes — used for the frequency panel even when count is 0.
const WHEEL_OPTIONS = [
  { label: '+$5',                type: 'cash' },
  { label: '+$25',               type: 'cash' },
  { label: '+$50',               type: 'cash' },
  { label: '+$100',              type: 'cash' },
  { label: '100 SC',             type: 'sc' },
  { label: '1,000 SC',           type: 'sc' },
  { label: 'Gamble $1,000 more', type: 'other' },
  { label: 'Mystery Gift',       type: 'other' },
];

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  applyConfig();
  renderQR();
  loadData();
});

function applyConfig() {
  document.getElementById('series-label').textContent = CONFIG.seriesName;
  document.getElementById('day-total').textContent = CONFIG.daysInSeries;
  document.getElementById('spinquest-link').href = CONFIG.spinquestUrl;
  document.getElementById('channel-link').href = CONFIG.channelUrl;
  document.getElementById('merch-link').href = CONFIG.merchUrl;
}

function renderQR() {
  try {
    if (typeof qrcode !== 'function') return;
    const qr = qrcode(0, 'M');
    qr.addData(CONFIG.spinquestUrl);
    qr.make();
    document.getElementById('qrcode').innerHTML =
      qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (err) {
    console.warn('QR render failed:', err);
  }
}

// ============================================================
// DATA LOAD (worker → fallback to localStorage)
// ============================================================
async function loadData() {
  const status = document.getElementById('status-line');

  try {
    const res = await fetch(CONFIG.workerUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'unknown error');

    localStorage.setItem(CONFIG.cacheKey, JSON.stringify(data));
    render(data);
    status.textContent = `Live · ${data.dayCount} day${data.dayCount === 1 ? '' : 's'} logged`;
  } catch (err) {
    console.warn('Live fetch failed, trying cache:', err);
    const cached = localStorage.getItem(CONFIG.cacheKey);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        render(data);
        status.textContent = 'Showing cached data — live fetch failed';
        status.classList.add('error');
        return;
      } catch (e) { /* fall through */ }
    }
    renderEmpty();
    status.textContent = 'Unable to load vault data — please try again later';
    status.classList.add('error');
  }
}

// ============================================================
// RENDER
// ============================================================
function render(data) {
  const days = (data.days || []).slice().sort((a, b) => a.day - b.day);

  renderHero(days);
  renderSubStats(days);
  renderHeaderProgress(days);
  renderChart(days);
  renderWheelFrequency(days);
  renderRecentActivity(days);
  renderMystery(days);
  renderDailyLog(days);
  renderLastUpdated(data.lastUpdated);
}

function renderEmpty() {
  document.getElementById('vault-total').textContent = '$0';
  document.getElementById('sc-total').textContent = '0 SC';
  document.getElementById('per-winner-vault').textContent = '$0';
  document.getElementById('per-winner-sc').textContent = '0 SC';
  document.getElementById('log-body').innerHTML =
    '<tr><td colspan="5" class="log-empty">No data yet — check back after Day 1.</td></tr>';
  renderWheelFrequency([]);
  document.getElementById('activity-list').innerHTML =
    '<li class="activity-empty">Series hasn\'t started yet.</li>';
}

// ----------- HERO STATS -----------
function renderHero(days) {
  if (days.length === 0) { renderEmpty(); return; }
  const latest = days[days.length - 1];
  const vault = latest.vaultTotal || 0;
  const sc    = latest.scTotal || 0;
  const pwv   = Math.round(vault / CONFIG.numWinners);
  const pws   = Math.round(sc / CONFIG.numWinners);

  countUp(document.getElementById('vault-total'), vault, (v) => fmtCurrency(v));
  countUp(document.getElementById('sc-total'),    sc,    (v) => fmtSC(v));
  countUp(document.getElementById('per-winner-vault'), pwv, (v) => fmtCurrency(v));
  countUp(document.getElementById('per-winner-sc'),    pws, (v) => fmtSC(v));

  document.getElementById('day-current').textContent = latest.day;
}

// ----------- MINI STATS -----------
function renderSubStats(days) {
  const n = days.length;
  if (n === 0) {
    document.getElementById('avg-per-day').textContent = '$0';
    document.getElementById('best-day').textContent   = '$0';
    document.getElementById('wheel-cash').textContent = '$0';
    document.getElementById('days-left').textContent  = CONFIG.daysInSeries;
    return;
  }

  const latest = days[n - 1];
  const avg = Math.round(latest.vaultTotal / n);
  const best = days.reduce((m, d) => Math.max(m, d.dailyVaultAdd || 0), 0);
  const wheelCash = days.reduce((s, d) => s + (d.wheelCash || 0), 0);
  const daysLeft = Math.max(0, CONFIG.daysInSeries - latest.day);

  document.getElementById('avg-per-day').textContent = fmtCurrency(avg);
  document.getElementById('best-day').textContent   = fmtCurrency(best);
  document.getElementById('wheel-cash').textContent = fmtCurrency(wheelCash);
  document.getElementById('days-left').textContent  = daysLeft;
}

// ----------- PROGRESS BAR -----------
function renderHeaderProgress(days) {
  if (days.length === 0) return;
  const latest = days[days.length - 1];
  const pct = Math.min(100, (latest.day / CONFIG.daysInSeries) * 100);
  // small delay so the animation is visible
  setTimeout(() => {
    document.getElementById('progress-fill').style.width = pct + '%';
  }, 200);
}

// ----------- CHART -----------
function renderChart(days) {
  try {
    const ctx = document.getElementById('vault-chart');
    if (!ctx || typeof Chart !== 'function') return;

  if (window._vaultChart) { window._vaultChart.destroy(); }

  const labels = days.map((d) => fmtShortDate(dayToDate(d.day)));
  const values = days.map((d) => d.vaultTotal || 0);

  // gold gradient fill
  const ctx2 = ctx.getContext('2d');
  const gradient = ctx2.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, 'rgba(235, 195, 113, 0.35)');
  gradient.addColorStop(1, 'rgba(235, 195, 113, 0)');

  window._vaultChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Vault total',
        data: values,
        borderColor: '#EBC371',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#EBC371',
        pointBorderColor: '#0B0F14',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A2028',
          borderColor: '#353D48',
          borderWidth: 1,
          titleColor: '#F0EAD8',
          bodyColor: '#EBC371',
          titleFont: { family: 'Manrope', size: 12, weight: '600' },
          bodyFont:  { family: 'JetBrains Mono', size: 13, weight: '700' },
          padding: 10,
          displayColors: false,
          callbacks: { label: (ctx) => fmtCurrency(ctx.raw) },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#1F2731', drawBorder: false },
          ticks: {
            color: '#8B8B86',
            font: { family: 'JetBrains Mono', size: 11 },
            padding: 8,
            callback: (v) => '$' + v.toLocaleString(),
          },
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#8B8B86',
            font: { family: 'JetBrains Mono', size: 11 },
            maxRotation: 0,
            autoSkipPadding: 12,
          },
        },
      },
    },
  });
  } catch (err) {
    console.warn('Chart render failed:', err);
  }
}

// ----------- WHEEL FREQUENCY -----------
function renderWheelFrequency(days) {
  const counts = {};
  WHEEL_OPTIONS.forEach((w) => { counts[w.label] = 0; });
  days.forEach((d) => {
    if (d.wheelResult && counts[d.wheelResult] !== undefined) {
      counts[d.wheelResult]++;
    }
  });

  // sort: hits first (by count desc), then untouched options
  const sorted = WHEEL_OPTIONS.slice().sort((a, b) => {
    const ca = counts[a.label], cb = counts[b.label];
    if (cb !== ca) return cb - ca;
    return 0;
  });

  const list = document.getElementById('wheel-list');
  list.innerHTML = '';
  sorted.forEach((opt) => {
    const count = counts[opt.label];
    const li = document.createElement('li');
    const hitClass = count === 0 ? 'is-zero' : (opt.type === 'sc' ? 'is-hit-sc' : opt.type === 'cash' ? 'is-hit-cash' : '');
    li.className = hitClass;
    li.innerHTML = `
      <span class="wheel-label">${opt.label}</span>
      <span class="wheel-count">${count}×</span>
    `;
    list.appendChild(li);
  });
}

// ----------- RECENT ACTIVITY -----------
function renderRecentActivity(days) {
  const list = document.getElementById('activity-list');
  if (days.length === 0) {
    list.innerHTML = '<li class="activity-empty">Series hasn\'t started yet.</li>';
    return;
  }
  // 3 most recent days
  const recent = days.slice(-3).reverse();
  list.innerHTML = '';
  recent.forEach((d) => {
    const isSC = d.wheelResult && d.wheelResult.includes('SC');
    const dotClass = isSC ? 'purple' : 'gold';
    const vaultBit = d.dailyVaultAdd
      ? `Day ${d.day} added <b>${fmtCurrency(d.dailyVaultAdd)}</b> to the vault`
      : `Day ${d.day} logged`;
    const wheelBit = d.wheelResult ? `Wheel: ${d.wheelResult}` : 'No wheel result';
    const dateBit = fmtMediumDate(dayToDate(d.day));

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="activity-dot ${dotClass}"></span>
      <div>
        <p class="activity-text">${vaultBit}</p>
        <p class="activity-meta">${wheelBit} · ${dateBit}</p>
      </div>
    `;
    list.appendChild(li);
  });
}

// ----------- MYSTERY GIFTS -----------
function renderMystery(days) {
  const section = document.getElementById('mystery-section');
  const grid = document.getElementById('mystery-grid');
  const gifts = days.filter((d) => d.mysteryGift && d.mysteryGift.trim());
  if (gifts.length === 0) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = '';
  gifts.forEach((d) => {
    const item = document.createElement('div');
    item.className = 'mystery-item';
    item.innerHTML = `
      <p class="mystery-day">Day ${d.day} · ${fmtMediumDate(dayToDate(d.day))}</p>
      <p class="mystery-desc">${escapeHtml(d.mysteryGift)}</p>
    `;
    grid.appendChild(item);
  });
}

// ----------- DAILY LOG TABLE -----------
function renderDailyLog(days) {
  const body = document.getElementById('log-body');
  if (days.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="log-empty">No data yet — check back after Day 1.</td></tr>';
    return;
  }
  // newest first
  const reversed = days.slice().reverse();
  body.innerHTML = '';
  reversed.forEach((d) => {
    const tr = document.createElement('tr');
    const pillClass = d.wheelResult
      ? (d.wheelResult.includes('SC') ? 'is-sc' : (d.wheelResult.startsWith('+$') ? 'is-cash' : 'is-other'))
      : 'is-other';
    const wheelCell = d.wheelResult
      ? `<span class="wheel-pill ${pillClass}">${escapeHtml(d.wheelResult)}</span>`
      : '—';
    const vodCell = d.videoUrl
      ? `<a class="vod-link" href="${escapeAttr(d.videoUrl)}" target="_blank" rel="noopener" aria-label="Watch day ${d.day} video">
           <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
             <rect x="2" y="6" width="20" height="12" rx="3"/><path d="M10 9 L16 12 L10 15 Z" fill="currentColor"/>
           </svg>
         </a>`
      : '<span style="color: var(--text-dim);">—</span>';

    tr.innerHTML = `
      <td class="col-day">${d.day}</td>
      <td class="col-date">${fmtShortDate(dayToDate(d.day))}</td>
      <td class="col-vault">${fmtCurrency(d.dailyVaultAdd)}</td>
      <td class="col-wheel">${wheelCell}</td>
      <td class="col-vod">${vodCell}</td>
    `;
    body.appendChild(tr);
  });
}

// ----------- LAST UPDATED -----------
function renderLastUpdated(iso) {
  if (!iso) return;
  const d = new Date(iso);
  document.getElementById('last-updated').textContent = d.toLocaleString();
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function fmtCurrency(n) {
  const v = Math.round(n || 0);
  return '$' + v.toLocaleString('en-US');
}

function fmtSC(n) {
  const v = Math.round(n || 0);
  return v.toLocaleString('en-US') + ' SC';
}

function dayToDate(dayNum) {
  // Parse YYYY-MM-DD as local date (avoid timezone shift)
  const [y, m, d] = CONFIG.startDate.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + (dayNum - 1));
  return start;
}

function fmtShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMediumDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// ============================================================
// COUNT-UP ANIMATION
// ============================================================
function countUp(el, target, formatter) {
  const start = parseFloat(el.dataset.value || '0');
  const duration = 900;
  const t0 = performance.now();

  function frame(t) {
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
    const v = start + (target - start) * eased;
    el.textContent = formatter(v);
    if (p < 1) requestAnimationFrame(frame);
    else { el.dataset.value = target; el.textContent = formatter(target); }
  }
  requestAnimationFrame(frame);
}
