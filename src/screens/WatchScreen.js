import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, ScrollView, Image, Modal,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F, compact } from '../theme';
import useWindowControls from '../windowControls';
import { ago } from '../data';
import { auth } from '../firebase';
import { Person, Chevron } from '../Icons';
import Player from '../Player';
import PostActions from '../PostActions';
import CommentThread from '../CommentThread';
import { useFollowing, toggleFollow } from '../social';

/**
 * Watching one video.
 *
 * What a card drawn as a video promises: the thing plays on a page of its own,
 * with the title, whose it is and the same like, dislike and comment the rest
 * of Codera has. Playing it inside a card in the feed meant a video the size of
 * a card, with the feed still scrolling underneath it.
 */
export default function WatchScreen({ route, navigation }) {
  const { post } = route.params;
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const wc = useWindowControls();

  const { width, height } = useWindowDimensions();
  const [full, setFull] = useState(false);
  const following = useFollowing();
  const mine = auth.currentUser?.uid === post.uid;

  return (
    <View style={s.fill}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={[s.top, { paddingTop: insets.top + 8, paddingLeft: 10 + wc }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.back}
                   accessibilityRole="button" accessibilityLabel="Back">
          {/* Chevron points the way a list opens; back is the other way. */}
          <View style={s.flip}><Chevron color={T.text} size={20} /></View>
        </Pressable>
      </View>

      <Player source={{ uri: post.videoUrl }} style={s.stage} onFull={() => setFull(true)} />

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={s.title}>{post.title}</Text>

        <View style={s.by}>
          <Pressable style={s.who} hitSlop={6}
                     onPress={() => navigation.navigate('User', { uid: post.uid })}
                     accessibilityRole="link" accessibilityLabel={post.authorName + '’s page'}>
            <View style={s.avatar}>
              {post.authorPhoto
                ? <Image source={{ uri: post.authorPhoto }} style={s.photo} />
                : <Person color={T.muted} size={17} />}
            </View>
            <View>
              <Text style={s.name} numberOfLines={1}>{post.authorName}</Text>
              <Text style={s.when}>
                {compact(post.likeCount || 0)} {(post.likeCount || 0) === 1 ? 'like' : 'likes'} · {ago(post.createdAt)}
              </Text>
            </View>
          </Pressable>
          {!mine && (
            <Pressable
              onPress={() => toggleFollow(post.uid, following.has(post.uid)).catch(() => {})}
              style={[s.follow, following.has(post.uid) && s.followOn]}
              accessibilityRole="button"
            >
              <Text style={[s.followTxt, following.has(post.uid) && s.followTxtOn]}>
                {following.has(post.uid) ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          )}
        </View>

        <PostActions post={post} />

        {!!post.description && <Text style={s.desc}>{post.description}</Text>}

        {/* On the page, under the video. A video is watched on a page of its
            own, so there is room for the thread; a post in a feed has none,
            and raises the same thread over itself instead. */}
        <View style={s.line} />
        <CommentThread post={post} />
      </ScrollView>

      {/* Full screen, turned on its side.
          Android will not rotate the window without a native orientation
          module, so the picture is turned instead: a landscape stage the size
          of the screen, laid across a portrait window. */}
      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}
             supportedOrientations={['portrait', 'landscape']}>
        <View style={s.dark}>
          <View style={[s.turned, { width: height, height: width }]}>
            <Player
              source={{ uri: post.videoUrl }}
              style={StyleSheet.absoluteFill}
              full
              onFull={() => setFull(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  top: { paddingBottom: 8, backgroundColor: '#000' },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ rotate: '180deg' }] },
  stage: { width: '100%', aspectRatio: 16 / 9 },
  body: { padding: 16, gap: 14 },
  title: { color: T.text, fontSize: 18.5, fontFamily: F['800'], lineHeight: 25 },
  by: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  name: { color: T.text, fontSize: 14.5, fontFamily: F['700'] },
  when: { color: T.muted, fontSize: 12.5, fontFamily: F['500'] },
  follow: {
    paddingHorizontal: 16, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: T.green,
  },
  followOn: { backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border },
  followTxt: { color: '#04140b', fontSize: 13.5, fontFamily: F['800'] },
  followTxtOn: { color: T.text },
  dark: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  turned: { transform: [{ rotate: '90deg' }] },
  line: { height: 1, backgroundColor: T.border, marginTop: 4 },
  desc: {
    color: T.muted, fontSize: 14.5, fontFamily: F['400'], lineHeight: 21,
    backgroundColor: T.bg2, borderRadius: 14, borderWidth: 1, borderColor: T.border,
    padding: 12,
  },
});
