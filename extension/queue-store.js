// Persist the list, but keep signed media URLs only in Chrome's in-memory session.
export async function loadQueue(storage = chrome.storage) {
  const [{ queue = [] }, { mediaUrls = {} }] = await Promise.all([
    storage.local.get("queue"),
    storage.session.get("mediaUrls"),
  ]);
  return queue.map((item) => {
    const restored = { ...item, url: mediaUrls[item.id] || item.url };
    if (!restored.url && restored.status !== "Complete") {
      restored.status = "Rescan needed";
      restored.error =
        "Open this lesson, scan, and add it again to refresh its video link.";
    }
    return restored;
  });
}

export async function saveQueue(queue, storage = chrome.storage) {
  const mediaUrls = Object.fromEntries(
    queue.filter((item) => item.url).map((item) => [item.id, item.url]),
  );
  await storage.session.set({ mediaUrls });
  const metadata = queue.map(({ url, ...item }) => {
    // Remove obsolete source-page data and query strings from older versions.
    const { page, ...rest } = item;
    return rest;
  });
  await storage.local.set({ queue: metadata });
}
