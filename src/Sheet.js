import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, Animated, Easing, BackHandler,
} from 'react-native';

import { useTheme, F } from './theme';
import Gradient, { BRAND } from './Gradient';

/**
 * Codera's own confirmation sheet, in place of the system's alert.
 *
 * A system alert on Android is a grey box in Roboto that looks like it came
 * from a different app, which for a question like "charge $10?" is exactly the
 * wrong feeling. This one is the app: its dark card, its typeface, and the
 * brand gradient on the button that says yes.
 *
 * Asked from anywhere, without threading state through screens:
 *
 *   if (await ask({ title, body, yes: 'Pay $10.00' })) { ... }
 *   await tell({ title: 'Card updated', body: '...' });
 *
 * <SheetHost /> is mounted once, at the root of the app.
 */

let open = null;

/** Asks a question. Resolves true only when the yes button is pressed. */
export function ask({ title, body, yes = 'OK', no = 'Not now', danger = false }) {
  return new Promise(resolve => {
    if (!open) { console.warn('[sheet] no SheetHost mounted'); resolve(false); return; }
    open({ title, body, yes, no, danger, resolve });
  });
}

/** Says something, with a single button to close it. */
export function tell({ title, body, ok = 'Done' }) {
  return ask({ title, body, yes: ok, no: null }).then(() => undefined);
}

export function SheetHost() {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const [sheet, setSheet] = useState(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    open = next => setSheet(next);
    return () => { open = null; };
  }, []);

  // Driven from JavaScript, not the native driver: a native animation started in
  // the same moment a Modal mounts can fail to attach on Android, which leaves
  // the sheet open at opacity 0 — invisible, and swallowing every tap.
  useEffect(() => {
    if (!sheet) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1, duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false,
    }).start();
  }, [sheet, fade]);

  const close = answer => {
    if (!sheet) return;
    const { resolve } = sheet;
    // Closed and answered straight away; the fade is decoration, and nothing
    // should wait on an animation callback that might never come.
    setSheet(null);
    resolve(answer);
  };

  // The back button means "no", as it would for any other dialog.
  useEffect(() => {
    if (!sheet) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(false); return true; });
    return () => sub.remove();
  });

  if (!sheet) return null;

  const rise = {
    opacity: fade,
    transform: [
      { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
      { scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
      <View style={s.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => sheet.no !== null && close(false)} />
        <Animated.View style={[s.card, rise]}>
          {/* A thin line of the brand across the top: this is Codera asking. */}
          <Gradient colors={sheet.danger ? [T.red, T.red] : BRAND} angle="horizontal" style={s.rule} />

          <Text style={s.title}>{sheet.title}</Text>
          {!!sheet.body && <Text style={s.body}>{sheet.body}</Text>}

          <View style={s.row}>
            {sheet.no !== null && (
              <Pressable onPress={() => close(false)} style={({ pressed }) => [s.no, pressed && s.pressed]}>
                <Text style={s.noTxt}>{sheet.no}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => close(true)} style={({ pressed }) => [s.yesWrap, pressed && s.pressed]}>
              {sheet.danger ? (
                <View style={[s.yes, { backgroundColor: T.red }]}>
                  <Text style={s.yesTxt}>{sheet.yes}</Text>
                </View>
              ) : (
                <Gradient colors={BRAND} style={s.yes}>
                  <Text style={s.yesTxt}>{sheet.yes}</Text>
                </Gradient>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = T => StyleSheet.create({
  scrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center', paddingHorizontal: 22,
  },
  card: {
    backgroundColor: T.bg2, borderRadius: 22, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20, overflow: 'hidden',
  },
  rule: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  title: { color: T.text, fontSize: 21, fontFamily: F['900'], letterSpacing: -0.6, lineHeight: 26 },
  body: { color: T.muted, fontSize: 15, fontFamily: F['500'], lineHeight: 22, marginTop: 10 },
  row: { flexDirection: 'row', gap: 10, marginTop: 22 },
  no: {
    flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg,
  },
  noTxt: { color: T.text, fontSize: 15.5, fontFamily: F['700'] },
  yesWrap: { flex: 1.35 },
  yes: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  yesTxt: { color: '#fff', fontSize: 15.5, fontFamily: F['800'] },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
