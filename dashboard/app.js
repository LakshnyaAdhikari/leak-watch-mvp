// app.js - LeakWatch Dashboard logic (connects to ws://127.0.0.1:8080/ws)

(() => {
  const WS_URL = 'ws://127.0.0.1:8080/ws';
  const ACTION_URL = 'http://127.0.0.1:8080/action';
  let socket; // ✅ defined early to avoid reference errors

  const state = {
    alerts: [],
    log: [],
    blockedDomains: new Set(JSON.parse(localStorage.getItem('lw_blockedDomains') || '[]')),
    weeklyCounts: JSON.parse(localStorage.getItem('lw_weekly') || '{}'),
    blockedAttempts: [],
    topDestMap: {},
    counts: { total: 0, blocked: 0, allowed: 0 },
  };

  // DOM elements
  const connStatusEl = document.getElementById('connStatus');
  const alertsEl = document.getElementById('alerts');
  const logEl = document.getElementById('log');
  const statTotal = document.getElementById('statTotal');
  const statBlocked = document.getElementById('statBlocked');
  const statAllowed = document.getElementById('statAllowed');
  const statActive = document.getElementById('statActive');
  const blockedListEl = document.getElementById('blockedList');
  const blockedAttemptsEl = document.getElementById('blockedAttempts');
  const topDestEl = document.getElementById('topDest');
  const weeklyCanvas = document.getElementById('weeklyChart');
  const weeklyCtx = weeklyCanvas.getContext('2d');
  const riskDonut = document.getElementById('riskDonut');
  const riskCtx = riskDonut.getContext('2d');

  // ====== INIT ======
  init();
  function init() {
    renderBlockedList();
    connectWS();
    setupUI();
    drawWeeklyChart();
    drawRiskDonut();
    updateStats();
  }

  // ====== WEBSOCKET ======
  function connectWS() {
    socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      connStatusEl.textContent = 'Connected';
      addLog('✅ Connected to backend WebSocket');
      console.log('WebSocket connected');
    };
    socket.onclose = () => {
      connStatusEl.textContent = 'Disconnected';
      console.warn('WebSocket closed');
    };
    socket.onerror = (e) => {
      connStatusEl.textContent = 'Error';
      console.error('WebSocket error:', e);
    };
    socket.onmessage = (ev) => handleMessage(ev.data);
  }

  // ====== HANDLE INCOMING EVENTS ======
  function handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      addLog('Malformed message: ' + raw);
      return;
    }

    addLog(JSON.stringify(msg));

    if (msg.type === 'extension-event') {
      pushLog({ type: 'extension-event', evt: msg.evt || msg });
    } else if (msg.type === 'proxy-event') {
      // 💡 Auto-detect backend message structure
      const pEvent = msg.pEvent || msg.event || {};
      const correlation =
        msg.correlation ||
        (msg.correlated
          ? { confidence: 0.9, clipboard: { page: pEvent.page || 'unknown' } }
          : null);

      pushLog({ type: 'proxy-event', pEvent, correlation });

      if (correlation) {
        createAlert({ pEvent, correlation });
        incrementCountForToday();
        updateTopDest(pEvent && pEvent.host);
        drawWeeklyChart();
        drawRiskDonut();
      }
    } else if (msg.type === 'blocked-attempt') {
      pushLog({ type: 'blocked-attempt', pEvent: msg.pEvent });
      state.blockedAttempts.unshift(msg.pEvent);
      if (state.blockedAttempts.length > 10) state.blockedAttempts.pop();
      renderBlockedAttempts();
    } else if (msg.type === 'action') {
      addLog('Action: ' + JSON.stringify(msg));
    }
    updateStats();
  }

  // ====== LOGGING ======
  function addLog(msg) {
    const t = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'log-line';
    div.innerHTML = `<strong>${t}</strong> — ${escapeHtml(msg)}`;
    logEl.prepend(div);
  }

  function pushLog(line) {
    const entry = { ts: Date.now(), ...line };
    state.log.unshift(entry);
    if (state.log.length > 500) state.log.pop();
    renderLog();
  }

  function renderLog() {
    logEl.innerHTML = '';
    for (let i = 0; i < Math.min(state.log.length, 200); i++) {
      const l = state.log[i];
      const div = document.createElement('div');
      div.className = 'log-line';
      div.innerHTML = `<strong>${new Date(l.ts).toLocaleTimeString()}</strong> — ${escapeHtml(
        l.type
      )} ${escapeHtml(JSON.stringify(l.pEvent || l.evt || ''))}`;
      div.onclick = () => openModalFromLog(l);
      logEl.appendChild(div);
    }
  }

  // ====== ALERT CARDS ======
  function createAlert(evtMsg) {
    const corr = evtMsg.correlation || null;
    const pEvent = evtMsg.pEvent || evtMsg.event || evtMsg.proxy;
    const alert = {
      id: 'a_' + Math.random().toString(36).slice(2, 9),
      ts: Date.now(),
      pEvent,
      correlation: corr,
      risk: classifyRisk(corr?.confidence || 0.6),
      status: 'active',
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > 200) state.alerts.pop();
    renderAlerts();
  }

  function classifyRisk(conf) {
    if (conf >= 0.8) return 'high';
    if (conf >= 0.55) return 'med';
    return 'low';
  }

  function renderAlerts() {
    alertsEl.innerHTML = '';
    const filtered = state.alerts.filter((a) => a.status === 'active');
    filtered.forEach((a) => {
      const host = a.pEvent && a.pEvent.host ? a.pEvent.host.split(':')[0] : 'unknown';
      const page = a.correlation?.clipboard?.page || 'unknown';
      const conf = Math.round((a.correlation?.confidence || 0) * 100);
      const card = document.createElement('div');
      card.className = 'alert-card';
      const color =
        a.risk === 'high'
          ? 'linear-gradient(180deg,#ff7b7b,#ff4b6e)'
          : a.risk === 'med'
          ? 'linear-gradient(180deg,#ffb86b,#ff9a3c)'
          : 'linear-gradient(180deg,#80f3b5,#2bd68b)';
      card.innerHTML = `
        <div class="alert-left" style="background:${color}"></div>
        <div class="alert-main">
          <div class="alert-row">
            <div>
              <div class="alert-title">${escapeHtml(host)} <span class="muted">• ${escapeHtml(page)}</span></div>
              <div class="alert-meta">Confidence ${conf}% — likely data exfiltration</div>
            </div>
            <div style="text-align:right">
              <div class="badge ${a.risk}">${a.risk.toUpperCase()}</div>
              <div class="muted" style="margin-top:8px;font-size:12px">${new Date(a.ts).toLocaleTimeString()}</div>
            </div>
          </div>
          <div class="alert-actions">
            <button class="btn warn" onclick="onBlockDomain('${a.id}')">Block Domain</button>
            <button class="btn" onclick="onBlockExtension('${a.id}')">Block Extension</button>
            <button class="btn primary" onclick="openDetails('${a.id}')">Details</button>
            <button class="btn ghost" onclick="markAllowed('${a.id}')">Allow</button>
          </div>
        </div>`;
      alertsEl.appendChild(card);
    });
    statActive.textContent = state.alerts.filter((a) => a.status === 'active').length;
  }

  // ====== ACTIONS ======
  function onBlockDomain(alertId) {
    const a = state.alerts.find((x) => x.id === alertId);
    if (!a) return;
    const host = a.pEvent && a.pEvent.host ? a.pEvent.host.split(':')[0] : null;
    if (!host) return;
    performAction('block-domain', host);
    a.status = 'resolved';
    state.counts.blocked++;
    state.blockedDomains.add(host);
    persistBlocked();
    renderBlockedList();
    renderAlerts();
    updateStats();
  }

  function onBlockExtension(alertId) {
    const a = state.alerts.find((x) => x.id === alertId);
    if (!a) return;
    const ext =
      a.correlation?.clipboard?.source ||
      (a.pEvent && a.pEvent.headers && a.pEvent.headers['x-fake-extension-id']) ||
      null;
    if (!ext) {
      onBlockDomain(alertId);
      return;
    }
    performAction('block-extension', null, ext);
    a.status = 'resolved';
    state.counts.blocked++;
    renderAlerts();
    updateStats();
  }

  function markAllowed(alertId) {
    const a = state.alerts.find((x) => x.id === alertId);
    if (!a) return;
    a.status = 'resolved';
    state.counts.allowed++;
    renderAlerts();
    updateStats();
  }

  // ====== MODAL ======
  function openDetails(alertId) {
    const a = state.alerts.find((x) => x.id === alertId);
    if (!a) return openModalFromLog({ msg: 'not found' });
    openModal(a);
  }

  function openModalFromLog(logEntry) {
    const modal = document.getElementById('modalBackdrop');
    const body = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = 'Event details';
    body.innerHTML = `<pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(logEntry, null, 2))}</pre>`;
    modal.style.display = 'flex';
  }

  function openModal(a) {
    const modal = document.getElementById('modalBackdrop');
    const body = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = 'Alert details';
    body.innerHTML = `
      <div><strong>Destination</strong>: ${escapeHtml(a.pEvent?.host || 'unknown')}</div>
      <div><strong>Page</strong>: ${escapeHtml(a.correlation?.clipboard?.page || 'unknown')}</div>
      <div><strong>Confidence</strong>: ${Math.round((a.correlation?.confidence || 0) * 100)}%</div>
      <div style="margin-top:8px"><strong>Body preview</strong>:</div>
      <pre style="white-space:pre-wrap;background:rgba(255,255,255,0.02);padding:8px;border-radius:6px;color:#bfcbd9">${escapeHtml(a.pEvent?.bodyPreview || '')}</pre>`;
    document.getElementById('modalBlock').onclick = () => {
      onBlockDomain(a.id);
      closeModal();
    };
    document.getElementById('modalBlockExt').onclick = () => {
      onBlockExtension(a.id);
      closeModal();
    };
    document.getElementById('modalAllow').onclick = () => {
      markAllowed(a.id);
      closeModal();
    };
    modal.style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modalBackdrop').style.display = 'none';
  }

  // ====== HELPERS ======
  function performAction(action, domain, extensionId) {
    const body = { action };
    if (domain) body.domain = domain;
    if (extensionId) body.extensionId = extensionId;
    fetch(ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((j) => addLog('Action result: ' + JSON.stringify(j)))
      .catch((e) => addLog('Action error: ' + e));
  }

  function renderBlockedList() {
    blockedListEl.innerHTML = '';
    const arr = Array.from(state.blockedDomains);
    if (arr.length === 0) {
      blockedListEl.innerHTML = '<div class="muted">No blocked domains</div>';
      return;
    }
    arr.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<div class="muted">${escapeHtml(d)}</div><div><button class="btn" onclick="unblockDomain('${d}')">Unblock</button></div>`;
      blockedListEl.appendChild(el);
    });
  }

  window.unblockDomain = function (d) {
    state.blockedDomains.delete(d);
    persistBlocked();
    performAction('unblock-domain', d);
    renderBlockedList();
    addLog('Unblocked ' + d);
  };

  function persistBlocked() {
    localStorage.setItem('lw_blockedDomains', JSON.stringify(Array.from(state.blockedDomains)));
  }

  function renderBlockedAttempts() {
    blockedAttemptsEl.innerHTML = '';
    state.blockedAttempts.slice(0, 8).forEach((a) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<div>${escapeHtml(a.host || 'unknown')}</div><div class="muted">${new Date(
        a.ts || Date.now()
      ).toLocaleTimeString()}</div>`;
      blockedAttemptsEl.appendChild(el);
    });
  }

  function updateTopDest(host) {
    if (!host) return;
    const key = host.split(':')[0];
    state.topDestMap[key] = (state.topDestMap[key] || 0) + 1;
    renderTopDest();
  }

  function renderTopDest() {
    topDestEl.innerHTML = '';
    Object.entries(state.topDestMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .forEach(([k, v]) => {
        const el = document.createElement('div');
        el.className = 'list-item';
        el.innerHTML = `<div style="font-weight:700">${escapeHtml(k)}</div><div class="muted">${v}</div>`;
        topDestEl.appendChild(el);
      });
  }

  function incrementCountForToday() {
    const key = isoDate(new Date());
    state.weeklyCounts[key] = (state.weeklyCounts[key] || 0) + 1;
    localStorage.setItem('lw_weekly', JSON.stringify(state.weeklyCounts));
    state.counts.total++;
  }

  function drawWeeklyChart() {
    const ctx = weeklyCtx;
    const w = weeklyCanvas.width,
      h = weeklyCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(new Date().getDate() - i);
      days.push(isoDate(d));
    }
    const vals = days.map((k) => state.weeklyCounts[k] || 0);
    const maxv = Math.max(1, ...vals);
    const pad = 18;
    const barW = ((w - pad * 2) / vals.length) * 0.66;
    const gap = ((w - pad * 2) / vals.length) * 0.34;
    vals.forEach((v, i) => {
      const bx = pad + i * (barW + gap);
      const by = h - pad;
      const bh = Math.round((v / maxv) * (h - pad * 2));
      ctx.fillStyle = 'rgba(88,166,255,0.95)';
      ctx.fillRect(bx, by - bh, barW, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '11px Arial';
      ctx.fillText(shortWeekLabel(days[i]), bx, h - 4);
      ctx.fillText(String(v), bx, by - bh - 6);
    });
  }

  function drawRiskDonut() {
    const ctx = riskCtx;
    ctx.clearRect(0, 0, riskDonut.width, riskDonut.height);
    const total = state.alerts.filter((a) => a.status === 'active').length || 1;
    const high = state.alerts.filter((a) => a.risk === 'high' && a.status === 'active').length;
    const med = state.alerts.filter((a) => a.risk === 'med' && a.status === 'active').length;
    const low = state.alerts.filter((a) => a.risk === 'low' && a.status === 'active').length;
    let start = -Math.PI / 2;
    const drawSlice = (fraction, color) => {
      const end = start + fraction * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(riskDonut.width / 2, riskDonut.height / 2);
      ctx.arc(riskDonut.width / 2, riskDonut.height / 2, 60, start, end);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      start = end;
    };
    drawSlice(high / total, '#ff6b6b');
    drawSlice(med / total, '#ffb86b');
    drawSlice(low / total, '#2bd68b');
    ctx.beginPath();
    ctx.fillStyle = '#0f1724';
    ctx.arc(riskDonut.width / 2, riskDonut.height / 2, 36, 0, 2 * Math.PI);
    ctx.fill();
  }

  function setupUI() {
    document.getElementById('addBlock').addEventListener('click', () => {
      const v = document.getElementById('wlInput').value.trim();
      if (!v) return;
      state.blockedDomains.add(v);
      persistBlocked();
      performAction('block-domain', v);
      renderBlockedList();
      addLog('Blocked manual ' + v);
    });

    document.getElementById('globalSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderAlerts();
        return;
      }
      const matched = state.alerts.filter((a) => {
        const host = (a.pEvent && a.pEvent.host || '').toLowerCase();
        const page = (a.correlation && a.correlation.clipboard && a.correlation.clipboard.page || '').toLowerCase();
        return host.includes(q) || page.includes(q);
      });
      alertsEl.innerHTML = '';
      matched.forEach((a) => {
        const item = document.createElement('div');
        item.className = 'alert-card';
        item.textContent = `${a.pEvent?.host || 'unknown'} • ${a.correlation?.clipboard?.page || ''}`;
        alertsEl.appendChild(item);
      });
    });

    renderBlockedAttempts();
    renderTopDest();
  }

  function updateStats() {
    statTotal.textContent =
      Object.keys(state.weeklyCounts).reduce((s, k) => s + state.weeklyCounts[k], 0) ||
      state.counts.total ||
      0;
    statBlocked.textContent = state.counts.blocked || 0;
    statAllowed.textContent = state.counts.allowed || 0;
    statActive.textContent = state.alerts.filter((a) => a.status === 'active').length;
  }

  function isoDate(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function shortWeekLabel(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  window.onBlockDomain = onBlockDomain;
  window.onBlockExtension = onBlockExtension;
  window.markAllowed = markAllowed;
})();

// === ENHANCED PROFILE DROPDOWN LOGIC ===
document.addEventListener('DOMContentLoaded', () => {
  const profile = document.getElementById('profileDropdown');
  const dropdown = document.getElementById('dropdownMenu');
  const scoreBar = document.getElementById('scoreBarFill');
  const scoreNum = document.getElementById('securityScore');
  let dropdownOpen = false;

  if (!profile || !dropdown) return;

  profile.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
    dropdown.style.display = dropdownOpen ? 'block' : 'none';
  });

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
    dropdownOpen = false;
  });

  setInterval(() => {
    const score = 70 + Math.floor(Math.random() * 30);
    scoreNum.textContent = score;
    scoreBar.style.width = score + '%';
  }, 10000);

  window.openMyAccount = () => {
    alert('👤 My Account\n\nName: Alex Patel\nEmail: alex.patel@leakwatch.ai\nDevice: Chrome Desktop');
    dropdown.style.display = 'none';
  };

  window.openSecuritySettings = () => {
    alert('🔐 Security Settings\n\n- Hash sensitive text: ON\n- Retention: 30 days\n- Desktop alerts: ENABLED');
    dropdown.style.display = 'none';
  };

  window.openIncidentReports = () => {
    alert('📁 Incident Reports\n\n1. [11/09/25] Blocked api.writeassist.io\n2. [11/08/25] Allowed grammarfixer.ai');
    dropdown.style.display = 'none';
  };

  window.downloadReport = () => {
    alert('📄 Weekly Report Generated.');
    dropdown.style.display = 'none';
  };

  window.openNotifications = () => {
    alert('🔔 Notifications\n\nAlert sound: ON\nPopup on High risk: ENABLED');
    dropdown.style.display = 'none';
  };

  window.openHelp = () => {
    alert('❓ Help\nVisit docs.leakwatch.ai for detailed guide.');
    dropdown.style.display = 'none';
  };

  window.openAbout = () => {
    alert('ℹ️ LeakWatch v1.0 — Team EcoVive');
    dropdown.style.display = 'none';
  };

  window.logout = () => {
    if (confirm('Are you sure you want to log out?')) {
      alert('🚪 Logged out successfully.');
      dropdown.style.display = 'none';
    }
  };
});
