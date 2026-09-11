import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme, F } from './theme';
import ButtonFill from './ButtonFill';

/**
 * What a screen shows before there is anything real to show.
 *
 * Replaces the placeholder feed: invented creators and view counts make an
 * empty app look busy, which is worse than an honest empty state because it
 * gives nobody a reason to post the first thing.
 */
export default function Empty({ icon, title, body, action, onAction }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  return (
    <View style={s.wrap}>
      {icon ? <View style={s.icon}>{icon}</View> : null}
      <Text style={s.title}>{title}</Text>
      {body ? <Text style={s.body}>{body}</Text> : null}
      {action ? (
        <Pressable onPress={onAction} style={s.btnPress}>
          <ButtonFill style={s.btn}>
            <Text style={s.btnTxt}>{action}</Text>
          </ButtonFill>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = T => StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 48 },
  icon: {
    width: 62, height: 62, borderRadius: 18, backgroundColor: T.bg2,
    borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { color: T.text, fontSize: 17, fontFamily: F['800'], textAlign: 'center' },
  body: { color: T.muted, fontFamily: F['400'], fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  btnPress: { marginTop: 20 },
  btn: { borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  btnTxt: { color: '#fff', fontSize: 14.5, fontFamily: F['800'] },
});
