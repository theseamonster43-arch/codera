import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';

import { TAB_H } from './theme';

/**
 * How much of the bottom of a tab screen the tab bar covers, for either bar.
 *
 * Inside Apple's native tab bar (iOS 26 iPhones) the navigator measures the
 * real bar and provides its height; content scrolls on under the glass, so this
 * is padding, not a gap. Everywhere else it's Codera's own bar: TAB_H plus the
 * home-indicator inset. Before the native bar's first measurement it reports 0,
 * hence the floor at the safe-area inset.
 */
export default function useTabSpace() {
  const insets = useSafeAreaInsets();
  const nativeBar = useContext(BottomTabBarHeightContext);
  if (nativeBar !== undefined) return Math.max(nativeBar, insets.bottom);
  return TAB_H + insets.bottom;
}

/** True inside the native tab bar, where scenes run full height under the glass. */
export function useNativeTabBar() {
  return useContext(BottomTabBarHeightContext) !== undefined;
}
