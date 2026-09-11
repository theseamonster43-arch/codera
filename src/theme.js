import { useColorScheme } from 'react-native';

/** Colours that mean the same thing in either appearance. */
const BRAND = {
  green:    '#22c55e',
  greenDim: '#16a34a',
  blue:     '#3b82f6',
  blueSoft: '#60a5fa',
  amber:    '#f59e0b',
  red:      '#ef4444',
  onGreen:  '#04140a',
};

export const DARK = {
  ...BRAND,
  dark:   true,
  bg:     '#080c0a',
  bg2:    '#0d1411',
  bg3:    '#111a15',
  border: 'rgba(34,197,94,0.12)',
  text:   '#e2e8e4',
  muted:  '#6b7b6f',
  // Behind a video or a short, which stays black in both appearances.
  stage:  '#000000',
};

export const LIGHT = {
  ...BRAND,
  dark:   false,
  bg:     '#f5f7f6',
  bg2:    '#ffffff',
  bg3:    '#ebefec',
  border: 'rgba(22,101,52,0.14)',
  text:   '#0f1a14',
  // Darker than the dark theme's muted: the same grey on white fails contrast.
  muted:  '#56655b',
  stage:  '#000000',
};

/**
 * The palette for whatever the device is set to, live.
 *
 * useColorScheme re-renders when the user switches appearance, so a screen
 * that reads its colours from here follows the change without restarting.
 * An unknown scheme falls back to dark, which is what the app was designed in.
 */
export function useTheme() {
  return useColorScheme() === 'light' ? LIGHT : DARK;
}
/**
 * Scoutie Sans, one family name per weight.
 *
 * Named files rather than fontWeight, because Android ignores fontWeight on a
 * custom font and renders everything at the weight of whichever file it finds.
 * These names are both the filenames Android matches on and the PostScript
 * names iOS matches on — checked against each file's name table, since a
 * mismatch works on one platform and silently falls back on the other.
 *
 * Scoutie Sans stops at 800, so '900' is ExtraBold rather than a missing file.
 * Asking for a family that is not bundled does not error — it quietly renders
 * the system font — which is why the heaviest real weight stands in for it.
 */
export const F = {
  '400': 'ScoutieSans-Regular',
  '500': 'ScoutieSans-Medium',
  '600': 'ScoutieSans-SemiBold',
  '700': 'ScoutieSans-Bold',
  '800': 'ScoutieSans-ExtraBold',
  '900': 'ScoutieSans-ExtraBold',
};

/**
 * Height of the tab bar, excluding the device's own gesture inset.
 *
 * Screens that draw full-bleed content need it to keep their last item clear
 * of the bar, so it lives here rather than being guessed at in each one.
 */
export const TAB_H = 58;

/** 1.2k, 3.4M — the counts under a video. */
export function compact(n) {
  if (n == null) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/** 7:38 */
export function clock(sec) {
  if (sec == null || !isFinite(sec)) return '';
  const s = Math.floor(sec);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
