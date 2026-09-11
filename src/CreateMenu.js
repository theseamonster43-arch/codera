import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, TAB_H, F } from './theme';
import { Shorts, Play, Code, Plus } from './Icons';
import ButtonFill from './ButtonFill';
import { BRAND } from './Gradient';

// Roughly the height of iOS 26's floating glass tab bar above the home
// indicator. The menu renders in a modal, outside the navigator that measures
// the real bar, so it can't ask.
const NATIVE_BAR_H = 70;

/** What the + button can make. Order is bottom-up, nearest the thumb first. */
export const KINDS = [
  { id: 'short', title: 'Record a short', sub: 'Under a minute, one idea', icon: Shorts },
  { id: 'video', title: 'Upload a video', sub: 'A full tutorial with voice', icon: Play },
  { id: 'post',  title: 'Write a post',   sub: 'Text and a code snippet',   icon: Code },
];

/**
 * The menu the + button opens.
 *
 * A Modal rather than a view inside the tab bar: the bar is pinned to the
 * bottom, and on Android anything drawn outside a parent's bounds still shows
 * but cannot be tapped — the options would have been visible and dead.
 *
 * Everything animates with the native driver (opacity and transform only), so
 * it stays smooth even while the JS thread is busy loading the next screen.
 */
/**
 * `native`: opened from Apple's tab bar, whose + is a separate circle at the
 * end of the bar rather than a button in the middle. There's no centre + for an
 * × to replace, so none is drawn — a tap anywhere outside closes the menu — and
 * the options sit above the floating glass bar instead of Codera's own.
 */
export default function CreateMenu({ open, onClose, onPick, native = false }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();

  // Kept mounted through the closing animation, then removed. Unmounting on
  // `open` going false would cut the exit off halfway.
  const [visible, setVisible] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.spring(progress, {
        toValue: 1, useNativeDriver: true, damping: 16, stiffness: 180, mass: 0.8,
      }).start();
    } else if (visible) {
      Animated.timing(progress, {
        toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setVisible(false); });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const backdrop = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  // The + turns into an × — the same button, now meaning "close", sitting in
  // exactly the place it was pressed.
  const spin = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={[s.stack, { bottom: (native ? NATIVE_BAR_H : TAB_H) + insets.bottom + 14 }]}
            pointerEvents="box-none">
        {KINDS.map((k, i) => {
          // Each option rises a little further and a little later than the one
          // below it, so they fan up out of the button instead of popping in as
          // a single block.
          const from = 26 + i * 16;
          const start = i * 0.14;
          const itemOpacity = progress.interpolate({
            inputRange: [start, Math.min(1, start + 0.55)], outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          const itemY = progress.interpolate({
            inputRange: [0, 1], outputRange: [from, 0],
          });
          const itemScale = progress.interpolate({
            inputRange: [0, 1], outputRange: [0.92, 1],
          });
          const Icon = k.icon;

          return (
            <Animated.View
              key={k.id}
              style={{ opacity: itemOpacity, transform: [{ translateY: itemY }, { scale: itemScale }] }}
            >
              <Pressable
                onPress={() => onPick(k.id)}
                style={({ pressed }) => [s.option, pressed && s.optionPressed]}
              >
                {/* The whole row is the button, so the icon's glass stays still. */}
                <ButtonFill style={s.icon} interactive={false}><Icon color="#fff" size={21} /></ButtonFill>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{k.title}</Text>
                  <Text style={s.sub}>{k.sub}</Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      {!native && (
        <View style={[s.closeRow, { bottom: insets.bottom, height: TAB_H }]} pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={10}>
            {/* Sits exactly where the + was, so it wears the same colours. */}
            <ButtonFill colors={BRAND} style={s.close}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Plus color="#fff" size={24} />
              </Animated.View>
            </ButtonFill>
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const styles = T => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.dark ? 'rgba(0,0,0,0.62)' : 'rgba(10,20,14,0.38)',
  },
  stack: { position: 'absolute', left: 16, right: 16, gap: 10 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    borderRadius: 16, padding: 13,
  },
  optionPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  icon: { width: 42, height: 42, borderRadius: 12 },
  title: { color: T.text, fontSize: 15, fontFamily: F['800'] },
  sub: { color: T.muted, fontSize: 12.5, fontFamily: F['400'], marginTop: 2 },
  closeRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  close: { width: 46, height: 32, borderRadius: 11 },
});
