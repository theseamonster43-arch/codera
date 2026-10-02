import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';

import { useTheme, F } from '../theme';
import { auth, functions } from '../firebase';
import Mark from '../Mark';

/** Where the code is typed, and what the square points at. */
const SITE = 'https://learncodera.com/tv';

/**
 * Signing in on a television.
 *
 * Nobody types an email address with a remote, so the television does not ask
 * anybody to. It shows a code and waits: whoever is already signed in on a
 * phone opens the page, enters the code, and the television is handed a token
 * for that account. The square is the same page with the code already in it,
 * for a phone that would rather point its camera than type.
 *
 * Because approval happens wherever you are already signed in, this works the
 * same whether that was Google, GitHub or an email address — the television
 * never learns which, and never handles a password.
 */
export default function TVSignIn() {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);

  const [pair, setPair] = useState(null);     // { code, secret, expires }
  const [err, setErr] = useState('');
  const asking = useRef(false);

  // A code, and a new one whenever the old one runs out.
  useEffect(() => {
    let alive = true;

    async function start() {
      if (asking.current) return;
      asking.current = true;
      setErr('');
      try {
        const res = await httpsCallable(functions, 'tvPairStart')({});
        if (alive) setPair(res.data);
      } catch (e) {
        if (alive) setErr('Couldn’t reach Codera. Check the connection.');
      } finally {
        asking.current = false;
      }
    }

    start();
    return () => { alive = false; };
  }, []);

  // Waiting for somebody to say yes on their phone.
  useEffect(() => {
    if (!pair) return undefined;
    let alive = true;

    const tick = setInterval(async () => {
      if (!alive) return;
      if (Date.now() > pair.expires) { setPair(null); return; }
      try {
        const res = await httpsCallable(functions, 'tvPairClaim')({
          code: pair.code, secret: pair.secret,
        });
        const d = res.data || {};
        if (d.gone) { setPair(null); return; }
        if (d.token && alive) {
          clearInterval(tick);
          await signInWithCustomToken(auth, d.token);
        }
      } catch (e) {
        if (!alive) return;
        // Only the television's own secret being wrong means this pairing is
        // finished with. Anything else is the server having a bad moment, and
        // throwing the code away for that is how a perfectly good pairing
        // turned into a fresh code on screen while somebody was still typing
        // the old one.
        if (e && e.code === 'functions/permission-denied') {
          setPair(null);
          return;
        }
        setErr('Couldn’t finish signing in. The code is still good — trying again.');
      }
    }, 2500);

    return () => { alive = false; clearInterval(tick); };
  }, [pair]);

  // Lost or expired: ask for a fresh one. A pairing that is still good keeps
  // its code however loudly the last poll complained.
  useEffect(() => {
    if (pair) return undefined;
    const again = setTimeout(async () => {
      try {
        const res = await httpsCallable(functions, 'tvPairStart')({});
        setPair(res.data);
      } catch (e) { setErr('Couldn’t reach Codera. Check the connection.'); }
    }, 600);
    return () => clearTimeout(again);
  }, [pair, err]);

  return (
    <View style={s.fill}>
      <View style={s.left}>
        <View style={s.brand}>
          <Mark size={44} />
          <Text style={s.wordmark}>Codera</Text>
        </View>

        <Text style={s.lead}>Sign in from your phone</Text>
        <Text style={s.step}>
          1.  Open <Text style={s.strong}>learncodera.com/tv</Text>
        </Text>
        <Text style={s.step}>2.  Enter this code</Text>

        {pair ? (
          <View style={s.codeBox}>
            {pair.code.split('').map((c, i) => (
              <View key={i} style={s.cell}><Text style={s.cellTxt}>{c}</Text></View>
            ))}
          </View>
        ) : (
          <ActivityIndicator color={T.blue} size="large" style={s.spin} />
        )}

        {/* Beside the code, never instead of it: a message saying the code is
            still good is worth nothing if it is covering the code. */}
        {!!err && <Text style={s.err}>{err}</Text>}

        <Text style={s.note}>
          Nothing is typed here. Whoever says yes on their phone is who this
          television signs in as.
        </Text>
      </View>

      <View style={s.right}>
        {pair && (
          <>
            <View style={s.qr}>
              <QRCode
                value={SITE + '?code=' + pair.code}
                size={260}
                backgroundColor="#ffffff"
                color="#080c0a"
              />
            </View>
            <Text style={s.qrNote}>Or point your camera at this</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = T => StyleSheet.create({
  fill: { flex: 1, flexDirection: 'row', backgroundColor: T.bg, padding: 56 },
  left: { flex: 1, justifyContent: 'center', gap: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  wordmark: { color: T.text, fontSize: 30, fontFamily: F['900'], letterSpacing: -0.6 },
  lead: { color: T.text, fontSize: 32, fontFamily: F['800'], letterSpacing: -0.6 },
  step: { color: T.muted, fontSize: 19, fontFamily: F['500'] },
  strong: { color: T.text, fontFamily: F['800'] },

  codeBox: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cell: {
    width: 62, height: 78, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.bg2, borderWidth: 2, borderColor: T.green,
  },
  cellTxt: { color: T.text, fontSize: 38, fontFamily: F['900'] },
  spin: { alignSelf: 'flex-start', marginTop: 16 },
  err: { color: T.red, fontSize: 17, fontFamily: F['600'], marginTop: 10 },
  note: {
    color: T.muted, fontSize: 15, fontFamily: F['400'],
    lineHeight: 22, maxWidth: 460, marginTop: 18,
  },

  right: { width: 340, alignItems: 'center', justifyContent: 'center', gap: 16 },
  qr: { padding: 16, borderRadius: 18, backgroundColor: '#fff' },
  qrNote: { color: T.muted, fontSize: 15, fontFamily: F['500'] },
});
