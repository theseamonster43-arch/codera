import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import {
  CardForm, initStripe, confirmPayment, confirmSetupIntent,
} from '@stripe/stripe-react-native';

import { auth, functions } from '../firebase';
import { useTheme, F } from '../theme';
import { plusDate, STRIPE_PK, solid } from '../plus';
import { ask } from '../Sheet';
import PlusCelebration from '../PlusCelebration';
import Gradient, { BRAND } from '../Gradient';
import { Close, Check } from '../Icons';
import Mark from '../Mark';

/**
 * Codera's own checkout, for paying inside the Android app.
 *
 * Everything on this screen is ours — the layout, Scoutie Sans, the gradient —
 * except the rows where the card is typed. Those are Stripe's CardForm, native
 * fields whose contents never pass through Codera's code:
 * which is what keeps a card number out of the app entirely, while still
 * letting it look like the app.
 *
 * Three moods, from the route:
 *   pay    — $10 today, then monthly.
 *   renew  — subscribing again inside a month already paid for; the card is
 *            saved now and the first $10 waits for that month to end.
 *   card   — change the card an active subscription is charged to.
 *
 * Android only (see IN_APP_PAYMENTS). iOS never links Stripe's native code, so
 * this screen is loaded lazily and only ever opened on Android.
 */
export default function CheckoutScreen({ navigation, route }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const insets = useSafeAreaInsets();

  const asked = route.params?.mode || 'pay';
  const nextCharge = route.params?.nextCharge || 0;

  const [prep, setPrep] = useState(null);     // what the server handed back
  const [card, setCard] = useState(null);     // the field's own report on the card
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);     // the celebration, once it worked

  // The server decides whether this is a payment today or a card saved for
  // later; a cancelled member always gets the second, whatever was asked.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await httpsCallable(functions, asked === 'card' ? 'plusCard' : 'plusIntent')();
        const data = (res && res.data) || {};
        await initStripe({ publishableKey: data.livemode ? STRIPE_PK.live : STRIPE_PK.test });
        const mode = asked === 'card' ? 'card' : data.setupSecret ? 'renew' : 'pay';
        if (live) setPrep({ ...data, mode });
      } catch (e) {
        if (live) setErr(String(e?.message || '').replace(/\s*\[\d+\]$/, '')
          || "Couldn't reach Codera. Check your connection and try again.");
      }
    })();
    return () => { live = false; };
  }, [asked]);

  const mode = prep?.mode || asked;
  const startsOn = prep?.startsAt ? plusDate(prep.startsAt) : '';
  const nextOn = nextCharge ? plusDate(nextCharge) : '';

  const WORDS = {
    pay: {
      title: 'Codera Plus',
      lede: 'No ads, and every new perk first.',
      button: 'Subscribe · $10.00 today',
      ask: ['Subscribe to Codera Plus?',
        'You pay $10.00 today on this card, then $10.00 every month until you cancel.',
        'Pay $10.00'],
      done: ['Welcome to Codera Plus', 'Payment received. No more ads, and every new perk is yours first.'],
    },
    renew: {
      title: 'Subscribe again',
      lede: `Nothing is charged today. Your first $10.00 is on ${startsOn}.`,
      button: 'Subscribe again · $0 today',
      ask: ['Subscribe to Codera Plus again?',
        `Nothing is charged today. $10.00 on this card from ${startsOn}, when your current month ends, then every month until you cancel.`,
        'Confirm'],
      done: ['Plus will carry on', `Card saved. Nothing charged today — your next $10.00 is on ${startsOn}.`],
    },
    card: {
      title: 'Change card',
      lede: `Nothing is charged now.${nextOn ? ` Your next $10.00 on ${nextOn} goes on the new card.` : ''}`,
      button: 'Save card',
      ask: ['Use this card for Plus?',
        `Your next $10.00${nextOn ? ` on ${nextOn}` : ''} will go on this card. Nothing is charged now.`,
        'Use this card'],
      done: ['Card updated', 'From now on Plus is charged to this card.'],
    },
  }[mode];

  const DUE = {
    pay: [['Due today', '$10.00'], ['Then', '$10.00 every month']],
    renew: [['Due today', '$0.00'], ['From ' + (startsOn || 'next month'), '$10.00 every month']],
    card: [['Due now', '$0.00'], ['Next charge', nextOn ? '$10.00 on ' + nextOn : '$10.00']],
  }[mode];

  async function go() {
    if (!prep || busy) return;
    setErr('');
    if (!card?.complete) { setErr('Finish entering your card first.'); return; }

    const label = card.brand && card.last4 ? `${card.brand} •••• ${card.last4}` : 'this card';
    const yes = await ask({
      title: WORDS.ask[0],
      body: WORDS.ask[1].replace('this card', label),
      yes: WORDS.ask[2],
    });
    if (!yes) return;

    setBusy(true);
    const email = auth.currentUser?.email || undefined;
    const details = { paymentMethodType: 'Card', paymentMethodData: { billingDetails: { email } } };

    try {
      const out = prep.setupSecret
        ? await confirmSetupIntent(prep.setupSecret, details)
        : await confirmPayment(prep.clientSecret, details);

      if (out.error) {
        // Written for the person holding the card — a decline, a wrong number.
        setErr(out.error.localizedMessage || out.error.message || 'That did not go through.');
        setBusy(false);
        return;
      }

      if (mode === 'card') {
        await httpsCallable(functions, 'plusCardSave')({ setupIntentId: prep.setupIntentId });
      }

      // Plus itself is switched on by the webhook; the Plus screen follows it.
      setDone({ title: WORDS.done[0], body: WORDS.done[1].replace('this card', label) });
    } catch (e) {
      setErr(String(e?.message || '').replace(/\s*\[\d+\]$/, '') || 'That did not go through.');
      setBusy(false);
    }
  }

  const ready = !!prep && !err.startsWith("Couldn't reach");

  return (
    <View style={s.fill}>
      <StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.body, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.bar}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.close} disabled={busy}>
              <Close color={T.text} size={18} />
            </Pressable>
            <Text style={s.test}>{prep && !prep.livemode ? 'TEST MODE' : ''}</Text>
          </View>

          {/* The plan, in a card edged with the brand gradient. */}
          <Gradient colors={BRAND} style={s.edge}>
            <View style={s.plan}>
              <View style={s.planTop}>
                <Mark size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{WORDS.title}</Text>
                  <Text style={s.lede}>{WORDS.lede}</Text>
                </View>
              </View>
              <View style={s.priceRow}>
                <Text style={s.price}>$10</Text>
                <Text style={s.per}>/ month</Text>
              </View>
              {['No ads on shorts or videos', 'Every new Plus perk, first', 'Cancel anytime'].map(t => (
                <View key={t} style={s.perk}>
                  <Gradient colors={BRAND} style={s.tick}><Check color="#fff" size={11} /></Gradient>
                  <Text style={s.perkTxt}>{t}</Text>
                </View>
              ))}
            </View>
          </Gradient>

          <Text style={s.label}>Card</Text>
          {ready ? (
            // Each part of the card on its own row — number, expiry, security
            // code, postcode — rather than all four squeezed into one line.
            <CardForm
              cardStyle={{
                backgroundColor: T.bg2,
                textColor: T.text,
                placeholderColor: T.muted,
                borderColor: solid(T.border, T.bg2),
                borderWidth: 1,
                borderRadius: 14,
                fontSize: 16,
                fontFamily: 'ScoutieSans-Medium',
                cursorColor: T.green,
                textErrorColor: T.red,
              }}
              style={s.form}
              onFormComplete={setCard}
            />
          ) : (
            <View style={[s.form, s.fieldWait]}>
              {!err && <ActivityIndicator color={T.green} />}
            </View>
          )}

          {!!err && <Text style={s.err}>{err}</Text>}

          <View style={s.due}>
            {DUE.map(([k, v], i) => (
              <View key={k} style={[s.dueRow, i > 0 && s.dueLine]}>
                <Text style={[s.dueKey, i === 0 && s.dueStrong]}>{k}</Text>
                <Text style={[s.dueVal, i === 0 && s.dueStrong]}>{v}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={go} disabled={!ready || busy} style={({ pressed }) => [pressed && s.pressed]}>
            <Gradient colors={BRAND} style={[s.button, (!ready || busy) && s.dim]}>
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.buttonTxt}>{WORDS.button}</Text>}
            </Gradient>
          </Pressable>

          <Text style={s.fine}>
            Card details go straight to Stripe — Codera never sees them.
            {mode === 'card' ? '' : ' Cancel any time from the Plus screen.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {done && (
        <PlusCelebration
          title={done.title}
          body={done.body}
          button={mode === 'card' ? 'Done' : 'Start watching'}
          onDone={() => navigation.goBack()}
        />
      )}
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.bg },
  body: { paddingHorizontal: 20 },
  bar: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  close: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.bg2,
    borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center',
  },
  test: {
    marginLeft: 'auto', color: T.amber, fontSize: 11.5, fontFamily: F['800'], letterSpacing: 1.2,
  },

  // Gradient centres what it holds, which suits a button label; a card inside
  // it has to be told to fill the width, or it shrinks to its text.
  edge: { borderRadius: 22, padding: 1.5, alignItems: 'stretch' },
  plan: { backgroundColor: T.bg2, borderRadius: 20.5, padding: 20, alignSelf: 'stretch' },
  planTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  title: { color: T.text, fontSize: 22, fontFamily: F['900'], letterSpacing: -0.6 },
  lede: { color: T.muted, fontSize: 13.5, fontFamily: F['500'], lineHeight: 19, marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 18, marginBottom: 10 },
  price: { color: T.text, fontSize: 40, fontFamily: F['900'], letterSpacing: -1.5 },
  per: { color: T.muted, fontSize: 15, fontFamily: F['700'] },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  perkTxt: { color: T.text, fontSize: 14.5, fontFamily: F['600'] },

  label: {
    color: T.muted, fontSize: 11.5, fontFamily: F['800'], letterSpacing: 1.1,
    textTransform: 'uppercase', marginTop: 26, marginBottom: 10,
  },
  // Tall enough for Stripe's four rows and their labels.
  form: { width: '100%', height: 290 },
  fieldWait: {
    borderRadius: 14, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  err: { color: T.red, fontSize: 14, fontFamily: F['600'], lineHeight: 20, marginTop: 12 },

  due: {
    marginTop: 18, borderRadius: 16, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, paddingHorizontal: 16,
  },
  dueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  dueLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.border },
  dueKey: { flex: 1, color: T.muted, fontSize: 14.5, fontFamily: F['600'] },
  dueVal: { color: T.muted, fontSize: 14.5, fontFamily: F['600'] },
  dueStrong: { color: T.text, fontSize: 16, fontFamily: F['800'] },

  button: {
    height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  buttonTxt: { color: '#fff', fontSize: 16.5, fontFamily: F['800'] },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  fine: {
    color: T.muted, fontSize: 12.5, fontFamily: F['500'], lineHeight: 18,
    textAlign: 'center', marginTop: 14,
  },
});
