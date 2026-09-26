import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Image, ActivityIndicator,
} from 'react-native';

import { useTheme, F } from './theme';
import { auth } from './firebase';
import { ago, subscribeComments, addComment, deleteComment } from './data';
import { contactProblem } from './safety';
import { Person, Close, Send } from './Icons';
import Gradient, { BRAND } from './Gradient';
import { useFace } from './social';

/**
 * One comment.
 *
 * A component of its own because the face is looked up per person, and a hook
 * cannot be called from inside a loop.
 */
function Said({ comment, canDelete, onDelete, T, s }) {
  const face = useFace(comment.uid, comment);
  return (
    <View style={s.row}>
      <View style={s.avatar}>
        {face.photo
          ? <Image source={{ uri: face.photo }} style={s.photo} />
          : <Person color={T.muted} size={15} />}
      </View>
      <View style={s.said}>
        <View style={s.byline}>
          <Text style={s.who} numberOfLines={1}>{face.name}</Text>
          <Text style={s.when}>{ago(comment.createdAt)}</Text>
        </View>
        <Text style={s.text} selectable>{comment.text}</Text>
      </View>
      {canDelete && (
        <Pressable hitSlop={8} onPress={onDelete}
                   accessibilityRole="button" accessibilityLabel="Delete comment">
          <Close color={T.muted} size={14} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * What people said about a post: the thread and the box to add to it.
 *
 * Drawn as plain rows rather than a list of its own, so it can sit at the
 * bottom of a page that already scrolls — a watch page — as well as inside the
 * sheet that raises it over a feed. Two scrollers inside one another fight.
 */
export default function CommentThread({ post, heading = true }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  const [comments, setComments] = useState(null);   // null while first loading
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const postId = post?.id;
  const postUid = post?.uid;

  useEffect(() => {
    if (!postId) return undefined;
    return subscribeComments(postId, setComments, () => setComments([]));
  }, [postId]);

  if (!post) return null;
  const me = auth.currentUser?.uid;
  const count = comments ? comments.length : 0;

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    // The author of a post owns the room and may point at their own things;
    // nobody may hand out a phone number or a way into a private chat.
    const problem = contactProblem(body, !!(me && postUid && postUid === me));
    if (problem) { setErr(problem); return; }
    setBusy(true);
    setErr('');
    try {
      await addComment(postId, body);
      setText('');
    } catch (e) {
      setErr("Couldn't post that comment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      {heading && (
        <Text style={s.heading}>
          {count === 0 ? 'Comments' : count + (count === 1 ? ' comment' : ' comments')}
        </Text>
      )}

      {comments === null ? (
        <ActivityIndicator color={T.blue} style={s.spin} />
      ) : comments.length === 0 ? (
        <View style={s.none}>
          <Text style={s.noneTitle}>No comments yet</Text>
          <Text style={s.noneBody}>Say the first thing.</Text>
        </View>
      ) : (
        <View style={s.rows}>
          {comments.map(item => (
            <Said
              key={item.id}
              comment={item}
              // Your own comment, or anyone's comment on your own post.
              canDelete={item.uid === me || postUid === me}
              onDelete={() => deleteComment(postId, item.id).catch(() => {})}
              T={T}
              s={s}
            />
          ))}
        </View>
      )}

      {!!err && <Text style={s.err}>{err}</Text>}

      <View style={s.box}>
        <TextInput
          style={s.field}
          value={text}
          onChangeText={t => { setText(t); if (err) setErr(''); }}
          placeholder="Add a comment"
          placeholderTextColor={T.muted}
          multiline
          maxLength={1000}
        />
        <Pressable onPress={send} disabled={busy || !text.trim()}
                   style={(busy || !text.trim()) && s.sendOff}
                   accessibilityRole="button" accessibilityLabel="Post comment">
          <Gradient colors={BRAND} style={s.send}>
            <Send color="#fff" size={19} />
          </Gradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = T => StyleSheet.create({
  wrap: { gap: 4 },
  heading: { color: T.text, fontSize: 16.5, fontFamily: F['800'], marginBottom: 8 },
  spin: { marginVertical: 30 },
  rows: { gap: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  said: { flex: 1, gap: 3 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  who: { color: T.text, fontSize: 13.5, fontFamily: F['700'], flexShrink: 1 },
  when: { color: T.muted, fontSize: 12, fontFamily: F['500'] },
  text: { color: T.text, fontSize: 14.5, fontFamily: F['400'], lineHeight: 21 },
  none: { paddingVertical: 20, gap: 4 },
  noneTitle: { color: T.text, fontSize: 15, fontFamily: F['700'] },
  noneBody: { color: T.muted, fontSize: 14, fontFamily: F['400'] },
  err: { color: T.red, fontSize: 13, fontFamily: F['500'], paddingVertical: 6 },
  box: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingTop: 12 },
  field: {
    flex: 1, maxHeight: 110, color: T.text, fontSize: 15, fontFamily: F['400'],
    backgroundColor: T.bg3, borderRadius: 18, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  send: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  sendOff: { opacity: 0.4 },
});
