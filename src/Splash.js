import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Animated, Easing, StyleSheet, StatusBar } from 'react-native';

import { useTheme, F } from './theme';
import Mark from './Mark';

/**
 * Must match the native launch screens exactly — the tile in
 * android/.../drawable/splash_mark.xml and the SplashMark image in iOS's
 * LaunchScreen.storyboard. This screen takes over from those, and any
 * difference in size or position shows as a jump at the hand-off.
 */
export const MARK = 72;
const GAP = 16;

/**
 * What shows while Codera starts.
 *
 * It opens as the native launch screen left it — the tile alone, centred — then
 * the tile moves aside and the name slides in beside it, the same lockup as the
 * header. Once sign-in has been checked it fades away to reveal the app.
 */
export default function Splash({ ready, onDone }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  const [nameW, setNameW] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const shift = useRef(new Animated.Value(0)).current;
  const name = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  // Read through a ref: the parent passes a fresh function on every render, and
  // restarting the fade each time it re-renders would call onDone twice.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Waits for the name to be measured: the tile has to move by half of the
  // name's width to leave the pair centred, and that width depends on the font.
  useEffect(() => {
    if (!nameW) return;
    Animated.parallel([
      Animated.timing(shift, {
        toValue: -(nameW + GAP) / 2, duration: 560, delay: 120,
        easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true,
      }),
      Animated.timing(name, {
        toValue: 1, duration: 460, delay: 240,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start(() => setIntroDone(true));
  }, [nameW, shift, name]);

  // Held until both the intro has played and the app knows who is signed in:
  // whichever finishes second decides when it goes, so a fast start still
  // shows the name, and a slow one never fades out to an empty screen.
  useEffect(() => {
    if (!ready || !introDone) return;
    Animated.timing(fade, {
      toValue: 0, duration: 280, delay: 200,
      easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(({ finished }) => finished && doneRef.current && doneRef.current());
  }, [ready, introDone, fade]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, s.fill, { opacity: fade }]}
      pointerEvents={ready && introDone ? 'none' : 'auto'}
    >
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />

      <Animated.View style={{ transform: [{ translateX: shift }] }}>
        <Mark size={MARK} />

        {/* Absolutely placed beside the tile so it never pushes the tile off
            centre — the tile starts exactly where the launch screen drew it. */}
        <View style={s.nameBox} pointerEvents="none">
          <Animated.Text
            style={[s.name, {
              opacity: name,
              transform: [{ translateX: name.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
            }]}
            numberOfLines={1}
            onLayout={e => setNameW(e.nativeEvent.layout.width)}
          >
            Codera
          </Animated.Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = T => StyleSheet.create({
  fill: { backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  nameBox: {
    position: 'absolute', left: MARK + GAP, top: 0, height: MARK,
    // Wide enough for the name at any font scale; the Text sizes to its content.
    width: 600, justifyContent: 'center', alignItems: 'flex-start',
  },
  name: { color: T.text, fontSize: 44, fontFamily: F['900'], letterSpacing: -1.2 },
});
