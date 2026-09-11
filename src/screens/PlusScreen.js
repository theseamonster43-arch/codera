import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, StatusBar, ActivityIndicator, Alert,
  Animated, Easing, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';

import { useTheme, F } from '../theme';
import {
  usePlus, plusDate, subscribePlus, cancelPlus,
  PLUS_PRICE, PLUS_INTERVAL, PLUS_TEST_MODE,
} from '../plus';
import { Sparkle, Check, Close } from '../Icons';
import ButtonFill from '../ButtonFill';
import Gradient, { BRAND } from '../Gradient';
import Mark from '../Mark';
import PlusChip from '../PlusChip';

const PERKS = [
  'No ads on shorts or videos',
  'Every new Plus perk, first',
  'Cancel anytime',
];

// Plus is the one screen, besides the mark itself, that wears the brand
// gradient: it's where Codera is selling itself.

const uid = raw => raw.replace(/[^a-zA-Z0-9]/g, '');

/**
 * A soft green-and-blue glow behind the hero.
 *
 * Two radial gradients fading to nothing, in pixel coordinates rather than
 * percentages (which Android resolves against the wrong size on first layout).
 * Fainter in light mode, where the same strength would wash the page out.
 */
function Aurora({ width, height, dark, style }) {
  const id = uid(useId());
  const r = width * 0.6;
  return (
    <Svg width={width} height={height} style={[auroraStyle, style]} pointerEvents="none">
      <Defs>
        <RadialGradient id={`g${id}`} cx={width * 0.3} cy={220} r={r} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND[0]} stopOpacity={dark ? 0.32 : 0.2} />
          <Stop offset="1" stopColor={BRAND[0]} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`b${id}`} cx={width * 0.72} cy={300} r={r} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND[1]} stopOpacity={dark ? 0.3 : 0.22} />
          <Stop offset="1" stopColor={BRAND[1]} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#g${id})`} />
      <Rect width={width} height={height} fill={`url(#b${id})`} />
    </Svg>
  );
}
const auroraStyle = { position: 'absolute' };
const ORBIT = 220;
// Where the glow's own y = 250 lands: on the orbit's centre, i.e. behind the mark.
const AURORA_ANCHOR = 250;

/**
 * Fades the page out just above the button bar, so on a short phone the plan
 * card scrolls softly under it instead of being cut by a hard line.
 */
function FooterFade({ color }) {
  const id = uid(useId());
  return (
    <Svg width="100%" height={24} style={fadeStyle} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="24" fill={`url(#${id})`} />
    </Svg>
  );
}
const fadeStyle = { position: 'absolute', top: -24, left: 0, right: 0 };

/** The two orbit rings, stroked green into blue. */
function Rings({ size }) {
  const id = uid(useId());
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
          <Stop offset="0" stopColor={BRAND[0]} />
          <Stop offset="1" stopColor={BRAND[1]} />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 1} stroke={`url(#${id})`} strokeWidth={1} strokeOpacity={0.35} fill="none" />
      <Circle cx={c} cy={c} r={size * 0.355} stroke={`url(#${id})`} strokeWidth={1.2} strokeOpacity={0.6} fill="none" />
    </Svg>
  );
}

/** Codera Plus: what it costs, what you get, and subscribe / cancel / resume. */
export default function PlusScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const plus = usePlus();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // A short rise-in: the hero first, then the plan card a beat later. Native
  // driver only, so it stays smooth while the sheet is still sliding up.
  const heroIn = useRef(new Animated.Value(0)).current;
  const cardIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    Animated.stagger(90, [
      Animated.timing(heroIn, { toValue: 1, duration: 520, easing: ease, useNativeDriver: true }),
      Animated.timing(cardIn, { toValue: 1, duration: 520, easing: ease, useNativeDriver: true }),
    ]).start();
  }, [heroIn, cardIn]);
  const rise = v => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  async function run(action) {
    setErr('');
    setBusy(true);
    try {
      // No local state change on success: the new status arrives through
      // usePlus's live listener, so the screen shows what the server recorded.
      await action();
    } catch (e) {
      setErr(
        e?.code === 'functions/unauthenticated' ? 'Sign in again to continue.'
          : e?.code === 'functions/failed-precondition' ? e.message
          : "Couldn't reach Codera. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const date = plusDate(plus.endsAt);
  const confirmCancel = () => Alert.alert(
    'Cancel Codera Plus?',
    `You'll keep Plus until ${date}.`,
    [
      { text: 'Keep Plus', style: 'cancel' },
      { text: 'Cancel Plus', style: 'destructive', onPress: () => run(cancelPlus) },
    ],
  );

  // What sits in the card's corner once you're a member.
  const pill = !plus.active ? null
    : plus.cancelled ? { color: T.amber, text: `Ends ${date}` }
    : { color: T.green, text: 'Active' };

  // The line under the button. A test subscription never renews, so it never
  // claims to.
  const note = plus.cancelled ? `Plus stays until ${date}. Resume any time before then.`
    : plus.active ? (plus.test ? `Active until ${date}.` : `Renews ${date}.`)
    : 'Renews monthly. Cancel anytime.';

  let action;
  if (plus.loading) {
    action = <View style={s.btnSpace}><ActivityIndicator color={T.blue} /></View>;
  } else if (!plus.active || plus.cancelled) {
    const label = plus.cancelled ? 'Resume Plus' : `Subscribe for ${PLUS_PRICE}/${PLUS_INTERVAL}`;
    action = (
      <Pressable onPress={() => run(subscribePlus)} disabled={busy}>
        <ButtonFill colors={BRAND} style={[s.btn, busy && s.dim]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{label}</Text>}
        </ButtonFill>
      </Pressable>
    );
  } else {
    // Already a member: nothing to sell, so no big button — just a quiet way out.
    action = (
      <Pressable onPress={confirmCancel} disabled={busy} style={[s.btnQuiet, busy && s.dim]}>
        {busy ? <ActivityIndicator color={T.red} /> : <Text style={s.btnQuietTxt}>Cancel Plus</Text>}
      </Pressable>
    );
  }

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />

      {/* Grows to fill the screen: the hero takes whatever height is spare and
          centres itself in it, so the card always sits just above the button
          instead of leaving an empty band on a tall phone. */}
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.body, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.close}
                   accessibilityRole="button" accessibilityLabel="Close">
          <Close color={T.text} size={18} />
        </Pressable>

        <Animated.View style={[s.hero, rise(heroIn)]}>
          <View style={s.orbit}>
            {/* Anchored to the orbit, not the page: the hero moves with the
                screen's height, and the glow has to stay behind the mark.
                Spans the full screen width from the orbit's centred position. */}
            <Aurora
              width={width} height={600} dark={T.dark}
              style={{ top: ORBIT / 2 - AURORA_ANCHOR, left: -(width - ORBIT) / 2 }}
            />
            <Rings size={ORBIT} />
            <View style={[s.spark, { top: 22, right: 34 }]}><Sparkle color={T.green} size={18} filled /></View>
            <View style={[s.spark, { bottom: 30, left: 26 }]}><Sparkle color={T.blueSoft} size={13} filled /></View>
            <Mark size={84} />
          </View>

          <View style={s.titleRow}>
            <Text style={s.title}>Codera</Text>
            <PlusChip big />
          </View>
          <Text style={s.tagline}>Watch without ads, and get every new perk first.</Text>
        </Animated.View>

        <Animated.View style={[s.cardWrap, rise(cardIn)]}>
          {/* A hairline of the brand gradient as the card's border. */}
          <Gradient colors={BRAND} style={s.cardBorder}>
            <View style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.plan}>Monthly</Text>
                {pill && (
                  <View style={s.pill}>
                    <View style={[s.dot, { backgroundColor: pill.color }]} />
                    <Text style={s.pillTxt}>{pill.text}</Text>
                  </View>
                )}
              </View>

              <View style={s.priceRow}>
                <Text style={s.price}>{PLUS_PRICE}</Text>
                <Text style={s.per}>/ {PLUS_INTERVAL}</Text>
              </View>

              <View style={s.divider} />

              {PERKS.map(p => (
                <View key={p} style={s.perk}>
                  <Gradient colors={BRAND} style={s.tick}><Check color="#fff" size={14} /></Gradient>
                  <Text style={s.perkTxt}>{p}</Text>
                </View>
              ))}

              <View style={s.soon}>
                <Sparkle color={T.muted} size={15} />
                <Text style={s.soonTxt}>More perks are on the way</Text>
              </View>
            </View>
          </Gradient>
        </Animated.View>

        {!!err && <Text style={s.err}>{err}</Text>}
      </ScrollView>

      {/* Below the scroll area rather than over it, so the button is always in
          reach and never covers the card. */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <FooterFade color={T.bg} />
        {action}
        <Text style={s.note}>{note}</Text>
        {PLUS_TEST_MODE && <Text style={s.test}>Test mode — you won't be charged.</Text>}
      </View>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  body: { paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1 },

  close: {
    // Above the hero's glow, which spreads up behind it.
    zIndex: 2,
    width: 36, height: 36, borderRadius: 18, alignSelf: 'flex-start',
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  orbit: { width: ORBIT, height: ORBIT, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { color: T.text, fontSize: 34, fontFamily: F['900'], letterSpacing: -1 },
  tagline: {
    color: T.muted, fontSize: 15, fontFamily: F['400'], lineHeight: 21,
    // Narrow enough to break as two even lines instead of leaving two words
    // stranded on the second.
    textAlign: 'center', marginTop: 8, maxWidth: 230,
  },

  cardWrap: { marginTop: 16 },
  // The gradient shows only as the 1.5px ring between this and the card.
  cardBorder: { borderRadius: 22, padding: 1.5, alignItems: 'stretch' },
  card: { padding: 20, borderRadius: 20.5, backgroundColor: T.bg2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plan: {
    color: T.muted, fontSize: 12, fontFamily: F['700'],
    letterSpacing: 1.1, textTransform: 'uppercase',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: T.bg3,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillTxt: { color: T.text, fontSize: 12.5, fontFamily: F['700'] },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  price: { color: T.text, fontSize: 48, fontFamily: F['900'], letterSpacing: -1.5 },
  per: { color: T.muted, fontSize: 17, fontFamily: F['600'] },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: T.border, marginVertical: 18 },

  perk: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  tick: { width: 24, height: 24, borderRadius: 12 },
  perkTxt: { flex: 1, color: T.text, fontSize: 15.5, fontFamily: F['600'] },

  soon: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  soonTxt: { color: T.muted, fontSize: 13.5, fontFamily: F['500'] },

  err: { color: T.red, fontSize: 13.5, fontFamily: F['500'], textAlign: 'center', marginTop: 16 },

  footer: { paddingHorizontal: 20, paddingTop: 8, backgroundColor: T.bg },
  btnSpace: { height: 54, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 54, borderRadius: 16 },
  btnTxt: { color: '#fff', fontSize: 16.5, fontFamily: F['800'] },
  btnQuiet: {
    height: 54, borderRadius: 16, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, alignItems: 'center', justifyContent: 'center',
  },
  btnQuietTxt: { color: T.red, fontSize: 15.5, fontFamily: F['700'] },
  dim: { opacity: 0.5 },
  note: { color: T.muted, fontSize: 12.5, fontFamily: F['400'], textAlign: 'center', marginTop: 10 },
  test: { color: T.muted, fontSize: 11.5, fontFamily: F['400'], textAlign: 'center', marginTop: 3, opacity: 0.8 },
});
