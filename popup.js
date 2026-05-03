const enabledInput = document.querySelector("#enabled");
const refreshButton = document.querySelector("#refresh");

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  enabledInput.checked = Boolean(enabled);
});

enabledInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledInput.checked });
});

refreshButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.reload(tab.id);
  }
});
