import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import Video from 'react-native-video';

import { useTheme, F, clock, compact } from '../theme';
import { ago, picsOf } from '../data';
import { Person, Play } from '../Icons';
import { useFace } from '../social';
import { useFocus } from './focus';

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
  const focus = useFocus();

  const short = post.type === 'short';
  const video = short || post.type === 'video' || post.type === 'live';
  const pics = picsOf(post);

  return (
    <Pressable
      {...focus.bind}
      onPress={onPress}
      style={[s.card, { width: wide }, focus.on && s.on]}
      accessibilityRole="button"
      accessibilityLabel={post.title + ', by ' + face.name}
    >
      <View style={[s.stage, short ? s.tall : s.flat, focus.on && s.stageOn]}>
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
            {focus.on && (
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
    </Pressable>
  );
}

const styles = T => StyleSheet.create({
  card: {
    borderRadius: 16, overflow: 'hidden', backgroundColor: T.bg2,
    borderWidth: 2, borderColor: 'transparent',
  },
  // Focus is shown with the brand colour and a lift, never colour alone.
  on: { borderColor: T.green, transform: [{ scale: 1.04 }] },
  stage: { width: '100%', backgroundColor: '#000' },
  flat: { aspectRatio: 16 / 9 },
  tall: { aspectRatio: 9 / 16 },
  stageOn: { opacity: 1 },
  playBtn: {
    position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -28,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  words: { flex: 1, padding: 16, justifyContent: 'center' },
  wordsTxt: { color: T.text, fontSize: 17, fontFamily: F['600'], lineHeight: 25 },
  tag: {
    position: 'absolute', left: 10, bottom: 10, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: T.green,
  },
  streamTag: { backgroundColor: T.red },
  tagTxt: { color: '#04140b', fontSize: 11.5, fontFamily: F['900'] },
  len: {
    position: 'absolute', right: 10, bottom: 10, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.78)',
  },
  lenTxt: { color: '#fff', fontSize: 12, fontFamily: F['700'] },
  body: { flexDirection: 'row', gap: 10, padding: 12 },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  said: { flex: 1, gap: 2 },
  title: { color: T.text, fontSize: 16, fontFamily: F['700'] },
  who: { color: T.muted, fontSize: 13, fontFamily: F['500'] },
});
