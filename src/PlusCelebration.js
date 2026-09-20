import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing, useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';

import { useTheme, F } from './theme';
import Gradient, { BRAND } from './Gradient';
import Mark from './Mark';
import { Check, Sparkle } from './Icons';

/**
 * The moment someone becomes a Plus member, or keeps being one.
 *
 * The mark drops in and overshoots, three gradient rings ripple out from it,
 * a spray of green and blue sparks flies off in every direction, a check lands
 * on the mark's corner, and only then does the text rise in. About a second and
 * a half end to end: long enough to feel like something happened, short enough
 * that nobody waits for it.
 *
 * Everything runs on the native driver, so it stays smooth even while the app
 * behind it is still catching up with the webhook.
 */

const SPARKS = 22;
const MARK = 108;

const clean = raw => raw.replace(/[^a-zA-Z0-9]/g, '');

/** A ring stroked with the brand gradient. */
function Ring({ size }) {
  const id = clean(useId());
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
          <Stop offset="0" stopColor={BRAND[0]} />
          <Stop offset="1" stopColor={BRAND[1]} />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 2} stroke={`url(#${id})`} strokeWidth={3} fill="none" />
    </Svg>
  );
}

/** The soft green-and-blue glow the whole scene sits in. */
function Glow({ width, height }) {
  const id = clean(useId());
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={`g${id}`} cx={width * 0.35} cy={height * 0.38} r={width * 0.75} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND[0]} stopOpacity={0.32} />
          <Stop offset="1" stopColor={BRAND[0]} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`b${id}`} cx={width * 0.68} cy={height * 0.46} r={width * 0.75} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND[1]} stopOpacity={0.3} />
          <Stop offset="1" stopColor={BRAND[1]} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#g${id})`} />
      <Rect width={width} height={height} fill={`url(#b${id})`} />
    </Svg>
  );
}

export default function PlusCelebration({ title, body, button = 'Done', onDone }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const { width, height } = useWindowDimensions();
  // Each take of the burst. Tapping the mark plays it again — nobody should
  // have to buy something twice to see it twice.
  const [take, setTake] = useState(0);

  const scene = useRef(new Animated.Value(0)).current;   // backdrop
  const drop = useRef(new Animated.Value(0)).current;    // the mark
  const tick = useRef(new Animated.Value(0)).current;    // the check badge
  const words = useRef(new Animated.Value(0)).current;   // title and body
  const cta = useRef(new Animated.Value(0)).current;     // the button
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const burst = useRef(new Animated.Value(0)).current;   // every spark at once

  // Where each spark flies: evenly around the circle, jittered so it reads as
  // a burst rather than a clock face, at a mix of distances and sizes.
  const sparks = useMemo(() => Array.from({ length: SPARKS }, (_, i) => {
    const angle = (i / SPARKS) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist = 120 + Math.random() * Math.min(width, 420) * 0.42;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      size: 5 + Math.random() * 7,
      star: i % 4 === 0,
      color: i % 2 === 0 ? BRAND[0] : BRAND[1],
      spin: (Math.random() - 0.5) * 540,
    };
  }), [width, take]);

  useEffect(() => {
    // A replay starts from nothing again, except the backdrop, which stays up.
    [drop, tick, words, cta, burst, ...rings].forEach(v => v.setValue(0));
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    Animated.parallel([
      Animated.timing(scene, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(80),
        Animated.spring(drop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(260),
        Animated.timing(burst, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.stagger(170, rings.map(r => Animated.sequence([
        Animated.delay(240),
        Animated.timing(r, { toValue: 1, duration: 1200, easing: ease, useNativeDriver: true }),
      ]))),
      Animated.sequence([
        Animated.delay(620),
        Animated.spring(tick, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(760),
        Animated.timing(words, { toValue: 1, duration: 520, easing: ease, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(980),
        Animated.timing(cta, { toValue: 1, duration: 460, easing: ease, useNativeDriver: true }),
      ]),
    ]).start();
  }, [scene, drop, tick, words, cta, rings, burst, take]);

  const rise = v => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.scene, { opacity: scene }]}>
      <Glow width={width} height={height} />

      <View style={s.stage}>
        {/* Ripples, behind everything else at the centre. */}
        {rings.map((r, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[s.centred, {
              opacity: r.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.55, 2.6] }) }],
            }]}
          >
            <Ring size={MARK + 40} />
          </Animated.View>
        ))}

        {/* The sparks. */}
        {sparks.map((p, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[s.centred, {
              opacity: burst.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
                { scale: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1.2, 0.5] }) },
              ],
            }]}
          >
            {p.star
              ? <Sparkle color={p.color} size={p.size * 2.4} filled />
              : <View style={{ width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color }} />}
          </Animated.View>
        ))}

        {/* The mark, dropping in with an overshoot, and its check. Tap to replay. */}
        <Animated.View onTouchEnd={() => setTake(t => t + 1)} style={[s.centred, {
          opacity: drop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) },
            { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
          ],
        }]}>
          <View style={s.markShadow}>
            <Mark size={MARK} />
          </View>
          <Animated.View style={[s.badgeWrap, {
            opacity: tick,
            transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
          }]}>
            <Gradient colors={BRAND} style={s.badge}>
              <Check color="#fff" size={20} />
            </Gradient>
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View style={[s.copy, rise(words)]}>
        <Text style={s.title}>{title}</Text>
        {!!body && <Text style={s.body}>{body}</Text>}
      </Animated.View>

      <Animated.View style={[s.footer, rise(cta)]}>
        <Pressable onPress={onDone} style={({ pressed }) => [pressed && s.pressed]}>
          <Gradient colors={BRAND} style={s.button}>
            <Text style={s.buttonTxt}>{button}</Text>
          </Gradient>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = T => StyleSheet.create({
  scene: { backgroundColor: T.bg, zIndex: 50, elevation: 50 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centred: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  markShadow: {
    shadowColor: BRAND[0], shadowOpacity: 0.55, shadowRadius: 28, shadowOffset: { width: 0, height: 10 },
    elevation: 18, borderRadius: 32,
  },
  badgeWrap: { position: 'absolute', right: -12, bottom: -12 },
  badge: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: T.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  copy: { paddingHorizontal: 30, marginBottom: 34, alignItems: 'center' },
  title: {
    color: T.text, fontSize: 30, fontFamily: F['900'], letterSpacing: -1,
    textAlign: 'center', lineHeight: 36,
  },
  body: {
    color: T.muted, fontSize: 15.5, fontFamily: F['500'], lineHeight: 23,
    textAlign: 'center', marginTop: 10,
  },
  footer: { paddingHorizontal: 22, paddingBottom: 38 },
  button: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonTxt: { color: '#fff', fontSize: 16.5, fontFamily: F['800'] },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
