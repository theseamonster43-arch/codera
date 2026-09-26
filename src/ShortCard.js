import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import Video from 'react-native-video';
import { useNavigation } from '@react-navigation/native';

import { useTheme, F, compact } from './theme';
import { ago } from './data';
import { Person } from './Icons';

/** How wide one card on the shelf is. Narrow enough that the next one shows. */
export const SHELF_W = 150;

/**
 * A short on the shelf across the top of the feed.
 *
 * Tall, because a short is, and narrow enough that a couple more are in reach.
 * Pressing one opens the Shorts tab on that short rather than a lesser player
 * somewhere else — Shorts is where a short is watched.
 */
export default function ShortCard({ post }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const nav = useNavigation();
  const [still, setStill] = useState(false);

  return (
    <Pressable
      style={s.card}
      onPress={() => nav.navigate('Shorts', { id: post.id })}
      accessibilityRole="button"
      accessibilityLabel={post.title + ', short by ' + post.authorName}
    >
      <View style={s.thumb}>
        {/* The first frame stands in for a thumbnail: nothing is stored for
            this, so it is paused on the opening moment rather than played. */}
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
        <View style={s.tag}><Text style={s.tagTxt}>SHORT</Text></View>
      </View>

      <View style={s.body}>
        <View style={s.avatar}>
          {post.authorPhoto
            ? <Image source={{ uri: post.authorPhoto }} style={s.photo} />
            : <Person color={T.muted} size={13} />}
        </View>
        <View style={s.words}>
          <Text style={s.title} numberOfLines={2}>{post.title}</Text>
          <Text style={s.who} numberOfLines={1}>{post.authorName}</Text>
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
    width: SHELF_W, borderRadius: 16, overflow: 'hidden',
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
  },
  thumb: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000' },
  tag: {
    position: 'absolute', left: 8, bottom: 8,
    backgroundColor: T.green, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  tagTxt: { color: '#000', fontSize: 10.5, fontFamily: F['900'] },
  body: { flexDirection: 'row', gap: 8, padding: 9 },
  avatar: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: T.bg3,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  words: { flex: 1, gap: 2 },
  title: { color: T.text, fontSize: 13, fontFamily: F['700'] },
  who: { color: T.muted, fontSize: 11.5, fontFamily: F['500'] },
});
