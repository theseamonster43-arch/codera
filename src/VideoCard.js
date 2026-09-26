import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Image, Modal, useWindowDimensions,
} from 'react-native';
import Video from 'react-native-video';
import { useNavigation } from '@react-navigation/native';

import { useTheme, F, clock, compact } from './theme';
import { ago, deletePost } from './data';
import { auth } from './firebase';
import { Play, Person } from './Icons';
import CommentsSheet from './CommentsSheet';
import PostActions from './PostActions';
import { beforeVideo } from './ads';
import { nudgePost, WEIGHT } from './social';

/** What the ••• menu calls the thing you are about to delete. */
const KIND = { video: 'video', live: 'stream' };

/**
 * A video or a saved stream in the feed.
 *
 * Not a post with a video in it: the picture comes first and the words go
 * underneath, which is the shape a video has everywhere — here, on the website
 * and in the Apple app. Only something written keeps the post card.
 */
export default function VideoCard({ post }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const { width } = useWindowDimensions();
  const nav = useNavigation();

  const [starting, setStarting] = useState(false);
  const [menu, setMenu] = useState(null);
  const [talking, setTalking] = useState(false);
  const dots = useRef(null);
  const [still, setStill] = useState(false);

  const mine = auth.currentUser?.uid === post.uid;

  // Any ad comes before the video begins, never partway through it.
  async function play() {
    if (starting) return;
    setStarting(true);
    try {
      await beforeVideo(post.duration);
    } finally {
      setStarting(false);
      // A video opens on a page of its own rather than playing inside a card
      // in a feed that is still scrolling underneath it.
      nav.navigate('Watch', { post });
      nudgePost(post, WEIGHT.watch, 'watch:' + post.id);
    }
  }

  function openMenu() {
    dots.current?.measureInWindow((x, y, w, h) => {
      setMenu({ right: Math.max(12, width - (x + w)), top: y + h + 8 });
    });
  }

  return (
    <View style={s.card}>
      <Pressable style={s.thumb} onPress={play} disabled={starting}
                 accessibilityRole="button" accessibilityLabel={'Play ' + post.title}>
        {(
          <>
            <Video
              source={{ uri: post.videoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            // Android draws nothing for a video that has never played, so it
            // runs muted until the first frame is through and then stops. That
            // frame is the thumbnail; nothing is stored for one.
            paused={still}
            muted
            repeat={false}
            onProgress={() => { if (!still) setStill(true); }}
            />
            <View style={s.playBtn}><Play color="#fff" size={26} /></View>
            {post.type === 'live' && (
              <View style={[s.tag, s.streamTag]}><Text style={s.tagTxt}>STREAM</Text></View>
            )}
            {post.duration ? (
              <View style={s.len}><Text style={s.lenTxt}>{clock(post.duration)}</Text></View>
            ) : null}
          </>
        )}
      </Pressable>

      <View style={s.body}>
        <Pressable style={s.avatar} hitSlop={6}
                   onPress={() => nav.navigate('User', { uid: post.uid })}
                   accessibilityRole="link" accessibilityLabel={post.authorName + '’s page'}>
          {post.authorPhoto
            ? <Image source={{ uri: post.authorPhoto }} style={s.photo} />
            : <Person color={T.muted} size={16} />}
        </Pressable>

        <View style={s.words}>
          <Text style={s.title} numberOfLines={2}>{post.title}</Text>
          <Text style={s.who} numberOfLines={1}>{post.authorName}</Text>
          <Text style={s.who} numberOfLines={1}>
            {compact(post.likeCount || 0)} {(post.likeCount || 0) === 1 ? 'like' : 'likes'} · {ago(post.createdAt)}
          </Text>
        </View>

        {mine && (
          <Pressable ref={dots} onPress={openMenu} hitSlop={10}
                     accessibilityRole="button" accessibilityLabel="More">
            <Text style={s.moreTxt}>•••</Text>
          </Pressable>
        )}
      </View>

      {!!post.description && (
        <Text style={s.desc} numberOfLines={3}>{post.description}</Text>
      )}

      <View style={s.acts}>
        <PostActions post={post} onComment={() => setTalking(true)} />
      </View>

      {talking && <CommentsSheet post={post} onClose={() => setTalking(false)} />}

      {/* The ••• menu. A tap anywhere else closes it, having done nothing. */}
      <Modal transparent visible={!!menu} animationType="fade"
             onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)}>
          {menu && (
            <View style={[s.menu, { top: menu.top, right: menu.right }]}>
              <Pressable
                onPress={() => { setMenu(null); deletePost(post).catch(() => {}); }}
                style={({ pressed }) => [s.item, pressed && s.itemOn]}
              >
                <Text style={s.del}>Delete {KIND[post.type] || 'video'}</Text>
              </Pressable>
              <View style={s.line} />
              <Pressable onPress={() => setMenu(null)}
                         style={({ pressed }) => [s.item, pressed && s.itemOn]}>
                <Text style={s.keep}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = T => StyleSheet.create({
  card: {
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    borderRadius: 16, marginHorizontal: 14, marginBottom: 12, overflow: 'hidden',
  },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  playBtn: {
    position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -26,
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tag: {
    position: 'absolute', left: 10, bottom: 10, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, backgroundColor: T.green,
  },
  streamTag: { backgroundColor: T.red },
  tagTxt: { color: '#fff', fontSize: 10.5, fontFamily: F['900'] },
  len: {
    position: 'absolute', right: 10, bottom: 10, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.78)',
  },
  lenTxt: { color: '#fff', fontSize: 11, fontFamily: F['700'] },

  body: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'flex-start' },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  words: { flex: 1, gap: 2 },
  title: { color: T.text, fontSize: 15, fontFamily: F['700'] },
  who: { color: T.muted, fontSize: 12.5, fontFamily: F['500'] },
  desc: {
    color: T.muted, fontSize: 13.5, fontFamily: F['400'],
    paddingHorizontal: 12, paddingBottom: 4,
  },
  moreTxt: { color: T.muted, fontSize: 15, fontFamily: F['700'] },
  acts: { paddingHorizontal: 12, paddingBottom: 10 },

  menu: {
    position: 'absolute', minWidth: 190, borderRadius: 14, paddingVertical: 4,
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
  },
  item: { paddingVertical: 11, paddingHorizontal: 14 },
  itemOn: { backgroundColor: T.bg3 },
  del: { color: T.red, fontSize: 14.5, fontFamily: F['700'] },
  keep: { color: T.text, fontSize: 14.5, fontFamily: F['600'] },
  line: { height: 1, backgroundColor: T.border, marginHorizontal: 10 },
});
