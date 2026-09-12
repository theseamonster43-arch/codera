import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, StatusBar, Image, TextInput,
  ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
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
import { useProfile, setProfileImage, clearBanner, setBio, BIO_MAX } from '../profile';
import Gradient, { BRAND } from '../Gradient';
import { Picture, Camera } from '../Icons';

/** Your page: who you are, and everything you have posted. */
export default function YouScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const wc = useWindowControls();
  const { posts } = usePosts();
  const plus = usePlus();
  const profile = useProfile();

  // Which picture is being replaced, if either, and the description while it is
  // being written (null when it is not).
  const [busy, setBusy] = useState(null);
  const [bio, setBioText] = useState(null);

  // The picture's own shape, so the strip chosen on the website is the strip
  // shown here. React Native has no object-position, so the picture is drawn at
  // its full scaled height and slid up by the saved amount.
  const { width: winW } = useWindowDimensions();
  const [shot, setShot] = useState(null);
  const bannerUrl = profile.bannerUrl;
  React.useEffect(() => {
    if (!bannerUrl) { setShot(null); return undefined; }
    let live = true;
    Image.getSize(bannerUrl, (w, h) => { if (live) setShot({ w, h }); }, () => {});
    return () => { live = false; };
  }, [bannerUrl]);

  const BANNER_H = 132;
  const boxW = winW - 28;                       // the banner's own margins
  const fullH = shot ? Math.max(BANNER_H, (boxW / shot.w) * shot.h) : BANNER_H;
  const bannerY = typeof profile.bannerY === 'number' ? profile.bannerY : 50;
  const slide = -((fullH - BANNER_H) * (bannerY / 100));

  const me = auth.currentUser;
  const name = profile.username || me?.displayName || 'You';

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

  /** Picks one picture and puts it up as the banner or as the profile photo. */
  async function pickFor(kind) {
    if (busy) return;
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const a = res && res.assets && res.assets[0];
    if (!a || !a.uri) return;
    setBusy(kind);
    try {
      await setProfileImage(kind, { uri: a.uri, mime: a.type || 'image/jpeg' },
                            profile[kind + 'Path']);
    } catch (e) {
      Alert.alert('Could not save that', 'Check your connection and try again.');
    }
    setBusy(null);
  }

  function bannerMenu() {
    if (!profile.bannerUrl) return pickFor('banner');
    Alert.alert('Banner', null, [
      { text: 'Change banner', onPress: () => pickFor('banner') },
      {
        text: 'Remove banner',
        style: 'destructive',
        onPress: async () => {
          setBusy('banner');
          try { await clearBanner(profile.bannerPath); } catch (e) {}
          setBusy(null);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function saveBio() {
    const text = bio;
    setBioText(null);
    try {
      await setBio(text);
    } catch (e) {
      Alert.alert('Could not save that', 'Check your connection and try again.');
    }
  }

  async function out() {
    // Google's own session is cleared as well as Firebase's. Otherwise the next
    // "Continue with Google" silently reuses the last account instead of asking,
    // which on a shared device signs the next person in as the previous one.
    try { await GoogleSignin.signOut(); } catch (e) {}
    await signOut(auth);
  }

  const header = (
    <View style={{ paddingTop: insets.top + 10, paddingLeft: wc }}>
      {/* The banner: your picture if you set one, the brand wash if not. The
          same one the website shows, because both read the same profile. */}
      <Pressable onPress={bannerMenu} style={s.bannerWrap}>
        {profile.bannerUrl
          ? (
            <Image
              source={{ uri: profile.bannerUrl }}
              style={[s.banner, { height: fullH, transform: [{ translateY: slide }] }]}
              resizeMode="cover"
            />
          )
          : <Gradient colors={BRAND} style={s.banner} />}
        <View style={s.bannerBtn}>
          {busy === 'banner'
            ? <ActivityIndicator color="#fff" size="small" />
            : (
              <>
                <Picture color="#fff" size={15} />
                <Text style={s.bannerBtnTxt}>{profile.bannerUrl ? 'Change' : 'Add banner'}</Text>
              </>
            )}
        </View>
      </Pressable>

      <View style={s.head}>
        <Pressable onPress={() => pickFor('photo')} style={s.avatarWrap}>
          <View style={s.avatar}>
            {me?.photoURL
              ? <Image source={{ uri: me.photoURL }} style={s.photo} />
              : <Person color={T.muted} size={34} />}
          </View>
          <View style={s.camera}>
            {busy === 'photo'
              ? <ActivityIndicator color={T.text} size="small" />
              : <Camera color={T.text} size={14} />}
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            {plus.active && <PlusChip />}
          </View>
          <Text style={s.sub} numberOfLines={1}>@{name}</Text>
        </View>
      </View>

      {/* A line about yourself. Optional, and written in place. */}
      {bio === null ? (
        <Pressable onPress={() => setBioText(profile.bio || '')} style={s.bioWrap}>
          {profile.bio
            ? <Text style={s.bioTxt}>{profile.bio}</Text>
            : <Text style={s.bioAdd}>Add a description</Text>}
        </Pressable>
      ) : (
        <View style={s.bioWrap}>
          <TextInput
            style={s.bioInput} value={bio} onChangeText={setBioText} autoFocus multiline
            placeholder="Say what you post about." placeholderTextColor={T.muted}
            maxLength={BIO_MAX} textAlignVertical="top"
          />
          <View style={s.bioRow}>
            <Text style={s.bioLeft}>{BIO_MAX - bio.length} left</Text>
            <Pressable onPress={() => setBioText(null)} hitSlop={8}>
              <Text style={s.bioCancel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={saveBio} hitSlop={8}>
              <Text style={s.bioSave}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}

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
  bannerWrap: {
    marginHorizontal: 14, height: 132, borderRadius: 18, overflow: 'hidden',
    backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border,
  },
  banner: { width: '100%', height: '100%' },
  bannerBtn: {
    position: 'absolute', right: 10, bottom: 10, minWidth: 40, height: 30,
    paddingHorizontal: 11, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  bannerBtnTxt: { color: '#fff', fontSize: 12.5, fontFamily: F['700'] },

  // Pulled up so the picture sits half over the banner, as it does on the site.
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 18, marginTop: -26,
  },
  avatarWrap: { width: 74, height: 74 },
  camera: {
    position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13,
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 22 },
  bioWrap: { marginHorizontal: 18, marginTop: 12 },
  bioTxt: { color: T.muted, fontSize: 14, fontFamily: F['500'], lineHeight: 21 },
  bioAdd: { color: T.blue, fontSize: 13.5, fontFamily: F['700'] },
  bioInput: {
    color: T.text, fontSize: 14, fontFamily: F['500'], lineHeight: 21, minHeight: 74,
    borderWidth: 1, borderColor: T.border, borderRadius: 12, backgroundColor: T.bg2,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  bioRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  bioLeft: { flex: 1, color: T.muted, fontSize: 12, fontFamily: F['500'] },
  bioCancel: { color: T.muted, fontSize: 13.5, fontFamily: F['700'] },
  bioSave: { color: T.blue, fontSize: 13.5, fontFamily: F['800'] },

  avatar: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: T.bg2,
    borderWidth: 3, borderColor: T.bg, overflow: 'hidden',
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
