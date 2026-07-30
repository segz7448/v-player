# Video Player App

Android app: paste a video link (direct file or HLS/DASH stream) and play it
full-screen, with adaptive/low-data quality control. No embedded webpages, no
ad popups — the app plays the media directly through ExoPlayer
(via `react-native-video`), so there's no ad-injected wrapper page to strip.

## What's here

```
App.tsx                        # entry point
app.json                       # Expo config (bare workflow target)
src/
  screens/
    HomeScreen.tsx              # link input, paste, subtitle picker, quality toggle, Library button
    PlayerScreen.tsx             # fullscreen player: seek bar, double-tap seek, quality picker,
                                  # subtitles, favorite toggle, buffer %
    LibraryScreen.tsx            # Favorites + Recently played (History) tabs
  components/
    DataSaverToggle.tsx          # Auto / Low / Medium / High quality cap
  utils/
    linkResolver.ts               # detects direct file vs HLS (.m3u8) vs DASH (.mpd), subtitle type
    dataSaverContext.tsx          # app-wide quality-cap state
    library.ts                    # AsyncStorage-backed favorites + history persistence
  navigation/
    RootNavigator.tsx             # Home -> Player / Library stack
    types.ts
```

## Features

- Paste or type a link, autodetects direct file / HLS / DASH / Smooth Streaming
- Fullscreen player (ExoPlayer via react-native-video), no embedded webview, no ad popups
- **Seek bar** — drag to scrub anywhere in the video
- **Double-tap seek** — double-tap the left third of the screen to jump back
  10s, the right third to jump forward 10s. Tapping again quickly within the
  same side accumulates: 10s, 20s, 30s... same logic as YouTube/most players.
  A brief on-screen badge shows the running total; it resets after a short
  pause between taps.
- **Buffering indicator** — shows a live percentage based on how much of the
  video is buffered ahead of the playhead (via `playableDuration`), not a
  fake/simulated number
- **Resolution / quality manual picker** — for adaptive sources (HLS/DASH)
  that expose multiple renditions, tap "Quality" to pick a specific
  resolution/bitrate instead of leaving it on Auto. For single-rendition
  direct files there's nothing to pick, so this button only appears when
  real alternate tracks exist.
- **Subtitles** — pick a local `.srt`, `.vtt`, or `.ttml` file from the Home
  screen before playing; toggle captions on/off from the player's top bar
- **Favorites** — star icon in the player saves the current link; manage
  saved links from Library > Favorites
- **History** — every played link is recorded automatically with last
  playback position, so picking it again from Library > Recently played
  resumes where you left off
- Data-saver quality cap (Auto/Low/Medium/High) for adaptive streams
- Keeps screen awake during playback, free rotation for landscape
- **Audio track selection** — for sources with multiple language tracks, tap
  "Audio" in the top bar to switch between them
- **Volume/brightness swipe gestures** — swipe up/down on the right side of
  the screen for volume, left side for brightness, with an on-screen level
  indicator while swiping
- **Picture-in-picture** — tap "PiP" (Android only) to shrink playback into a
  floating window and keep using the phone; requires Android 8.0 (API 26)+

## Requirements

- Node.js 18+ and npm
- Android Studio (SDK + emulator, or a physical device with USB debugging)
- A JDK compatible with your Android Gradle Plugin version (JDK 17 recommended)

This project uses the **bare/prebuild Expo workflow** — not Expo Go, and no
EAS cloud build. Everything compiles locally through Gradle.

## Build steps (all local, no Termux, no EAS)

```bash
# 1. Install dependencies
npm install

# 2. Generate the native android/ project from the Expo config
npx expo prebuild --platform android

# 3. Build and install directly via local Gradle (device or emulator)
npx expo run:android
```

`expo run:android` invokes your local Gradle wrapper under the hood — it does
not talk to Expo's build servers. If you'd rather build the APK by hand:

```bash
cd android
./gradlew assembleRelease
# APK will be at android/app/build/outputs/apk/release/app-release.apk
```

For a release build you'll need to set up your own signing key (see
`android/app/build.gradle` -> `signingConfigs` after prebuild generates it).

## How quality/data-saving works

`react-native-video` wraps ExoPlayer on Android, which already does adaptive
bitrate switching for HLS/DASH sources based on measured bandwidth. The
in-app "Quality" toggle (Auto / Low / Medium / High) caps the maximum
bitrate ExoPlayer is allowed to select, so on a weak connection you can force
it down manually instead of waiting for auto-detection.

For single-rendition direct files (e.g. a plain .mp4 with no alternate
bitrates), there is nothing to switch between — the toggle has no effect on
those, since ExoPlayer can't upscale bitrate that isn't present in the file.

## Supported link types

- Direct files: `.mp4`, `.m4v`, `.mov`, `.mkv`, `.webm`, `.avi`, `.ts`, `.flv`, `.wmv`
- HLS: `.m3u8`
- DASH: `.mpd`
- Smooth Streaming: `.ism`
- RTSP: `rtsp://`, `rtsps://` — Android only, via the ExoPlayer RTSP
  extension (`androidx.media3:media3-exoplayer-rtsp`), added by the
  `withExoPlayerRtsp` config plugin during `expo prebuild`. Not supported
  on iOS.
- UDP/RTP multicast: `udp://`, `rtp://` — Android only, same ExoPlayer
  extension coverage as RTSP.
- SMB shares: `smb://`, `cifs://` — attempted directly; only works for
  servers that allow unauthenticated/guest access, since the app doesn't
  yet collect share credentials.
- FTP: `ftp://`, `ftps://` — attempted directly; same caveat as SMB for
  servers that require login.
- RTMP: `rtmp://`, `rtmps://`, `rtmpt://` are detected but rejected with an
  explanation — the ExoPlayer RTMP extension was discontinued upstream, so
  there is no working playback path for it in this app. Restream RTMP to
  HLS if you need to play that source.
- Anything without a recognizable extension is passed to ExoPlayer as-is,
  which will attempt to sniff the format.

Each resolved link carries a `supportLevel` (`native` / `extension` /
`passthrough` / `unsupported`); the player shows a dismissible banner with
details whenever a link isn't in the fully-native tier, so playback
limitations are visible up front instead of surfacing as a silent failure.

## Equalizer / audio boost

Android only, and requires a native build (not available in Expo Go). Adds
an "EQ" button to the player's top bar which opens a modal with:

- Per-band gain sliders — band count and frequency ranges are read from
  the device's actual platform `Equalizer` effect, since these vary by
  OEM rather than being a fixed 5-band layout everywhere.
- Presets (Flat, Bass boost, Vocal boost, Treble boost) applied as
  proportional band curves rather than the platform's built-in presets,
  since those are inconsistently available across devices.
- A boost slider (0 to +20dB) backed by Android's `LoudnessEnhancer`
  effect, which provides genuine gain beyond 100% — a plain EQ can only
  attenuate/boost within a file's existing headroom, so this is a
  separate effect chained after it.

**Known limitation**: `react-native-video` doesn't expose ExoPlayer's
per-instance Android audio session id to JS (no `onAudioSessionId`
callback or equivalent prop exists in its public API). The native module
(`android-native/equalizer/AudioEqualizerModule.kt`) therefore attaches
to Android's global output session (id `0`), which is where ExoPlayer's
audio lands by default. In practice, for a single-video-player app like
this one, that's equivalent to scoping it to the player — but the EQ will
also affect any other audio the app plays through the default session if
one is ever added. This is documented in the native module's own comments
in case a future `react-native-video` release adds real session reporting.

## Still not implemented

Playback speed control, background audio playback, casting, lock-screen
media controls, and SMB/FTP credential entry are not in this build — ask
if you want any of these added next.

## Notes on the new features

- **Volume/brightness gestures**: on Android, per-app screen brightness
  (`expo-brightness`'s `setBrightnessAsync`) does not require the
  `WRITE_SETTINGS` permission — that's only needed for changing the
  system-wide brightness, which this app does not do. Volume uses
  `react-native-volume-manager`, which requires a bare/prebuild dev client
  (this project already is one) since it's a native module.
- **Audio track selection**: only shows up in the top bar when a source
  actually reports more than one audio track (e.g. multi-language streams).
  Single-audio-track files won't show the button, since there's nothing to
  switch between.
- **Picture-in-picture**: Android-only here (the button is hidden on other
  platforms). Requires Android 8.0+ and the device/launcher to support PiP
  windows; behavior can vary slightly by OEM (Samsung, Xiaomi, etc. sometimes
  restrict background PiP unless the app is granted the "Appear on top"
  permission by the user).

## Scope note

This app is meant for links you have the rights to play (your own uploads,
self-hosted files, direct media URLs) — it does not scrape, proxy, or strip
ads from third-party platforms' pages, and is not designed for sites like
YouTube or Netflix.
