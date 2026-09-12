import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';

import { auth } from '../firebase';
import { useTheme, F } from '../theme';
import { claimUsername, nameFree, nameKey, NAME_MAX, NAME_OK } from '../profile';
import ButtonFill from '../ButtonFill';
import Mark from '../Mark';

/**
 * "Pick your username", with no way round it.
 *
 * Shown instead of the app to anyone whose account has no name yet — including
 * accounts made before usernames existed. The only other thing on this screen
 * is signing out: without a name there is nothing to show anyone as.
 */
export default function ChooseNameScreen() {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();

  const me = auth.currentUser;
  const suggestion = nameKey(
    (me?.displayName || me?.email?.split('@')[0] || '').slice(0, NAME_MAX));

  const [name, setName] = useState(suggestion);
  const [state, setState] = useState('');      // '' | 'checking' | 'free' | 'taken'
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const key = nameKey(name);
  const shaped = NAME_OK.test(key);

  // Checked as it is typed, so nobody presses the button only to be told no.
  useEffect(() => {
    clearTimeout(timer.current);
    setErr('');
    if (!key) return setState('');
    if (!shaped) {
      setState('');
      if (key.length < 3) setErr('At least 3 characters.');
      else setErr('Letters, numbers and underscores only.');
      return undefined;
    }
    setState('checking');
    timer.current = setTimeout(async () => {
      try { setState((await nameFree(key)) ? 'free' : 'taken'); }
      catch (e) { setState(''); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [key, shaped]);

  async function claim() {
    if (!shaped || busy) return;
    setBusy(true);
    setErr('');
    try {
      await claimUsername(key);
      // The profile listener in App.js sees the name land and lets the app in.
    } catch (e) {
      setErr(e?.code === 'permission-denied'
        ? '@' + key + ' is taken. Try another.'
        : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 40 }]}
                    keyboardShouldPersistTaps="handled">
          <Mark size={62} />
          <Text style={s.h1}>Pick your username</Text>
          <Text style={s.lede}>
            This is how everyone sees you on Codera — on your posts, your comments
            and your page. Up to {NAME_MAX} characters: letters, numbers and
            underscores. Nobody else can take it.
          </Text>

          <View style={s.field}>
            <Text style={s.at}>@</Text>
            <TextInput
              style={s.input} value={name} onChangeText={setName}
              placeholder="username" placeholderTextColor={T.muted}
              maxLength={NAME_MAX} autoCapitalize="none" autoCorrect={false}
              spellCheck={false} autoFocus editable={!busy}
              onSubmitEditing={claim}
            />
          </View>

          {!!err && <Text style={s.err}>{err}</Text>}
          {!err && state === 'checking' && <Text style={s.note}>Checking…</Text>}
          {!err && state === 'free' && <Text style={s.free}>@{key} is free</Text>}
          {!err && state === 'taken' && <Text style={s.err}>@{key} is taken. Try another.</Text>}

          <Pressable onPress={claim} disabled={!shaped || busy || state === 'taken'}>
            <ButtonFill style={[s.btn, (!shaped || busy || state === 'taken') && s.dim]}>
              {busy ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnTxt}>Claim it</Text>}
            </ButtonFill>
          </Pressable>

          <Pressable onPress={() => signOut(auth)} hitSlop={8} style={s.out}>
            <Text style={s.outTxt}>Signed in as {me?.email} · Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  body: { paddingHorizontal: 26, paddingBottom: 40 },
  h1: { color: T.text, fontSize: 27, fontFamily: F['900'], letterSpacing: -1, marginTop: 22 },
  lede: { color: T.muted, fontSize: 14.5, fontFamily: F['400'], lineHeight: 22, marginTop: 8, marginBottom: 24 },
  field: {
    flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: 14,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.bg2, paddingHorizontal: 15,
  },
  at: { color: T.muted, fontSize: 16, fontFamily: F['800'], marginRight: 4 },
  input: { flex: 1, color: T.text, fontSize: 16, fontFamily: F['600'], padding: 0 },
  err: { color: T.red, fontSize: 13.5, fontFamily: F['600'], marginTop: 10 },
  note: { color: T.muted, fontSize: 13.5, fontFamily: F['500'], marginTop: 10 },
  free: { color: T.green, fontSize: 13.5, fontFamily: F['700'], marginTop: 10 },
  btn: { height: 52, borderRadius: 14, marginTop: 22 },
  btnTxt: { color: '#fff', fontSize: 16, fontFamily: F['800'] },
  dim: { opacity: 0.45 },
  out: { alignSelf: 'center', marginTop: 26, padding: 6 },
  outTxt: { color: T.muted, fontSize: 13, fontFamily: F['500'] },
});
