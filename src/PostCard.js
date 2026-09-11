import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Platform, Alert } from 'react-native';
import Video from 'react-native-video';

import { useTheme, F, clock } from './theme';
import { ago, deletePost } from './data';
import { auth } from './firebase';
import { Play, Person } from './Icons';
import { beforeVideo } from './ads';

/** A post or a video in a feed. Shorts have their own full-screen player. */
export default function PostCard({ post }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);

  const mine = auth.currentUser?.uid === post.uid;

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

  function remove() {
    Alert.alert('Delete this?', "It'll be removed for everyone. This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePost(post).catch(() => {}) },
    ]);
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
          // Only on your own posts, and behind a confirmation — a stray tap on a
          // feed should never be able to delete something.
          <Pressable onPress={remove} hitSlop={10} style={s.more}>
            <Text style={s.moreTxt}>•••</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.title}>{post.title}</Text>
      {!!post.body && <Text style={s.body}>{post.body}</Text>}

      {post.type === 'video' && (
        <Pressable style={s.video} onPress={play} disabled={playing || starting}>
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
  body: { color: T.text, fontSize: 14, fontFamily: F['400'], lineHeight: 21, marginTop: 6, opacity: 0.9 },

  video: {
    height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000',
    marginTop: 12, alignItems: 'center', justifyContent: 'center',
  },
  playBtn: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(59,130,246,0.92)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 3,
  },
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
});
