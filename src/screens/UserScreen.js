import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F } from '../theme';
import { Person, Chevron, Live } from '../Icons';
import { Flag } from '../SocialIcons';
import Empty from '../Empty';
import PostCard from '../PostCard';
import useLayout from '../layout';
import { auth } from '../firebase';
import { useFollowing, useStreams, toggleFollow, loadUser, resolveUser, onAir } from '../social';
import { LinkRow } from '../LinkRow';
import { useAge, useBlocked, toggleBlock } from '../safety';
import ReportSheet from '../ReportSheet';

const CHOICES = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Videos' },
  { id: 'short', label: 'Shorts' },
  { id: 'live', label: 'Streams' },
  { id: 'post', label: 'Posts' },
];

/** Someone's page: banner, name, followers, a Follow button and everything they posted. */
export default function UserScreen({ route, navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const following = useFollowing();
  const streams = useStreams();
  const age = useAge();
  const blocked = useBlocked();
  const [reporting, setReporting] = useState(false);

  const [uid, setUid] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [was, setWas] = useState(null);      // following when the page opened
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(null);  // a follow pressed but not yet confirmed

  useEffect(() => {
    let alive = true;
    (async () => {
      const id = route.params?.uid || await resolveUser(route.params?.name);
      if (!alive) return;
      if (!id) { setErr('Nobody by that name.'); return; }
      const d = await loadUser(id);
      if (!alive) return;
      if (!d.profile.username && !d.posts.length) { setErr('This account has no page yet.'); return; }
      setUid(id);
      setData(d);
    })().catch(() => alive && setErr('Couldn’t open this page. Check your connection.'));
  return () => { alive = false; };
  }, [route.params?.uid, route.params?.name]);

  useEffect(() => { if (uid && was === null) setWas(following.has(uid)); }, [uid, following, was]);
  useEffect(() => { if (uid && local !== null && following.has(uid) === local) setLocal(null); }, [following, uid, local]);

  const mine = uid && auth.currentUser?.uid === uid;
  const isFollowing = local !== null ? local : (uid ? following.has(uid) : false);
  const followers = data ? data.followers - (was ? 1 : 0) + (isFollowing ? 1 : 0) : 0;
  const live = uid ? streams.find(st => st.uid === uid && onAir(st)) : null;

  const name = data ? data.profile.username || data.posts[0]?.authorName || 'someone' : '';
  const photo = data ? data.profile.photoUrl || data.posts[0]?.authorPhoto || null : null;
  const likes = data ? data.posts.reduce((n, p) => n + (p.likeCount || 0), 0) : 0;
  const choices = data ? CHOICES.filter(c => c.id === 'all' || data.posts.some(p => p.type === c.id)) : [];
  const shown = data ? (filter === 'all' ? data.posts : data.posts.filter(p => p.type === filter)) : [];

  async function follow() {
    if (!uid || busy) return;
    const next = !isFollowing;
    setLocal(next);
    setBusy(true);
    try { await toggleFollow(uid, !next); }
    catch (e) { setLocal(null); }
    setBusy(false);
  }

  const top = (
    <View style={[s.bar, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
        <View style={{ transform: [{ rotate: '180deg' }] }}><Chevron color={T.text} size={22} /></View>
      </Pressable>
      <Text style={s.barTitle} numberOfLines={1}>{name}</Text>
    </View>
  );

  if (err || !data) {
    return (
      <View style={s.fill}>
        {top}
        {err
          ? <Empty icon={<Person color={T.muted} size={28} />} title={err} body="Check the spelling, or find them through one of their posts." />
          : <ActivityIndicator color={T.blue} style={{ marginTop: 60 }} />}
      </View>
    );
  }

  const header = (
    <View style={{ marginBottom: 12 }}>
      <View style={s.banner}>
        {data.profile.bannerUrl ? <Image source={{ uri: data.profile.bannerUrl }} style={s.bannerImg} /> : null}
      </View>
      <View style={s.row}>
        <View style={s.avatar}>
          {photo ? <Image source={{ uri: photo }} style={s.photo} /> : <Person color="#fff" size={34} />}
        </View>
        <View style={{ flex: 1 }} />
        {live && (
          <Pressable style={s.livePill} onPress={() => navigation.navigate('LiveView', { path: 'stream/' + live.id })}>
            <Live color="#fff" size={16} /><Text style={s.livePillTxt}>Live now</Text>
          </Pressable>
        )}
        {!mine && (
          <Pressable onPress={follow} style={[s.follow, isFollowing && s.following]}
                     accessibilityRole="button" accessibilityState={{ selected: isFollowing }}>
            <Text style={[s.followTxt, isFollowing && s.followingTxt]}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </Pressable>
        )}
        {!mine && (
          <Pressable onPress={() => setReporting(true)} style={s.more} hitSlop={8}
                     accessibilityRole="button" accessibilityLabel="Block or report">
            <Flag color={T.muted} size={18} />
          </Pressable>
        )}
      </View>
      <Text style={s.name}>{name}</Text>
      <Text style={s.meta}>
        @{data.profile.username || name} · {followers} follower{followers === 1 ? '' : 's'} · {data.following} following · {likes} like{likes === 1 ? '' : 's'}
      </Text>
      {!!data.profile.bio && <Text style={s.bio}>{data.profile.bio}</Text>}
      <LinkRow links={data.profile.links} age={age} />
      <View style={s.chips}>
        {choices.map(c => (
          <Pressable key={c.id} onPress={() => setFilter(c.id)} style={[s.chip, filter === c.id && s.chipOn]}>
            <Text style={[s.chipTxt, filter === c.id && s.chipTxtOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
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
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      {top}
      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        name={name}
        blocked={uid ? blocked.has(uid) : false}
        onBlock={() => toggleBlock(uid, blocked.has(uid))}
        kind="user"
        target={uid}
        about={uid}
      />
      <FlatList
        data={shown}
        keyExtractor={p => p.id}
        key={'cols' + L.columns}
        numColumns={L.columns}
        renderItem={cell}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={s.none}>Nothing here yet.</Text>}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingHorizontal: L.side }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  back: { padding: 4 },
  barTitle: { flex: 1, color: T.text, fontSize: 17, fontFamily: F['800'] },
  banner: { height: 120, marginHorizontal: 14, borderRadius: 16, overflow: 'hidden', backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border },
  bannerImg: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 18, marginTop: -34 },
  avatar: {
    width: 84, height: 84, borderRadius: 42, overflow: 'hidden', backgroundColor: T.blue,
    alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: T.bg,
  },
  photo: { width: '100%', height: '100%' },
  follow: { height: 38, paddingHorizontal: 18, borderRadius: 19, backgroundColor: T.text, alignItems: 'center', justifyContent: 'center' },
  following: { backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border },
  followTxt: { color: T.bg, fontSize: 14, fontFamily: F['800'] },
  followingTxt: { color: T.text },
  more: {
    width: 38, height: 38, borderRadius: 19, marginLeft: 8,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  livePill: { height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: T.red, flexDirection: 'row', alignItems: 'center', gap: 6 },
  livePillTxt: { color: '#fff', fontSize: 13.5, fontFamily: F['800'] },
  name: { color: T.text, fontSize: 24, fontFamily: F['900'], letterSpacing: -0.6, marginHorizontal: 18, marginTop: 10 },
  meta: { color: T.muted, fontSize: 13, fontFamily: F['600'], marginHorizontal: 18, marginTop: 3 },
  bio: { color: T.muted, fontSize: 14, fontFamily: F['400'], lineHeight: 20, marginHorizontal: 18, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 14, marginTop: 16 },
  chip: { paddingHorizontal: 13, height: 34, borderRadius: 17, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, justifyContent: 'center' },
  chipOn: { backgroundColor: T.text, borderColor: T.text },
  chipTxt: { color: T.text, fontSize: 13.5, fontFamily: F['700'] },
  chipTxtOn: { color: T.bg },
  none: { color: T.muted, fontFamily: F['500'], textAlign: 'center', marginTop: 30 },
});
