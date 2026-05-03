chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
    chrome.storage.sync.set({ enabled: Boolean(enabled) });
  });
});
