/**
 * Registers assets/fonts with the native projects.
 *
 * `npx react-native-asset` copies these into android/app/src/main/assets/fonts
 * and lists them under UIAppFonts in the iOS Info.plist. Run it again after
 * adding or renaming a font; nothing picks them up automatically.
 */
module.exports = {
  project: { ios: {}, android: {} },
  assets: ['./assets/fonts'],
  dependencies: {
    // Apple's native tab bar is only used on iOS 26 iPhones; Android keeps
    // Codera's own bar, so this package's Android half isn't linked at all. Its
    // Android build script also pins a 2022 Android Gradle plugin that no longer
    // resolves, which fails the whole build.
    'react-native-bottom-tabs': { platforms: { android: null } },
  },
};
