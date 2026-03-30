const UNI_CONFIG = {
  ncku: {
    url: "https://nbk.acad.ncku.edu.tw/netcheckin/index.php?c=quall_rwd",
    func: (id) => {
      const run = (retry = 0) => {
        if (retry > 20) return;
        const s1 = document.querySelector('select');
        if (!s1) { setTimeout(() => run(retry + 1), 500); return; }
        s1.value = "2"; // 碩士班
        s1.dispatchEvent(new Event('change', { bubbles: true }));
        const check = setInterval(() => {
          const s2 = document.querySelectorAll('select')[1];
          if (s2 && s2.options.length > 1) {
            clearInterval(check);
            s2.value = id;
            s2.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => {
              const btn = Array.from(document.querySelectorAll('button, input, a.btn'))
                               .find(b => b.innerText.includes('查詢') || (b.value && b.value.includes('查詢')));
              if (btn) btn.click();
            }, 400);
          }
        }, 500);
      };
      run();
    }
  },
  ntu: {
    url: "https://gra108.aca.ntu.edu.tw/regbchk/stu_query.asp?id=15",
    func: (id) => {
      const run = (retry = 0) => {
        const s = document.querySelector('select[name="DEP"]');
        const btn = document.querySelector('input[name="qry"]');
        if (!s || !btn || s.options.length <= 1) { 
          if (retry < 10) setTimeout(() => run(retry + 1), 500);
          return; 
        }

        const targetId = id.trim();
        const targetSimplified = targetId.replace(/\s/g, '');
        let foundIndex = -1;

        // 1. 第一優先：精準匹配 (包含去掉空格後的完全一致)
        for (let i = 0; i < s.options.length; i++) {
          const optVal = s.options[i].value.trim();
          const optValSimp = optVal.replace(/\s/g, '');
          if (optVal === targetId || optValSimp === targetSimplified) {
            foundIndex = i;
            break;
          }
        }

        // 2. 第二優先：模糊匹配 (如果第一級沒找到)
        if (foundIndex === -1) {
          for (let i = 0; i < s.options.length; i++) {
            const optValSimp = s.options[i].value.replace(/\s/g, '');
            const optTextSimp = s.options[i].text.replace(/\s/g, '');
            if (optValSimp.includes(targetSimplified) || targetSimplified.includes(optValSimp) || optTextSimp.includes(targetSimplified)) {
              foundIndex = i;
              break;
            }
          }
        }

        if (foundIndex !== -1) {
          s.selectedIndex = foundIndex;
          s.value = s.options[foundIndex].value;
          
          // 模擬完整互動事件
          ['mousedown', 'input', 'change', 'blur'].forEach(evt => {
            s.dispatchEvent(new Event(evt, { bubbles: true }));
          });

          // 點擊查詢
          setTimeout(() => {
            btn.click();
          }, 200);
        }
      };
      run();
    }
  },
  nsysu: {
    url: "https://exam2-acad.nsysu.edu.tw/stunew_query/stunew_qry_step1.asp",
    multiStep: true,
    func: (id) => {
      const getDoc = () => {
        // 優先檢查是否有框架，如果沒有則使用當前的 document
        const frames = document.querySelectorAll('frame, iframe');
        for (let f of frames) {
          try {
            if (f.contentDocument && f.contentDocument.querySelector('select')) {
              return f.contentDocument;
            }
          } catch(e) {}
        }
        return document;
      };

      const run = (retry = 0) => {
        if (retry > 20) return;
        const doc = getDoc();
        const url = window.location.href;
        
        if (url.includes('step1.asp')) {
          const s = doc.querySelector('select[name="exam_list"]');
          const btn = Array.from(doc.querySelectorAll('input[type="submit"]'))
                           .find(b => b.value.includes('確定'));
          if (s && btn) {
            s.value = "41";
            ['change', 'input'].forEach(evt => s.dispatchEvent(new Event(evt, { bubbles: true })));
            btn.click();
          } else {
            setTimeout(() => run(retry + 1), 500);
          }
        } else {
          // 第二階段：科系選擇
          const s = doc.querySelector('select[name="sect_no"]');
          const btn = doc.querySelector('input[name="B1"]') || 
                      Array.from(doc.querySelectorAll('input[type="submit"]'))
                           .find(b => b.value.includes('查詢'));
          
          if (s && btn) {
            const targetId = id.toString().trim();
            const getIdPrefix = (str) => {
              const m = str.match(/^\d+/);
              return m ? m[0] : str;
            };
            const targetPrefix = getIdPrefix(targetId);
            
            const options = Array.from(s.options);
            
            // 找數字前綴相同的選項
            const targetOption = options.find(opt => 
              (opt.value && getIdPrefix(opt.value) === targetPrefix) || 
              (opt.text && getIdPrefix(opt.text) === targetPrefix)
            );
            
            if (targetOption && targetOption.value !== "0") {
              s.value = targetOption.value;
              s.selectedIndex = targetOption.index;
              ['change', 'input', 'blur'].forEach(evt => {
                s.dispatchEvent(new Event(evt, { bubbles: true }));
              });
              
              setTimeout(() => {
                btn.click();
              }, 500);
            } else {
              setTimeout(() => run(retry + 1), 500);
            }
          } else {
            setTimeout(() => run(retry + 1), 500);
          }
        }
      };
      setTimeout(() => run(), 500);
    }
  }
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "go") {
    // 優先使用設定檔，若無則嘗試使用傳入的 URL 或預設成大
    const config = UNI_CONFIG[msg.uni] || { url: msg.url || UNI_CONFIG.ncku.url, func: null };
    startProcess(msg.id, config);
  }
});

async function startProcess(deptId, config) {
  try {
    const tab = await chrome.tabs.create({ url: config.url });

    const checkAndInject = (tabId, status) => {
      if (status === 'complete') {
        if (config.func) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: config.func,
            args: [deptId]
          }).catch(err => console.error("Script injection failed:", err));
        }
        return true;
      }
      return false;
    };

    // 立即檢查分頁狀態，解決載入太快錯過監聽的問題
    let stepCount = 0;
    const updateListener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        checkAndInject(tabId, info.status);
        stepCount++;
        if (!config.multiStep || stepCount >= 2) {
          chrome.tabs.onUpdated.removeListener(updateListener);
        }
      }
    };

    chrome.tabs.get(tab.id, (t) => {
      if (checkAndInject(t.id, t.status)) {
        if (!config.multiStep) return;
      }
      chrome.tabs.onUpdated.addListener(updateListener);
    });
  } catch (err) {
    console.error("Start process failed:", err);
  }
}