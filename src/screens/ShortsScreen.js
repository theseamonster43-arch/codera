import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, StatusBar, ActivityIndicator, Pressable,
  useWindowDimensions, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Video from 'react-native-video';

import { useTheme, TAB_H, F } from '../theme';
import { Shorts, Person, Play } from '../Icons';
import { ago } from '../data';
import Empty from '../Empty';
import usePosts from '../usePosts';
import { usePlus } from '../plus';
import { RULES, takeSponsored, markAdShown, onSponsoredReady } from '../ads';
import SponsoredShort from '../SponsoredShort';

/** Full-screen vertical shorts, one per swipe. */
export default function ShortsScreen({ navigation }) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const focused = useIsFocused();
  const { posts, loading } = usePosts();

  const plus = usePlus();

  const shorts = useMemo(() => posts.filter(p => p.type === 'short'), [posts]);

  // Sponsored pages, each pinned after a particular short. Only ever added just
  // ahead of where you are, so nothing already on screen moves when one appears.
  const [slots, setSlots] = useState([]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  useEffect(() => () => slotsRef.current.forEach(sl => sl.ad.destroy()), []);

  const items = useMemo(() => {
    if (plus.active) return shorts;   // bought Plus mid-scroll: the ads go at once
    const out = [];
    for (const sh of shorts) {
      out.push(sh);
      for (const sl of slots) if (sl.afterId === sh.id) out.push(sl);
    }
    return out;
  }, [shorts, slots, plus.active]);

  // Each page is exactly the space above the tab bar, so a swipe lands squarely
  // on the next short rather than part-way between two.
  const pageH = height - TAB_H - insets.bottom;

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Shorts watched since the last sponsored page, and whether one is already
  // waiting further down.
  const sinceAd = useRef(0);
  const adWaiting = useRef(false);
  const current = useRef(null);

  // Places a sponsored page straight after the short on screen, if one is due.
  // It's the next page, so it's a break between two shorts, never a cut into one.
  const placeAd = useRef(() => {
    const it = current.current;
    if (!it || it.ad || adWaiting.current || sinceAd.current < RULES.shortsPerAd) return;
    // Never two sponsored pages in a row after the same short.
    if (slotsRef.current.some(sl => sl.afterId === it.id)) return;
    const ad = takeSponsored();
    if (!ad) return;
    adWaiting.current = true;
    setSlots(prev => [...prev, { key: `ad-${Date.now()}`, afterId: it.id, ad }]);
  }).current;

  // An ad that finishes loading while you're still on a short gets placed then,
  // instead of waiting for a swipe — with a single short there may never be one.
  useEffect(() => onSponsoredReady(placeAd), [placeAd]);

  // Which short is on screen. Only that one plays — the rest stay unmounted as
  // players, so swiping through twenty does not keep twenty decoders alive.
  const onViewable = useRef(({ viewableItems }) => {
    const v = viewableItems[0];
    if (!v) return;
    setActive(v.index ?? 0);
    setPaused(false);
    current.current = v.item;

    if (v.item.ad) {
      markAdShown();
      sinceAd.current = 0;
      adWaiting.current = false;
      return;
    }

    sinceAd.current += 1;
    placeAd();
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const render = useCallback(({ item, index }) => {
    if (item.ad) {
      return (
        <SponsoredShort ad={item.ad} width={width} height={pageH}
                        onPlus={() => navigation.navigate('Plus')} />
      );
    }
    const isActive = index === active;
    return (
      <Pressable style={{ height: pageH, width, backgroundColor: '#000' }}
                 onPress={() => setPaused(p => !p)}>
        {Math.abs(index - active) <= 1 ? (
          // The one either side is mounted too, paused, so the next swipe
          // starts playing immediately instead of showing a black frame.
          <Video
            source={{ uri: item.videoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            repeat
            // Nothing plays while you are on another tab: a short carrying on
            // underneath Home would be heard and not seen.
            paused={!isActive || paused || !focused}
          />
        ) : null}

        {isActive && paused && (
          <View style={st.pauseWrap} pointerEvents="none">
            <View style={st.pauseBtn}><Play color="#fff" size={34} /></View>
          </View>
        )}

        <View style={[st.info, { paddingBottom: 18 }]} pointerEvents="none">
          <View style={st.byRow}>
            <View style={st.avatar}>
              {item.authorPhoto
                ? <Image source={{ uri: item.authorPhoto }} style={st.photo} />
                : <Person color="#fff" size={15} />}
            </View>
            <Text style={st.author}>{item.authorName}</Text>
            <Text style={st.time}>· {ago(item.createdAt)}</Text>
          </View>
          <Text style={st.title} numberOfLines={3}>{item.title}</Text>
        </View>
      </Pressable>
    );
  }, [active, paused, focused, pageH, width, navigation]);

  if (!loading && shorts.length === 0) {
    return (
      <View style={[st.center, { backgroundColor: T.bg }]}>
        <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
        <Empty
          icon={<Shorts color={T.green} size={28} />}
          title="No shorts yet"
          body="Under a minute, one idea each. Post one and it plays here."
          action="Record a short"
          onAction={() => navigation.navigate('ComposeVideo', { kind: 'short' })}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 80 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={p => p.key || p.id}
          renderItem={render}
          extraData={[active, paused, focused]}
          pagingEnabled
          snapToInterval={pageH}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          getItemLayout={(_, index) => ({ length: pageH, offset: pageH * index, index })}
          windowSize={3}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  pauseWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pauseBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 4,
  },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 28, height: 28, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  author: { color: '#fff', fontSize: 14, fontFamily: F['800'] },
  time: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: F['400'] },
  title: {
    color: '#fff', fontSize: 15, fontFamily: F['600'], lineHeight: 21, marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6,
  },
});
