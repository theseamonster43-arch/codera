import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, Animated,
} from 'react-native';

import { useTheme, F } from '../theme';
import { auth } from '../firebase';
import { Home, Shorts, Followed, Person } from '../Icons';
import Mark from '../Mark';
import usePosts from '../usePosts';
import { useFollowing, useFace } from '../social';
import { useProfile } from '../profile';
import { Focusable, useArrival } from './focus';
import TVCard from './TVCard';
import TVWatch from './TVWatch';

/** The four places a television goes. Nothing is made on a TV, so no Create. */
const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'shorts', label: 'Shorts', icon: Shorts },
  { id: 'followed', label: 'Following', icon: Followed },
  { id: 'you', label: 'You', icon: Person },
];

/**
 * Codera on a television.
 *
 * A remote has four directions and a middle button, so the app is a rail down
 * the side and rows of things to watch beside it — no tab bar to reach with a
 * thumb, no sheets, nothing to type. Making things is left to the phone: a
 * person with a remote in their hand is here to watch.
 */
export default function TVShell() {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const [tab, setTab] = useState('home');
  const [watching, setWatching] = useState(null);

  if (watching) {
    return <TVWatch post={watching} onBack={() => setWatching(null)} />;
  }

  return (
    <View style={s.fill}>
      {/* Across the top, the way a television usually carries its places: the
          picture is the wide thing on a TV, so the chrome goes along the short
          edge and leaves the width to what you came to watch. */}
      <View style={s.bar}>
        <View style={s.brand}>
          <Mark size={28} />
          <Text style={s.wordmark}>Codera</Text>
        </View>
        <View style={s.tabs}>
          {TABS.map((t, i) => (
            <TabItem
              key={t.id}
              tab={t}
              on={tab === t.id}
              first={i === 0}
              onPress={() => setTab(t.id)}
              T={T}
              s={s}
            />
          ))}
        </View>
      </View>

      <View style={s.stage}>
        <Page tab={tab} onWatch={setWatching} T={T} s={s} />
      </View>
    </View>
  );
}

/** One place in the bar. Focus and being the open page are different things. */
function TabItem({ tab, on, first, onPress, T, s }) {
  const Icon = tab.icon;
  return (
    <Focusable onPress={onPress} first={first} grow={1.08}
               accessibilityRole="tab" accessibilityState={{ selected: on }}>
      {focused => (
        <View style={[s.tabItem, on && s.tabItemOpen, focused && s.tabItemOn]}>
          <Icon color={focused || on ? T.text : T.muted} size={19} filled={on} />
          {/* Only the page being viewed says its name. The others are their
              icons, which is what a bar of five places can afford to be. */}
          {on && <Text style={s.tabTxt}>{tab.label}</Text>}
        </View>
      )}
    </Focusable>
  );
}

function Page({ tab, onWatch, T, s }) {
  const arriving = useArrival(tab);
  const { posts, loading, error } = usePosts();
  const following = useFollowing();
  const me = auth.currentUser;
  const profile = useProfile(me);

  if (loading) return <ActivityIndicator color={T.blue} style={s.spin} size="large" />;
  if (error) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>Couldn’t load the feed</Text>
        <Text style={s.emptyBody}>Check the connection and try again.</Text>
      </View>
    );
  }

  const shorts = posts.filter(p => p.type === 'short');
  const rest = posts.filter(p => p.type !== 'short');

  if (tab === 'shorts') {
    return <Row title="Shorts" items={shorts} tall onWatch={onWatch} T={T} s={s}
                none="No shorts yet." />;
  }

  if (tab === 'followed') {
    const theirs = posts.filter(p => following.has(p.uid));
    return (
      <Grid title="From people you follow" items={theirs} onWatch={onWatch} T={T} s={s}
            none="Follow someone on the phone or the website and their posts turn up here." />
    );
  }

  if (tab === 'you') {
    const mine = me ? posts.filter(p => p.uid === me.uid) : [];
    return (
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.you}>
          <View style={s.bigAvatar}>
            {profile.photoUrl
              ? <Image source={{ uri: profile.photoUrl }} style={s.photo} />
              : <Person color={T.muted} size={34} />}
          </View>
          <View>
            <Text style={s.youName}>
              {profile.username || me?.displayName || 'You'}
            </Text>
            <Text style={s.youNote}>
              Posting, commenting and going live are on the phone and the website.
            </Text>
          </View>
        </View>
        <Shelf title="What you posted" items={mine} onWatch={onWatch} T={T} s={s}
               none="Nothing posted yet." />
      </ScrollView>
    );
  }

  return (
    <Animated.View style={[s.grow, arriving]}>
      <ScrollView contentContainerStyle={s.page}>
        {shorts.length > 0 && (
          <Shelf title="Shorts" items={shorts.slice(0, 12)} tall onWatch={onWatch} T={T} s={s} />
        )}
        <Shelf title="Latest" items={rest} onWatch={onWatch} T={T} s={s}
               none="Nothing posted yet." />
      </ScrollView>
    </Animated.View>
  );
}

/** A row that scrolls sideways, which is how a remote reads a shelf. */
function Shelf({ title, items, tall, onWatch, T, s, none }) {
  return (
    <View style={s.block}>
      <Text style={s.heading}>{title}</Text>
      {items.length === 0 ? (
        <Text style={s.emptyBody}>{none}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.shelf}>
          {items.map(p => (
            <TVCard key={p.id} post={p} wide={tall ? 112 : 186}
                    onPress={() => onWatch(p)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ title, items, tall, onWatch, T, s, none }) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Shelf title={title} items={items} tall={tall} onWatch={onWatch} T={T} s={s} none={none} />
    </ScrollView>
  );
}

/** Everything at once, wrapped, for a tab that is a list rather than shelves. */
function Grid({ title, items, onWatch, T, s, none }) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.heading}>{title}</Text>
      {items.length === 0 ? (
        <Text style={s.emptyBody}>{none}</Text>
      ) : (
        <View style={s.grid}>
          {items.map(p => (
            <TVCard key={p.id} post={p} wide={186} onPress={() => onWatch(p)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = T => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8,
    backgroundColor: T.bg2, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  brand: {
    position: 'absolute', left: 22, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 9,
  },
  wordmark: { color: T.text, fontSize: 15.5, fontFamily: F['900'], letterSpacing: -0.4 },
  tabs: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 34, paddingHorizontal: 12, borderRadius: 17,
    borderWidth: 2, borderColor: 'transparent',
  },
  // The page you are on and the thing the remote is resting on are different
  // facts, so they look different: a quiet ground for one, the ring for the other.
  tabItemOpen: { backgroundColor: T.bg3 },
  tabItemOn: { backgroundColor: T.bg3, borderColor: T.green },
  tabTxt: { color: T.text, fontSize: 13.5, fontFamily: F['700'] },

  fill: { flex: 1, backgroundColor: T.bg },
  grow: { flex: 1 },
  stage: { flex: 1 },
  page: { padding: 18, gap: 18 },
  block: { gap: 9 },
  heading: { color: T.text, fontSize: 15.5, fontFamily: F['800'], letterSpacing: -0.4 },
  shelf: { gap: 14, paddingVertical: 8, paddingHorizontal: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 8, paddingHorizontal: 5 },

  spin: { marginTop: 80 },
  empty: { padding: 40, gap: 6 },
  emptyTitle: { color: T.text, fontSize: 16, fontFamily: F['800'] },
  emptyBody: { color: T.muted, fontSize: 13, fontFamily: F['400'], lineHeight: 19 },

  you: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bigAvatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  youName: { color: T.text, fontSize: 19, fontFamily: F['900'] },
  youNote: { color: T.muted, fontSize: 12.5, fontFamily: F['500'], marginTop: 3 },
});
