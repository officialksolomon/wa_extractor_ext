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

  const scrapeHeaderPreview = () => {
    try {
      const chatHeader = document.querySelector('#main header, header');
      if (chatHeader) {
        const spans = chatHeader.querySelectorAll('span[title], span');
        spans.forEach(el => {
          const text = el.getAttribute('title') || el.textContent;
          if (text && text.includes('+')) {
            const parts = text.split(',');
            parts.forEach(part => {
              const p = extractPhone(part.trim());
              if (p && !contacts.has(p)) {
                contacts.set(p, 'Unknown');
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn('Error reading header preview:', e);
    }
  };

  // Evaluates a container to verify if it contains group/participant data
  // Differentiates participant popups from unrelated popups (Settings, Confirmations, Media, Emojis, etc.)
  const evaluateContainer = (el) => {
    if (!el) return { score: -1, rowCount: 0, phoneMatches: 0 };
    
    let score = 0;
    const textPreview = (el.innerText || el.textContent || '').substring(0, 2000).toLowerCase();
    
    // 1. Negative filters: Detect and reject unrelated popups
    const isMediaViewer = el.querySelector('video, [data-testid="media-viewer"]') !== null;
    const isEmojiPicker = el.querySelector('[role="tablist"]') !== null && (textPreview.includes('emoji') || textPreview.includes('gif') || textPreview.includes('sticker'));
    const isConfirmDialog = (
      (textPreview.includes('delete chat') || textPreview.includes('log out') || textPreview.includes('clear messages') || textPreview.includes('block contact')) 
      && !textPreview.includes('participant') && !textPreview.includes('member')
    );
    const isSettingsDialog = (
      (textPreview.includes('keyboard shortcuts') || textPreview.includes('chat wallpaper') || textPreview.includes('help & feedback'))
      && !textPreview.includes('participant') && !textPreview.includes('member')
    );
    
    if (isMediaViewer || isEmojiPicker || isConfirmDialog || isSettingsDialog) {
      return { score: -100, rowCount: 0, phoneMatches: 0 };
    }
    
    // 2. Count contact rows
    const rows = el.querySelectorAll('[role="listitem"], [role="row"]');
    const rowCount = rows.length;
    
    // 3. Detect phone numbers in titles or text
    let phoneMatches = 0;
    const elementsWithTitle = el.querySelectorAll('[title]');
    for (const tEl of elementsWithTitle) {
      if (extractPhone(tEl.getAttribute('title'))) {
        phoneMatches++;
        if (phoneMatches >= 5) break;
      }
    }
    if (phoneMatches === 0) {
      const textEls = el.querySelectorAll('span, div');
      for (const tEl of textEls) {
        if (tEl.childNodes.length === 1 && tEl.childNodes[0].nodeType === 3) {
          if (extractPhone(tEl.textContent.trim())) {
            phoneMatches++;
            if (phoneMatches >= 5) break;
          }
        }
      }
    }
    
    // 4. Keyword verification
    const hasParticipantKeywords = (
      textPreview.includes('participant') ||
      textPreview.includes('member') ||
      textPreview.includes('group info') ||
      textPreview.includes('community') ||
      textPreview.includes('contacts')
    );
    
    if (hasParticipantKeywords) score += 60;
    score += phoneMatches * 30;
    score += Math.min(rowCount, 30) * 5;
    
    return { score, rowCount, phoneMatches };
  };

  const getTargetContainer = () => {
    const isScrollable = (el) => {
      if (el.scrollHeight <= el.clientHeight) return false;
      const style = window.getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll');
    };

    // 1. POPUPS / MODAL DIALOGS (Highest priority ONLY if it actually contains participant data!)
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], [data-animate-modal-popup="true"], [data-animate-modal-body="true"]'
    );
    
    let bestDialogCandidate = null;
    let highestDialogScore = 0;

    for (let i = dialogs.length - 1; i >= 0; i--) {
      const dialog = dialogs[i];
      const dialogEval = evaluateContainer(dialog);
      
      // If dialog is an unrelated popup (Settings, Media, Confirmation), skip it!
      if (dialogEval.score <= 0) continue;

      // Look inside the dialog for the best scrollable list
      const innerScrollables = [];
      const divs = dialog.querySelectorAll('div');
      for (const d of divs) {
        if (isScrollable(d)) {
          const rect = d.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 50) {
            const dEval = evaluateContainer(d);
            innerScrollables.push({ el: d, ...dEval });
          }
        }
      }
      
      if (innerScrollables.length > 0) {
        innerScrollables.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.el.scrollHeight - a.el.scrollHeight;
        });
        if (innerScrollables[0].score > highestDialogScore) {
          highestDialogScore = innerScrollables[0].score;
          bestDialogCandidate = innerScrollables[0].el;
        }
      } else if (dialogEval.score > highestDialogScore) {
        highestDialogScore = dialogEval.score;
        bestDialogCandidate = dialog;
      }
    }

    if (bestDialogCandidate && highestDialogScore > 0) {
      return bestDialogCandidate;
    }

    // 2. SIDEBARS / RIGHT DRAWERS (Group Info sidebar)
    const rightSideThreshold = window.innerWidth * 0.35;
    const rightScrollables = [];
    
    const elements = document.querySelectorAll('div');
    for (const el of elements) {
      if (isScrollable(el)) {
        const rect = el.getBoundingClientRect();
        if (rect.left >= rightSideThreshold && rect.width > 50 && rect.height > 100) {
          const evalRes = evaluateContainer(el);
          rightScrollables.push({ el, rect, ...evalRes });
        }
      }
    }

    if (rightScrollables.length > 0) {
      // Sort by participant score first, then rightmost, then scrollHeight
      rightScrollables.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.rect.left !== a.rect.left) return b.rect.left - a.rect.left;
        return b.el.scrollHeight - a.el.scrollHeight;
      });
      return rightScrollables[0].el;
    }

    // 3. FALLBACK: Any other container holding list rows with positive score (excluding left chat list)
    const otherCandidates = [];
    for (const el of elements) {
      if (isScrollable(el)) {
        const rect = el.getBoundingClientRect();
        if (rect.left > 120) {
          const evalRes = evaluateContainer(el);
          if (evalRes.score > 0) {
            otherCandidates.push({ el, ...evalRes });
          }
        }
      }
    }

    if (otherCandidates.length > 0) {
      otherCandidates.sort((a, b) => b.score - a.score);
      return otherCandidates[0].el;
    }

    return null;
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  const targetContainer = getTargetContainer();
  
  if (targetContainer) {
    // Scrape what is currently visible first
    scrapeContainer(targetContainer);
    
    // Only scroll if container is actually scrollable
    if (targetContainer.scrollHeight > targetContainer.clientHeight) {
      // Scroll to the top first
      targetContainer.scrollTop = 0;
      await sleep(300); 
      
      let previousScrollTop = -1;
      let attempts = 0;
      
      // Keep scrolling down until bottom reached
      while (targetContainer.scrollTop !== previousScrollTop && attempts < 200) { 
        previousScrollTop = targetContainer.scrollTop;
        
        scrapeContainer(targetContainer);
        
        targetContainer.scrollTop += (targetContainer.clientHeight / 1.5); 
        await sleep(300);
        
        attempts++;
      }
    }
  } else {
    // Fallback if no sidebar or popup is found
    const openDialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (openDialog) {
      scrapeContainer(openDialog);
    } else {
      scrapeContainer(document.body);
    }
  }

  // Also harvest any numbers visible in the group chat header subtitle
  scrapeHeaderPreview();

  // Convert Map back to array of objects
  return Array.from(contacts.entries())
    .map(([phone, name]) => ({ phone, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
