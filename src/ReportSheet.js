import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

import { useTheme, F } from './theme';
import { Flag } from './SocialIcons';
import { Close } from './Icons';
import { REASONS, report } from './safety';

/**
 * Blocking and reporting, in one sheet, because they are the same moment: a
 * person has decided they don't want this and wants it dealt with.
 *
 * Reports are anonymous to the person reported and go to `reports`, one per
 * reporter per thing. Blocking is immediate and private — it is the part that
 * changes what you see straight away, so it sits at the top where someone
 * upset can reach it without reading the rest.
 */
export default function ReportSheet({
  open, onClose, name, blocked, onBlock, kind, target, about,
}) {
  const T = useTheme();
  const s = useMemo(() => styles(T), [T]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState('');

  async function send(reason) {
    if (busy) return;
    setBusy(reason);
    try { await report(kind, target, about, reason); setSent(true); }
    catch (e) { setSent(true); }   // never leave someone stuck on this screen
    setBusy('');
  }

  function close() {
    setSent(false);
    onClose();
  }

  return (
    <Modal visible={!!open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.dim} onPress={close}>
        <Pressable style={s.card} onPress={e => e.stopPropagation()}>
          <View style={s.head}>
            <Flag color={T.text} size={20} />
            <Text style={s.title}>{sent ? 'Thank you' : name || 'This person'}</Text>
            <Pressable onPress={close} hitSlop={10}><Close color={T.muted} size={20} /></Pressable>
          </View>

          {sent ? (
            <>
              <Text style={s.body}>
                We’ve got it. Someone will look at this. If a person is in danger right now,
                tell the police as well — we can take things down, but we can’t reach them.
              </Text>
              <Pressable style={s.done} onPress={close}>
                <Text style={s.doneTxt}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              {onBlock ? (
                <Pressable
                  style={s.block}
                  onPress={() => { onBlock(); close(); }}
                >
                  <Text style={s.blockTxt}>{blocked ? 'Unblock' : 'Block'}</Text>
                  <Text style={s.blockWhy}>
                    {blocked
                      ? 'You’ll see each other again.'
                      : 'You won’t see each other’s posts, streams or chat.'}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={s.lead}>What’s wrong? Reports are anonymous.</Text>
              {REASONS.map(r => (
                <Pressable key={r.id} style={s.reason} onPress={() => send(r.id)}>
                  <Text style={s.reasonTxt}>{r.label}</Text>
                  {busy === r.id ? <ActivityIndicator color={T.muted} size="small" /> : null}
                </Pressable>
              ))}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = T => StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: T.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 26,
    borderTopWidth: 1, borderColor: T.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  title: { flex: 1, color: T.text, fontSize: 16.5, fontFamily: F['800'] },
  body: { color: T.muted, fontSize: 13.5, fontFamily: F['500'], lineHeight: 20, marginBottom: 18 },
  lead: { color: T.muted, fontSize: 12.5, fontFamily: F['700'], marginTop: 16, marginBottom: 8 },
  block: {
    borderRadius: 12, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg3,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  blockTxt: { color: T.red, fontSize: 14.5, fontFamily: F['800'] },
  blockWhy: { color: T.muted, fontSize: 12.5, fontFamily: F['500'], marginTop: 3 },
  reason: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  reasonTxt: { color: T.text, fontSize: 14.5, fontFamily: F['600'] },
  done: {
    height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border,
  },
  doneTxt: { color: T.text, fontSize: 15, fontFamily: F['800'] },
});
