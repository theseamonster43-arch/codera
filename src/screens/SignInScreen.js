import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  GoogleAuthProvider, signInWithCredential,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { auth } from '../firebase';
import { claimUsername, nameKey, NAME_MAX, NAME_OK } from '../profile';
import { useTheme, F } from '../theme';
import ButtonFill from '../ButtonFill';
import Mark from '../Mark';

/**
 * The OAuth web client ID from google-services.json (client_type 3).
 *
 * Empty until that file is re-downloaded with Google sign-in enabled — the
 * first copy predates it and carries no OAuth clients at all. While empty, the
 * Google button explains that rather than failing with an opaque error.
 */
const WEB_CLIENT_ID = '';

if (WEB_CLIENT_ID) GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

/** Firebase error codes are not something to put in front of a person. */
function message(e) {
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-login-credentials': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/invalid-email': "That doesn't look like an email address.",
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'No connection. Check your internet.',
  };
  return map[e?.code] || 'Something went wrong. Try again.';
}

export default function SignInScreen() {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState('in');   // 'in' | 'up'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(null);   // null | 'email' | 'google'
  const [err, setErr] = useState('');

  const up = mode === 'up';

  async function submit() {
    setErr('');
    if (up && !NAME_OK.test(nameKey(name))) {
      return setErr(nameKey(name).length < 3
        ? 'Pick a username of at least 3 characters.'
        : 'Usernames are letters, numbers and underscores, up to ' + NAME_MAX + '.');
    }
    if (!email.trim()) return setErr('Enter your email.');
    // Checked here rather than left to Firebase, whose own minimum is six:
    // eight is the floor worth enforcing for an account someone will keep.
    if (up && pass.length < 8) return setErr('Use at least 8 characters.');
    if (!pass) return setErr('Enter your password.');

    setBusy('email');
    try {
      if (up) {
        // The account has to exist before the name can be claimed: claiming
        // writes to the database, and the database only listens to accounts.
        await createUserWithEmailAndPassword(auth, email.trim(), pass);
        try {
          await claimUsername(name);
        } catch (e2) {
          // Taken in the moment between checking and claiming. The account is
          // real, so the unskippable prompt asks again from here.
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pass);
      }
      // No navigation here: App listens for the auth change and swaps the
      // whole tree, so there is exactly one place that decides what shows.
    } catch (e) {
      setErr(message(e));
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setErr('');
    if (!WEB_CLIENT_ID) {
      return setErr('Google sign-in is almost ready — it needs the updated Firebase config.');
    }
    setBusy('google');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      // v13 and later return { type, data }; a cancelled picker is not an error
      // worth showing, the person simply changed their mind.
      if (res?.type === 'cancelled') return;
      const idToken = res?.data?.idToken ?? res?.idToken;
      if (!idToken) throw new Error('no id token');
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } catch (e) {
      setErr(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[s.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.mark}><Mark size={58} /></View>

          <Text style={s.title}>{up ? 'Create your account' : 'Welcome to Codera'}</Text>
          <Text style={s.sub}>
            {up
              ? 'Post tutorials, record shorts, and follow the people you learn from.'
              : 'Sign in to watch, post and run code from any tutorial.'}
          </Text>

          <Pressable style={s.google} onPress={google} disabled={!!busy}>
            {busy === 'google'
              ? <ActivityIndicator color={T.text} />
              : <Text style={s.googleTxt}>Continue with Google</Text>}
          </Pressable>

          <View style={s.orRow}>
            <View style={s.line} /><Text style={s.or}>or</Text><View style={s.line} />
          </View>

          {up && (
            <TextInput
              style={s.input} value={name} onChangeText={setName}
              placeholder="Username" placeholderTextColor={T.muted}
              maxLength={NAME_MAX} autoCapitalize="none" autoCorrect={false}
              spellCheck={false} autoComplete="username" textContentType="username"
            />
          )}
          <TextInput
            style={s.input} value={email} onChangeText={setEmail}
            placeholder="Email" placeholderTextColor={T.muted}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            autoComplete="email" textContentType="emailAddress"
          />
          <TextInput
            style={s.input} value={pass} onChangeText={setPass}
            placeholder={up ? 'Password (8+ characters)' : 'Password'}
            placeholderTextColor={T.muted} secureTextEntry
            autoComplete={up ? 'new-password' : 'password'}
            textContentType={up ? 'newPassword' : 'password'}
            onSubmitEditing={submit} returnKeyType="go"
          />

          {!!err && <Text style={s.err}>{err}</Text>}

          <Pressable onPress={submit} disabled={!!busy} style={s.btnPress}>
            <ButtonFill style={s.btn}>
              {busy === 'email'
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTxt}>{up ? 'Create account' : 'Sign in'}</Text>}
            </ButtonFill>
          </Pressable>

          <Pressable onPress={() => { setErr(''); setMode(up ? 'in' : 'up'); }} hitSlop={8}>
            <Text style={s.swap}>
              {up ? 'Already have an account? ' : 'New to Codera? '}
              <Text style={s.swapLink}>{up ? 'Sign in' : 'Create one'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  wrap: { paddingHorizontal: 26, flexGrow: 1 },

  mark: { alignSelf: 'center' },

  title: {
    color: T.text, fontSize: 26, fontFamily: F['800'],
    textAlign: 'center', marginTop: 20, letterSpacing: -0.4,
  },
  sub: {
    color: T.muted, fontSize: 14, fontFamily: F['400'],
    textAlign: 'center', lineHeight: 21, marginTop: 8, marginBottom: 28,
  },

  google: {
    height: 52, borderRadius: 13, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, alignItems: 'center', justifyContent: 'center',
  },
  googleTxt: { color: T.text, fontSize: 15, fontFamily: F['700'] },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.border },
  or: { color: T.muted, fontSize: 12.5, fontFamily: F['500'] },

  input: {
    height: 52, borderRadius: 13, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, paddingHorizontal: 15, marginBottom: 11,
    color: T.text, fontSize: 15, fontFamily: F['400'],
  },

  err: {
    color: T.red, fontSize: 13, fontFamily: F['500'],
    textAlign: 'center', marginTop: 4, marginBottom: 8,
  },

  btnPress: { marginTop: 6 },
  btn: { height: 54, borderRadius: 13 },
  btnTxt: { color: '#fff', fontSize: 15.5, fontFamily: F['800'] },

  swap: {
    color: T.muted, fontSize: 13.5, fontFamily: F['400'],
    textAlign: 'center', marginTop: 20,
  },
  swapLink: { color: T.blue, fontFamily: F['700'] },
});
