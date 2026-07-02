/* 
  Copyright 2018. Jefferson "jscher2000" Scher. License: MPL-2.0.
  Modified in 2026 for Icon Sync by Arnaud Bétrémieux arnaud@btmx.fr
*/

const windowizedTabs = new Set();
const windowizedWindows = new Map();
const pendingNavs = new Set();
const windowizingTabs = new Set();
const closeWindowOnCreate = new Map();

function windowize(tab) {
    if (tab.index == 0) return;
    windowizingTabs.add(tab.id);

    var createData = {
        tabId: tab.id,
        incognito: tab.incognito,
        focused: false
    };

    var srcwin = browser.windows.get(tab.windowId);

    srcwin.then(function(result) {
        if (result.state == "fullscreen") {
            createData.state = "fullscreen";
        }
        browser.windows.create(createData).then((win) => {
            windowizingTabs.delete(tab.id);
            if (closeWindowOnCreate.has(tab.id)) {
                closeWindowOnCreate.delete(tab.id);
                browser.windows.remove(win.id).catch((e) => {
                    console.error("Tabfree: failed to close leftover window", e);
                });
                console.log("Tabfree: closed leftover window", win.id, "for tab", tab.id);
                return;
            }
            windowizedTabs.add(tab.id);
            windowizedWindows.set(tab.id, win.id);
            setTimeout(() => {
                windowizedTabs.delete(tab.id);
                windowizedWindows.delete(tab.id);
            }, 5000);
            browser.tabs.get(tab.id).then((t) => {
                if (t.url !== "about:blank") {
                    browser.windows.update(win.id, { focused: true }).catch((e) => {
                        console.error("Tabfree: failed to focus window", e);
                    });
                }
            });
        });
    }, function(error) {
        browser.windows.create(createData).then((win) => {
            windowizingTabs.delete(tab.id);
            if (closeWindowOnCreate.has(tab.id)) {
                closeWindowOnCreate.delete(tab.id);
                browser.windows.remove(win.id).catch((e) => {
                    console.error("Tabfree: failed to close leftover window", e);
                });
                console.log("Tabfree: closed leftover window", win.id, "for tab", tab.id);
                return;
            }
            windowizedTabs.add(tab.id);
            windowizedWindows.set(tab.id, win.id);
            setTimeout(() => {
                windowizedTabs.delete(tab.id);
                windowizedWindows.delete(tab.id);
            }, 5000);
            browser.tabs.get(tab.id).then((t) => {
                if (t.url !== "about:blank") {
                    browser.windows.update(win.id, { focused: true }).catch((e) => {
                        console.error("Tabfree: failed to focus window", e);
                    });
                }
            });
        });
    });
}

browser.tabs.onCreated.addListener(windowize);

browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    pendingNavs.delete(details.tabId);
    if (closeWindowOnCreate.has(details.tabId)) return;
    if (windowizedTabs.has(details.tabId)) {
        const winId = windowizedWindows.get(details.tabId);
        windowizedTabs.delete(details.tabId);
        windowizedWindows.delete(details.tabId);
        if (winId !== undefined) {
            browser.windows.update(winId, { focused: true }).catch((e) => {
                console.error("Tabfree: failed to focus window", e);
            });
        }
    }
    resetWindowIcon(details.tabId);
});

browser.webNavigation.onErrorOccurred.addListener((details) => {
    if (details.frameId !== 0) return;
    const isWindowized = windowizedTabs.has(details.tabId);
    const isWindowizing = windowizingTabs.has(details.tabId);
    const isPending = pendingNavs.has(details.tabId);
    pendingNavs.delete(details.tabId);
    if (!isWindowized && !isWindowizing && !isPending) {
        resetWindowIcon(details.tabId);
        return;
    }
    if (details.error.includes("2147500036") || details.error.includes("2152398865")) {
        if (isWindowized) {
            const winId = windowizedWindows.get(details.tabId);
            windowizedTabs.delete(details.tabId);
            windowizedWindows.delete(details.tabId);
            if (winId !== undefined) {
                browser.windows.remove(winId).catch((e) => {
                    console.error("Tabfree: failed to close leftover window", e);
                });
                console.log("Tabfree: closed leftover window", winId, "for tab", details.tabId);
            }
        } else if (isWindowizing) {
            closeWindowOnCreate.set(details.tabId, true);
            setTimeout(() => { closeWindowOnCreate.delete(details.tabId); }, 5000);
        } else {
            browser.tabs.remove(details.tabId).catch((e) => {
                console.error("Tabfree: failed to close leftover tab", e);
            });
            console.log("Tabfree: closed leftover tab", details.tabId);
        }
    }
});

var windowIds = {};
var gettingId = {};

async function resetWindowIcon(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    const xId = windowIds[tab.windowId];
    if (xId) {
      browser.runtime.sendNativeMessage("fr.btmx.seticon", {
        reset: true,
        windowId: xId
      });
    }
  } catch (e) {
    console.error("Tabfree: failed to reset window icon", e);
  }
}

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const wId = tab.windowId;
  if (!windowIds[wId]) {
    if (!gettingId[wId]) {
      gettingId[wId] = (async () => {
        const win = await browser.windows.get(tab.windowId);
        const windowUUID = crypto.randomUUID();
        await browser.windows.update(win.id, { titlePreface: `[TABFREE_UUID:${windowUUID}]` });
        try {
          const response = await browser.runtime.sendNativeMessage("fr.btmx.seticon", { windowUUID });
          if (response.windowId) {
            windowIds[wId] = response.windowId;
          } else {
            delete windowIds[wId];
          }
        } catch (e) {
          delete windowIds[wId];
          throw e;
        } finally {
          await browser.windows.update(win.id, { titlePreface: '' });
          delete gettingId[wId];
        }
      })();
    }
    try {
      await gettingId[wId];
    } catch (e) {
      return;
    }
  }
  if (changeInfo.favIconUrl && windowIds[wId]) {
    browser.runtime.sendNativeMessage("fr.btmx.seticon", {
      iconUrl: changeInfo.favIconUrl,
      windowId: windowIds[wId]
    });
  }
});

const allowedSchemes = new Set([
    "http", "https", "ftp", "file", "about", "moz-extension", "view-source", "ws", "wss"
]);

browser.webNavigation.onBeforeNavigate.addListener(
    (details) => {
        if (details.frameId !== 0) return;
        pendingNavs.add(details.tabId);
        try {
            const url = new URL(details.url);
            const scheme = url.protocol.replace(':', '');
            if (!allowedSchemes.has(scheme)) {
                setTimeout(() => {
                    browser.tabs.remove(details.tabId).catch((e) => {
                        console.error("Tabfree: failed to close leftover tab", e);
                    });
                }, 1000);
            }
        } catch (e) {
            console.error("Tabfree: URL parsing failed", e);
        }
    }
);
