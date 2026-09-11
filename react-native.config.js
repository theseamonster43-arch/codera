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
};
