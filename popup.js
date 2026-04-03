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
  loadingOverlay: document.getElementById('loadingOverlay')
};

let currentUni = 'ntu';
let selectedDept = null;
let fIdx = -1;
let uFIdx = -1;
let results = [];

// --- Utils ---
const cleanName = (t) => {
  let s = t
    .replace(/^\[[^\]]+\]/, '')      // 1. 移除開頭的 [學院] 或 [類別]
    .replace(/^[0-9A-Z]+\s*/, '')    // 2. 移除開頭的 數位/代號編號 (如 101, 411P)
    .replace(/\[[A-Z0-9]+\]$/, '')   // 3. 移除結尾的 [編號] (如 [371])
    .trim();

  // 4. 統一組別格式：將結尾的 (一般生) 或 [乙組] 或直接接在後面的「甲組」統一為 「 [組別]」
  // 首先匹配括號 ( ) [ ] { }
  s = s.replace(/[\(\[{(]([^)\]}]+)[\)\]})]\s*$/, ' [$1]');

  // 如果後面沒括號，但有「甲組/乙組...」等字眼，也補上括號
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

// Cache for pre-cleaned dept names to avoid redundant regex calls in search
let processedDeptsMap = {};

const preProcessDepts = (uniId) => {
  if (processedDeptsMap[uniId]) return processedDeptsMap[uniId];
  const depts = UNIVERSITY_DATA[uniId].depts;
  // Pre-calculate clean names and lower-case search strings
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

// --- Core Logic ---
const init = () => {
  chrome.storage.local.get(['lastUni'], (d) => {
    if (d.lastUni) { 
      currentUni = d.lastUni; 
      updateUniUI(currentUni);
      preProcessDepts(currentUni); // Pre-warm the cache
    }
    renderList();
  });

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

  // 效能優化：加入 60ms 防抖
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
    const opts = Array.from(el.uniOptions.querySelectorAll('.option'));
    uFIdx = opts.findIndex(o => o.dataset.value === currentUni);
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
  preProcessDepts(val); // 預處裡該大學的科系緩存
  el.deptSearch.value = '';
  hideResults();
  toggleUni(false);
  renderList();
};

const updateUniUI = (id) => {
  const cfg = UNIVERSITY_DATA[id];
  const opt = el.uniOptions.querySelector(`.option[data-value="${id}"]`);
  const isClosed = opt && opt.classList.contains('disabled');
  
  if (isClosed) {
    el.currentUniName.innerHTML = `${cfg.name} (${id.toUpperCase()}) <span class="closed-note trigger">系統關閉</span>`;
  } else {
    el.currentUniName.textContent = `${cfg.name} (${id.toUpperCase()})`;
  }
  
  el.uniOptions.querySelectorAll('.option').forEach(o => o.classList.toggle('selected', o.dataset.value === id));
};

const showResults = (q) => {
  const depts = preProcessDepts(currentUni); // 使用預處裡的資料集 (O(1) 緩存)
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

const handleAdd = async () => {
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
          hideResults(); // 新增成功後自動收合列表
          showBtnFeedback('success');
        });
      } else {
        hideResults(); // 即使重複也收合列表，並給予視覺提示
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
      // 判定是否需要播放進場動畫：或者是初次開場，或者是新加入的項目
      const shouldAnimate = isInitialRender || !lastListKeys.has(o.key);
      const animationClass = shouldAnimate ? 'entering' : '';
      const delay = shouldAnimate ? (isInitialRender ? (0.24 + i * 0.05) : 0) : 0;
      const delayStyle = delay ? `style="animation-delay:${delay}s"` : '';

      return `
        <div class="card-wrapper ${animationClass}" ${delayStyle}>
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

    // 渲染後更新狀態
    isInitialRender = false;
    lastListKeys = newListKeys;

    el.listContainer.querySelectorAll('.btn-search').forEach((b, i) => b.onclick = () => {
      showLoading(true);
      chrome.runtime.sendMessage({ action: "go", id: list[i].val, uni: list[i].uniId, url: list[i].uni.url });
    });

    el.listContainer.querySelectorAll('.btn-del').forEach((b, i) => b.onclick = (e) => {
      const wrapper = e.target.closest('.card-wrapper');
      // 1. 先播放離場動畫
      wrapper.classList.add('removing');


      // 2. 動畫結束後（300ms）再真正更新數據與 UI
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