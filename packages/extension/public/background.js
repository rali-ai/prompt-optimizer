const OPTIMIZE_SELECTION_MENU_ID = 'goprmpt-optimize-selection';
const OPEN_SIDEPANEL_MENU_ID = 'goprmpt-open-sidepanel';
const OPEN_FULLTAB_MENU_ID = 'goprmpt-open-fulltab';

const configureSidePanelBehavior = () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
};

const buildAppPath = (prompt) => {
  if (!prompt) return 'index.html';
  return 'index.html#/basic/user?prompt=' + encodeURIComponent(prompt);
};

const openFullTab = (prompt) => {
  chrome.tabs.create({ url: chrome.runtime.getURL(buildAppPath(prompt)) });
};

const openInSidePanel = (tab, prompt) => {
  if (!chrome.sidePanel?.open) {
    openFullTab(prompt);
    return;
  }

  const path = buildAppPath(prompt);
  if (tab && typeof tab.id === 'number') {
    if (prompt && chrome.sidePanel.setOptions) {
      chrome.sidePanel.setOptions({ tabId: tab.id, path, enabled: true }).catch(() => {});
    }
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => openFullTab(prompt));
    return;
  }

  if (tab && typeof tab.windowId === 'number') {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => openFullTab(prompt));
    return;
  }

  openFullTab(prompt);
};

// Configure click-to-toggle right-hand Side Panel immediately when service worker wakes.
configureSidePanelBehavior();

// Context menus persist across browser restarts; clear and recreate cleanly on install/update.
chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: OPTIMIZE_SELECTION_MENU_ID,
      title: '用高词 · GoPrmpt 在右侧栏优化“%s”',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: OPEN_SIDEPANEL_MENU_ID,
      title: '在右侧边栏打开高词 · GoPrmpt',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: OPEN_FULLTAB_MENU_ID,
      title: '在新标签页全屏打开高词 · GoPrmpt',
      contexts: ['page', 'action'],
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === OPTIMIZE_SELECTION_MENU_ID) {
    openInSidePanel(tab, info.selectionText);
  } else if (info.menuItemId === OPEN_SIDEPANEL_MENU_ID) {
    openInSidePanel(tab);
  } else if (info.menuItemId === OPEN_FULLTAB_MENU_ID) {
    openFullTab();
  }
});

// Fallback only for older browsers without setPanelBehavior.
if (!chrome.sidePanel?.setPanelBehavior) {
  chrome.action.onClicked.addListener((tab) => openInSidePanel(tab));
}
