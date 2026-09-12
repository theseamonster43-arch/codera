import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, StatusBar, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { auth } from '../firebase';
import { useTheme, F } from '../theme';
import useTabSpace from '../tabSpace';
import useWindowControls from '../windowControls';
import { Person, Play, Chevron } from '../Icons';
import Empty from '../Empty';
import PostCard from '../PostCard';
import usePosts from '../usePosts';
import Mark from '../Mark';
import PlusChip from '../PlusChip';
import { usePlus, plusDate, PLUS_PRICE, PLUS_INTERVAL } from '../plus';

/** Your page: who you are, and everything you have posted. */
export default function YouScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const wc = useWindowControls();
  const { posts } = usePosts();
  const plus = usePlus();

  const me = auth.currentUser;
  const name = me?.displayName || me?.email?.split('@')[0] || 'You';

  const mine = useMemo(() => posts.filter(p => p.uid === me?.uid), [posts, me?.uid]);
  const counts = useMemo(() => ({
    posts: mine.filter(p => p.type === 'post').length,
    shorts: mine.filter(p => p.type === 'short').length,
    videos: mine.filter(p => p.type === 'video').length,
  }), [mine]);

  // Which of your things the list is showing.
  const [tab, setTab] = useState('all');
  const shown = useMemo(
    () => (tab === 'all' ? mine : mine.filter(p => p.type === tab)),
    [mine, tab]);

  const CHOICES = [
    { id: 'all', label: 'All', n: mine.length },
    { id: 'post', label: 'Posts', n: counts.posts },
    { id: 'short', label: 'Shorts', n: counts.shorts },
    { id: 'video', label: 'Videos', n: counts.videos },
  ];

  async function out() {
    // Google's own session is cleared as well as Firebase's. Otherwise the next
    // "Continue with Google" silently reuses the last account instead of asking,
    // which on a shared device signs the next person in as the previous one.
    try { await GoogleSignin.signOut(); } catch (e) {}
    await signOut(auth);
  }

  const header = (
    <View style={{ paddingTop: insets.top + 16, paddingLeft: wc }}>
      <View style={s.head}>
        <View style={s.avatar}>
          {me?.photoURL
            ? <Image source={{ uri: me.photoURL }} style={s.photo} />
            : <Person color={T.muted} size={34} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.sub} numberOfLines={1}>{me?.email}</Text>
        </View>
      </View>

      {/* Counted from what you have actually posted, not stored separately —
          a stored counter drifts the first time a delete fails halfway. */}
      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statV}>{counts.posts}</Text><Text style={s.statL}>Posts</Text></View>
        <View style={s.stat}><Text style={s.statV}>{counts.shorts}</Text><Text style={s.statL}>Shorts</Text></View>
        <View style={s.stat}><Text style={s.statV}>{counts.videos}</Text><Text style={s.statL}>Videos</Text></View>
      </View>

      <Pressable onPress={() => navigation.navigate('Plus')}
                 style={[s.plus, plus.active && s.plusOn]}>
        <Mark size={40} />
        <View style={s.plusText}>
          <View style={s.plusTitleRow}>
            <Text style={s.plusTitle}>Codera</Text>
            <PlusChip />
          </View>
          <Text style={s.plusSub} numberOfLines={1}>
            {!plus.active ? `${PLUS_PRICE}/${PLUS_INTERVAL} · no ads`
              : plus.cancelled ? `Cancelled · ends ${plusDate(plus.endsAt)}`
              : plus.test ? `Active until ${plusDate(plus.endsAt)}`
              : `Active · renews ${plusDate(plus.endsAt)}`}
          </Text>
        </View>
        <Chevron color={T.muted} size={18} />
      </Pressable>

      {mine.length > 0 && (
        <View style={s.chooser}>
          {CHOICES.map(c => {
            const on = tab === c.id;
            return (
              <Pressable key={c.id} onPress={() => setTab(c.id)}
                         style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{c.label}</Text>
                <Text style={[s.chipN, on && s.chipTxtOn]}>{c.n}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const footer = (
    <Pressable onPress={out} style={s.signOut} hitSlop={8}>
      <Text style={s.signOutTxt}>Sign out</Text>
    </Pressable>
  );

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <FlatList
        data={shown}
        keyExtractor={p => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          mine.length > 0 ? (
            // You have things, just none of this kind.
            <Text style={s.none}>
              {tab === 'short' ? "No shorts yet."
                : tab === 'video' ? "No videos yet."
                : "No posts yet."}
            </Text>
          ) : (
          <Empty
            icon={<Play color={T.green} size={26} />}
            title="You haven't posted yet"
            body="Your posts, shorts and videos collect here."
            action="Write a post"
            onAction={() => navigation.navigate('ComposePost')}
          />
          )
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: tabSpace + 24 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 18 },
  avatar: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: T.bg2,
    borderWidth: 1, borderColor: T.border, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  name: { color: T.text, fontSize: 21, fontFamily: F['800'], letterSpacing: -0.5 },
  sub: { color: T.muted, fontFamily: F['400'], fontSize: 12.5, marginTop: 4 },
  stats: { flexDirection: 'row', gap: 10, marginHorizontal: 18, marginTop: 18, marginBottom: 6 },
  stat: {
    flex: 1, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    borderRadius: 13, paddingVertical: 13, alignItems: 'center',
  },
  statV: { color: T.text, fontSize: 18, fontFamily: F['800'] },
  statL: { color: T.muted, fontFamily: F['400'], fontSize: 11, marginTop: 3 },
  plus: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 18, marginTop: 10, padding: 12,
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 14,
  },
  plusOn: { borderColor: 'rgba(34,197,94,0.45)' },
  plusText: { flex: 1 },
  plusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plusTitle: { color: T.text, fontSize: 15, fontFamily: F['800'] },
  plusSub: { color: T.muted, fontSize: 12.5, fontFamily: F['400'], marginTop: 3 },
  section: {
    color: T.muted, fontSize: 11, fontFamily: F['700'], letterSpacing: 1.1,
    textTransform: 'uppercase', marginHorizontal: 18, marginTop: 18, marginBottom: 10,
  },
  chooser: { flexDirection: 'row', gap: 8, marginHorizontal: 18, marginTop: 18, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.bg2,
  },
  chipOn: { borderColor: T.blue, backgroundColor: 'rgba(59,130,246,0.14)' },
  chipTxt: { color: T.muted, fontSize: 13, fontFamily: F['700'] },
  chipN: { color: T.muted, fontSize: 12, fontFamily: F['600'], opacity: 0.8 },
  chipTxtOn: { color: T.blue },
  none: { color: T.muted, fontSize: 14, fontFamily: F['500'], textAlign: 'center', marginTop: 26 },

  signOut: { alignSelf: 'center', marginTop: 8, paddingVertical: 10, paddingHorizontal: 18 },
  signOutTxt: { color: T.red, fontSize: 14, fontFamily: F['700'] },
});
