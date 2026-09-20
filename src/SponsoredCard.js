import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import {
  NativeAdView, NativeMediaView, NativeAsset, NativeAssetType,
} from 'react-native-google-mobile-ads';

import { useTheme, F } from './theme';

/**
 * A sponsored card in the Home feed, shaped like any other post.
 *
 * Its video starts muted and silent in the card; you watch it only if you want
 * to, by tapping it. Nothing is laid over the video, and it says plainly that
 * it's an ad (AdChoices is added top-right by the SDK).
 */
export default function SponsoredCard({ ad }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  return (
    <NativeAdView nativeAd={ad} style={s.card}>
      <View style={s.head}>
        {ad.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={s.icon} />
          </NativeAsset>
        ) : null}
        <View style={s.flex}>
          {ad.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text style={s.advertiser} numberOfLines={1}>{ad.advertiser}</Text>
            </NativeAsset>
          ) : null}
          <Text style={s.badge}>Sponsored</Text>
        </View>
      </View>

      <NativeMediaView style={s.media} resizeMode="cover" />

      <NativeAsset assetType={NativeAssetType.HEADLINE}>
        <Text style={s.headline} numberOfLines={2}>{ad.headline}</Text>
      </NativeAsset>
      {ad.body ? (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={s.body} numberOfLines={2}>{ad.body}</Text>
        </NativeAsset>
      ) : null}
      {ad.callToAction ? (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={s.cta}>{ad.callToAction}</Text>
        </NativeAsset>
      ) : null}
    </NativeAdView>
  );
}

const styles = T => StyleSheet.create({
  card: {
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border,
    borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 14, gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: { width: 28, height: 28, borderRadius: 14 },
  flex: { flex: 1, minWidth: 0 },
  advertiser: { color: T.text, fontSize: 14, fontFamily: F['700'] },
  badge: { color: T.muted, fontSize: 11.5, fontFamily: F['700'], letterSpacing: 0.3 },
  media: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  headline: { color: T.text, fontSize: 16, fontFamily: F['700'] },
  body: { color: T.muted, fontSize: 14, fontFamily: F['400'] },
  cta: {
    alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: T.blue, color: '#fff', fontSize: 13.5, fontFamily: F['800'],
  },
});
