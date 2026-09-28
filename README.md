# Lesson Saver for Whop

An independent Chrome side-panel extension for collecting and downloading videos you own or have permission to download from Whop lessons. Not affiliated with Whop or Mux.

## What it does

- Detects video players in the currently open Whop lesson, including Mux players with open shadow roots.
- Lets you select videos and add them to a local download list.
- Downloads the list with progress, stop, and retry controls.
- Combines separate audio and video streams into one MP4 locally, without re-encoding.
- Keeps signed playback links in session memory rather than persistent queue storage.

## Install the development version

1. Download or clone this repository.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose Load unpacked and select the `extension` folder.
4. Open a Whop lesson, then click the extension to open its side panel.
5. Scan the page, select a detected video, and add it to your list.
6. Open and scan other lessons if needed, then click Download all.

Keep the panel open while downloading. Files save in Downloads/Whop Videos. After restarting Chrome or updating the extension, rescan unfinished lessons to refresh their temporary links. Reload the extension after changing its files.

## Supported formats and limitations

Chrome 116 or newer. Whop and Mux HTTPS sources. Direct MP4, WebM, and MOV files; completed, unencrypted HLS streams. The highest-bandwidth rendition and its default audio track are selected. Separate streams produce MP4; already combined MPEG-TS streams produce TS files.

No DRM or access-control bypass. No live streams, byte-range HLS, or changing initialization data. A 1 GB limit applies to streaming downloads; local processing can use several times the media size in memory. Unopened lessons must be opened and scanned individually. Source-site changes can affect compatibility.

## Privacy

No accounts, analytics, advertising, or publisher-operated download backend are implemented. The extension directly requests the media chosen by the user. Download-list metadata stays in the browser profile; signed URLs are held in session memory. See [privacy policy](docs/privacy.html).

## Development

```sh
npm ci
npm test
npm run package
```

The extension's own JavaScript is shipped as readable source; there is no compilation step. Third-party FFmpeg JavaScript and WebAssembly are bundled under `extension/vendor` and loaded locally. Packaging creates a ZIP with manifest.json at its root.

## Third-party source materials

The application is GPL-2.0-or-later. Third-party files retain their licenses; see [notices](extension/THIRD-PARTY.md). The source-materials archive accompanying releases contains the FFmpeg source tree, dependency sources, and build scripts matching the selected upstream release references. SOURCES.json records commit IDs and SHA-256 hashes. BUNDLED-BINARY-HASHES.json identifies the unmodified npm distribution files.

The npm core version 0.12.10 corresponds to the ffmpeg.wasm repository's **v12.15** tag, not its older v0.12.10 tag. Exact upstream build reproduction has not been performed; see the source archive's README for the verification scope.

## Support

Report bugs through this repository's Issues page. Include your Chrome version and an error description. Do not post signed media URLs, passwords, private course materials, or account credentials.
