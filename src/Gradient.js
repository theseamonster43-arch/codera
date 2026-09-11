import React, { useId, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/** The blue used on primary actions. */
export const BLUE = ['#3b82f6', '#60a5fa'];

/** Green into blue, for the Codera mark only. */
export const BRAND = ['#22c55e', '#60a5fa'];

/**
 * A gradient fill behind its children.
 *
 * Drawn with react-native-svg, which the app already links, rather than adding
 * a dedicated gradient package — that would mean another native module and a
 * full rebuild for something SVG does natively.
 */
export default function Gradient({ colors = BLUE, style, children, angle = 'diagonal' }) {
  // Each gradient needs its own id: SVG resolves url(#id) against the whole
  // document, so two buttons sharing one would both paint whichever defined it
  // last. useId's colons are not valid inside url(), hence the replace.
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const end = angle === 'horizontal' ? { x2: '1', y2: '0' } : { x2: '1', y2: '1' };

  // Sized in pixels from the real layout, not with 100%. On Android the SVG
  // resolves percentages against its first measurement, which is taken before
  // the view has its final width — a button whose label is still being laid
  // out came out half-filled, with white text over the unpainted half.
  const [box, setBox] = useState(null);
  const onLayout = e => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || box.width !== width || box.height !== height) setBox({ width, height });
  };

  return (
    <View style={[s.wrap, style]} onLayout={onLayout}>
      {box ? (
        <Svg style={StyleSheet.absoluteFill} width={box.width} height={box.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" {...end}>
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={box.width} height={box.height} fill={`url(#${id})`} />
        </Svg>
      ) : (
        // One frame of flat colour before layout, rather than a flash of
        // nothing behind white text.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors[0] }]} />
      )}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  // Clipping lives here so the gradient takes the corner radius passed in by
  // the caller instead of painting a square underneath it.
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
