import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';

import { BRAND } from './Gradient';

/**
 * The </> glyph, in a 100×100 box.
 *
 * The same shapes the app icon and the launch screens are drawn from, so the
 * logo on the home screen, on the launch screen and inside the app is one
 * drawing rather than three that nearly match. Drawn as strokes, not as text,
 * because a font's </> changes with the font and would drift from the icon.
 */
const GLYPH = 'M35 35.5 L21.5 50 L35 64.5 M65 35.5 L78.5 50 L65 64.5 M55.5 32.5 L44.5 67.5';

/** The Codera mark: the glyph on the green→blue tile. */
export default function Mark({ size = 30 }) {
  // Each gradient needs its own id; see Gradient.js.
  const id = 'mk' + useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        {/* userSpaceOnUse in viewBox units: fixed coordinates, not percentages,
            which Android resolves against the wrong size on first layout. */}
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
          <Stop offset="0" stopColor={BRAND[0]} />
          <Stop offset="1" stopColor={BRAND[1]} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="100" rx="30" fill={`url(#${id})`} />
      <Path
        d={GLYPH}
        fill="none"
        stroke="#fff"
        // A touch heavier when small, where the icon's weight turns spindly.
        strokeWidth={size >= 48 ? 6.2 : 7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
