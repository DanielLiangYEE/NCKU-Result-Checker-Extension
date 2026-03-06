const NCKU_URL = "https://nbk.acad.ncku.edu.tw/netcheckin/index.php?c=quall_rwd";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "go") {
    startProcess(msg.id);
  }
});

async function startProcess(deptId) {
  const tab = await chrome.tabs.create({ url: NCKU_URL });

  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (id) => {
          const run = () => {
            const s1 = document.querySelector('select');
            if (!s1) { setTimeout(run, 500); return; }
            
            // 碩士班固定選 2
            s1.value = "2";
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
        },
        args: [deptId]
      });
    }
  });
}