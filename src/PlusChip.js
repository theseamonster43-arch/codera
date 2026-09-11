import React from 'react';
import { Text, StyleSheet } from 'react-native';

import { F } from './theme';
import Gradient, { BRAND } from './Gradient';

/**
 * The PLUS tag. On the brand gradient, like the mark itself — Plus is part of
 * the Codera brand, which is the one place the app uses a gradient.
 */
export default function PlusChip({ big }) {
  return (
    <Gradient colors={BRAND} style={[s.chip, big && s.chipBig]}>
      <Text style={[s.txt, big && s.txtBig]}>PLUS</Text>
    </Gradient>
  );
}

const s = StyleSheet.create({
  chip: { height: 18, paddingHorizontal: 6, borderRadius: 5 },
  chipBig: { height: 26, paddingHorizontal: 9, borderRadius: 7 },
  txt: { color: '#fff', fontSize: 10, fontFamily: F['900'], letterSpacing: 0.8 },
  txtBig: { fontSize: 13, letterSpacing: 1.1 },
});
