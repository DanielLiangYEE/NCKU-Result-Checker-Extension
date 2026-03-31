import { UNIVERSITY_DATA } from './data.js';

const elements = {
  uniSelector: document.getElementById('uniSelector'),
  currentUniName: document.getElementById('currentUniName'),
  uniOptions: document.getElementById('uniOptions'),
  searchContainer: document.querySelector('.search-container'),
  deptSearch: document.getElementById('deptSearch'),
  searchResults: document.getElementById('searchResults'),
  addBtn: document.getElementById('addBtn'),
  listContainer: document.getElementById('listContainer')
};

let currentUni = 'ntu';
let selectedDept = null;
let focusedIndex = -1;
let uniFocusedIndex = -1; // 追蹤大學選單的鍵盤選取
let currentResults = [];

// Initialize
function init() {
  chrome.storage.local.get(['lastUni'], (data) => {
    if (data.lastUni) {
      currentUni = data.lastUni;
      updateUniUI(currentUni);
    }
    renderSavedList();
  });

  const uniTrigger = elements.uniSelector.querySelector('.select-trigger');

  // Toggle Uni Selector
  uniTrigger.onclick = () => toggleUniSelector();

  // University Keyboard Navigation
  uniTrigger.addEventListener('keydown', (e) => {
    const isActive = elements.uniSelector.classList.contains('active');

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isActive) {
        toggleUniSelector();
      } else {
        confirmUniSelection();
      }
    } else if (e.key === 'ArrowDown' && isActive) {
      e.preventDefault();
      moveUniFocus(1);
    } else if (e.key === 'ArrowUp' && isActive) {
      e.preventDefault();
      moveUniFocus(-1);
    } else if (e.key === 'Escape' && isActive) {
      elements.uniSelector.classList.remove('active');
      uniFocusedIndex = -1;
      updateUniFocusUI();
    }
  });

  elements.uniOptions.querySelectorAll('.option').forEach((opt, idx) => {
    opt.onclick = () => {
      selectUniversity(opt.dataset.value);
    };
  });

  // Search Logic
  elements.deptSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    selectedDept = null;
    if (!query) {
      hideResults();
      return;
    }
    showResults(query);
  });

  elements.deptSearch.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < currentResults.length) {
        const dept = currentResults[focusedIndex];
        selectDept(dept);
        handleAdd();
      } else {
        handleAdd();
      }
    }
  });

  elements.addBtn.addEventListener('click', handleAdd);

  document.addEventListener('click', (e) => {
    if (!elements.searchContainer?.contains(e.target)) {
      hideResults();
    }
    if (!elements.uniSelector?.contains(e.target)) {
      elements.uniSelector.classList.remove('active');
      uniFocusedIndex = -1;
      updateUniFocusUI();
    }
  });
}

function toggleUniSelector() {
  const isActive = elements.uniSelector.classList.toggle('active');
  if (isActive) {
    // 預設高亮當前選中的大學
    const options = Array.from(elements.uniOptions.querySelectorAll('.option'));
    uniFocusedIndex = options.findIndex(opt => opt.dataset.value === currentUni);
    updateUniFocusUI();
  } else {
    uniFocusedIndex = -1;
    updateUniFocusUI();
  }
}

function moveUniFocus(delta) {
  const options = elements.uniOptions.querySelectorAll('.option');
  uniFocusedIndex += delta;
  // 改為「碰撞邊界」模式，不再循環
  if (uniFocusedIndex < 0) uniFocusedIndex = 0;
  if (uniFocusedIndex >= options.length) uniFocusedIndex = options.length - 1;
  updateUniFocusUI();
}

function updateUniFocusUI() {
  const options = elements.uniOptions.querySelectorAll('.option');
  options.forEach((opt, idx) => {
    if (idx === uniFocusedIndex) {
      opt.classList.add('focused');
      opt.scrollIntoView({ block: 'nearest' });
    } else {
      opt.classList.remove('focused');
    }
  });
}

function confirmUniSelection() {
  const options = elements.uniOptions.querySelectorAll('.option');
  if (uniFocusedIndex >= 0 && uniFocusedIndex < options.length) {
    selectUniversity(options[uniFocusedIndex].dataset.value);
  }
}

function selectUniversity(val) {
  currentUni = val;
  updateUniUI(val);
  chrome.storage.local.set({ lastUni: currentUni });
  elements.deptSearch.value = '';
  hideResults();
  elements.uniSelector.classList.remove('active');
  uniFocusedIndex = -1;
  updateUniFocusUI();
  renderSavedList();
}

function updateUniUI(uniId) {
  const uniCfg = UNIVERSITY_DATA[uniId];
  elements.currentUniName.textContent = `${uniCfg.name} (${uniId.toUpperCase()})`;
  elements.uniOptions.querySelectorAll('.option').forEach(opt => {
    if (opt.dataset.value === uniId) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
}

function moveFocus(delta) {
  if (currentResults.length === 0) return;
  focusedIndex += delta;
  // 改為「碰撞邊界」模式，不再循環
  if (focusedIndex < 0) focusedIndex = 0;
  if (focusedIndex >= currentResults.length) focusedIndex = currentResults.length - 1;
  updateFocusUI();
}

function updateFocusUI() {
  const items = elements.searchResults.querySelectorAll('.result-item');
  items.forEach((item, idx) => {
    if (idx === focusedIndex) {
      item.classList.add('focused');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('focused');
    }
  });
}

function selectDept(dept) {
  elements.deptSearch.value = cleanDeptName(dept.text);
  selectedDept = dept;
  hideResults();
  elements.deptSearch.focus();
}

async function handleAdd() {
  if (!selectedDept) {
    const query = elements.deptSearch.value.toLowerCase().trim();
    if (query) {
      const deptToUse = (focusedIndex >= 0) ? currentResults[focusedIndex] : currentResults[0];
      if (deptToUse) {
        selectedDept = deptToUse;
      } else {
        const depts = UNIVERSITY_DATA[currentUni].depts;
        const filtered = depts.filter(d =>
          d.text.toLowerCase().includes(query) || d.val.toLowerCase().includes(query)
        );
        if (filtered.length > 0) selectedDept = filtered[0];
      }
    }
  }

  if (selectedDept) {
    const isSuccess = await saveDept(selectedDept);
    if (isSuccess) {
      elements.deptSearch.value = '';
      selectedDept = null;
      hideResults();
      showBtnFeedback('success');
    } else {
      showBtnFeedback('shake');
    }
  } else {
    showBtnFeedback('shake');
  }
}

function showBtnFeedback(type) {
  const originalText = elements.addBtn.textContent;
  if (type === 'success') {
    elements.addBtn.textContent = '✓';
    elements.addBtn.classList.add('success');
    setTimeout(() => {
      elements.addBtn.textContent = originalText;
      elements.addBtn.classList.remove('success');
    }, 1000);
  } else if (type === 'shake') {
    elements.addBtn.classList.add('shake');
    setTimeout(() => elements.addBtn.classList.remove('shake'), 400);
  }
}

function cleanDeptName(text) {
  return text.replace(/^\[[^\]]+\]/, '')
    .replace(/^[0-9A-Z]+\s*/, '')
    .replace(/\[\w+\]$/, '');
}

function showResults(query) {
  const depts = UNIVERSITY_DATA[currentUni].depts;

  // 1. 先選出所有符合條件的科系
  const allMatches = depts.filter(d =>
    d.text.toLowerCase().includes(query) || d.val.toLowerCase().includes(query)
  );

  // 2. 智慧排序：開頭匹配 > 文字包含
  allMatches.sort((a, b) => {
    const aText = cleanDeptName(a.text).toLowerCase();
    const bText = cleanDeptName(b.text).toLowerCase();
    const aStarts = aText.startsWith(query);
    const bStarts = bText.startsWith(query);

    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return aText.length - bText.length; // 短的優先 (通常較精準)
  });

  // 3. 擴展上限至 30 個
  currentResults = allMatches.slice(0, 30);

  if (currentResults.length === 0) {
    hideResults();
    return;
  }

  focusedIndex = -1;
  elements.searchResults.innerHTML = '';
  currentResults.forEach((dept, idx) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.textContent = cleanDeptName(dept.text);
    item.onmousedown = (e) => e.preventDefault();
    item.onclick = () => selectDept(dept);
    elements.searchResults.appendChild(item);
  });
  elements.searchResults.classList.add('active');
}

function hideResults() {
  elements.searchResults.classList.remove('active');
  currentResults = [];
  focusedIndex = -1;
}

function saveDept(dept) {
  return new Promise((resolve) => {
    const key = `savedDepts_${currentUni}`;
    chrome.storage.local.get([key], (data) => {
      let list = data[key] || [];
      if (!list.find(d => d.val === dept.val)) {
        list.push(dept);
        chrome.storage.local.set({ [key]: list }, () => {
          renderSavedList();
          resolve(true);
        });
      } else {
        resolve(false);
      }
    });
  });
}

function renderSavedList() {
  chrome.storage.local.get(null, (allData) => {
    let combinedList = [];
    Object.keys(UNIVERSITY_DATA).forEach(uniId => {
      const uniCfg = UNIVERSITY_DATA[uniId];
      const savedKey = `savedDepts_${uniId}`;
      const savedItems = allData[savedKey] || [];
      savedItems.forEach(item => {
        combinedList.push({
          ...item,
          uniId: uniId,
          uniCfg: uniCfg
        });
      });
    });

    elements.listContainer.innerHTML = '';
    if (combinedList.length === 0) {
      elements.listContainer.innerHTML = `
        <div class="empty-state">
          <img src="icons/empty_folder.png" style="width: 35px; height: 35px; margin-bottom: 8px; opacity: 0.5; filter: grayscale(0.1);">
          <div style="font-weight: 600; color: var(--text-primary);">尚無關注科系</div>
          <div style="font-size: 12px; opacity: 0.6; margin-top: 4px;">開始搜尋並點擊「新增」來填滿它吧！</div>
        </div>
      `;
      return;
    }

    combinedList.forEach(item => {
      const { uniId, uniCfg } = item;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="dept-info">
          <span class="uni-tag" style="background: ${uniCfg.color}15; color: ${uniCfg.color}; border: 1px solid ${uniCfg.color}30;">
            ${uniCfg.short || uniCfg.name.substring(0, 2)}
          </span>
          <div class="dept-name">${cleanDeptName(item.text)}</div>
        </div>
        <div class="button-group">
          <button class="btn-search" data-val="${item.val}" data-uni="${uniId}">查詢</button>
          <button class="btn-del" data-val="${item.val}" data-uni="${uniId}">
            <img src="icons/delete.png" alt="刪除">
          </button>
        </div>
      `;

      card.querySelector('.btn-search').onclick = (e) => {
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = '查詢中';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        chrome.runtime.sendMessage({
          action: "go",
          id: item.val,
          uni: uniId,
          url: uniCfg.url
        });
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 1500);
      };

      card.querySelector('.btn-del').onclick = () => {
        deleteDept(item.val, uniId);
      };

      elements.listContainer.appendChild(card);
    });
  });
}

function deleteDept(val, uniId) {
  const key = `savedDepts_${uniId}`;
  chrome.storage.local.get([key], (data) => {
    const list = (data[key] || []).filter(d => d.val !== val);
    chrome.storage.local.set({ [key]: list }, () => renderSavedList());
  });
}

init();