import { UNIVERSITY_DATA } from './data.js';

const el = {
  uniSelector: document.getElementById('uniSelector'),
  currentUniName: document.getElementById('currentUniName'),
  uniOptions: document.getElementById('uniOptions'),
  searchContainer: document.querySelector('.search-container'),
  deptSearch: document.getElementById('deptSearch'),
  searchResults: document.getElementById('searchResults'),
  addBtn: document.getElementById('addBtn'),
  listContainer: document.getElementById('listContainer'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  announcementBanner: document.getElementById('announcementBanner'),
  announcementBtn: document.getElementById('announcementBtn')
};

let currentUni = 'ntu';
let selectedDept = null;
let fIdx = -1;
let uFIdx = -1;
let results = [];

// --- Utils ---
const cleanName = (t) => {
  let s = t
    .replace(/^\[[^\]]+\]/, '')
    .replace(/^[0-9A-Z]+\s*/, '')
    .replace(/\[[A-Z0-9]+\]$/, '')
    .trim();

  s = s.replace(/[\(\[{(]([^\)\\]}]+)[\)\]})]\\s*$/, ' [$1]');

  if (!s.includes(' [')) {
    s = s.replace(/(甲組|乙組|丙組|丁組|戊組|己組|庚組|辛組|壬組|癸組)\s*$/, ' [$1]');
  }

  return s.trim();
};

const showLoading = (s) => el.loadingOverlay.classList.toggle('active', s);

const showBtnFeedback = (type) => {
  const original = el.addBtn.textContent;
  if (type === 'success') {
    el.addBtn.textContent = '✓';
    el.addBtn.classList.add('success');
    setTimeout(() => { el.addBtn.textContent = original; el.addBtn.classList.remove('success'); }, 1000);
  } else {
    el.addBtn.classList.add('shake');
    setTimeout(() => el.addBtn.classList.remove('shake'), 400);
  }
};

let processedDeptsMap = {};

const preProcessDepts = (uniId) => {
  if (processedDeptsMap[uniId]) return processedDeptsMap[uniId];
  const depts = UNIVERSITY_DATA[uniId].depts;
  processedDeptsMap[uniId] = depts.map(d => ({
    ...d,
    clean: cleanName(d.text),
    searchStr: d.text.toLowerCase() + '|' + d.val.toLowerCase()
  }));
  return processedDeptsMap[uniId];
};

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// --- Announcement Banner ---
const DISMISSED_KEY = 'dismissedAnnouncements';
let currentAnnouncements = [];

const renderAnnouncements = (annList, forceShow = false) => {
  if (!annList || !annList.length) { el.announcementBanner.innerHTML = ''; return; }

  currentAnnouncements = annList;

  chrome.storage.local.get([DISMISSED_KEY], (d) => {
    const dismissed = d[DISMISSED_KEY] || [];
    const toShow = forceShow ? annList : annList.filter(a => !dismissed.includes(a.id));
    const hasNew = annList.some(a => !dismissed.includes(a.id));

    el.announcementBtn.classList.toggle('has-new', hasNew);

    if (!toShow.length) { el.announcementBanner.innerHTML = ''; return; }

    el.announcementBanner.innerHTML = toShow.map((ann, idx) => {
      const type = ann.type || 'info';
      const icon = type === 'warning' ? '⚠️' : type === 'update' ? '🎉' : 'ℹ️';
      const linkBtn = ann.link
        ? `<a class="announcement-action-icon" href="${ann.link}" target="_blank" title="前往更新" aria-label="前往更新連結">↗</a>`
        : '';
      const dismissBtn = ann.dismissible !== false
        ? `<button class="announcement-dismiss-icon" data-ann-id="${ann.id}" title="已讀" aria-label="關閉公告">×</button>`
        : '';

      return `
        <div class="announcement" data-type="${type}" data-id="${ann.id}" style="animation-delay: ${idx * 0.12}s">
          <div class="announcement-icon-fixed">${icon}</div>
          <div class="announcement-marquee-viewport">
            <div class="announcement-track">
              <span class="announcement-text"><strong>${ann.title}</strong> ${ann.message}&nbsp;&nbsp;&nbsp;&nbsp;</span>
            </div>
          </div>
          <div class="announcement-actions-hover">
            ${linkBtn}
            ${dismissBtn}
          </div>
        </div>`;
    }).join('');

    el.announcementBanner.querySelectorAll('.announcement-dismiss-icon').forEach(btn => {
      btn.onclick = () => {
        const annId = btn.dataset.annId;
        const banner = btn.closest('.announcement');
        banner.classList.add('dismissing');
        setTimeout(() => {
          banner.remove();
          const updated = [...dismissed, annId];
          chrome.storage.local.set({ [DISMISSED_KEY]: updated });
          if (annList.every(a => updated.includes(a.id))) {
            el.announcementBtn.classList.remove('has-new');
          }
        }, 350);
      };
    });

    requestAnimationFrame(() => {
      el.announcementBanner.querySelectorAll('.announcement-track').forEach(track => {
        const viewport = track.closest('.announcement-marquee-viewport');
        if (!viewport) return;

        const vWidth = viewport.offsetWidth;
        const tWidth = track.scrollWidth;
        const speed = 48;
        const duration = (vWidth + tWidth) / speed;

        track.style.setProperty('--marquee-start', `${vWidth}px`);
        track.style.setProperty('--marquee-end', `-${tWidth}px`);
        track.style.setProperty('--marquee-duration', `${duration}s`);

        track.style.animation = 'none';
        track.offsetHeight;
        track.style.animation = '';
      });
    });
  });
};

// --- Remote Config ---
// [PUBLISH_CHECK] 打包發布前請務必切換回 GitHub 連結
// const REMOTE_CONFIG_URL = 'https://raw.githubusercontent.com/DanielLiangYEE/NCKU-Result-Checker-Extension/main/remote_config.json';
const REMOTE_CONFIG_URL = chrome.runtime.getURL('remote_config.json');
const REMOTE_CONFIG_KEY = 'remoteConfig';

const applyRemoteConfig = (config) => {
  if (!config?.universities) return;

  el.uniOptions.querySelectorAll('.option').forEach(opt => {
    const uniCfg = config.universities[opt.dataset.value];
    if (!uniCfg) return;

    const existingNote = opt.querySelector('.closed-note');

    if (uniCfg.closed) {
      opt.classList.add('disabled');
      if (!existingNote) {
        const note = document.createElement('span');
        note.className = 'closed-note';
        note.textContent = uniCfg.closedReason || '系統暫時關閉';
        opt.appendChild(note);
      } else {
        existingNote.textContent = uniCfg.closedReason || '系統暫時關閉';
      }
    } else {
      opt.classList.remove('disabled');
      if (existingNote) existingNote.remove();
    }
  });

  const announcements = config.announcements || (config.announcement ? [config.announcement] : []);
  if (announcements.length) renderAnnouncements(announcements);

  updateUniUI(currentUni);
};

const fetchRemoteConfig = async () => {
  chrome.storage.local.get([REMOTE_CONFIG_KEY], (d) => {
    if (d[REMOTE_CONFIG_KEY]) applyRemoteConfig(d[REMOTE_CONFIG_KEY]);
  });

  try {
    const res = await fetch(`${REMOTE_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const config = await res.json();
    chrome.storage.local.set({ [REMOTE_CONFIG_KEY]: config });
    applyRemoteConfig(config);
  } catch (e) {
    console.debug('[RemoteConfig] Fetch failed, using cache:', e.message);
  }
};

// --- Core Logic ---
const init = () => {
  chrome.storage.local.get(['lastUni'], (d) => {
    if (d.lastUni) {
      currentUni = d.lastUni;
      updateUniUI(currentUni);
      preProcessDepts(currentUni);
    }
    renderList();
  });

  fetchRemoteConfig();

  el.announcementBtn.onclick = () => {
    if (!currentAnnouncements.length) return;
    if (el.announcementBanner.innerHTML !== '') {
      el.announcementBanner.querySelectorAll('.announcement').forEach(b => b.classList.add('dismissing'));
      setTimeout(() => { el.announcementBanner.innerHTML = ''; }, 350);
    } else {
      renderAnnouncements(currentAnnouncements, true);
    }
  };

  const uniTrigger = el.uniSelector.querySelector('.select-trigger');
  uniTrigger.onclick = () => toggleUni();

  uniTrigger.onkeydown = (e) => {
    const active = el.uniSelector.classList.contains('active');
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); active ? confirmUni() : toggleUni(true); }
    else if (e.key === 'ArrowDown' && active) { e.preventDefault(); moveUniFocus(1); }
    else if (e.key === 'ArrowUp' && active) { e.preventDefault(); moveUniFocus(-1); }
    else if (e.key === 'Escape') toggleUni(false);
  };

  el.uniOptions.querySelectorAll('.option').forEach(opt => opt.onclick = () => selectUni(opt.dataset.value));

  const debouncedSearch = debounce((q) => q ? showResults(q) : hideResults(), 60);
  el.deptSearch.oninput = (e) => debouncedSearch(e.target.value.toLowerCase().trim());

  el.deptSearch.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    else if (e.key === 'Enter') handleAdd();
  };

  el.addBtn.onclick = handleAdd;

  document.onclick = (e) => {
    if (!el.searchContainer.contains(e.target)) hideResults();
    if (!el.uniSelector.contains(e.target)) toggleUni(false);
  };

  chrome.runtime.onMessage.addListener((m) => {
    if (m.action === "searching_complete") {
      el.loadingOverlay.classList.add('success');
      setTimeout(() => {
        showLoading(false);
        el.loadingOverlay.classList.remove('success');
      }, 500);
    }
  });
};

const toggleUni = (s) => {
  const active = typeof s === 'boolean' ? s : el.uniSelector.classList.toggle('active');
  el.uniSelector.classList.toggle('active', active);
  if (active) {
    uFIdx = Array.from(el.uniOptions.querySelectorAll('.option')).findIndex(o => o.dataset.value === currentUni);
    updateUniFocusUI();
  } else uFIdx = -1;
};

const moveUniFocus = (d) => {
  const max = el.uniOptions.querySelectorAll('.option').length - 1;
  uFIdx = Math.max(0, Math.min(max, uFIdx + d));
  updateUniFocusUI();
};

const updateUniFocusUI = () => {
  el.uniOptions.querySelectorAll('.option').forEach((o, i) => {
    o.classList.toggle('focused', i === uFIdx);
    if (i === uFIdx) o.scrollIntoView({ block: 'nearest' });
  });
};

const confirmUni = () => {
  const opts = el.uniOptions.querySelectorAll('.option');
  if (uFIdx >= 0 && uFIdx < opts.length) selectUni(opts[uFIdx].dataset.value);
};

const selectUni = (val) => {
  const opt = el.uniOptions.querySelector(`.option[data-value="${val}"]`);
  if (!opt || opt.classList.contains('disabled')) return;

  currentUni = val;
  updateUniUI(val);
  chrome.storage.local.set({ lastUni: val });
  preProcessDepts(val);
  el.deptSearch.value = '';
  hideResults();
  toggleUni(false);
  renderList();
};

const updateUniUI = (id) => {
  const cfg = UNIVERSITY_DATA[id];
  const opt = el.uniOptions.querySelector(`.option[data-value="${id}"]`);
  const isClosed = opt?.classList.contains('disabled');

  if (isClosed) {
    el.currentUniName.innerHTML = `${cfg.name} (${id.toUpperCase()}) <span class="closed-note trigger">系統關閉</span>`;
  } else {
    el.currentUniName.textContent = `${cfg.name} (${id.toUpperCase()})`;
  }

  el.uniOptions.querySelectorAll('.option').forEach(o => o.classList.toggle('selected', o.dataset.value === id));
};

const showResults = (q) => {
  const depts = preProcessDepts(currentUni);
  results = depts.filter(d => d.searchStr.includes(q))
    .sort((a, b) => {
      const as = a.clean.toLowerCase().startsWith(q), bs = b.clean.toLowerCase().startsWith(q);
      return as !== bs ? (as ? -1 : 1) : a.clean.length - b.clean.length;
    }).slice(0, 30);

  if (!results.length) return hideResults();
  fIdx = -1;
  el.searchResults.innerHTML = results.map(d => `<div class="result-item">${d.clean}</div>`).join('');
  el.searchResults.querySelectorAll('.result-item').forEach((item, idx) => {
    item.onmousedown = (e) => e.preventDefault();
    item.onclick = () => { el.deptSearch.value = results[idx].clean; selectedDept = results[idx]; hideResults(); el.deptSearch.focus(); };
  });
  el.searchResults.classList.add('active');
};

const hideResults = () => { el.searchResults.classList.remove('active'); results = []; fIdx = -1; };

const moveFocus = (d) => {
  if (!results.length) return;
  fIdx = Math.max(0, Math.min(results.length - 1, fIdx + d));
  el.searchResults.querySelectorAll('.result-item').forEach((o, i) => {
    o.classList.toggle('focused', i === fIdx);
    if (i === fIdx) o.scrollIntoView({ block: 'nearest' });
  });
};

const handleAdd = () => {
  if (!selectedDept) {
    const q = el.deptSearch.value.trim();
    if (q) selectedDept = results[fIdx >= 0 ? fIdx : 0] || UNIVERSITY_DATA[currentUni].depts.find(d => cleanName(d.text).includes(q));
  }
  if (selectedDept) {
    const key = `savedDepts_${currentUni}`;
    chrome.storage.local.get([key], (d) => {
      const list = d[key] || [];
      if (!list.find(o => o.val === selectedDept.val)) {
        list.push(selectedDept);
        chrome.storage.local.set({ [key]: list }, () => {
          renderList();
          el.deptSearch.value = '';
          selectedDept = null;
          hideResults();
          showBtnFeedback('success');
        });
      } else {
        hideResults();
        showBtnFeedback('shake');
      }
    });
  } else {
    showBtnFeedback('shake');
  }
};

let isInitialRender = true;
let lastListKeys = new Set();

const renderList = () => {
  chrome.storage.local.get(null, (all) => {
    const list = [];
    Object.keys(UNIVERSITY_DATA).forEach(id => {
      const items = all[`savedDepts_${id}`] || [];
      items.forEach(o => list.push({ ...o, uniId: id, uni: UNIVERSITY_DATA[id], key: `${id}_${o.val}` }));
    });

    if (!list.length) {
      el.listContainer.innerHTML = `
        <div class="empty-state">
          <img src="icons/empty_folder.png">
          <div class="empty-state-title">尚無關注科系</div>
          <div class="empty-state-subtitle">開始搜尋並新增吧！</div>
        </div>`;
      isInitialRender = false;
      lastListKeys = new Set();
      return;
    }

    const newListKeys = new Set(list.map(o => o.key));

    el.listContainer.innerHTML = list.map((o, i) => {
      const shouldAnimate = isInitialRender || !lastListKeys.has(o.key);
      const delay = shouldAnimate ? (isInitialRender ? (0.24 + i * 0.05) : 0) : 0;

      return `
        <div class="card-wrapper ${shouldAnimate ? 'entering' : ''}" ${delay ? `style="animation-delay:${delay}s"` : ''}>
          <div class="card" data-key="${o.key}">
            <div class="dept-info">
              <span class="uni-tag" style="background:${o.uni.color}15;color:${o.uni.color};border:1px solid ${o.uni.color}30">${o.uni.short || o.uni.name.slice(0, 2)}</span>
              <div class="dept-name">${cleanName(o.text)}</div>
            </div>
            <div class="button-group">
              <button class="btn-search" data-val="${o.val}" data-uni="${o.uniId}">查詢</button>
              <button class="btn-del" data-val="${o.val}" data-uni="${o.uniId}"><img src="icons/delete.png"></button>
            </div>
          </div>
        </div>`;
    }).join('');

    isInitialRender = false;
    lastListKeys = newListKeys;

    el.listContainer.querySelectorAll('.btn-search').forEach((b, i) => b.onclick = () => {
      showLoading(true);
      chrome.runtime.sendMessage({ action: "go", id: list[i].val, uni: list[i].uniId, url: list[i].uni.url });
    });

    el.listContainer.querySelectorAll('.btn-del').forEach((b, i) => b.onclick = (e) => {
      e.target.closest('.card-wrapper').classList.add('removing');
      setTimeout(() => {
        const key = `savedDepts_${list[i].uniId}`;
        chrome.storage.local.get([key], d => {
          const nList = (d[key] || []).filter(o => o.val !== list[i].val);
          chrome.storage.local.set({ [key]: nList }, renderList);
        });
      }, 300);
    });
  });
};

init();