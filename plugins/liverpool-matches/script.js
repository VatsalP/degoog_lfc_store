(() => {
  const formatKickoff = (element) => {
    if (element.dataset.localised === "true") return;
    const value = element.getAttribute("datetime");
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    element.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
    element.title = `${date.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
    element.dataset.localised = "true";
  };

  const formatAll = (root = document) => {
    if (root.matches?.(".lfc-kickoff")) formatKickoff(root);
    root.querySelectorAll?.(".lfc-kickoff").forEach(formatKickoff);
  };

  formatAll();
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) formatAll(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
