import { FFmpeg } from "./vendor/ffmpeg/index.js";

// Remux only: original encoded audio/video are preserved, with no quality loss.
export async function mergeTracks(video, audio, signal) {
  signal.throwIfAborted();
  const ffmpeg = new FFmpeg();
  const abort = () => ffmpeg.terminate();
  signal.addEventListener("abort", abort, { once: true });
  const recent = [];
  ffmpeg.on("log", ({ message }) => {
    recent.push(message);
    if (recent.length > 8) recent.shift();
  });
  try {
    await ffmpeg.load({
      coreURL: new URL("./vendor/core/ffmpeg-core.js", import.meta.url).href,
      wasmURL: new URL("./vendor/core/ffmpeg-core.wasm", import.meta.url).href,
    });
    signal.throwIfAborted();
    await ffmpeg.writeFile(
      "video.media",
      new Uint8Array(await video.arrayBuffer()),
    );
    await ffmpeg.writeFile(
      "audio.media",
      new Uint8Array(await audio.arrayBuffer()),
    );
    const code = await ffmpeg.exec([
      "-i",
      "video.media",
      "-i",
      "audio.media",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);
    signal.throwIfAborted();
    if (code !== 0)
      throw new Error(
        "Could not combine the audio and video: " +
          recent.join(" ").slice(-450),
      );
    const bytes = await ffmpeg.readFile("output.mp4");
    return new Blob([bytes], { type: "video/mp4" });
  } finally {
    signal.removeEventListener("abort", abort);
    ffmpeg.terminate();
  }
}
