import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';
import mobileAds, {
  AdsConsent, AdEventType, InterstitialAd, NativeAd, TestIds, MaxAdContentRating,
  NativeMediaAspectRatio, NativeAdChoicesPlacement,
} from 'react-native-google-mobile-ads';

import { usePlus } from './plus';

/**
 * Ads in Codera, and the rules for when they're allowed.
 *
 * Two places only, both at a natural break, never over something playing:
 *   - a sponsored page between shorts, which you can swipe straight past;
 *   - one short ad before a longer video starts — never in the middle of one,
 *     where it would land on whatever part you were enjoying.
 * Plus members see neither.
 */

// Codera's own AdMob ad units (AdMob → Apps → Codera → Ad units). null means not
// created yet, and that kind of ad simply doesn't run in release builds.
const REAL_UNIT = Platform.select({
  android: {
    sponsoredShort: 'ca-app-pub-3513532971187636/8328139000',
    beforeVideo: 'ca-app-pub-3513532971187636/8171014882',
  },
  // No iOS app in AdMob yet. Until there is one, iOS release builds show no ads
  // rather than Google's test ads.
  default: { sponsoredShort: null, beforeVideo: null },
});

// Debug builds always use Google's test units, never the real ones: tapping
// your own live ads while testing, even by accident, can get the AdMob account
// suspended. Test units never earn, and are safe to tap.
const UNIT = __DEV__
  ? { sponsoredShort: TestIds.NATIVE_VIDEO, beforeVideo: TestIds.INTERSTITIAL_VIDEO }
  : REAL_UNIT;

/** Tuned to be rare. Loosen with care: an annoyed viewer is worth more than an ad. */
const REAL_RULES = {
  // Nothing in the first two minutes after opening the app.
  quietStartMs: 2 * 60 * 1000,
  // At least four minutes between any two ads, of either kind.
  minGapMs: 4 * 60 * 1000,
  // A sponsored page at most once every six shorts watched.
  shortsPerAd: 6,
  // No ad in front of a video shorter than this, in seconds: an ad nearly as
  // long as the video is the most irritating kind.
  minVideoSec: 60,
};

/**
 * PREVIEW: lets you see both kinds of ad straight away while developing — a
 * sponsored page right after the first short, and an ad before any video, at
 * most every 20 seconds. Only ever applies to debug builds (__DEV__); a release
 * build always uses the real rules above, whatever this is set to.
 */
const PREVIEW = true;

const PREVIEW_RULES = { quietStartMs: 0, minGapMs: 20 * 1000, shortsPerAd: 1, minVideoSec: 0 };

export const RULES = __DEV__ && PREVIEW ? PREVIEW_RULES : REAL_RULES;

// An hour is when Google says a loaded native ad goes stale; refresh a bit before.
const NATIVE_TTL_MS = 55 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const LOAD_TIMEOUT_MS = 30 * 1000;

// What the ad system is doing, in debug builds only (visible in Metro / logcat).
const log = (...a) => { if (__DEV__) console.log('[ads]', ...a); };

const sessionStart = Date.now();
let lastAdAt = 0;
// Starts ad-free: until Plus status has loaded, an ad could be shown to someone
// who has paid to never see one.
let adFree = true;
let started = false;
let sdkReady = false;

/** Whether the rules allow an ad right now. Where it goes is up to the caller. */
export function adAllowed(now = Date.now()) {
  return !adFree && sdkReady
    && now - sessionStart >= RULES.quietStartMs
    && now - lastAdAt >= RULES.minGapMs;
}

/** Called the moment an ad is actually on screen; starts the gap before the next. */
export function markAdShown() {
  lastAdAt = Date.now();
}

async function startAds() {
  if (started) return;
  started = true;

  // Shows Google's consent form only where the law requires one (EEA, UK,
  // Switzerland) and only once. It fails harmlessly when no consent message is
  // set up in AdMob yet, or offline — the SDK then uses last session's answer.
  try { await AdsConsent.gatherConsent(); } catch (e) { log('consent form skipped:', e?.message); }

  try {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) { log('not allowed to request ads (no consent)'); started = false; return; }

    await mobileAds().setRequestConfiguration({
      // Codera's audience includes students: nothing rated above teen.
      maxAdContentRating: MaxAdContentRating.T,
      testDeviceIdentifiers: __DEV__ ? ['EMULATOR'] : [],
    });
    await mobileAds().initialize();
    sdkReady = true;
    log('ready', RULES === REAL_RULES ? '(real rules)' : '(PREVIEW rules)');
    loadBeforeVideo();
    loadSponsored();
  } catch (e) {
    log('start failed:', e?.message);
    started = false;
  }
}

/**
 * Keeps the ad rules in step with Plus. Mounted once, where the signed-in app
 * lives; the ad SDK isn't even started for members.
 */
export function useAdsGate() {
  const plus = usePlus();
  useEffect(() => {
    if (plus.loading) return;
    adFree = plus.active;
    log(plus.active ? 'Plus member: no ads' : 'not Plus: ads on');
    if (!plus.active) startAds();
  }, [plus.loading, plus.active]);
}

// ---- Before a video ---------------------------------------------------------

let interstitial = null;
let interstitialReady = false;

function loadBeforeVideo() {
  if (!UNIT.beforeVideo) return;
  if (interstitial) interstitial.removeAllListeners();
  interstitialReady = false;
  interstitial = InterstitialAd.createForAdRequest(UNIT.beforeVideo);
  interstitial.addAdEventListener(AdEventType.LOADED, () => { interstitialReady = true; log('video ad loaded'); });
  interstitial.addAdEventListener(AdEventType.ERROR, e => {
    log('video ad failed to load:', e?.message);
    interstitialReady = false;
    // No fill or offline: try again later rather than hammering the network.
    setTimeout(() => { if (!interstitialReady) loadBeforeVideo(); }, RETRY_MS);
  });
  interstitial.load();
}

/**
 * Call when someone taps play on a video, and start the video once it resolves.
 *
 * Resolves straight away when no ad is due — which is almost always — and
 * otherwise after the ad is closed. It is never used once a video is playing.
 */
export function beforeVideo(durationSec) {
  if (!(durationSec >= RULES.minVideoSec) || !interstitialReady || !adAllowed()) {
    return Promise.resolve(false);
  }

  const ad = interstitial;
  interstitialReady = false;

  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (Platform.OS === 'ios') StatusBar.setHidden(false);
      loadBeforeVideo();  // the next one, ready for next time
      resolve(true);
    };
    ad.addAdEventListener(AdEventType.OPENED, () => {
      markAdShown();
      // Otherwise the status bar can sit over the ad's close button on iOS.
      if (Platform.OS === 'ios') StatusBar.setHidden(true);
    });
    ad.addAdEventListener(AdEventType.CLOSED, finish);
    ad.addAdEventListener(AdEventType.ERROR, finish);
    ad.show().catch(finish);
  });
}

// ---- Between shorts ---------------------------------------------------------

let sponsored = null;
let sponsoredAt = 0;
let loadingSponsored = false;
const sponsoredListeners = new Set();

function loadSponsored() {
  if (!UNIT.sponsoredShort || loadingSponsored || sponsored) return;
  loadingSponsored = true;

  let settled = false;
  const failed = why => {
    if (settled) return;
    settled = true;
    loadingSponsored = false;
    log('sponsored short failed to load:', why);
    setTimeout(loadSponsored, RETRY_MS);
  };
  // On Android the library never rejects when a native ad fails to load — its
  // native side only ever resolves — so without a deadline a failure would
  // leave this "loading" forever and no sponsored short would be tried again.
  const timer = setTimeout(() => failed('timed out'), LOAD_TIMEOUT_MS);

  NativeAd.createForAdRequest(UNIT.sponsoredShort, {
    aspectRatio: NativeMediaAspectRatio.PORTRAIT,
    adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
  })
    .then(ad => {
      clearTimeout(timer);
      // A slow one that turned up after a retry already filled the spot.
      if (sponsored) { ad.destroy(); return; }
      settled = true;
      loadingSponsored = false;
      sponsored = ad;
      sponsoredAt = Date.now();
      log('sponsored short loaded');
      sponsoredListeners.forEach(l => l());
    })
    .catch(e => { clearTimeout(timer); failed(e?.message); });
}

/**
 * Tells the Shorts feed when a sponsored short has finished loading, so it can
 * place one even if you're sitting on the same short — otherwise an ad that
 * arrives after you land on a short would wait for a swipe that may never come.
 */
export function onSponsoredReady(listener) {
  sponsoredListeners.add(listener);
  return () => sponsoredListeners.delete(listener);
}

/**
 * Hands over a loaded sponsored short if one is allowed right now, or null.
 * The caller owns it from then on and must destroy() it when done.
 */
export function takeSponsored() {
  if (sponsored && Date.now() - sponsoredAt > NATIVE_TTL_MS) {
    sponsored.destroy();
    sponsored = null;
    loadSponsored();
  }
  if (!sponsored || !adAllowed()) return null;
  const ad = sponsored;
  sponsored = null;
  loadSponsored();
  return ad;
}
