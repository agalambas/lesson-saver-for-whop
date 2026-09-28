export function attributes(line) {
  const result = {};
  for (const match of line.matchAll(/([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g))
    result[match[1]] = match[2] ?? match[3];
  return result;
}
export function parsePlaylist(text, base) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim());
  if (lines[0] !== "#EXTM3U")
    throw new Error(
      "The server did not return a video playlist. Reopen the lesson and scan again.",
    );
  const variants = [],
    segments = [],
    audio = [];
  let pending = null,
    map = null,
    duration = 0;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY:") && attributes(line).METHOD !== "NONE")
      throw new Error("Encrypted streams are not supported.");
    if (line.startsWith("#EXT-X-BYTERANGE:"))
      throw new Error("Byte-range streams are not supported.");
    if (line.startsWith("#EXT-X-MEDIA:")) {
      const a = attributes(line);
      if (a.TYPE === "AUDIO")
        audio.push({
          ...a,
          URI: a.URI ? new URL(a.URI, base).href : undefined,
        });
    }
    if (line.startsWith("#EXT-X-STREAM-INF:")) pending = attributes(line);
    else if (line.startsWith("#EXT-X-MAP:")) {
      const a = attributes(line);
      if (a.BYTERANGE) throw new Error("Byte-range streams are not supported.");
      const next = new URL(a.URI, base).href;
      if (map && map !== next)
        throw new Error(
          "Streams with changing initialization data are not supported.",
        );
      map = next;
    } else if (line.startsWith("#EXTINF:"))
      duration += parseFloat(line.slice(8)) || 0;
    else if (line && !line.startsWith("#")) {
      const url = new URL(line, base).href;
      if (pending) {
        variants.push({ url, ...pending });
        pending = null;
      } else segments.push(url);
    }
  }
  return {
    variants,
    segments,
    audio,
    map,
    duration,
    ended: lines.includes("#EXT-X-ENDLIST"),
  };
}
export function chooseVariant(p) {
  const variant = [...p.variants].sort(
    (a, b) => Number(b.BANDWIDTH || 0) - Number(a.BANDWIDTH || 0),
  )[0];
  if (!variant) throw new Error("No video rendition was found.");
  const tracks = p.audio.filter((a) => a["GROUP-ID"] === variant.AUDIO);
  const audio =
    tracks.find((a) => a.DEFAULT === "YES") ||
    tracks.find((a) => a.AUTOSELECT === "YES") ||
    tracks[0];
  return { ...variant, audioUrl: audio?.URI };
}
export function safeName(title) {
  return (
    (title || "Whop video")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/, "")
      .slice(0, 150) || "Whop video"
  );
}
