import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme, F } from './theme';
import { ThumbUp, ThumbDown, Comment } from './Icons';
import { vote, subscribeMyVote } from './data';

/**
 * Like, dislike and comment, for anything that can be posted.
 *
 * The totals come from the post itself, which the feed already watches, so they
 * move the moment anyone votes. Your own vote is a separate little document,
 * watched here — that's what fills the thumb in.
 *
 * `tone="video"` is the version that sits over a playing short: white, stacked
 * in a column down the right-hand side.
 */
export default function PostActions({ post, onComment, tone = 'card' }) {
  const T = useTheme();
  const video = tone === 'video';
  const s = useMemo(() => styles(T, video), [T, video]);

  const [mine, setMine] = useState(0);
  useEffect(() => subscribeMyVote(post.id, setMine), [post.id]);

  // Nothing is done about a failed vote beyond leaving the count alone: the
  // listener holds the truth, so the thumb simply doesn't stick.
  const press = want => vote(post.id, want).catch(() => {});

  const plain = video ? 'rgba(255,255,255,0.92)' : T.muted;
  const size = video ? 27 : 19;

  return (
    <View style={s.row}>
      <Pressable onPress={() => press(1)} style={s.btn} hitSlop={8}
                 accessibilityRole="button" accessibilityLabel="Like">
        <ThumbUp color={mine === 1 ? T.green : plain} size={size} filled={mine === 1} />
        <Text style={[s.n, mine === 1 && s.on]}>{post.likeCount || 0}</Text>
      </Pressable>

      <Pressable onPress={() => press(-1)} style={s.btn} hitSlop={8}
                 accessibilityRole="button" accessibilityLabel="Dislike">
        <ThumbDown color={mine === -1 ? T.red : plain} size={size} filled={mine === -1} />
        <Text style={[s.n, mine === -1 && s.off]}>{post.dislikeCount || 0}</Text>
      </Pressable>

      <Pressable onPress={onComment} style={s.btn} hitSlop={8}
                 accessibilityRole="button" accessibilityLabel="Comments">
        <Comment color={plain} size={size} />
        <Text style={s.n}>{post.commentCount || 0}</Text>
      </Pressable>
    </View>
  );
}

const styles = (T, video) => StyleSheet.create({
  row: video
    ? { gap: 22, alignItems: 'center' }
    : { flexDirection: 'row', gap: 20, marginTop: 12 },
  btn: video
    ? { alignItems: 'center', gap: 3 }
    : { flexDirection: 'row', alignItems: 'center', gap: 6 },
  n: {
    color: video ? '#fff' : T.muted,
    fontSize: video ? 12.5 : 13,
    fontFamily: F['700'],
    ...(video ? { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 } : null),
  },
  on: { color: T.green },
  off: { color: T.red },
});
