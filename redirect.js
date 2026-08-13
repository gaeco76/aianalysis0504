(() => {
  const AGENTIC_INDEX_URL = "https://artificialanalysis.ai/?intelligence=agentic-index";

  const params = new URLSearchParams(location.search);
  const alreadyAtTarget =
    location.pathname === "/" && params.get("intelligence") === "agentic-index";

  if (!alreadyAtTarget) {
    location.replace(AGENTIC_INDEX_URL + location.hash);
  }
})();
