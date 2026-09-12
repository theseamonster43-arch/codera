import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Image, Platform, Modal, useWindowDimensions,
} from 'react-native';
import Video from 'react-native-video';

import { useTheme, F, clock } from './theme';
import { ago, deletePost } from './data';
import { auth } from './firebase';
import { useNavigation } from '@react-navigation/native';

import { Play, Person } from './Icons';
import PostActions from './PostActions';
import { beforeVideo } from './ads';

/** What the ••• menu calls the thing you are about to delete. */
const KIND = { post: 'post', short: 'short', video: 'video' };

/** A post, a short or a video in a feed. */
export default function PostCard({ post }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const { width } = useWindowDimensions();
  const nav = useNavigation();

  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  // Where the ••• sits on screen, so the menu opens right under it.
  const [menu, setMenu] = useState(null);
  const dots = useRef(null);

  const mine = auth.currentUser?.uid === post.uid;
  const isShort = post.type === 'short';
  const hasVideo = isShort || post.type === 'video';

  // Any ad comes before the video begins, never partway through it. Almost
  // always there's none due and this starts the video immediately.
  async function play() {
    if (playing || starting) return;
    setStarting(true);
    try {
      await beforeVideo(post.duration);
    } finally {
      setStarting(false);
      setPlaying(true);
    }
  }

  function openMenu() {
    dots.current?.measureInWindow((x, y, w, h) => {
      setMenu({ right: Math.max(12, width - (x + w)), top: y + h + 8 });
    });
  }

  function remove() {
    setMenu(null);
    deletePost(post).catch(() => {});
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.avatar}>
          {post.authorPhoto
            ? <Image source={{ uri: post.authorPhoto }} style={s.photo} />
            : <Person color={T.muted} size={16} />}
        </View>
        <Text style={s.author} numberOfLines={1}>{post.authorName}</Text>
        <Text style={s.time}>{ago(post.createdAt)}</Text>
        {mine && (
          // Only on your own posts. The menu itself is the confirmation:
          // nothing is deleted by the tap that opens it.
          <Pressable ref={dots} onPress={openMenu} hitSlop={10} style={s.more}
                     accessibilityRole="button" accessibilityLabel="More">
            <Text style={s.moreTxt}>•••</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.title}>{post.title}</Text>
      {!!post.description && (
        <Text style={s.desc} numberOfLines={3}>{post.description}</Text>
      )}
      {!!post.body && <Text style={s.body}>{post.body}</Text>}

      {!!post.imageUrl && (
        <Image source={{ uri: post.imageUrl }} style={s.picture} resizeMode="cover" />
      )}

      {hasVideo && (
        <Pressable style={[s.video, isShort && s.short]} onPress={play}
                   disabled={playing || starting}>
          {playing ? (
            // Mounted only once tapped: a feed of ten videos each holding a
            // decoder would stutter and drain the battery before anyone pressed
            // play on any of them.
            <Video
              source={{ uri: post.videoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              controls
              onEnd={() => setPlaying(false)}
            />
          ) : (
            <>
              <View style={s.playBtn}><Play color="#fff" size={26} /></View>
              {isShort && <View style={s.tag}><Text style={s.tagTxt}>SHORT</Text></View>}
              {post.duration ? (
                <View style={s.len}><Text style={s.lenTxt}>{clock(post.duration)}</Text></View>
              ) : null}
            </>
          )}
        </Pressable>
      )}

      {!!post.code && (
        <View style={s.codeBox}>
          {!!post.lang && <Text style={s.lang}>{post.lang}</Text>}
          <Text style={s.code} selectable>{post.code}</Text>
        </View>
      )}

      <PostActions
        post={post}
        onComment={() => nav.navigate('Comments', {
          postId: post.id, postTitle: post.title, postUid: post.uid,
        })}
      />

      {/* The ••• menu. A tap anywhere else closes it, having done nothing. */}
      <Modal transparent visible={!!menu} animationType="fade"
             onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)}>
          {menu && (
            <View style={[s.menu, { top: menu.top, right: menu.right }]}>
              <Pressable onPress={remove} style={({ pressed }) => [s.item, pressed && s.itemOn]}>
                <Text style={s.del}>Delete {KIND[post.type] || 'post'}</Text>
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
    borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  author: { flexShrink: 1, color: T.text, fontSize: 13.5, fontFamily: F['700'] },
  time: { color: T.muted, fontSize: 12, fontFamily: F['400'], marginLeft: 'auto' },
  more: { paddingLeft: 8 },
  moreTxt: { color: T.muted, fontSize: 13, fontFamily: F['700'], letterSpacing: 1 },

  title: { color: T.text, fontSize: 16, fontFamily: F['800'], lineHeight: 22, marginTop: 11 },
  desc: { color: T.muted, fontSize: 13.5, fontFamily: F['400'], lineHeight: 20, marginTop: 5 },
  body: { color: T.text, fontSize: 14, fontFamily: F['400'], lineHeight: 21, marginTop: 6, opacity: 0.9 },

  picture: { height: 220, borderRadius: 12, marginTop: 12, backgroundColor: T.bg3 },
  video: {
    height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000',
    marginTop: 12, alignItems: 'center', justifyContent: 'center',
  },
  // Shorts are filmed upright, so they get a taller frame than a video.
  short: { height: 330 },
  playBtn: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(59,130,246,0.92)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 3,
  },
  tag: {
    position: 'absolute', left: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  tagTxt: { color: '#fff', fontSize: 10, fontFamily: F['800'], letterSpacing: 0.8 },
  len: {
    position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  lenTxt: { color: '#fff', fontSize: 11.5, fontFamily: F['600'] },

  codeBox: {
    marginTop: 12, borderRadius: 11, padding: 12,
    backgroundColor: T.dark ? '#050806' : '#eef2ef',
    borderWidth: 1, borderColor: T.border,
  },
  lang: {
    color: T.blue, fontSize: 10.5, fontFamily: F['700'],
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7,
  },
  code: {
    color: T.text, fontSize: 12.5, lineHeight: 19,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },

  menu: {
    position: 'absolute', minWidth: 180, borderRadius: 13, overflow: 'hidden',
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
    }),
  },
  item: { paddingHorizontal: 16, paddingVertical: 13 },
  itemOn: { backgroundColor: T.bg3 },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: T.border },
  del: { color: T.red, fontSize: 15, fontFamily: F['700'] },
  keep: { color: T.text, fontSize: 15, fontFamily: F['600'] },
});
