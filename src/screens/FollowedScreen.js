import React from 'react';
import { Text, ScrollView, StyleSheet, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, TAB_H, F } from '../theme';
import { Followed } from '../Icons';
import Empty from '../Empty';

/** People you follow and their latest. Empty until following exists. */
export default function FollowedScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.fill, { backgroundColor: T.bg }]}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: TAB_H + insets.bottom + 24,
        }}
      >
        <Text style={[s.h1, { color: T.text }]}>Followed</Text>
        <Empty
          icon={<Followed color={T.green} size={28} />}
          title="Not following anyone yet"
          body="Follow a creator and their new tutorials land here first."
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  h1: { fontSize: 24, fontFamily: F['900'], letterSpacing: -0.6, marginHorizontal: 18 },
});
