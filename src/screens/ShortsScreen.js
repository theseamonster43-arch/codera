import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, StatusBar, ActivityIndicator, Pressable,
  useWindowDimensions, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Video from 'react-native-video';

import { useTheme, F } from '../theme';
import useTabSpace, { useNativeTabBar } from '../tabSpace';
import { Shorts, Person, Play } from '../Icons';
import { ago } from '../data';
import Empty from '../Empty';
import PostActions from '../PostActions';
import usePosts from '../usePosts';
import { usePlus } from '../plus';
import { RULES, takeSponsored, markAdShown, onSponsoredReady } from '../ads';
import SponsoredShort from '../SponsoredShort';
import CommentsSheet from '../CommentsSheet';

/** Full-screen vertical shorts, one per swipe. */
export default function ShortsScreen({ navigation, route }) {
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
  const tabSpace = useTabSpace();
  // Under Apple's glass tab bar each short runs the full height of the screen,
  // with the bar floating over the video; with Codera's own bar the page stops
  // above it.
  const underGlass = useNativeTabBar();
  const pageH = underGlass ? height : height - tabSpace;

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  // Over the short rather than instead of it: leaving for a page of comments
  // meant coming back to the top of the feed.
  const [talking, setTalking] = useState(null);
  const list = useRef(null);

  // Opened from somewhere else — the shelf on the feed, a profile — asking for
  // one short in particular. The list is jumped to it once it holds it.
  const wanted = route?.params?.id;
  useEffect(() => {
    if (!wanted) return;
    const at = items.findIndex(it => !it.ad && it.id === wanted);
    if (at < 0) return;
    list.current?.scrollToIndex({ index: at, animated: false });
    setActive(at);
    navigation.setParams({ id: undefined });
  }, [wanted, items, navigation]);

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
    // A short is a tall picture. In a wide window — an iPad, a Vision Pro
    // window, a phone held open — it keeps its shape in the middle of the
    // screen rather than being cropped to the width.
    const stage = Math.min(width, Math.round(pageH * 9 / 16));
    return (
      <Pressable style={{ height: pageH, width, backgroundColor: '#000' }}
                 onPress={() => setPaused(p => !p)}>
        {/* The one either side is mounted too, paused, so the next swipe
            starts playing immediately instead of showing a black frame. */}
        {Math.abs(index - active) <= 1 ? (
          <View style={{ position: 'absolute', top: 0, left: (width - stage) / 2, width: stage, height: pageH, overflow: 'hidden' }}>
          <Video
            source={{ uri: item.videoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            repeat
            // Nothing plays while you are on another tab: a short carrying on
            // underneath Home would be heard and not seen.
            paused={!isActive || paused || !focused}
          />
          </View>
        ) : null}

        {isActive && paused && (
          <View style={st.pauseWrap} pointerEvents="none">
            <View style={st.pauseBtn}><Play color="#fff" size={34} /></View>
          </View>
        )}

        <View style={[st.rail, { bottom: (underGlass ? tabSpace : 0) + 120, right: (width - stage) / 2 + 10 }]}>
          <PostActions
            post={item}
            tone="video"
            onComment={() => setTalking(item)}
          />
        </View>

        <View style={[st.info, { paddingBottom: (underGlass ? tabSpace : 0) + 18, left: (width - stage) / 2 + 14, right: (width - stage) / 2 + 74 }]} pointerEvents="none">
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
  }, [active, paused, focused, pageH, width, navigation, underGlass, tabSpace]);

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
          ref={list}
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

      {talking && <CommentsSheet post={talking} onClose={() => setTalking(null)} />}
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
  rail: { position: 'absolute', right: 12, alignItems: 'center' },
  // Room down the right for the rail, so a long title doesn't run under it.
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingRight: 76 },
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
