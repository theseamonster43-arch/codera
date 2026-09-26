import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, PanResponder } from 'react-native';
import Video from 'react-native-video';

import { useTheme, F, clock } from './theme';
import { Play, Pause, Full, Exit } from './Icons';

/**
 * Codera's video player.
 *
 * react-native-video's own controls are Android's, in Android's typeface, with
 * Android's icons — the one part of a Codera screen that looked like somebody
 * else's app. This is the picture with nothing on it and a bar of ours drawn
 * over: play, how far through, a line to drag, and a way to fill the frame.
 *
 * The bar shows itself when the picture is touched and gets out of the way a
 * few seconds later, because what somebody came for is the video.
 */
export default function Player({ source, poster, full, onFull, onEnd, style }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const video = useRef(null);
  const bar = useRef(null);
  const barW = useRef(0);

  const [paused, setPaused] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const [showing, setShowing] = useState(true);
  const hiding = useRef(null);

  /** Show the bar, and take it away again once it has been read. */
  function reveal() {
    setShowing(true);
    clearTimeout(hiding.current);
    hiding.current = setTimeout(() => setShowing(false), 3000);
  }

  function hold() {
    setPaused(was => {
      const now = !was;
      clearTimeout(hiding.current);
      // A paused video keeps its bar; a playing one loses it again.
      if (now) setShowing(true); else reveal();
      return now;
    });
  }

  // How long the video runs, where a gesture handler made once can still read
  // it: the handler is built on the first render and would otherwise hold the
  // zero it saw then, so every drag would seek to the start.
  const runs = useRef(0);
  runs.current = length;

  /** Dragging anywhere along the line moves the video to that point. */
  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => seek(e.nativeEvent.locationX),
    onPanResponderMove: e => seek(e.nativeEvent.locationX),
    onPanResponderRelease: () => reveal(),
  })).current;

  function seek(x) {
    if (!runs.current || !barW.current) return;
    const part = Math.max(0, Math.min(1, x / barW.current));
    setAt(part * runs.current);
    video.current?.seek(part * runs.current);
    clearTimeout(hiding.current);
    setShowing(true);
  }

  const through = length > 0 ? Math.max(0, Math.min(1, at / length)) : 0;

  return (
    <View style={[s.wrap, style]}>
      <Video
        ref={video}
        source={source}
        poster={poster}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={paused}
        controls={false}
        onLoad={info => setLength(info?.duration || 0)}
        onProgress={p => setAt(p?.currentTime || 0)}
        onEnd={onEnd}
      />

      {/* The whole picture is what brings the bar back. */}
      <Pressable style={StyleSheet.absoluteFill}
                 onPress={() => (showing ? hold() : reveal())} />

      {showing && (
        <View style={s.bar} pointerEvents="box-none">
          <Pressable onPress={hold} hitSlop={8} style={s.btn}
                     accessibilityRole="button"
                     accessibilityLabel={paused ? 'Play' : 'Pause'}>
            {paused ? <Play color="#fff" size={20} /> : <Pause color="#fff" size={20} />}
          </Pressable>

          <Text style={s.time}>{clock(at)} / {clock(length)}</Text>

          <View
            ref={bar}
            style={s.track}
            onLayout={e => { barW.current = e.nativeEvent.layout.width; }}
            {...drag.panHandlers}
          >
            <View style={s.rail} />
            <View style={[s.done, { width: (through * 100) + '%' }]} />
            <View style={[s.knob, { left: (through * 100) + '%' }]} />
          </View>

          {onFull && (
            <Pressable onPress={() => { onFull(); reveal(); }} hitSlop={8} style={s.btn}
                       accessibilityRole="button"
                       accessibilityLabel={full ? 'Leave full screen' : 'Full screen'}>
              {full ? <Exit color="#fff" size={18} /> : <Full color="#fff" size={18} />}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = T => StyleSheet.create({
  wrap: { backgroundColor: '#000', overflow: 'hidden' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingBottom: 8, paddingTop: 26,
  },
  btn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  time: { color: '#fff', fontSize: 12, fontFamily: F['600'] },
  track: { flex: 1, height: 26, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  done: {
    position: 'absolute', height: 4, borderRadius: 2, backgroundColor: T.green,
  },
  knob: {
    position: 'absolute', width: 11, height: 11, borderRadius: 6,
    marginLeft: -5.5, backgroundColor: '#fff',
  },
});
