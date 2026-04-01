const UNI_CONFIG = {
  ncku: {
    url: "https://nbk.acad.ncku.edu.tw/netcheckin/index.php?c=quall_rwd",
    func: (id) => {
      const run = (retry = 0) => {
        if (retry > 20) return;
        const s1 = document.querySelector('select');
        if (!s1) return setTimeout(() => run(retry + 1), 500);
        
        s1.value = "2";
        s1.dispatchEvent(new Event('change', { bubbles: true }));
        
        const check = setInterval(() => {
          const s2 = document.querySelectorAll('select')[1];
          if (s2 && s2.options.length > 1) {
            clearInterval(check);
            s2.value = id;
            s2.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => {
              const btn = [...document.querySelectorAll('button, input, a.btn')]
                .find(b => b.innerText.includes('查詢') || (b.value && b.value.includes('查詢')));
              btn?.click();
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
        const targetSimp = targetId.replace(/\s/g, '');
        let idx = -1;

        for (let i = 0; i < s.options.length; i++) {
          const v = s.options[i].value.trim();
          if (v === targetId || v.replace(/\s/g, '') === targetSimp) { idx = i; break; }
        }

        if (idx === -1) {
          for (let i = 0; i < s.options.length; i++) {
            const vSimp = s.options[i].value.replace(/\s/g, '');
            const tSimp = s.options[i].text.replace(/\s/g, '');
            if (vSimp.includes(targetSimp) || targetSimp.includes(vSimp) || tSimp.includes(targetSimp)) { idx = i; break; }
          }
        }

        if (idx !== -1) {
          s.selectedIndex = idx;
          s.value = s.options[idx].value;
          ['mousedown', 'input', 'change', 'blur'].forEach(e => s.dispatchEvent(new Event(e, { bubbles: true })));
          setTimeout(() => btn.click(), 200);
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
        const frames = document.querySelectorAll('frame, iframe');
        for (let f of frames) {
          try { if (f.contentDocument?.querySelector('select')) return f.contentDocument; } catch(e) {}
        }
        return document;
      };

      const run = (retry = 0) => {
        if (retry > 20) return;
        const doc = getDoc();
        const url = window.location.href;
        
        if (url.includes('step1.asp')) {
          const s = doc.querySelector('select[name="exam_list"]');
          const btn = [...doc.querySelectorAll('input[type="submit"]')].find(b => b.value.includes('確定'));
          if (s && btn) {
            s.value = "41";
            ['change', 'input'].forEach(e => s.dispatchEvent(new Event(e, { bubbles: true })));
            btn.click();
          } else setTimeout(() => run(retry + 1), 500);
        } else {
          const s = doc.querySelector('select[name="sect_no"]');
          const btn = doc.querySelector('input[name="B1"]') || [...doc.querySelectorAll('input[type="submit"]')].find(b => b.value.includes('查詢'));
          if (s && btn) {
            const tid = id.toString().trim();
            const prefix = (str) => str.match(/^\d+/) ? str.match(/^\d+/)[0] : str;
            const targetPfx = prefix(tid);
            const opt = [...s.options].find(o => (o.value && prefix(o.value) === targetPfx) || (o.text && prefix(o.text) === targetPfx));
            if (opt && opt.value !== "0") {
              s.value = opt.value;
              s.selectedIndex = opt.index;
              ['change', 'input', 'blur'].forEach(e => s.dispatchEvent(new Event(e, { bubbles: true })));
              setTimeout(() => btn.click(), 500);
            } else setTimeout(() => run(retry + 1), 500);
          } else setTimeout(() => run(retry + 1), 500);
        }
      };
      setTimeout(() => run(), 500);
    }
  },
  ncu: {
    url: (id) => id,
    func: null
  }
};


chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "go") {
    chrome.windows.getLastFocused({ populate: false }, (win) => {
      if (msg.uni === 'ncu') {
        chrome.tabs.create({ url: msg.id, active: true });
        chrome.runtime.sendMessage({ action: "searching_complete" });
        return;
      }

      const cfg = UNI_CONFIG[msg.uni];
      const config = cfg ? {
        url: typeof cfg.url === 'function' ? cfg.url(msg.id) : cfg.url,
        func: cfg.func,
        multiStep: cfg.multiStep || false
      } : {
        url: msg.url || UNI_CONFIG.ncku.url,
        func: null
      };
      startProcess(msg.id, config, win.id);
    });
  }
});



async function startProcess(deptId, config, targetWindowId) {
  let hiddenWindowId = null;
  try {
    const hiddenWindow = await chrome.windows.create({
      url: config.url,
      focused: false,
      state: "minimized",
      type: "normal"
    });
    
    hiddenWindowId = hiddenWindow.id;
    
    const tabs = await chrome.tabs.query({ windowId: hiddenWindowId });
    if (!tabs?.length) throw new Error("No tab found");
    
    const tabId = tabs[0].id;
    const maxSteps = config.func ? (config.multiStep ? 3 : 2) : 1;
    let stepCount = 0;


    const handleUpdate = (tId, status) => {
      if (status !== 'complete') return;
      stepCount++;
      
      if (stepCount < maxSteps && config.func) {
        chrome.scripting.executeScript({
          target: { tabId: tId },
          func: config.func,
          args: [deptId]
        }).catch(err => console.error("[Injection] Error:", err));
      } 
      
      if (stepCount >= maxSteps) {
        chrome.tabs.onUpdated.removeListener(updateListener);
        chrome.tabs.move(tId, { windowId: targetWindowId, index: -1 }, () => {
          const winId = chrome.runtime.lastError ? null : targetWindowId;
          const focusWin = (id) => {
            chrome.tabs.update(tId, { active: true });
            chrome.windows.update(id, { focused: true });
          };
          if (!winId) chrome.windows.getLastFocused(w => focusWin(w.id));
          else focusWin(winId);
        });
        
        chrome.runtime.sendMessage({ action: "searching_complete" });
        setTimeout(() => {
          chrome.windows.get(hiddenWindowId, w => !chrome.runtime.lastError && w && chrome.windows.remove(hiddenWindowId));
        }, 1000);
      }
    };

    const updateListener = (tId, info) => tId === tabId && handleUpdate(tId, info.status);
    chrome.tabs.onUpdated.addListener(updateListener);
    chrome.tabs.get(tabId, t => t.status === 'complete' && handleUpdate(t.id, t.status));

  } catch (err) {
    if (hiddenWindowId) chrome.windows.remove(hiddenWindowId);
    chrome.runtime.sendMessage({ action: "searching_complete" });
  }
}