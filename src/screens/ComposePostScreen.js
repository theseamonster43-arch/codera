import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F } from '../theme';
import { createPost } from '../data';
import ButtonFill from '../ButtonFill';

const LANGS = ['JavaScript', 'Python', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'Other'];

export default function ComposePostScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [code, setCode] = useState('');
  const [lang, setLang] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canPost = title.trim().length > 0 && (body.trim() || code.trim());

  async function post() {
    if (!canPost || busy) return;
    setErr('');
    setBusy(true);
    try {
      await createPost({ title, body, code, lang: code.trim() ? lang : null });
      navigation.goBack();
    } catch (e) {
      setErr(e?.code === 'permission-denied'
        ? "You don't have permission to post yet."
        : "Couldn't post. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />

      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
        <Text style={s.barTitle}>New post</Text>
        <Pressable onPress={post} disabled={!canPost || busy} hitSlop={6}>
          <ButtonFill style={[s.postBtn, (!canPost || busy) && s.dim]}>
            {busy ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.postTxt}>Post</Text>}
          </ButtonFill>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <TextInput
            style={s.title} value={title} onChangeText={setTitle}
            placeholder="Title" placeholderTextColor={T.muted}
            maxLength={120} autoFocus
          />
          <TextInput
            style={s.text} value={body} onChangeText={setBody}
            placeholder="What did you learn, build or break?"
            placeholderTextColor={T.muted} multiline maxLength={4000}
          />

          <Text style={s.label}>Code</Text>
          <TextInput
            // Every autocorrect and capitalisation aid off: they "fix" code into
            // something that no longer runs, and a smart quote in a string
            // literal is a syntax error nobody can see.
            style={s.code} value={code} onChangeText={setCode}
            placeholder={'// optional snippet'} placeholderTextColor={T.muted}
            multiline autoCapitalize="none" autoCorrect={false} spellCheck={false}
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
            maxLength={8000} textAlignVertical="top"
          />

          {code.trim().length > 0 && (
            <View style={s.langs}>
              {LANGS.map(l => (
                <Pressable key={l} onPress={() => setLang(lang === l ? null : l)}
                           style={[s.lang, lang === l && s.langOn]}>
                  <Text style={[s.langTxt, lang === l && s.langTxtOn]}>{l}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {!!err && <Text style={s.err}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border,
  },
  cancel: { color: T.muted, fontSize: 15, fontFamily: F['500'] },
  barTitle: { flex: 1, textAlign: 'center', color: T.text, fontSize: 16, fontFamily: F['800'] },
  postBtn: { height: 34, paddingHorizontal: 18, borderRadius: 10, minWidth: 64 },
  dim: { opacity: 0.4 },
  postTxt: { color: '#fff', fontSize: 14, fontFamily: F['800'] },

  body: { padding: 18, paddingBottom: 60 },
  title: { color: T.text, fontSize: 22, fontFamily: F['800'], paddingVertical: 6 },
  text: {
    color: T.text, fontSize: 15, fontFamily: F['400'], lineHeight: 22,
    minHeight: 90, textAlignVertical: 'top', marginTop: 6,
  },
  label: {
    color: T.muted, fontSize: 11, fontFamily: F['700'], letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 18, marginBottom: 8,
  },
  code: {
    minHeight: 150, borderRadius: 12, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.dark ? '#050806' : '#f0f3f1', padding: 13,
    color: T.text, fontSize: 13, lineHeight: 20,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  lang: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.bg2,
  },
  langOn: { borderColor: T.blue, backgroundColor: 'rgba(59,130,246,0.14)' },
  langTxt: { color: T.muted, fontSize: 12.5, fontFamily: F['600'] },
  langTxtOn: { color: T.blue },
  err: { color: T.red, fontSize: 13, fontFamily: F['500'], marginTop: 14 },
});
