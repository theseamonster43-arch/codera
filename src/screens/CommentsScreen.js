import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F } from '../theme';
import useWindowControls from '../windowControls';
import { auth } from '../firebase';
import { ago, subscribeComments, addComment, deleteComment } from '../data';
import { Person, Comment as CommentIcon, Close } from '../Icons';
import ButtonFill from '../ButtonFill';

/** Everything people have said about one post, and the box to add to it. */
export default function CommentsScreen({ route, navigation }) {
  const { postId, postTitle, postUid } = route.params;
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const wc = useWindowControls();

  const [comments, setComments] = useState(null);   // null while first loading
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = useRef(null);

  useEffect(() => subscribeComments(postId, setComments, () => setComments([])), [postId]);

  const me = auth.currentUser?.uid;

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr('');
    try {
      await addComment(postId, body);
      setText('');
      // New ones land at the bottom, so follow them down.
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
        <View style={s.flex}>
          <View style={s.byRow}>
            <Text style={s.who} numberOfLines={1}>{item.authorName}</Text>
            <Text style={s.when}>{ago(item.createdAt)}</Text>
            {canDelete && (
              <Pressable hitSlop={10} onPress={() => deleteComment(postId, item.id).catch(() => {})}>
                <Close color={T.muted} size={13} />
              </Pressable>
            )}
          </View>
          <Text style={s.text}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />

      <View style={[s.bar, { paddingTop: insets.top + 8, paddingLeft: 16 + wc }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={s.close}>Close</Text>
        </Pressable>
        <Text style={s.barTitle} numberOfLines={1}>Comments</Text>
        <View style={s.spacer} />
      </View>

      {!!postTitle && <Text style={s.on} numberOfLines={1}>on “{postTitle}”</Text>}

      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                            keyboardVerticalOffset={insets.top + 44}>
        {comments === null ? (
          <ActivityIndicator color={T.blue} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={list}
            data={comments}
            keyExtractor={c => c.id}
            renderItem={render}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.empty}>
                <CommentIcon color={T.muted} size={26} />
                <Text style={s.emptyTxt}>No comments yet. Say the first thing.</Text>
              </View>
            }
          />
        )}

        {!!err && <Text style={s.err}>{err}</Text>}

        <View style={[s.compose, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Add a comment"
            placeholderTextColor={T.muted}
            maxLength={1000}
            multiline
          />
          <Pressable onPress={send} disabled={!text.trim() || busy}>
            <ButtonFill style={[s.send, (!text.trim() || busy) && s.dim]}>
              {busy ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.sendTxt}>Post</Text>}
            </ButtonFill>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border,
  },
  close: { color: T.muted, fontSize: 15, fontFamily: F['500'] },
  barTitle: { flex: 1, textAlign: 'center', color: T.text, fontSize: 16, fontFamily: F['800'] },
  spacer: { width: 44 },
  on: {
    color: T.muted, fontSize: 12.5, fontFamily: F['400'],
    textAlign: 'center', marginTop: 8, marginHorizontal: 20,
  },

  list: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  avatar: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flexShrink: 1, color: T.text, fontSize: 13.5, fontFamily: F['700'] },
  when: { color: T.muted, fontSize: 12, fontFamily: F['400'], marginRight: 'auto' },
  text: { color: T.text, fontSize: 14.5, fontFamily: F['400'], lineHeight: 20, marginTop: 3 },

  empty: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, paddingBottom: 40 },
  emptyTxt: { color: T.muted, fontSize: 14, fontFamily: F['500'] },
  err: { color: T.red, fontSize: 13, fontFamily: F['500'], textAlign: 'center', marginBottom: 6 },

  compose: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.border,
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 44,
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 14,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
    color: T.text, fontSize: 15, fontFamily: F['400'],
  },
  send: { height: 44, paddingHorizontal: 18, borderRadius: 14 },
  sendTxt: { color: '#fff', fontSize: 15, fontFamily: F['800'] },
  dim: { opacity: 0.45 },
});
