import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTheme, F } from './theme';
import { Person } from './Icons';
import { ago } from './data';

/** A stream on air. Opens it in the live view. `wide` fills the row; otherwise a shelf card. */
export default function LiveCard({ stream, wide = false }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const nav = useNavigation();

  return (
    <Pressable
      onPress={() => nav.navigate('LiveView', { path: 'stream/' + stream.id })}
      style={({ pressed }) => [s.card, wide ? s.wide : s.shelf, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`${stream.title}, live`}
    >
      <View style={s.stage}>
        <View style={s.ring}>
          {stream.authorPhoto
            ? <Image source={{ uri: stream.authorPhoto }} style={s.photo} />
            : <Person color="#fff" size={26} />}
        </View>
        <View style={s.live}><Text style={s.liveTxt}>LIVE</Text></View>
        <View style={s.count}><Text style={s.countTxt}>{stream.watching || 0} watching</Text></View>
      </View>
      <Text style={s.title} numberOfLines={2}>{stream.title}</Text>
      <Text style={s.who} numberOfLines={1}>{stream.authorName} · started {ago(stream.startedAt)}</Text>
    </Pressable>
  );
}

const styles = T => StyleSheet.create({
  card: { gap: 4 },
  wide: { marginHorizontal: 14, marginBottom: 16 },
  shelf: { width: 230, marginRight: 12 },
  stage: {
    aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#07100b',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  ring: {
    width: 62, height: 62, borderRadius: 31, overflow: 'hidden', backgroundColor: T.blue,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: T.red,
  },
  photo: { width: '100%', height: '100%' },
  live: { position: 'absolute', left: 8, bottom: 8, backgroundColor: T.red, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  liveTxt: { color: '#fff', fontSize: 10.5, fontFamily: F['900'], letterSpacing: 0.6 },
  count: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  countTxt: { color: '#fff', fontSize: 11, fontFamily: F['700'] },
  title: { color: T.text, fontSize: 15, fontFamily: F['800'], lineHeight: 20 },
  who: { color: T.muted, fontSize: 12.5, fontFamily: F['600'] },
});
