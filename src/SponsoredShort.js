import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NativeAdView, NativeMediaView, NativeAsset, NativeAssetType,
} from 'react-native-google-mobile-ads';

import { F } from './theme';
import { Sparkle, Chevron } from './Icons';

/**
 * A sponsored page in the Shorts feed.
 *
 * Its own page, like any short: it never plays over one, and a swipe moves
 * straight past it. Nothing is laid over the ad's video — the text sits below
 * it — both because Google's native ad policy asks for that and because text
 * over someone else's video is hard to read.
 */
export default function SponsoredShort({ ad, width, height, onPlus }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.page, { width, height, paddingTop: insets.top }]}>
      <NativeAdView nativeAd={ad} style={st.ad}>
        {/* Must say it's an ad. AdChoices is added top-right by the SDK. */}
        <View style={st.top}>
          <Text style={st.badge}>Sponsored</Text>
        </View>

        <NativeMediaView style={st.media} resizeMode="contain" />

        <View style={st.panel}>
          <View style={st.row}>
            {ad.icon ? (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image source={{ uri: ad.icon.url }} style={st.icon} />
              </NativeAsset>
            ) : null}
            <View style={st.flex}>
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text style={st.headline} numberOfLines={2}>{ad.headline}</Text>
              </NativeAsset>
              {ad.advertiser ? (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text style={st.advertiser} numberOfLines={1}>{ad.advertiser}</Text>
                </NativeAsset>
              ) : null}
            </View>
          </View>

          {ad.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={st.body} numberOfLines={2}>{ad.body}</Text>
            </NativeAsset>
          ) : null}

          {ad.callToAction ? (
            // A plain Text styled as the button: the SDK records the tap on the
            // asset's own view, and wrapping it in a Pressable would break that.
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <Text style={st.cta}>{ad.callToAction}</Text>
            </NativeAsset>
          ) : null}
        </View>
      </NativeAdView>

      {/* Outside the ad view, so a tap here is never counted as a tap on the ad. */}
      <Pressable onPress={onPlus} style={st.plus}>
        <Sparkle color="#4ade80" size={16} filled />
        <Text style={st.plusTxt}>No ads with Codera Plus</Text>
        <Chevron color="rgba(255,255,255,0.6)" size={14} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  page: { backgroundColor: '#000' },
  ad: { flex: 1 },
  flex: { flex: 1 },
  top: { paddingHorizontal: 16, paddingVertical: 10, paddingRight: 48 },
  badge: {
    alignSelf: 'flex-start', color: '#000', backgroundColor: '#facc15',
    fontSize: 11, fontFamily: F['800'], letterSpacing: 0.4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden',
  },
  media: { flex: 1, width: '100%' },
  panel: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 10 },
  headline: { color: '#fff', fontSize: 16, fontFamily: F['800'], lineHeight: 21 },
  advertiser: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5, fontFamily: F['500'], marginTop: 2 },
  body: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, fontFamily: F['400'], lineHeight: 19 },
  cta: {
    color: '#fff', backgroundColor: '#3b82f6', textAlign: 'center',
    fontSize: 15, fontFamily: F['800'], paddingVertical: 12,
    borderRadius: 12, overflow: 'hidden',
  },
  plus: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
  },
  plusTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: F['600'] },
});
