import React, { useMemo } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';

import { useTheme, F } from './theme';
import { Close } from './Icons';
import CommentThread from './CommentThread';

/**
 * The thread raised over something that has no room for it — a card in a feed,
 * a short filling the screen.
 *
 * It was a page of its own, which meant leaving the feed to read a line and
 * coming back to find your place gone. A watch page has room and keeps its
 * thread on the page; this is for everywhere else. Either way the thread itself
 * is the same piece.
 */
export default function CommentsSheet({ post, onClose }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  if (!post) return null;

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
            <Text style={s.title}>Comments</Text>
            <Pressable onPress={onClose} hitSlop={10}
                       accessibilityRole="button" accessibilityLabel="Close">
              <Close color={T.text} size={17} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={s.scroll}
                      contentContainerStyle={s.pad}>
            <CommentThread post={post} heading={false} />
          </ScrollView>
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
  scroll: { flexGrow: 0 },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
});
