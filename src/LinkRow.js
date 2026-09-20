import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Linking, ActivityIndicator,
} from 'react-native';

import { useTheme, F } from './theme';
import { SocialMark, Lock } from './SocialIcons';
import { Close } from './Icons';
import {
  ADULT_AGE, FACE_CHECKS, MAX_LINKS, chipsFor, isAdult, linkProblem, asUrl, setLinks,
} from './safety';

/**
 * Where else a creator can be found — the row of places along the top of a
 * profile, and the form for filling it in.
 *
 * It opens for adults on both sides: you prove your age to put links up, and
 * you prove it to open someone else's. Proof means a face check, not a date
 * typed into a box, because a link leads off Codera and nobody there is
 * checking who is at the other end. See web/app.js for the long version — the
 * gate is the same one, worked out from the same `ages` record.
 */

/** The row on a profile. `mine` is true on your own page. */
export function LinkRow({ links, mine, age, onCheckAge }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const chips = chipsFor(links);
  if (!chips.length) return null;

  if (mine || isAdult(age)) {
    return (
      <View style={s.row}>
        {chips.map(c => (
          <Pressable
            key={c.href}
            style={s.chip}
            onPress={() => Linking.openURL(c.href).catch(() => {})}
          >
            <SocialMark place={c.key} color={T.text} />
            <Text style={s.chipTxt} numberOfLines={1}>{c.text}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const many = chips.length > 1;
  return (
    <View style={s.shut}>
      <Lock color={T.muted} />
      <Text style={s.shutTxt}>
        {chips.length + (many ? ' links' : ' link') + ' to where they are off Codera'}
        {FACE_CHECKS
          ? ` — ${many ? 'these open' : 'it opens'} once you’ve confirmed you’re ${ADULT_AGE} or over.`
          : '. Age checks open soon.'}
      </Text>
      {FACE_CHECKS ? (
        <Pressable onPress={onCheckAge} hitSlop={8}>
          <Text style={s.act}>Confirm your age</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Your own row, with the way in to changing it. Putting links up needs the
 * same check as opening someone else's.
 */
export function MyLinks({ links, age, onCheckAge }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const [editing, setEditing] = useState(false);
  const has = chipsFor(links).length > 0;

  if (editing) {
    return <LinkEditor links={links} onDone={() => setEditing(false)} />;
  }

  return (
    <View>
      <LinkRow links={links} mine age={age} />
      {isAdult(age) ? (
        <Pressable onPress={() => setEditing(true)} style={s.addWrap} hitSlop={8}>
          <Text style={s.act}>{has ? 'Edit links' : 'Add your links'}</Text>
        </Pressable>
      ) : (
        <View style={s.shut}>
          <Lock color={T.muted} />
          <Text style={s.shutTxt}>
            {FACE_CHECKS
              ? `Your channel, your GitHub, your site — confirm you’re ${ADULT_AGE} or over to put them here.`
              : 'Your channel, your GitHub, your site. Adding them needs an age check, which opens soon.'}
          </Text>
          {FACE_CHECKS ? (
            <Pressable onPress={onCheckAge} hitSlop={8}>
              <Text style={s.act}>Confirm your age</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function LinkEditor({ links, onDone }) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const start = Array.isArray(links) && links.length ? links.slice(0, MAX_LINKS) : [''];
  const [rows, setRows] = useState(start);
  const [bad, setBad] = useState(-1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (i, v) => setRows(rows.map((r, n) => (n === i ? v : r)));
  const drop = i => {
    const left = rows.filter((_, n) => n !== i);
    setRows(left.length ? left : ['']);
  };

  async function save() {
    const kept = [];
    for (let i = 0; i < rows.length; i += 1) {
      const text = rows[i].trim();
      if (!text) continue;
      const problem = linkProblem(text);
      if (problem) { setBad(i); setErr(problem); return; }
      kept.push(asUrl(text).href);
    }
    setBad(-1);
    setErr('');
    setBusy(true);
    try { await setLinks(kept); onDone(); }
    catch (e) { setBusy(false); setErr('Couldn’t save that. Check your connection.'); }
  }

  return (
    <View style={s.editor}>
      <Text style={s.why}>
        Your channel, your GitHub, your site — up to {MAX_LINKS}. They show on your profile
        to anyone {ADULT_AGE} or over. A link that opens a private message with you isn’t allowed.
      </Text>
      {rows.map((value, i) => (
        // The index is the identity here: rows are only ever added at the end
        // or removed whole, and a url isn't unique while it's half-typed.
        <View key={i} style={s.editRow}>
          <TextInput
            style={[s.input, bad === i && s.inputBad]}
            value={value}
            onChangeText={v => change(i, v)}
            placeholder="https://youtube.com/@you"
            placeholderTextColor={T.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={200}
          />
          <Pressable onPress={() => drop(i)} hitSlop={8} style={s.drop}>
            <Close color={T.muted} size={18} />
          </Pressable>
        </View>
      ))}
      {err ? <Text style={s.err}>{err}</Text> : null}
      <View style={s.editActs}>
        {rows.length < MAX_LINKS ? (
          <Pressable onPress={() => setRows([...rows, ''])} hitSlop={8}>
            <Text style={s.actMuted}>Add another</Text>
          </Pressable>
        ) : <View />}
        <View style={s.spacer} />
        <Pressable onPress={onDone} hitSlop={8}>
          <Text style={s.actMuted}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} hitSlop={8} disabled={busy}>
          {busy ? <ActivityIndicator color={T.blue || T.green} /> : <Text style={s.act}>Save</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = T => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 18, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 13,
    borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg2,
    maxWidth: 220,
  },
  chipTxt: { color: T.text, fontSize: 13.5, fontFamily: F['700'], flexShrink: 1 },
  shut: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18, marginTop: 12,
    flexWrap: 'wrap',
  },
  shutTxt: { color: T.muted, fontSize: 13, fontFamily: F['500'], flexShrink: 1, lineHeight: 19 },
  addWrap: { marginHorizontal: 18, marginTop: 12 },
  act: { color: T.green, fontSize: 13.5, fontFamily: F['800'] },
  actMuted: { color: T.muted, fontSize: 13.5, fontFamily: F['700'] },
  editor: { marginHorizontal: 18, marginTop: 12 },
  why: { color: T.muted, fontSize: 12.5, fontFamily: F['500'], lineHeight: 18, marginBottom: 10 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: {
    flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.bg2, paddingHorizontal: 12, color: T.text, fontSize: 14,
    fontFamily: F['500'],
  },
  inputBad: { borderColor: T.red },
  drop: { width: 32, alignItems: 'center' },
  err: { color: T.red, fontSize: 12.5, fontFamily: F['600'], marginBottom: 8, lineHeight: 18 },
  editActs: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 2 },
  spacer: { flex: 1 },
});
