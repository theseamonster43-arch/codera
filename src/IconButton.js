import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LiquidGlassView } from '@callstack/liquid-glass';

import { GLASS } from './ButtonFill';
import { useTheme } from './theme';

/**
 * A round button holding one icon: real Liquid Glass where iOS has it, and a
 * quiet filled circle everywhere else.
 *
 * Untinted, unlike ButtonFill — these sit in headers and over content, where a
 * blue button would read as the main action of the screen when it isn't.
 */
export default function IconButton({ children, size = 38, style }) {
  const T = useTheme();
  const shape = {
    width: size, height: size, borderRadius: size / 2,
    alignItems: 'center', justifyContent: 'center',
  };

  if (GLASS) {
    return (
      <LiquidGlassView style={[shape, style]} interactive effect="regular" colorScheme="system">
        {children}
      </LiquidGlassView>
    );
  }

  return <View style={[shape, s.plain(T), style]}>{children}</View>;
}

const s = {
  plain: T => ({
    backgroundColor: T.bg2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
  }),
};
