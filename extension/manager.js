import { parsePlaylist, chooseVariant, safeName } from "./hls.js";
import { loadQueue, saveQueue } from "./queue-store.js";
const $ = (id) => document.getElementById(id);
let queue = await loadQueue(),
  detected = [],
  busy = false,
  controller;
for (const item of queue)
  if (["Downloading", "Saving"].includes(item.status)) {
    item.status = "Interrupted";
    item.error = "Rescan if needed, then retry.";
  }
const save = () => saveQueue(queue);
function message(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
}
function render() {
  $("queue").replaceChildren();
  $("count").textContent = queue.length;
  if (!queue.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      "Your list is empty. Select a detected video to get started.";
    $("queue").append(p);
  }
  for (const item of queue) {
    const row = document.createElement("div");
    row.className = "row";
    const info = document.createElement("div");
    info.className = "info";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent =
      (item.status || "Ready") + (item.error ? " — " + item.error : "");
    if (item.error) meta.classList.add("error");
    info.append(title, meta);
    const remove = document.createElement("button");
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.disabled = busy;
    remove.onclick = async () => {
      queue = queue.filter((v) => v.id !== item.id);
      await save();
      render();
    };
    row.append(info, remove);
    $("queue").append(row);
  }
  $("download").disabled = busy || !queue.some((i) => i.status !== "Complete");
  $("cancel").disabled = !busy;
  $("clear").disabled = busy;
  $("scan").disabled = busy;
  $("add").disabled = busy || !$("detected").querySelector("input:checked");
}
$("scan").onclick = async () => {
  try {
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tabId = active?.id;
    if (!tabId) throw new Error("Open a Whop lesson in this window first.");
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https:\/\/([\w-]+\.)?whop\.com\//.test(tab.url))
      throw new Error(
        "Switch to the Whop lesson you want to scan, then try again.",
      );
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const result = await chrome.tabs.sendMessage(
      tabId,
      { type: "scan" },
      { frameId: 0 },
    );
    detected = result.videos || [];
    $("detected").replaceChildren();
    for (const video of detected) {
      const row = document.createElement("label");
      row.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = video.id;
      cb.checked = true;
      cb.onchange = render;
      const info = document.createElement("span");
      info.className = "info";
      const title = document.createElement("strong");
      title.textContent = video.title;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent =
        video.kind === "hls"
          ? "Streaming video • best available quality"
          : "Direct video file";
      info.append(title, meta);
      row.append(cb, info);
      $("detected").append(row);
    }
    message(
      detected.length
        ? `${detected.length} video${detected.length === 1 ? "" : "s"} detected. Select what you want to save.`
        : "No video source found yet. Press play briefly on the Whop lesson, pause it, then scan again.",
    );
    render();
  } catch (e) {
    detected = [];
    $("detected").replaceChildren();
    message(e.message, true);
    render();
  }
};
$("add").onclick = async () => {
  const selected = new Set(
    [...$("detected").querySelectorAll("input:checked")].map((i) => i.value),
  );
  for (const video of detected.filter((v) => selected.has(v.id))) {
    const existing = queue.find((v) => v.id === video.id);
    if (existing)
      Object.assign(existing, video, { status: "Ready", error: "" });
    else queue.push({ ...video, status: "Ready" });
  }
  await save();
  render();
  message("Selected videos are in your download list.");
};
$("clear").onclick = async () => {
  queue = queue.filter((i) => i.status !== "Complete");
  await save();
  render();
};
$("cancel").onclick = () => controller?.abort();
function allowed(url) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !(
      u.hostname === "whop.com" ||
      u.hostname.endsWith(".whop.com") ||
      u.hostname.endsWith(".mux.com")
    )
  )
    throw new Error(
      "This video host is outside the extension’s Whop/Mux permissions.",
    );
  return url;
}
async function request(url, signal, format = "text") {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const timeout = new AbortController();
    const abort = () => timeout.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(
      () =>
        timeout.abort(new Error("The video server timed out. Please retry.")),
      60000,
    );
    try {
      const res = await fetch(allowed(url), {
        signal: timeout.signal,
        credentials: "omit",
      });
      if (!res.ok) {
        const e = new Error(
          `Video server returned ${res.status}. Reopen the lesson and scan again if its link expired.`,
        );
        if (res.status < 500) throw Object.assign(e, { noRetry: true });
        throw e;
      }
      allowed(res.url);
      // Consume the body here so truncated transfers are retried as well.
      const body = await (format === "bytes" ? res.arrayBuffer() : res.text());
      return { body, url: res.url };
    } catch (e) {
      if (signal.aborted || e.noRetry) throw e;
      last = e;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw last;
}
async function streamBlob(item, signal) {
  let url = item.url,
    p,
    audioUrl;
  for (let depth = 0; depth < 5; depth++) {
    const res = await request(url, signal);
    p = parsePlaylist(res.body, res.url);
    if (!p.variants.length) break;
    const variant = chooseVariant(p);
    audioUrl = variant.audioUrl || audioUrl;
    url = variant.url;
  }
  if (p.variants.length) throw new Error("Too many nested video playlists.");
  if (!p.ended)
    throw new Error("Live or unfinished streams are not supported.");
  if (!p.segments.length) throw new Error("No video segments were found.");
  const urls = p.map ? [p.map, ...p.segments] : p.segments;
  const parts = new Array(urls.length);
  let cursor = 0,
    done = 0,
    total = 0;
  const inner = new AbortController();
  const abort = () => inner.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) inner.abort();
  const workers = Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const response = await request(urls[index], inner.signal, "bytes");
      const bytes = response.body;
      total += bytes.byteLength;
      if (total > 1024 * 1024 * 1024) {
        inner.abort();
        throw new Error("This video exceeds the 1 GB in-memory limit.");
      }
      parts[index] = bytes;
      done++;
      $("progress").textContent =
        `${item.title}: ${done}/${urls.length} segments · ${Math.round(total / 1048576)} MB`;
    }
  });
  try {
    await Promise.all(workers);
  } catch (e) {
    inner.abort();
    await Promise.allSettled(workers);
    throw e;
  } finally {
    signal.removeEventListener("abort", abort);
  }
  const videoBlob = new Blob(parts, {
    type: p.map ? "video/mp4" : "video/mp2t",
  });
  if (audioUrl) {
    const audio = await streamBlob(
      { ...item, url: audioUrl, title: item.title + " (audio)" },
      signal,
    );
    if (videoBlob.size + audio.blob.size > 1024 * 1024 * 1024)
      throw new Error("Combined media exceeds the 1 GB limit.");
    $("progress").textContent =
      item.title + ": combining video and audio into MP4…";
    const { mergeTracks } = await import("./merge.js");
    return {
      blob: await mergeTracks(videoBlob, audio.blob, signal),
      extension: "mp4",
    };
  }
  return { blob: videoBlob, extension: p.map ? "mp4" : "ts" };
}
async function saveDownload(url, filename, signal) {
  const id = await chrome.downloads.download({
    url,
    filename,
    conflictAction: "uniquify",
    saveAs: false,
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      chrome.downloads.onChanged.removeListener(changed);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    }
    function changed(d) {
      if (d.id !== id) return;
      if (d.state?.current === "complete") finish();
      if (d.state?.current === "interrupted")
        finish(new Error(d.error?.current || "Download interrupted"));
    }
    function abort() {
      chrome.downloads.cancel(id).catch(() => {});
      finish(new DOMException("Stopped", "AbortError"));
    }
    chrome.downloads.onChanged.addListener(changed);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else
      chrome.downloads
        .search({ id })
        .then(([d]) => {
          if (d?.state === "complete") finish();
          else if (d?.state === "interrupted")
            finish(new Error(d.error || "Download interrupted"));
        })
        .catch(finish);
  });
}
$("download").onclick = async () => {
  busy = true;
  controller = new AbortController();
  const signal = controller.signal;
  render();
  try {
    for (const item of queue.filter((i) => i.status !== "Complete")) {
      if (signal.aborted) break;
      let objectUrl;
      try {
        if (!item.url)
          throw new Error(
            "Open this lesson, scan, and add it again to refresh its video link.",
          );
        item.status = "Downloading";
        item.error = "";
        await save();
        render();
        let url = item.url,
          extension = new URL(url).pathname.split(".").pop();
        if (item.kind === "hls") {
          const result = await streamBlob(item, signal);
          extension = result.extension;
          objectUrl = URL.createObjectURL(result.blob);
          url = objectUrl;
        } else allowed(url);
        if (signal.aborted) throw new DOMException("Stopped", "AbortError");
        item.status = "Saving";
        render();
        await saveDownload(
          url,
          "Whop Videos/" + safeName(item.title) + "." + extension,
          signal,
        );
        item.status = "Complete";
      } catch (e) {
        item.status = signal.aborted ? "Stopped" : "Failed";
        item.error = signal.aborted ? "" : e.message;
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        await save();
        render();
      }
    }
  } finally {
    busy = false;
    $("progress").textContent = signal.aborted
      ? "Downloads stopped. Click Download all to retry unfinished videos."
      : `${queue.filter((i) => i.status === "Complete").length} of ${queue.length} videos saved. Failed videos remain in the list for retry.`;
    render();
  }
};
window.addEventListener("beforeunload", (e) => {
  if (busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
await save();
render();
$("scan").click();
