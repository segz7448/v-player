const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * withAndroidGradlePluginVersion
 *
 * Expo SDK 51's default template pins the Android Gradle Plugin to 8.2.1,
 * whose maximum supported compileSdkVersion is 34. react-native-video now
 * pulls in androidx.media3 1.8.0, which requires compileSdk 35+. Bumping
 * compileSdkVersion via expo-build-properties alone isn't enough — AGP
 * itself needs to be new enough to allow it, and there's no expo-build-properties
 * option for AGP version, so this plugin rewrites the classpath line in the
 * generated root build.gradle during `expo prebuild`.
 *
 * Bump AGP_VERSION here if media3 (or another dependency) raises its
 * required compileSdk again in the future.
 */
const AGP_VERSION = '8.3.2';

module.exports = function withAndroidGradlePluginVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const classpathRegex = /classpath\(["']com\.android\.tools\.build:gradle:[^"']+["']\)/;

    if (!classpathRegex.test(contents)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[withAndroidGradlePluginVersion] Could not find AGP classpath line in root build.gradle; ' +
          `set it manually to com.android.tools.build:gradle:${AGP_VERSION}`
      );
      return config;
    }

    config.modResults.contents = contents.replace(
      classpathRegex,
      `classpath("com.android.tools.build:gradle:${AGP_VERSION}")`
    );

    return config;
  });
};
