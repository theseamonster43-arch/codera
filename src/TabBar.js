import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView, LiquidGlassContainerView } from '@callstack/liquid-glass';

import { useTheme, TAB_H } from './theme';
import ButtonFill, { GLASS } from './ButtonFill';
import { BRAND } from './Gradient';
import CreateMenu from './CreateMenu';
import { Home, Shorts, Plus, Followed, Person } from './Icons';

const ICONS = { Home, Shorts, Followed, You: Person };

// GLASS is false on Android and on iOS before 26, where the glass view renders
// as plain transparency — so the bar's fallback is a real background, not an
// invisible bar.

/**
 * One tab's icon, with a small spring when it becomes the active page.
 *
 * The icon already switches from outlined to filled; the spring is what makes
 * that switch feel like a response to the tap rather than a redraw.
 */
function TabIcon({ Icon, focused, T }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!focused) return;
    scale.setValue(0.78);
    Animated.spring(scale, {
      toValue: 1, useNativeDriver: true, damping: 9, stiffness: 260, mass: 0.6,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon color={focused ? T.text : T.muted} size={25} filled={focused} />
    </Animated.View>
  );
}

/**
 * The bottom bar.
 *
 * Drawn by hand rather than with the default renderer for two reasons: no
 * labels, and the middle item is an action, not a tab — it opens a menu of
 * things to make, and nothing about it should read as "the page you are on".
 *
 * Being a plain view pinned to the bottom also keeps it at the bottom. A real
 * UITabBar gets relocated to the top by iPadOS on a large screen; this cannot.
 */
export default function TabBar({ state, navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const pick = kind => {
    setMenuOpen(false);
    // The tab navigator hands these up to the stack above it, which is where
    // the compose screens live — so they slide up over the bar, not inside it.
    if (kind === 'post') navigation.navigate('ComposePost');
    else navigation.navigate('ComposeVideo', { kind });
  };

  const plus = (
    <Pressable key="plus" onPress={() => setMenuOpen(true)} style={s.item}
               android_ripple={null} hitSlop={8}>
      {/* The brand green-to-blue: the + is Codera's signature button. The
          shadow only suits the gradient; glass casts its own. */}
      <ButtonFill colors={BRAND} style={[s.create, !GLASS && s.createShadow]}>
        <Plus color="#fff" size={24} />
      </ButtonFill>
    </Pressable>
  );

  const tabs = state.routes.map((route, i) => {
    const focused = state.index === i;
    const Icon = ICONS[route.name];
    const onPress = () => {
      const e = navigation.emit({
        type: 'tabPress', target: route.key, canPreventDefault: true,
      });
      if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={s.item}
                 android_ripple={null} hitSlop={8}>
        {/* Filled on the page you are on, outlined everywhere else — the whole
            signal, since there are no labels. */}
        <TabIcon Icon={Icon} focused={focused} T={T} />
      </Pressable>
    );
  });

  // Two tabs either side of the +, which sits in the middle as an action.
  const items = [...tabs.slice(0, 2), plus, ...tabs.slice(2)];

  const bar = GLASS ? (
    <View style={[s.wrap, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
      {/* The container lets neighbouring glass views merge into one another
          instead of each rendering its own separate pane. */}
      <LiquidGlassContainerView spacing={12} style={s.glassWrap}>
        <LiquidGlassView style={s.bar} effect="regular" colorScheme="system">
          {items}
        </LiquidGlassView>
      </LiquidGlassContainerView>
    </View>
  ) : (
    <View style={[s.wrap, s.wrapSolid, { paddingBottom: insets.bottom }]}>
      <View style={s.bar}>{items}</View>
    </View>
  );

  return (
    <>
      {bar}
      <CreateMenu open={menuOpen} onClose={() => setMenuOpen(false)} onPick={pick} />
    </>
  );
}

const styles = T => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // Only the non-glass path paints a background; over glass it would defeat
  // the whole effect.
  wrapSolid: {
    backgroundColor: T.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
  },
  glassWrap: { marginHorizontal: 12, marginBottom: 6, borderRadius: 26, overflow: 'hidden' },
  bar: {
    height: TAB_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  create: { width: 46, height: 32, borderRadius: 11 },
  createShadow: Platform.select({
    android: { elevation: 3 },
    ios: {
      shadowColor: T.blue, shadowOpacity: 0.4, shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
  }),
});
