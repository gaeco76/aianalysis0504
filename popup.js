const enabledInput = document.querySelector("#enabled");
const refreshButton = document.querySelector("#refresh");

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  enabledInput.checked = Boolean(enabled);
});

enabledInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledInput.checked });
});

const AA_AGENTIC_INDEX_URL = "https://artificialanalysis.ai/?intelligence=agentic-index";

refreshButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url: AA_AGENTIC_INDEX_URL });
  } else {
    await chrome.tabs.create({ url: AA_AGENTIC_INDEX_URL });
  }
});
