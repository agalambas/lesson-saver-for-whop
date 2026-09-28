(() => {
  if (globalThis.__whopSaver) return;
  globalThis.__whopSaver = true;
  function scan() {
    const found = new Map();
    function walk(root, title = document.title) {
      for (const el of root.querySelectorAll("*")) {
        const label =
          el.getAttribute("title") || el.getAttribute("aria-label") || title;
        if (
          ["VIDEO", "SOURCE", "MUX-VIDEO", "MUX-PLAYER"].includes(el.tagName)
        ) {
          const src = el.currentSrc || el.getAttribute("src");
          if (
            src &&
            /^https:\/\//.test(src) &&
            /\.(m3u8|mp4|webm|mov)(?:\?|$)/i.test(src)
          ) {
            const u = new URL(src);
            const id = u.origin + u.pathname;
            found.set(id, {
              id,
              url: src,
              title: label.replace(/\s*\|\s*Whop.*$/, ""),
              kind: /\.m3u8(?:\?|$)/i.test(src) ? "hls" : "file",
            });
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot, label);
      }
    }
    walk(document);
    return [...found.values()];
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === "scan")
      respond({ videos: scan(), page: location.href });
  });
})();
