import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Video from 'react-native-video';

import { useTheme, F, clock, compact } from '../theme';
import { ago, picsOf } from '../data';
import { Person, Play } from '../Icons';
import { useFace } from '../social';
import { Focusable } from './focus';

/**
 * One thing to watch, across the room.
 *
 * Everything is bigger than it is on a phone because it is read from a sofa,
 * and the card says loudly when it has focus: on a television the only way to
 * tell what the middle button will press is to look.
 */
export default function TVCard({ post, wide = 300, onPress }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const [still, setStill] = useState(false);
  const face = useFace(post.uid, post);

  const short = post.type === 'short';
  const video = short || post.type === 'video' || post.type === 'live';
  const pics = picsOf(post);

  return (
    <Focusable
      onPress={onPress}
      grow={1.06}
      style={[s.card, { width: wide }]}
      accessibilityRole="button"
      accessibilityLabel={post.title + ', by ' + face.name}
    >
      {focused => (
      <View style={[s.inner, focused && s.on]}>
      <View style={[s.stage, short ? s.tall : s.flat]}>
        {video ? (
          <>
            <Video
              source={{ uri: post.videoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              // Android draws nothing for a video that has never played, so it
              // runs muted until the first frame is through and then stops.
              paused={still}
              muted
              repeat={false}
              onProgress={() => { if (!still) setStill(true); }}
            />
            {focused && (
              <View style={s.playBtn}><Play color="#fff" size={30} /></View>
            )}
            {short && <View style={s.tag}><Text style={s.tagTxt}>SHORT</Text></View>}
            {post.type === 'live' && (
              <View style={[s.tag, s.streamTag]}><Text style={s.tagTxt}>STREAM</Text></View>
            )}
            {post.duration ? (
              <View style={s.len}><Text style={s.lenTxt}>{clock(post.duration)}</Text></View>
            ) : null}
          </>
        ) : pics.length ? (
          <Image source={{ uri: pics[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          // Something written: the words are the picture.
          <View style={s.words}>
            <Text style={s.wordsTxt} numberOfLines={4}>{post.body || post.title}</Text>
          </View>
        )}
      </View>

      <View style={s.body}>
        <View style={s.avatar}>
          {face.photo
            ? <Image source={{ uri: face.photo }} style={s.photo} />
            : <Person color={T.muted} size={15} />}
        </View>
        <View style={s.said}>
          <Text style={s.title} numberOfLines={2}>{post.title}</Text>
          <Text style={s.who} numberOfLines={1}>{face.name}</Text>
          <Text style={s.who} numberOfLines={1}>
            {compact(post.likeCount || 0)} {(post.likeCount || 0) === 1 ? 'like' : 'likes'} · {ago(post.createdAt)}
          </Text>
        </View>
      </View>
      </View>
      )}
    </Focusable>
  );
}

const styles = T => StyleSheet.create({
  card: { borderRadius: 16 },
  inner: {
    borderRadius: 16, overflow: 'hidden', backgroundColor: T.bg2,
    borderWidth: 2, borderColor: 'transparent',
  },
  // Focus is shown with the brand colour and the lift Focusable gives it,
  // never colour alone: across a room a colour change by itself is missable.
  on: { borderColor: T.green },
  stage: { width: '100%', backgroundColor: '#000' },
  flat: { aspectRatio: 16 / 9 },
  tall: { aspectRatio: 9 / 16 },
  playBtn: {
    position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -28,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  words: { flex: 1, padding: 11, justifyContent: 'center' },
  wordsTxt: { color: T.text, fontSize: 13, fontFamily: F['600'], lineHeight: 19 },
  tag: {
    position: 'absolute', left: 7, bottom: 7, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2, backgroundColor: T.green,
  },
  streamTag: { backgroundColor: T.red },
  tagTxt: { color: '#04140b', fontSize: 9, fontFamily: F['900'] },
  len: {
    position: 'absolute', right: 7, bottom: 7, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.78)',
  },
  lenTxt: { color: '#fff', fontSize: 9.5, fontFamily: F['700'] },
  body: { flexDirection: 'row', gap: 7, padding: 9 },
  avatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  said: { flex: 1, gap: 2 },
  title: { color: T.text, fontSize: 12.5, fontFamily: F['700'] },
  who: { color: T.muted, fontSize: 11, fontFamily: F['500'] },
});
