import React, { useMemo, useState } from 'react';
import {
  View, Image, Pressable, StyleSheet, Modal, Text, ScrollView, useWindowDimensions,
} from 'react-native';

import { useTheme, F } from './theme';
import { Close } from './Icons';

/**
 * The pictures on a post.
 *
 * One picture is just a picture. Several get a page each, swiped through, with
 * a dot apiece so it reads at a glance as more than one rather than a picture
 * that happens to move. Pressing any of them fills the screen with it.
 */
export default function Gallery({ urls }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const { width } = useWindowDimensions();
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(-1);

  if (!urls || !urls.length) return null;

  // The card is inset from the screen on both sides; a page is what is left.
  const page = width - 32;

  return (
    <View style={s.wrap}>
      {urls.length === 1 ? (
        <Pressable onPress={() => setOpen(0)}>
          <Image source={{ uri: urls[0] }} style={s.one} resizeMode="cover" />
        </Pressable>
      ) : (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => {
              setAt(Math.round(e.nativeEvent.contentOffset.x / page));
            }}
          >
            {urls.map((url, i) => (
              <Pressable key={i} onPress={() => setOpen(i)}>
                <Image source={{ uri: url }} style={[s.page, { width: page }]} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
          <View style={s.dots}>
            {urls.map((_, i) => (
              <View key={i} style={[s.dot, i === at && s.dotOn]} />
            ))}
          </View>
        </>
      )}

      <Viewer urls={urls} at={open} onClose={() => setOpen(-1)} />
    </View>
  );
}

/** One picture, filling the screen, swiped through like the row it came from. */
function Viewer({ urls, at, onClose }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const { width, height } = useWindowDimensions();
  const [showing, setShowing] = useState(at);

  if (at < 0) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.full}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: at * width, y: 0 }}
          onMomentumScrollEnd={e => {
            setShowing(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
        >
          {urls.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={{ width, height }}
              resizeMode="contain"
            />
          ))}
        </ScrollView>

        <Pressable style={s.shut} onPress={onClose} hitSlop={10}
                   accessibilityRole="button" accessibilityLabel="Close">
          <Close color="#fff" size={20} />
        </Pressable>

        {urls.length > 1 && (
          <Text style={s.count}>{(showing < 0 ? at : showing) + 1} / {urls.length}</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = T => StyleSheet.create({
  wrap: { marginTop: 10 },
  one: { width: '100%', height: 190, borderRadius: 12, backgroundColor: T.bg3 },
  page: { height: 220, borderRadius: 12, backgroundColor: T.bg3, marginRight: 0 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.muted, opacity: 0.4 },
  dotOn: { backgroundColor: T.text, opacity: 1 },

  full: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  shut: {
    position: 'absolute', top: 44, right: 16, width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  count: {
    position: 'absolute', bottom: 34, alignSelf: 'center',
    color: 'rgba(255,255,255,0.75)', fontFamily: F['600'], fontSize: 13,
  },
});
