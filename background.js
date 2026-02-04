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
var deferedIconUrls = {};
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  console.log("ON UPDATED");
  const twId = tab.windowId+' '+tabId;
  if (!windowIds[twId]) {
    if (!gettingId[twId]) {
      gettingId[twId] = true;
    } else {
      return;
    }
    console.log("WID");
    const win = await browser.windows.get(tab.windowId);
    console.log("WINDOW", win);
    const windowUUID = crypto.randomUUID();
    await browser.windows.update(win.id, { titlePreface: `[TABFREE_UUID:${windowUUID}]` });
    console.log("BID");
    try {
     console.log("MSG");
     const response = await browser.runtime.sendNativeMessage("fr.btmx.seticon", { windowUUID });
     windowIds[twId] = response.windowId;
     console.log("WID: ", response.windowId);
    } finally {
      await browser.windows.update(win.id, { titlePreface: '' });
      delete(gettingId[twId]);
      if (deferedIconUrls[twId]) {
        browser.runtime.sendNativeMessage("fr.btmx.seticon", {
          iconUrl: deferedIconUrls[twId],
          windowId: windowIds[twId]
        });
        delete(deferedIconUrls[twId]);
      }
    }
  }
  if (changeInfo.favIconUrl) {
    if (gettingId[twId]) {
      deferedIconUrls[twId] = changeInfo.favIconUrl;
      return
    }
    browser.runtime.sendNativeMessage("fr.btmx.seticon", {
      iconUrl: changeInfo.favIconUrl,
      windowId: windowIds[twId]
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
