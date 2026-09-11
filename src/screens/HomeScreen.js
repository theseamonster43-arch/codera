import React, { useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, TAB_H, F } from '../theme';
import { Code, Search } from '../Icons';
import Mark from '../Mark';
import Empty from '../Empty';
import PostCard from '../PostCard';
import usePosts from '../usePosts';

/** Posts and full videos, newest first. Shorts live on their own tab. */
export default function HomeScreen({ navigation }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();
  const { posts, loading, error } = usePosts();

  const feed = useMemo(() => posts.filter(p => p.type !== 'short'), [posts]);

  const header = (
    <View style={[s.head, { paddingTop: insets.top + 10 }]}>
      <Mark size={30} />
      <Text style={s.brand}>Codera</Text>
      <Pressable hitSlop={10}><Search color={T.text} size={22} /></Pressable>
    </View>
  );

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <FlatList
        data={feed}
        keyExtractor={p => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={header}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_H + insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={T.blue} style={{ marginTop: 60 }} />
          ) : error ? (
            <Empty
              icon={<Code color={T.red} size={28} />}
              title="Couldn't load the feed"
              body="Check your connection. If this keeps happening, the database may not be set up yet."
            />
          ) : (
            <Empty
              icon={<Code color={T.green} size={28} />}
              title="Nothing posted yet"
              body="Be the first. Tutorials and posts show up here."
              action="Make the first one"
              onAction={() => navigation.navigate('ComposePost')}
            />
          )
        }
      />
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  brand: { flex: 1, color: T.text, fontSize: 19, fontFamily: F['900'], letterSpacing: -0.4 },
});
