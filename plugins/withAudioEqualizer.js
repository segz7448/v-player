const { withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_JAVA_PATH = 'com/matthew/videoplayerapp/equalizer';
const SOURCE_DIR = 'android-native/equalizer';

/**
 * withAudioEqualizer
 *
 * `expo prebuild` regenerates the android/ folder from scratch, so native
 * source files can't just live under android/ directly in version control —
 * they'd be wiped on the next prebuild. Instead the Kotlin sources live in
 * android-native/equalizer/ at the project root, and this plugin copies
 * them into the generated project (mirroring what a native module's own
 * `android/` folder would do if this were published as a real package) and
 * registers AudioEqualizerPackage in MainApplication's package list.
 */
module.exports = function withAudioEqualizer(config) {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, SOURCE_DIR);
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        PACKAGE_JAVA_PATH
      );

      if (!fs.existsSync(srcDir)) {
        // eslint-disable-next-line no-console
        console.warn(`[withAudioEqualizer] Source dir not found: ${srcDir}`);
        return config;
      }

      fs.mkdirSync(destDir, { recursive: true });

      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith('.kt')) continue;
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }

      return config;
    },
  ]);

  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;
    const importLine = 'import com.matthew.videoplayerapp.equalizer.AudioEqualizerPackage';
    const packageAdd = 'add(AudioEqualizerPackage())';

    let updated = contents;

    if (!updated.includes(importLine)) {
      // Insert after the package declaration line.
      updated = updated.replace(
        /(package [^\n]+\n)/,
        `$1\n${importLine}\n`
      );
    }

    if (!updated.includes(packageAdd)) {
      // RN 0.76's generated MainApplication.kt (both the community template
      // and Expo prebuild's version of it) writes getPackages() as:
      //
      //   override fun getPackages(): List<ReactPackage> =
      //       PackageList(this).packages.apply {
      //         // add(MyReactNativePackage())
      //       }
      //
      // There is no standalone `val packages = ...` line to anchor on —
      // an earlier version of this plugin assumed one existed (a pattern
      // from older RN/Java templates) and its regex never matched here,
      // so the package silently never got registered. The reliable anchor
      // is the `.apply {` block opener itself, which exists in both the
      // Kotlin and (as a fallback) older Java-style templates.
      const applyAnchor = /(PackageList\(this\)\.packages\.apply\s*\{\s*\n)/;
      const legacyValAnchor = /(val packages = PackageList\(this\)\.packages\s*\n)/;

      if (applyAnchor.test(updated)) {
        updated = updated.replace(applyAnchor, `$1          ${packageAdd}\n`);
      } else if (legacyValAnchor.test(updated)) {
        updated = updated.replace(
          legacyValAnchor,
          `$1        packages.${packageAdd}\n`
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[withAudioEqualizer] Could not find a getPackages() anchor in MainApplication.kt; ' +
            `add \`${packageAdd}\` inside getPackages() manually.`
        );
      }
    }

    config.modResults.contents = updated;
    return config;
  });

  return config;
};
