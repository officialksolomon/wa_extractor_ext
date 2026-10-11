document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('extract-btn');
  const copyBtn = document.getElementById('copy-btn');
  const csvBtn = document.getElementById('csv-btn');
  const resetBtn = document.getElementById('reset-btn');
  
  const mainContainer = document.getElementById('main-container');
  const resultContainer = document.getElementById('result-container');
  const errorMsg = document.getElementById('error-msg');
  const numbersOutput = document.getElementById('numbers-output');
  const numberCount = document.getElementById('number-count');

  let extractedContacts = [];

  extractBtn.addEventListener('click', async () => {
    errorMsg.style.display = 'none';
    extractBtn.disabled = true;
    extractBtn.innerHTML = 'Extracting...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('web.whatsapp.com')) {
        throw new Error('Please open WhatsApp Web first.');
      }

      extractBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Auto-scrolling & Extracting...';

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: extractWhatsAppNumbers,
      });

      if (results && results[0] && results[0].result) {
        extractedContacts = results[0].result;
        
        if (extractedContacts.length === 0) {
          throw new Error('No contacts found. Make sure you opened the Group Info sidebar or popup.');
        }

        // Show results
        mainContainer.style.display = 'none';
        resultContainer.style.display = 'block';
        
        // Format for textarea: "Name - Phone"
        numbersOutput.value = extractedContacts.map(c => `${c.name} - ${c.phone}`).join('\n');
        numberCount.textContent = extractedContacts.length;
      } else {
        throw new Error('Failed to extract contacts.');
      }
    } catch (err) {
      errorMsg.textContent = err.message || 'An error occurred.';
      errorMsg.style.display = 'block';
    } finally {
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Extract Numbers';
    }
  });

  copyBtn.addEventListener('click', () => {
    numbersOutput.select();
    document.execCommand('copy');
    
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  });

  csvBtn.addEventListener('click', () => {
    // Add BOM for Excel UTF-8 compatibility
    const BOM = "\uFEFF";
    const csvContent = BOM + "Name,Phone Number\n" 
      + extractedContacts.map(c => `"${c.name.replace(/"/g, '""')}","${c.phone}"`).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "whatsapp_group_contacts.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  resetBtn.addEventListener('click', () => {
    mainContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    extractedContacts = [];
  });
});

// This function is injected and runs in the context of the WhatsApp Web page
async function extractWhatsAppNumbers() {
  const contacts = new Map(); // Map to hold phone -> name
  
  const extractPhone = (text) => {
    if (!text) return null;
    const trimmed = text.trim();
    if (trimmed.startsWith('+')) {
      const cleanNumber = trimmed.replace(/[^\d]/g, '');
      if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
        if (/^[\+\d\s\-\(\)]+$/.test(trimmed)) {
          return trimmed;
        }
      }
    }
    return null;
  };

  const scrapeContainer = (container) => {
    if (!container) return;
    try {
      // Look for rows (WhatsApp usually uses role="listitem" or role="row")
      const rows = container.querySelectorAll('[role="listitem"], [role="row"]');
      
      if (rows.length > 0) {
        rows.forEach(row => {
          let phone = null;
          let possibleNames = new Set();
          
          // 1. Check title attributes within the row
          const titleEls = row.querySelectorAll('span[title], div[title], img[title]');
          titleEls.forEach(el => {
            const title = el.getAttribute('title');
            const p = extractPhone(title);
            if (p) phone = p;
            else if (title && title.length > 1) possibleNames.add(title);
          });
          
          // 2. Check inner texts within the row
          const textEls = row.querySelectorAll('span, div');
          textEls.forEach(el => {
            if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
              const text = el.textContent.trim();
              const p = extractPhone(text);
              if (p) phone = p;
              else if (text && text.length > 1) possibleNames.add(text);
            }
          });
          
          if (phone) {
            // Filter out common non-name texts
            const ignoreList = ['Group Admin', 'Admin', 'typing...', 'online', 'You'];
            const namesArray = Array.from(possibleNames).filter(n => 
              !ignoreList.some(ignore => n.toLowerCase().includes(ignore.toLowerCase())) &&
              n !== phone
            );
            
            let bestName = 'Unknown';
            if (namesArray.length > 0) {
               // Prefer names that don't start with '~' (pushnames)
               const withoutTilde = namesArray.find(n => !n.startsWith('~'));
               bestName = withoutTilde || namesArray[0].replace(/^~/, '');
            } else {
               // Fallback just in case the only name we had was a ~pushname that got filtered
               const fallback = Array.from(possibleNames).find(n => n.startsWith('~'));
               if (fallback) bestName = fallback.replace(/^~/, '');
            }
            
            // If we found a name or don't have this phone yet, or the current name is 'Unknown', update it
            if (!contacts.has(phone) || (contacts.get(phone) === 'Unknown' && bestName !== 'Unknown')) {
              contacts.set(phone, bestName);
            }
          }
        });
      } else {
        // Fallback: If no rows found, indiscriminately scrape, but we can't associate names easily
        const elementsWithTitle = container.querySelectorAll('span[title], div[title]');
        elementsWithTitle.forEach(el => {
          const p = extractPhone(el.getAttribute('title'));
          if (p && !contacts.has(p)) contacts.set(p, 'Unknown');
        });

        const allElements = container.querySelectorAll('span, div');
        allElements.forEach(el => {
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
            const p = extractPhone(el.textContent);
            if (p && !contacts.has(p)) contacts.set(p, 'Unknown');
          }
        });
      }
    } catch(e) {
      console.error('Error extracting contacts:', e);
    }
  };

  const getTargetContainer = () => {
    const scrollables = [];
    const elements = document.querySelectorAll('div');
    
    // Find all scrollable elements
    for (const el of elements) {
      if (el.scrollHeight > el.clientHeight) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 50) {
            scrollables.push(el);
          }
        }
      }
    }

    if (scrollables.length === 0) return null;

    // 1. Prioritize a popup/dialog if one is open in the center
    for (const el of scrollables) {
      let parent = el;
      while (parent && parent !== document.body) {
        if (parent.getAttribute('role') === 'dialog' || parent.getAttribute('aria-modal') === 'true') {
          return el; // Found a scrollable area inside a popup
        }
        parent = parent.parentElement;
      }
    }
    
    // 2. Fallback to the rightmost container (the sidebar)
    let rightmostContainer = null;
    let maxLeft = -1;
    for (const el of scrollables) {
      const rect = el.getBoundingClientRect();
      if (rect.left > maxLeft) {
        maxLeft = rect.left;
        rightmostContainer = el;
      } else if (rect.left === maxLeft) {
        if (rightmostContainer && el.scrollHeight > rightmostContainer.scrollHeight) {
          rightmostContainer = el;
        }
      }
    }
    
    return rightmostContainer;
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  const targetContainer = getTargetContainer();
  
  if (targetContainer) {
    // Scrape what is currently visible first
    scrapeContainer(targetContainer);
    
    // Scroll to the top first
    targetContainer.scrollTop = 0;
    await sleep(300); 
    
    let previousScrollTop = -1;
    let attempts = 0;
    
    // Keep scrolling down until we reach the bottom
    while (targetContainer.scrollTop !== previousScrollTop && attempts < 200) { 
      previousScrollTop = targetContainer.scrollTop;
      
      scrapeContainer(targetContainer);
      
      // Scroll by about half the container height
      targetContainer.scrollTop += (targetContainer.clientHeight / 1.5); 
      
      // Wait for WhatsApp to render virtualized list items
      await sleep(300);
      
      attempts++;
    }
  } else {
    // Fallback if no sidebar is found
    scrapeContainer(document.body);
  }

  // Convert Map back to array of objects
  return Array.from(contacts.entries())
    .map(([phone, name]) => ({ phone, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
