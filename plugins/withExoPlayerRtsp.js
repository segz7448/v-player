const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * withExoPlayerRtsp
 *
 * react-native-video bundles core ExoPlayer but not every media3 extension.
 * RTSP playback needs the separate `media3-exoplayer-rtsp` artifact. This
 * plugin appends that dependency to android/app/build.gradle during
 * `expo prebuild`, so `rtsp://` sources work on Android without hand-editing
 * generated native files after every prebuild.
 *
 * Version is pinned to match the media3 version react-native-video ships;
 * bump alongside react-native-video upgrades if playback of rtsp:// starts
 * failing after a dependency bump. (Bumped to 1.8.0 alongside the SDK 52
 * upgrade, since react-native-video now pulls media3 1.8.0 for everything
 * else — mismatched media3 artifact versions can cause runtime crashes even
 * when the build compiles.)
 */
const RTSP_DEPENDENCY = 'androidx.media3:media3-exoplayer-rtsp:1.8.0';

module.exports = function withExoPlayerRtsp(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const marker = 'implementation "androidx.media3:media3-exoplayer-rtsp';

    if (contents.includes(marker)) {
      return config;
    }

    const dependenciesBlockRegex = /dependencies\s*{/;
    if (!dependenciesBlockRegex.test(contents)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[withExoPlayerRtsp] Could not find a dependencies { } block in app/build.gradle; RTSP extension was not added automatically. Add it manually:\n' +
          `    implementation "${RTSP_DEPENDENCY}"`
      );
      return config;
    }

    config.modResults.contents = contents.replace(
      dependenciesBlockRegex,
      `dependencies {\n    implementation "${RTSP_DEPENDENCY}"`
    );

    return config;
  });
};
