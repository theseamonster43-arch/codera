import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, BackHandler } from 'react-native';
import Video from 'react-native-video';

import { useTheme, F, clock, compact } from '../theme';
import { ago } from '../data';
import { Person, Play, Pause, Chevron } from '../Icons';
import { useFace } from '../social';
import { useFocus } from './focus';

/** Ten seconds, which is what a skip means to everybody. */
const STEP = 10;

/**
 * Watching one thing on a television.
 *
 * A remote cannot drag, so there is no scrub bar to take hold of: the controls
 * are buttons the remote lands on — back ten, play, forward ten — and the line
 * above them only reports. The controls get out of the way while it plays and
 * come back when anything is pressed.
 */
export default function TVWatch({ post, onBack }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const video = useRef(null);
  const face = useFace(post.uid, post);

  const [paused, setPaused] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  // The controls stay.
  //
  // A phone can hide them because a finger can tap anywhere to ask for them
  // back. A remote cannot: hiding them takes away the only things focus can
  // rest on, so there is nothing left to press and no way to ask for them
  // again. They sit at the bottom, out of the picture, and the remote always
  // has somewhere to be.

  const step = by => {
    const to = Math.max(0, Math.min(length || 0, at + by));
    setAt(to);
    video.current?.seek(to);
  };

  const hold = () => setPaused(was => !was);

  // The remote's back button leaves the video rather than the app.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => sub.remove();
  }, [onBack]);

  const through = length > 0 ? Math.max(0, Math.min(1, at / length)) : 0;
  const tall = post.type === 'short';

  return (
    <View style={s.fill}>
      <Video
        ref={video}
        source={{ uri: post.videoUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode={tall ? 'contain' : 'contain'}
        paused={paused}
        controls={false}
        onLoad={info => setLength(info?.duration || 0)}
        onProgress={p => setAt(p?.currentTime || 0)}
        repeat={tall}
      />

      <View style={s.over} pointerEvents="box-none">
          <View style={s.top}>
            <Text style={s.title} numberOfLines={1}>{post.title}</Text>
            <View style={s.by}>
              <View style={s.avatar}>
                {face.photo
                  ? <Image source={{ uri: face.photo }} style={s.photo} />
                  : <Person color={T.muted} size={15} />}
              </View>
              <Text style={s.who}>
                {face.name} · {compact(post.likeCount || 0)} {(post.likeCount || 0) === 1 ? 'like' : 'likes'} · {ago(post.createdAt)}
              </Text>
            </View>
          </View>

          <View style={s.bottom}>
            <View style={s.track}>
              <View style={s.rail} />
              <View style={[s.done, { width: (through * 100) + '%' }]} />
            </View>
            <Text style={s.time}>{clock(at)} / {clock(length)}</Text>

            <View style={s.controls}>
              <Knob label={'Back ' + STEP} onPress={() => step(-STEP)} T={T} s={s}>
                <Text style={s.knobTxt}>-{STEP}</Text>
              </Knob>
              <Knob label={paused ? 'Play' : 'Pause'} onPress={hold} T={T} s={s} big first>
                {paused ? <Play color="#fff" size={21} /> : <Pause color="#fff" size={21} />}
              </Knob>
              <Knob label={'Forward ' + STEP} onPress={() => step(STEP)} T={T} s={s}>
                <Text style={s.knobTxt}>+{STEP}</Text>
              </Knob>
              <Knob label="Back to Codera" onPress={onBack} T={T} s={s}>
                <View style={s.flip}><Chevron color="#fff" size={18} /></View>
              </Knob>
            </View>
          </View>
      </View>
    </View>
  );
}

/** One control the remote can land on. */
function Knob({ children, label, onPress, big, first, T, s }) {
  const focus = useFocus();
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={first}
      onFocus={focus.bind.onFocus}
      onBlur={focus.bind.onBlur}
      onPress={onPress}
      style={[s.knob, big && s.knobBig, focus.on && s.knobOn]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  over: { ...StyleSheet.absoluteFillObject },

  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    padding: 22, backgroundColor: 'rgba(0,0,0,0.5)', gap: 6,
  },
  title: { color: '#fff', fontSize: 19, fontFamily: F['800'], letterSpacing: -0.4 },
  by: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: T.bg3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  who: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, fontFamily: F['500'] },

  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 22, gap: 9, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  track: { height: 4, borderRadius: 2, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  done: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: T.green },
  time: { color: '#fff', fontSize: 12, fontFamily: F['600'] },
  controls: { flexDirection: 'row', gap: 11, marginTop: 2 },
  knob: {
    minWidth: 48, height: 42, paddingHorizontal: 13, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 2, borderColor: 'transparent',
  },
  knobBig: { minWidth: 66 },
  knobOn: { backgroundColor: 'rgba(255,255,255,0.3)', borderColor: T.green },
  knobTxt: { color: '#fff', fontSize: 14, fontFamily: F['800'] },
  flip: { transform: [{ rotate: '180deg' }] },
});
