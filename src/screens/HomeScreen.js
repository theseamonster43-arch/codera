import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, StatusBar, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F } from '../theme';
import useTabSpace from '../tabSpace';
import useWindowControls from '../windowControls';
import { Code, Search, Live } from '../Icons';
import IconButton from '../IconButton';
import Mark from '../Mark';
import Empty from '../Empty';
import PostCard from '../PostCard';
import usePosts from '../usePosts';
import useLayout from '../layout';
import SponsoredCard from '../SponsoredCard';
import { takeHomeAd, onHomeAdReady, markAdShown } from '../ads';
import LiveCard from '../LiveCard';
import { useStreams, useTaste, useFollowing, onAir } from '../social';
import { rank } from '../taste';

/**
 * Posts and full videos, recommended for this person (see taste.js): what they
 * watch and like, who they follow, what is new and what is liked. Streams on air
 * sit at the top, and this is the only place they are listed. Saved streams are
 * part of the feed. Shorts live on their own tab.
 */
export default function HomeScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const wc = useWindowControls();
  const L = useLayout();
  const { posts, loading, error } = usePosts();

  const streams = useStreams();
  const taste = useTaste();
  const following = useFollowing();
  const feed = useMemo(
    () => rank(posts.filter(p => p.type !== 'short'), taste, following),
    [posts, taste, following],
  );
  // At most one sponsored card, after the first video, when the ad rules allow.
  const [ad, setAd] = useState(null);
  useEffect(() => {
    let mine = null;
    const grab = () => {
      if (mine) return;
      const got = takeHomeAd();
      if (got) { mine = got; setAd(got); markAdShown(); }
    };
    grab();
    const stop = onHomeAdReady(grab);
    return () => { stop(); if (mine) mine.destroy(); };
  }, []);
  const withAd = useMemo(() => {
    if (!ad || feed.length < 2) return feed;
    const first = feed.findIndex(p => p.type === 'video' || p.type === 'live');
    const at = first >= 0 ? first + 1 : Math.min(3, feed.length);
    return [...feed.slice(0, at), { id: '__ad__', ad }, ...feed.slice(at)];
  }, [feed, ad]);

  const onNow = useMemo(() => streams.filter(onAir)
    .sort((a, b) => (following.has(b.uid) - following.has(a.uid)) || (b.watching || 0) - (a.watching || 0)), [streams, following]);

  // Each card takes one column's worth of the row, measured rather than
  // proportioned, so the row can't collapse around its contents.
  const cellW = (L.width - L.side * 2) / L.columns;
  const cell = ({ item }) => {
    const inner = item.ad ? <SponsoredCard ad={item.ad} /> : <PostCard post={item} />;
    return L.wide ? <View style={{ width: cellW }}>{inner}</View> : inner;
  };

  const header = (
    <View style={[s.head, { paddingTop: insets.top + 10, paddingLeft: 16 + wc }]}>
      <Mark size={30} />
      <Text style={s.brand}>Codera</Text>
      <Pressable hitSlop={10}>
        <IconButton size={38}><Search color={T.text} size={20} /></IconButton>
      </Pressable>
    </View>
  );

  const top = (
    <View>
      {header}
      {onNow.length > 0 && (
        <>
          <View style={s.subRow}>
            <Live color={T.red} size={18} />
            <Text style={s.sub}>Live now</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>
            {onNow.map(st => <LiveCard key={st.id} stream={st} />)}
          </ScrollView>
        </>
      )}
    </View>
  );

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <FlatList
        data={withAd}
        keyExtractor={p => p.id}
        key={'cols' + L.columns}
        numColumns={L.columns}
        renderItem={cell}
        ListHeaderComponent={top}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: tabSpace + 24, paddingHorizontal: L.side }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={T.blue} style={{ marginTop: 60 }} />
          ) : error ? (
            <Empty
              icon={<Code color={T.red} size={28} />}
              title="Couldn't load the feed"
              body="Check your connection. If this keeps happening, the database may not be set up yet."
            />
          ) : (
            <Empty
              icon={<Code color={T.green} size={28} />}
              title="Nothing posted yet"
              body="Be the first. Tutorials and posts show up here."
              action="Make the first one"
              onAction={() => navigation.navigate('ComposePost')}
            />
          )
        }
      />
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  brand: { flex: 1, color: T.text, fontSize: 19, fontFamily: F['900'], letterSpacing: -0.4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 16, marginTop: 6, marginBottom: 12 },
  sub: { color: T.text, fontSize: 17, fontFamily: F['800'] },
  more: { color: T.muted, fontSize: 13, fontFamily: F['700'], marginLeft: 6 },
  because: { flex: 1, color: T.muted, fontSize: 12.5, fontFamily: F['600'], marginLeft: 4 },
  shelf: { paddingHorizontal: 14, paddingBottom: 14 },
});
