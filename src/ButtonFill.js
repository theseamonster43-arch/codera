import React from 'react';
import { StyleSheet } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

import { useTheme } from './theme';
import Gradient from './Gradient';

/**
 * Real UIGlassEffect where the OS has it: iOS 26 and later.
 *
 * A boolean, not a function, despite reading like one: iOS takes it from the
 * native module's constants at load, and every other platform exports plain
 * `false`. Calling it throws "false is not a function" before the app renders.
 */
export const GLASS = isLiquidGlassSupported;

/**
 * The fill behind a primary button.
 *
 * Apple's Liquid Glass tinted Codera blue where iOS supports it, and the blue
 * gradient everywhere else — Android, and iPhones before iOS 26, where the glass
 * view would render as nothing at all. The glass replaces the gradient rather
 * than sitting over it: glass on a gradient just reads as a muddy blur.
 *
 * `interactive` gives the button UIKit's own press — it swells and catches a
 * shimmer. Leave it off for a fill that isn't the thing being pressed, like an
 * icon inside a larger tappable row.
 */
export default function ButtonFill({ style, children, interactive = true, colors }) {
  const T = useTheme();

  // `colors` only changes the gradient; the glass stays tinted blue either way.
  if (!GLASS) return <Gradient colors={colors} style={style}>{children}</Gradient>;

  return (
    <LiquidGlassView
      style={[s.glass, style]}
      interactive={interactive}
      effect="regular"
      tintColor={T.blue}
      colorScheme="system"
    >
      {children}
    </LiquidGlassView>
  );
}

// No overflow: hidden, unlike the gradient: it would clip the swell of the
// interactive press, which grows slightly past the button's edge.
const s = StyleSheet.create({
  glass: { alignItems: 'center', justifyContent: 'center' },
});
