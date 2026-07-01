/* 
  Copyright 2018. Jefferson "jscher2000" Scher. License: MPL-2.0.
  Modified in 2026 for Icon Sync by Arnaud Bétrémieux arnaud@btmx.fr
*/

function windowize(tab) {
    if (tab.index == 0) return;

    var createData = {
        tabId: tab.id,
        incognito: tab.incognito
    };

    var srcwin = browser.windows.get(tab.windowId);

    srcwin.then(function(result) {
        if (result.state == "fullscreen") {
            createData.state = "fullscreen";
        }
        browser.windows.create(createData);
    }, function(error) {
        browser.windows.create(createData);
    });
}

browser.tabs.onCreated.addListener(windowize);

var windowIds = {};
var gettingId = {};
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

browser.webRequest.onBeforeRequest.addListener(
    (details) => {
        try {
            const url = new URL(details.url);
            const scheme = url.protocol.replace(':', '');
            if (!allowedSchemes.has(scheme)) {
                setTimeout(() => {
                    browser.tabs.remove(details.tabId).catch(() => {
                        // Ignore error if tab is already closed
                    });
                }, 1000);
            }
        } catch (e) {
            console.error("Tabfree: URL parsing failed", e);
        }
    },
    { urls: ["<all_urls>"], types: ["main_frame"] }
);
