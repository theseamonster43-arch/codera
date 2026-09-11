import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';

import { useTheme, F, clock } from '../theme';
import { uploadVideo } from '../data';
import { Shorts, Play } from '../Icons';
import ButtonFill from '../ButtonFill';

/** Shorts are a promise of "under a minute"; the limit is what makes them shorts. */
const SHORT_MAX = 60;

const COPY = {
  short: { title: 'New short', record: 'Record a short', pick: 'Choose from gallery',
           hint: 'Up to 60 seconds. Vertical works best.' },
  video: { title: 'New video', record: 'Record a video', pick: 'Choose from gallery',
           hint: 'A full tutorial. Screen recordings work well.' },
};

export default function ComposeVideoScreen({ navigation, route }) {
  const kind = route.params?.kind === 'short' ? 'short' : 'video';
  const copy = COPY[kind];

  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();

  const [asset, setAsset] = useState(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState(null);   // null | 0..1
  const [err, setErr] = useState('');

  const uploading = progress !== null;

  function take(res) {
    if (!res || res.didCancel) return;
    if (res.errorCode) {
      setErr(res.errorCode === 'camera_unavailable'
        ? 'No camera available on this device.'
        : "Couldn't open that. Try again.");
      return;
    }
    const a = res.assets && res.assets[0];
    if (!a?.uri) return;
    // Checked after picking as well as limited while recording: the gallery has
    // no limit, and a four-minute clip is not a short no matter how it arrived.
    if (kind === 'short' && a.duration && a.duration > SHORT_MAX + 0.5) {
      setErr(`That clip is ${clock(a.duration)}. Shorts can be up to 1:00.`);
      return;
    }
    setErr('');
    setAsset(a);
  }

  const record = async () =>
    take(await launchCamera({
      mediaType: 'video',
      videoQuality: 'high',
      durationLimit: kind === 'short' ? SHORT_MAX : 0,
      saveToPhotos: false,
    }));

  const pick = async () =>
    take(await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 }));

  async function publish() {
    if (!asset || !title.trim() || uploading) return;
    setErr('');
    setProgress(0);
    try {
      await uploadVideo({
        uri: asset.uri,
        kind,
        title,
        duration: asset.duration,
        mime: asset.type,
        onProgress: setProgress,
      });
      // Land where the new thing now lives, so the result is the first thing
      // you see rather than the screen you started from.
      navigation.navigate('Tabs', { screen: kind === 'short' ? 'Shorts' : 'Home' });
    } catch (e) {
      setProgress(null);
      setErr(e?.code === 'storage/unauthorized'
        ? "You don't have permission to upload yet."
        : "Upload failed. Check your connection and try again.");
    }
  }

  const Icon = kind === 'short' ? Shorts : Play;

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />

      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} disabled={uploading} hitSlop={10}>
          <Text style={[s.cancel, uploading && s.dimTxt]}>Cancel</Text>
        </Pressable>
        <Text style={s.barTitle}>{copy.title}</Text>
        <View style={{ width: 52 }} />
      </View>

      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 30 }]}
                    keyboardShouldPersistTaps="handled">
          {!asset ? (
            <>
              <View style={[s.empty, kind === 'short' && s.emptyTall]}>
                <View style={s.emptyIcon}><Icon color={T.green} size={30} /></View>
                <Text style={s.hint}>{copy.hint}</Text>
              </View>

              <Pressable onPress={record} style={s.gap}>
                <ButtonFill style={s.btn}><Text style={s.btnTxt}>{copy.record}</Text></ButtonFill>
              </Pressable>
              <Pressable onPress={pick} style={s.ghost}>
                <Text style={s.ghostTxt}>{copy.pick}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={[s.preview, kind === 'short' && s.previewTall]}>
                {/* Muted and looping: a preview to confirm the clip, not to
                    watch it — sound would start the moment it appears. */}
                <Video
                  source={{ uri: asset.uri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={kind === 'short' ? 'cover' : 'contain'}
                  repeat muted paused={uploading}
                />
                {asset.duration ? (
                  <View style={s.len}><Text style={s.lenTxt}>{clock(asset.duration)}</Text></View>
                ) : null}
              </View>

              {!uploading && (
                <Pressable onPress={() => setAsset(null)} hitSlop={6}>
                  <Text style={s.change}>Choose a different clip</Text>
                </Pressable>
              )}

              <TextInput
                style={s.input} value={title} onChangeText={setTitle}
                placeholder="Give it a title" placeholderTextColor={T.muted}
                maxLength={120} editable={!uploading}
              />

              {uploading ? (
                <View style={s.progressWrap}>
                  <View style={s.track}>
                    <View style={[s.fillBar, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                  <Text style={s.pct}>
                    {progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : 'Finishing up…'}
                  </Text>
                </View>
              ) : (
                <Pressable onPress={publish} disabled={!title.trim()} style={s.gap}>
                  <ButtonFill style={[s.btn, !title.trim() && s.dim]}>
                    <Text style={s.btnTxt}>{kind === 'short' ? 'Post short' : 'Post video'}</Text>
                  </ButtonFill>
                </Pressable>
              )}
            </>
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
  cancel: { color: T.muted, fontSize: 15, fontFamily: F['500'], width: 52 },
  dimTxt: { opacity: 0.4 },
  barTitle: { flex: 1, textAlign: 'center', color: T.text, fontSize: 16, fontFamily: F['800'] },

  body: { padding: 18 },
  empty: {
    height: 220, borderRadius: 16, borderWidth: 1, borderColor: T.border,
    borderStyle: 'dashed', backgroundColor: T.bg2,
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  emptyTall: { height: 320 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 17, backgroundColor: T.bg3,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  hint: { color: T.muted, fontSize: 13.5, fontFamily: F['400'], textAlign: 'center' },

  gap: { marginTop: 16 },
  btn: { height: 52, borderRadius: 13 },
  dim: { opacity: 0.4 },
  btnTxt: { color: '#fff', fontSize: 15, fontFamily: F['800'] },
  ghost: {
    height: 52, borderRadius: 13, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  ghostTxt: { color: T.text, fontSize: 15, fontFamily: F['700'] },

  preview: {
    height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000',
  },
  previewTall: { height: 380, width: 214, alignSelf: 'center' },
  len: {
    position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  lenTxt: { color: '#fff', fontSize: 11.5, fontFamily: F['600'] },
  change: {
    color: T.blue, fontSize: 13.5, fontFamily: F['600'],
    textAlign: 'center', marginTop: 10,
  },
  input: {
    height: 52, borderRadius: 13, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, paddingHorizontal: 15, marginTop: 16,
    color: T.text, fontSize: 15, fontFamily: F['400'],
  },

  progressWrap: { marginTop: 18 },
  track: { height: 6, borderRadius: 3, backgroundColor: T.bg3, overflow: 'hidden' },
  fillBar: { height: '100%', backgroundColor: T.blue },
  pct: { color: T.muted, fontSize: 13, fontFamily: F['500'], marginTop: 8, textAlign: 'center' },

  err: { color: T.red, fontSize: 13, fontFamily: F['500'], marginTop: 14, textAlign: 'center' },
});
