import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, PermissionsAndroid, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, F } from '../theme';
import { Close, Live } from '../Icons';
import { liveUrl, sessionScript } from '../social';
import { ask } from '../Sheet';

/**
 * Going live, and watching a stream.
 *
 * The website's own live pages, in its "app mode" (no header or sidebar), in a
 * web view signed in with this app's session. A phone's web view can use the
 * camera and microphone, talk WebRTC to viewers and record the stream so it can
 * be kept at the end; the app's own video stack can't record, so this is the
 * one place Codera leans on the website.
 *
 * The page talks back: `done` when a stream has ended or been cancelled, `user`
 * when someone's name is tapped, and `live` as streaming starts and stops, so
 * the screen can ask before it's closed mid-stream.
 */
export default function LiveViewScreen({ route, navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const path = route.params?.path || 'live';
  const going = path === 'golive';

  // Android asks for the camera and microphone itself; the page can't.
  const [allowed, setAllowed] = useState(!going || Platform.OS !== 'android');
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const streaming = useRef(false);

  useEffect(() => {
    if (!going || Platform.OS !== 'android') return;
    PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]).then(r => {
      const ok = Object.values(r).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
      setAllowed(ok);
      setDenied(!ok);
    }).catch(() => setDenied(true));
  }, [going]);

  // Leaving mid-stream ends it without the question of whether to keep it, so ask.
  useEffect(() => navigation.addListener('beforeRemove', e => {
    if (!streaming.current) return;
    e.preventDefault();
    ask({
      title: 'End your stream?',
      body: 'Leaving this screen ends the stream, and it won’t be saved. Use End stream to keep it.',
      yes: 'End and leave',
      no: 'Stay live',
      danger: true,
    }).then(ok => {
      if (!ok) return;
      streaming.current = false;
      navigation.dispatch(e.data.action);
    });
  }), [navigation]);

  function onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch (err) { return; }
    if (msg.type === 'live') streaming.current = !!msg.on;
    if (msg.type === 'done') { streaming.current = false; navigation.goBack(); }
    if (msg.type === 'user' && msg.uid) navigation.navigate('User', { uid: msg.uid });
  }

  return (
    <View style={[s.fill, { paddingTop: insets.top }]}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <View style={s.head}>
        <Live color={T.red} size={20} />
        <Text style={s.title}>{going ? 'Go live' : 'Live'}</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={s.close}
                   accessibilityRole="button" accessibilityLabel="Close">
          <Close color={T.text} size={22} />
        </Pressable>
      </View>

      {denied ? (
        <View style={s.center}>
          <Text style={s.big}>Codera needs the camera and microphone</Text>
          <Text style={s.small}>Allow them for Codera in your phone’s settings, then try going live again.</Text>
        </View>
      ) : allowed ? (
        <>
          <WebView
            style={s.web}
            source={{ uri: liveUrl(path) }}
            injectedJavaScriptBeforeContentLoaded={sessionScript()}
            onMessage={onMessage}
            onLoadEnd={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            allowsFullscreenVideo
            setSupportMultipleWindows={false}
            originWhitelist={['https://*']}
            forceDarkOn={T.dark}
            // The page's own background while it loads, not a white flash.
            containerStyle={{ backgroundColor: T.bg }}
          />
          {loading && (
            <View style={s.loading} pointerEvents="none">
              <ActivityIndicator color={T.blue} />
            </View>
          )}
        </>
      ) : (
        <View style={s.center}><ActivityIndicator color={T.blue} /></View>
      )}
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border,
  },
  title: { flex: 1, color: T.text, fontSize: 17, fontFamily: F['800'] },
  close: { padding: 4 },
  web: { flex: 1, backgroundColor: T.bg },
  loading: { ...StyleSheet.absoluteFillObject, top: 60, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  big: { color: T.text, fontSize: 17, fontFamily: F['800'], textAlign: 'center' },
  small: { color: T.muted, fontSize: 14, fontFamily: F['400'], textAlign: 'center', lineHeight: 20 },
});
