import React, { useMemo } from 'react';
import {
  Text, FlatList, StyleSheet, StatusBar, View, Pressable, Image, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F } from '../theme';
import useTabSpace from '../tabSpace';
import { Followed, Person } from '../Icons';
import Empty from '../Empty';
import PostCard from '../PostCard';
import useLayout from '../layout';
import usePosts from '../usePosts';
import { useFollowing, useStreams, useFaces, onAir } from '../social';

/** The people you follow: who is live, and what they posted lately. */
export default function FollowedScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const following = useFollowing();
  const streams = useStreams();
  const { posts } = usePosts();

  const people = useMemo(() => [...following], [following]);
  const faces = useFaces(people);
  const live = useMemo(() => streams.filter(st => following.has(st.uid) && onAir(st)), [streams, following]);
  const latest = useMemo(() => posts.filter(p => following.has(p.uid)), [posts, following]);

  const header = (
    <View>
      <Text style={[s.h1, { paddingTop: insets.top + 16 }]}>Following</Text>
      {people.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.people}>
          {people.map(uid => {
            const f = faces[uid] || {};
            const on = live.find(st => st.uid === uid);
  return (
              <Pressable key={uid} style={s.person}
                onPress={() => on ? navigation.navigate('LiveView', { path: 'stream/' + on.id }) : navigation.navigate('User', { uid })}>
                <View style={[s.face, on && s.faceLive]}>
                  {f.photoUrl ? <Image source={{ uri: f.photoUrl }} style={s.photo} /> : <Person color="#fff" size={24} />}
                </View>
                {on && <View style={s.tag}><Text style={s.tagTxt}>LIVE</Text></View>}
                <Text style={s.personName} numberOfLines={1}>{f.username || '…'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {people.length > 0 && <Text style={[s.sub, s.subAlone]}>Latest from people you follow</Text>}
    </View>
  );

  // Each card takes one column's worth of the row, measured rather than
  // proportioned, so the row can't collapse around its contents.
  const cellW = (L.width - L.side * 2) / L.columns;
  const cell = ({ item }) => (
    L.wide
      ? <View style={{ width: cellW }}><PostCard post={item} /></View>
      : <PostCard post={item} />
  );

  return (
    <View style={[s.fill, { backgroundColor: T.bg }]}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <FlatList
        data={people.length ? latest : []}
        keyExtractor={p => p.id}
        key={'cols' + L.columns}
        numColumns={L.columns}
        renderItem={cell}
        ListHeaderComponent={header}
        ListEmptyComponent={people.length
          ? <Text style={s.none}>When the people you follow post something, it shows up here.</Text>
          : <Empty icon={<Followed color={T.green} size={28} />} title="Not following anyone yet"
                   body="Tap someone’s name on any post to open their page, then press Follow. Their new videos and streams land here." />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: tabSpace + 24, paddingHorizontal: L.side }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1 },
  h1: { color: T.text, fontSize: 24, fontFamily: F['900'], letterSpacing: -0.6, marginHorizontal: 18, marginBottom: 12 },
  people: { paddingHorizontal: 14, gap: 14, paddingBottom: 8 },
  person: { width: 70, alignItems: 'center', gap: 6 },
  face: { width: 58, height: 58, borderRadius: 29, overflow: 'hidden', backgroundColor: T.blue, alignItems: 'center', justifyContent: 'center' },
  faceLive: { borderWidth: 3, borderColor: T.red },
  photo: { width: '100%', height: '100%' },
  tag: { position: 'absolute', top: 48, backgroundColor: T.red, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  tagTxt: { color: '#fff', fontSize: 9, fontFamily: F['900'], letterSpacing: 0.5 },
  personName: { color: T.text, fontSize: 12, fontFamily: F['700'], maxWidth: 70 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 18, marginTop: 18, marginBottom: 12 },
  sub: { color: T.text, fontSize: 17, fontFamily: F['800'] },
  subAlone: { marginHorizontal: 18, marginTop: 18, marginBottom: 12 },
  none: { color: T.muted, fontFamily: F['500'], textAlign: 'center', marginTop: 20, marginHorizontal: 30, lineHeight: 20 },
});
