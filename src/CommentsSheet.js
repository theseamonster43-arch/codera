import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';

import { useTheme, F } from './theme';
import { auth } from './firebase';
import { ago, subscribeComments, addComment, deleteComment } from './data';
import { contactProblem } from './safety';
import { Person, Close, Send } from './Icons';
import Gradient, { BRAND } from './Gradient';

/**
 * What people said about a post, over the post rather than instead of it.
 *
 * It was a page of its own, which meant leaving the feed to read a line and
 * coming back to find your place gone. It slides up over whatever you were
 * looking at and drops away again, which is what a comment thread is for.
 */
export default function CommentsSheet({ post, onClose }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  const [comments, setComments] = useState(null);   // null while first loading
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = useRef(null);

  const postId = post?.id;
  const postUid = post?.uid;

  useEffect(() => {
    if (!postId) return undefined;
    return subscribeComments(postId, setComments, () => setComments([]));
  }, [postId]);

  if (!post) return null;
  const me = auth.currentUser?.uid;

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
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      setErr("Couldn't post that comment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const render = ({ item }) => {
    // Your own comment, or anyone's comment on your own post.
    const canDelete = item.uid === me || postUid === me;
    return (
      <View style={s.row}>
        <View style={s.avatar}>
          {item.authorPhoto
            ? <Image source={{ uri: item.authorPhoto }} style={s.photo} />
            : <Person color={T.muted} size={15} />}
        </View>
        <View style={s.said}>
          <View style={s.byline}>
            <Text style={s.who} numberOfLines={1}>{item.authorName}</Text>
            <Text style={s.when}>{ago(item.createdAt)}</Text>
          </View>
          <Text style={s.text} selectable>{item.text}</Text>
        </View>
        {canDelete && (
          <Pressable hitSlop={8} onPress={() => deleteComment(postId, item.id).catch(() => {})}
                     accessibilityRole="button" accessibilityLabel="Delete comment">
            <Close color={T.muted} size={14} />
          </Pressable>
        )}
      </View>
    );
  };

  const count = comments ? comments.length : 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* The darkness above it closes it; the sheet itself does not. */}
      <Pressable style={s.scrim} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.dock}
      >
        <View style={s.sheet}>
          <View style={s.grab} />
          <View style={s.head}>
            <Text style={s.title}>
              {count === 0 ? 'Comments' : count + (count === 1 ? ' comment' : ' comments')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}
                       accessibilityRole="button" accessibilityLabel="Close">
              <Text style={s.shut}>Close</Text>
            </Pressable>
          </View>

          {comments === null ? (
            <ActivityIndicator color={T.blue} style={s.spin} />
          ) : (
            <FlatList
              ref={list}
              data={comments}
              keyExtractor={c => c.id}
              renderItem={render}
              contentContainerStyle={s.listPad}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={s.none}>
                  <Text style={s.noneTitle}>No comments yet</Text>
                  <Text style={s.noneBody}>Say the first thing.</Text>
                </View>
              }
            />
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = T => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%' },
  sheet: {
    backgroundColor: T.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: T.border, paddingBottom: 10, maxHeight: '100%',
  },
  grab: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: T.border,
    alignSelf: 'center', marginTop: 8, marginBottom: 4,
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { color: T.text, fontSize: 16.5, fontFamily: F['800'] },
  shut: { color: T.blue, fontSize: 15, fontFamily: F['600'] },
  spin: { marginVertical: 40 },
  listPad: { paddingHorizontal: 16, paddingBottom: 12, gap: 16 },
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
  none: { paddingVertical: 26, gap: 4 },
  noneTitle: { color: T.text, fontSize: 15, fontFamily: F['700'] },
  noneBody: { color: T.muted, fontSize: 14, fontFamily: F['400'] },
  err: { color: T.red, fontSize: 13, fontFamily: F['500'], paddingHorizontal: 16, paddingBottom: 6 },
  box: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 8,
    borderTopWidth: 1, borderColor: T.border,
  },
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
