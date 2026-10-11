# WA Group Extractor – Technical Architecture & Detection Specification

This document details the internal architecture, container selection heuristics, pop-up differentiation logic, and DOM virtualization bypass mechanics used by **WA Group Extractor**.

---

## 1. Core Challenge: The WhatsApp Web DOM Environment

WhatsApp Web presents several complex architectural challenges for automated contact extraction:
1. **DOM Virtualization:** Large participant lists unmount non-visible rows. Only ~10–20 contacts exist in the DOM at any given moment.
2. **Multiple UI Topologies:** Groups can be displayed in:
   - Centered modal dialogs (e.g., clicking *"View all participants"* or *"x more"*).
   - Right-hand drawer sidebars (the default Group Info panel).
   - In-header subtitle previews.
3. **Concurrent Unrelated Pop-ups:** Users can have unrelated pop-ups active on screen (e.g., *Settings*, *Media Viewer*, *Delete Chat / Log Out confirmations*, *Emoji/Sticker pickers*).

---

## 2. Container Selection & Priority Pipeline

The extraction routine discovers and selects the active container using a 3-tier hierarchy (`getTargetContainer`):

```
┌────────────────────────────────────────────────────────┐
│ 1. Evaluate Open Pop-ups / Modal Dialogs               │
│    ([role="dialog"], [aria-modal="true"], etc.)         │
│    Score container using evaluateContainer()           │
└──────────────────────────┬─────────────────────────────┘
                           │
                 Score > 0 │ Score <= 0 (Unrelated popup)
                           ▼
              ┌───────────────────────────┐
              │ 2. Evaluate Right Sidebar │
              │    (screen width > 35%)   │
              └────────────┬──────────────┘
                           │
            Found sidebar  │ Not found
                           ▼
              ┌───────────────────────────┐
              │ 3. Score Fallback Divs    │
              │    (left > 120px)         │
              └───────────────────────────┘
```

### Priority Rules:
1. **Active Modal Dialogs Take Top Priority (Score > 0):** If the user clicked *"View all participants"*, the dialog contains the complete member list.
2. **Right-Hand Sidebar as Secondary Target:** If no modal is open (or the open modal is an unrelated popup like *Settings*), the right-hand Group Info drawer is targeted.
3. **Protection Against Chat History & Navigation:** The left navigation chat list (`rect.left < 50`) and middle chat message conversation are strictly excluded from scrolling.

---

## 3. Pop-up Differentiation Logic (`evaluateContainer`)

WhatsApp Web renders all modals using `role="dialog"` or `aria-modal="true"`. To prevent the extractor from latching onto the wrong dialog, each candidate is evaluated against negative and positive indicators.

### Negative Filters (Immediate Rejection)
If a dialog matches any of the following criteria, its score is set to `-100` and it is immediately ignored:
- **Media Lightbox / Viewer:** Contains `<video>` or `[data-testid="media-viewer"]` (e.g., user clicked an image or video).
- **Emoji / GIF / Sticker Tray:** Contains a tablist (`[role="tablist"]`) with emoji, sticker, or GIF categories.
- **Confirmation Dialogs:** Contains action text such as *"Delete chat"*, *"Log out"*, *"Clear messages"*, or *"Block contact"* with zero participant rows.
- **Settings & Help Modals:** Contains settings panels such as *"Keyboard shortcuts"*, *"Chat wallpaper"*, or *"Help & feedback"* without member items.

### Positive Indicators (Scoring System)
Candidate containers accumulate confidence points:
| Metric | Weight | Purpose |
| :--- | :--- | :--- |
| **Phone Number Matches** | `+30` pts per number | Verified international format (`+...`) found in row title or text |
| **Contact Row Count** | `+5` pts per row (up to 30) | Density of `[role="listitem"]` or `[role="row"]` elements |
| **Group Keywords** | `+60` pts | Text matching `"participants"`, `"members"`, `"group info"`, `"community"`, `"contacts"` |

**Threshold Rule:** Only pop-ups with a total confidence score `> 0` can be selected as extraction targets. Any dialog scoring `<= 0` is discarded, and the extractor falls back to the Group Info sidebar.

---

## 4. DOM Virtualization Bypass & Incremental Scrolling

Because WhatsApp Web unmounts contacts that are off-screen, the script executes an automated scrolling loop:

1. **Initial Snapshot:** Scrapes currently visible contacts before scrolling.
2. **Reset to Top:** Sets `targetContainer.scrollTop = 0` and waits `300ms`.
3. **Incremental Scroll:** 
   $$\text{scrollTop} \leftarrow \text{scrollTop} + \left(\frac{\text{clientHeight}}{1.5}\right)$$
4. **Hydration Sleep:** Pauses for `300ms` per iteration to allow WhatsApp Web's React engine to mount new DOM rows.
5. **Termination Conditions:**
   - `targetContainer.scrollTop === previousScrollTop` (reached the bottom).
   - Maximum attempt threshold (`200` iterations) to prevent infinite loops.
6. **Non-Scrollable Container Handling:** If `scrollHeight <= clientHeight` (e.g., small groups of 5–15 contacts that fit on screen without a scrollbar), scrolling is bypassed and visible contacts are immediately extracted.

---

## 5. Contact Association & Pushname Parsing

WhatsApp displays contacts in two primary variations:
1. **Saved Contacts:** Displays custom contact name as title (e.g., *"Jane Doe"*) and phone number in secondary label or tooltip.
2. **Unsaved Contacts:** Displays phone number as the main title (e.g., *"+1 (555) 019-2831"*) and pushname prefixed with a tilde (e.g., *"~Alex"*).

### Parsing Heuristics:
- **Title Extraction:** Inspects `span[title]`, `div[title]`, and `img[title]` within each row.
- **Pushname Sanitization:** Tildes (`~`) are cleanly stripped from pushnames.
- **Exclusion Filters:** System labels (*"Group Admin"*, *"Admin"*, *"typing..."*, *"online"*, *"You"*) are automatically excluded from name candidate lists.
- **Header Preview Harvest:** As an additional safety net, the chat header subtitle (`#main header`) is parsed to capture any phone numbers previewed in the conversation header.

---

## 6. Output & Export Pipeline

- **In-Memory Storage:** Deduplicated `Map<Phone, Name>` ensures unique phone numbers with the highest-fidelity name associated.
- **Sorting:** Alphabetical by name.
- **Clipboard Output:** `Name - Phone` plain text formatted for quick pasting.
- **CSV Export:** Generated as a `text/csv;charset=utf-8;` Blob prefixed with a UTF-8 Byte Order Mark (`\uFEFF`) to ensure seamless character encoding compatibility in Microsoft Excel, Google Sheets, and CRM tools.
