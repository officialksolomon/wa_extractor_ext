# WhatsApp Group Number Extractor

A Chrome Extension to easily extract all phone numbers from a WhatsApp Web group chat.

## Installation

1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked** in the top left.
4. Select the `wa_extractor_ext` folder where this extension is located.

## How to use

1. Open [WhatsApp Web](https://web.whatsapp.com/) and log in.
2. Click on a group chat.
3. Click the group name at the top to open the **Group Info** sidebar on the right.
4. Scroll down the participants list all the way to the bottom to ensure all numbers are loaded into the page.
5. Click on the extension icon in your Chrome toolbar.
6. Click **Extract Numbers**.
7. You can now **Copy** all numbers to your clipboard or download them as a **CSV** file!

## Key Features

- **Automated Virtualization Bypass:** Automatically scrolls the active participant list smoothly to force WhatsApp Web to render all off-screen contacts.
- **Smart Pop-up & Sidebar Detection:** Seamlessly extracts from both centered modal dialogs (*"View all participants"*) and right-side Group Info drawers.
- **Intelligent Pop-up Differentiation:** Accurately distinguishes participant modals from unrelated dialogs (*Settings*, *Confirmations*, *Media Viewer*, *Emoji pickers*).
- **Contact Name Association:** Associates phone numbers with contact names or pushnames while filtering system labels (*Admin*, *online*, etc.).
- **100% Local & Privacy-Friendly:** Operates entirely within your browser. No data is stored, tracked, or sent to external servers.
- **Export Options:** One-click copy to clipboard or UTF-8 CSV export (compatible with Excel & Google Sheets).

## Architecture & Technical Documentation

For in-depth technical details on the DOM container heuristics, scoring algorithms, and virtualization handling, refer to [ARCHITECTURE.md](ARCHITECTURE.md).

## Publishing to Chrome Web Store

1. A production zip package is ready at `wa_extractor_v1.0.0.zip`.
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Pay the one-time $5 developer registration fee if you haven't already.
4. Click **New Item** and upload `wa_extractor_v1.0.0.zip`.
5. Fill in the store listing information, upload a screenshot (1280x800 or 640x400), and link your Privacy Policy (`PRIVACY_POLICY.md`).
6. Click **Submit for Review**.


