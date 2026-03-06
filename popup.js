const listContainer = document.getElementById('listContainer');
const deptSelect = document.getElementById('deptSelect');
const addBtn = document.getElementById('addBtn');

// 讀取存好的系所
chrome.storage.local.get(['myDepts'], (data) => {
  const depts = data.myDepts || [];
  depts.forEach(d => renderDept(d));
});

// 新增按鈕
addBtn.addEventListener('click', () => {
  const val = deptSelect.value;
  const text = deptSelect.options[deptSelect.selectedIndex].text;
  
  chrome.storage.local.get(['myDepts'], (data) => {
    let depts = data.myDepts || [];
    if (!depts.find(item => item.val === val)) {
      depts.push({ val, text });
      chrome.storage.local.set({ myDepts: depts }, () => renderDept({ val, text }));
    }
  });
});

function renderDept(dept) {
  const item = document.createElement('div');
  item.className = 'card';
  item.innerHTML = `
    <span class="dept-name">${dept.text}</span>
    <div class="button-group">
      <button class="btn-search" data-id="${dept.val}">查詢</button>
      <button class="btn-del" data-id="${dept.val}">🗑️</button>
    </div>
  `;
  listContainer.appendChild(item);

  // 點擊查詢：傳訊息給 background
  item.querySelector('.btn-search').onclick = () => {
    chrome.runtime.sendMessage({ action: "go", id: dept.val });
  };

  // 點擊刪除
  item.querySelector('.btn-del').onclick = () => {
    chrome.storage.local.get(['myDepts'], (data) => {
      const depts = data.myDepts.filter(i => i.val !== dept.val);
      chrome.storage.local.set({ myDepts: depts }, () => item.remove());
    });
  };
}