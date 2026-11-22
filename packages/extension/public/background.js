const OPTIMIZE_SELECTION_MENU_ID = 'goprmpt-optimize-selection';
const OPEN_APP_MENU_ID = 'goprmpt-open-app';

const openApp = (prompt) => {
  const hash = prompt ? '#/basic/user?prompt=' + encodeURIComponent(prompt) : '';
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') + hash });
};

// Context menus persist across browser restarts; clear and recreate cleanly on install/update.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: OPTIMIZE_SELECTION_MENU_ID,
      title: '用高词 · GoPrmpt 优化“%s”',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: OPEN_APP_MENU_ID,
      title: '打开高词 · GoPrmpt 工作台',
      contexts: ['page'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === OPTIMIZE_SELECTION_MENU_ID) openApp(info.selectionText);
  if (info.menuItemId === OPEN_APP_MENU_ID) openApp();
});

chrome.action.onClicked.addListener(() => openApp());
