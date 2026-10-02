import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image,
} from 'react-native';

import { useTheme, F } from '../theme';
import { auth } from '../firebase';
import { Home, Shorts, Followed, Person } from '../Icons';
import Mark from '../Mark';
import usePosts from '../usePosts';
import { useFollowing, useFace } from '../social';
import { useProfile } from '../profile';
import { useFocus } from './focus';
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
      <View style={s.rail}>
        <View style={s.brand}>
          <Mark size={34} />
          <Text style={s.wordmark}>Codera</Text>
        </View>
        {TABS.map(t => (
          <RailItem
            key={t.id}
            tab={t}
            on={tab === t.id}
            onPress={() => setTab(t.id)}
            T={T}
            s={s}
          />
        ))}
      </View>

      <View style={s.stage}>
        <Page tab={tab} onWatch={setWatching} T={T} s={s} />
      </View>
    </View>
  );
}

/** One place in the rail. Focus and being the open page are different things. */
function RailItem({ tab, on, onPress, T, s }) {
  const focus = useFocus();
  const Icon = tab.icon;
  const lit = focus.on || on;
  return (
    <Pressable {...focus.bind} onPress={onPress}
               style={[s.railItem, focus.on && s.railItemOn]}
               accessibilityRole="tab" accessibilityState={{ selected: on }}>
      <Icon color={lit ? T.text : T.muted} size={24} filled={on} />
      <Text style={[s.railTxt, lit && s.railTxtOn]}>{tab.label}</Text>
    </Pressable>
  );
}

function Page({ tab, onWatch, T, s }) {
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
    <ScrollView contentContainerStyle={s.page}>
      {shorts.length > 0 && (
        <Shelf title="Shorts" items={shorts.slice(0, 12)} tall onWatch={onWatch} T={T} s={s} />
      )}
      <Shelf title="Latest" items={rest} onWatch={onWatch} T={T} s={s}
             none="Nothing posted yet." />
    </ScrollView>
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
            <TVCard key={p.id} post={p} wide={tall ? 210 : 330}
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
            <TVCard key={p.id} post={p} wide={330} onPress={() => onWatch(p)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, flexDirection: 'row', backgroundColor: T.bg },

  rail: {
    width: 232, paddingTop: 34, paddingHorizontal: 16, gap: 6,
    backgroundColor: T.bg2, borderRightWidth: 1, borderRightColor: T.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26, paddingLeft: 8 },
  wordmark: { color: T.text, fontSize: 21, fontFamily: F['900'], letterSpacing: -0.4 },
  railItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    height: 54, paddingHorizontal: 16, borderRadius: 27,
    borderWidth: 2, borderColor: 'transparent',
  },
  railItemOn: { backgroundColor: T.bg3, borderColor: T.green },
  railTxt: { color: T.muted, fontSize: 16.5, fontFamily: F['700'] },
  railTxtOn: { color: T.text },

  stage: { flex: 1 },
  page: { padding: 34, gap: 34 },
  block: { gap: 16 },
  heading: { color: T.text, fontSize: 24, fontFamily: F['800'], letterSpacing: -0.4 },
  shelf: { gap: 20, paddingVertical: 10, paddingHorizontal: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 10, paddingHorizontal: 6 },

  spin: { marginTop: 80 },
  empty: { padding: 60, gap: 8 },
  emptyTitle: { color: T.text, fontSize: 21, fontFamily: F['800'] },
  emptyBody: { color: T.muted, fontSize: 16, fontFamily: F['400'], lineHeight: 24 },

  you: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  bigAvatar: {
    width: 86, height: 86, borderRadius: 43, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  youName: { color: T.text, fontSize: 27, fontFamily: F['900'] },
  youNote: { color: T.muted, fontSize: 15.5, fontFamily: F['500'], marginTop: 4 },
});
