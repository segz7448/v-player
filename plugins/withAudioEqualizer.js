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
    const packageAdd = 'packages.add(AudioEqualizerPackage())';

    let updated = contents;

    if (!updated.includes(importLine)) {
      // Insert after the package declaration line.
      updated = updated.replace(
        /(package [^\n]+\n)/,
        `$1\n${importLine}\n`
      );
    }

    if (!updated.includes(packageAdd)) {
      // PackageList(this).packages is the standard Expo-generated hook point
      // for adding a package without disabling autolinking for everything else.
      const anchor = /(val packages = PackageList\(this\).packages\s*\n)/;
      if (anchor.test(updated)) {
        updated = updated.replace(anchor, `$1        ${packageAdd}\n`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[withAudioEqualizer] Could not find PackageList anchor in MainApplication; ' +
            'add `packages.add(AudioEqualizerPackage())` to getPackages() manually.'
        );
      }
    }

    config.modResults.contents = updated;
    return config;
  });

  return config;
};
