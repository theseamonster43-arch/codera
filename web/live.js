/**
 * Live streaming, browser to browser.
 *
 * There is no streaming server. The streamer's browser sends its camera or
 * screen straight to each viewer over WebRTC; Firestore is only the notice board
 * where the two sides leave each other the details needed to connect:
 *
 *   streams/{id}/peers/{viewer}          the viewer's offer, then the streamer's answer
 *   streams/{id}/peers/{viewer}/viewer/* the viewer's network routes
 *   streams/{id}/peers/{viewer}/host/*   the streamer's network routes
 *
 * Each viewer is a separate upload from the streamer, so this suits a small
 * audience (a handful to a dozen, depending on the streamer's connection). A
 * `session` id on everything means a viewer who reconnects starts clean instead
 * of tripping over the routes from last time.
 *
 * Only public STUN servers are used to find a route. Two people both behind
 * strict corporate or mobile networks may not be able to connect; that needs a
 * TURN relay, which costs money to run.
 */

import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, addDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const ICE = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

const plain = d => ({ type: d.type, sdp: d.sdp });
const newSession = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * The streamer's side: answers every viewer who asks, sending them `media`.
 *
 * @returns {{ stop(): void }}
 */
export function hostStream(db, streamId, media, { onWatching } = {}) {
  const peersCol = collection(db, 'streams', streamId, 'peers');
  const peers = new Map();       // viewer uid -> { pc, session, unsub }

  const report = () => {
    if (!onWatching) return;
    let n = 0;
    peers.forEach(p => { if (p.pc.connectionState === 'connected') n++; });
    onWatching(n);
  };

  function drop(uid) {
    const p = peers.get(uid);
    if (!p) return;
    peers.delete(uid);
    try { p.unsub && p.unsub(); } catch (e) {}
    try { p.pc.close(); } catch (e) {}
    report();
  }

  async function answer(uid, data) {
    drop(uid);
    const pc = new RTCPeerConnection(ICE);
    const entry = { pc, session: data.session, unsub: null };
    peers.set(uid, entry);

    media.getTracks().forEach(t => pc.addTrack(t, media));
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      addDoc(collection(db, 'streams', streamId, 'peers', uid, 'host'),
        { session: data.session, c: e.candidate.toJSON() }).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(uid);
      else report();
    };

    await pc.setRemoteDescription(data.offer);
    const reply = await pc.createAnswer();
    await pc.setLocalDescription(reply);
    await updateDoc(doc(peersCol, uid), { answer: plain(reply), answered: data.session });

    entry.unsub = onSnapshot(collection(db, 'streams', streamId, 'peers', uid, 'viewer'), snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (d.session === entry.session) pc.addIceCandidate(d.c).catch(() => {});
      });
    });
  }

  const unsub = onSnapshot(peersCol, snap => {
    snap.docChanges().forEach(ch => {
      const uid = ch.doc.id;
      const d = ch.doc.data();
      if (ch.type === 'removed') { drop(uid); return; }
      const cur = peers.get(uid);
      if (d.offer && d.session && (!cur || cur.session !== d.session)) {
        answer(uid, d).catch(() => drop(uid));
      }
    });
  });

  return {
    stop() {
      unsub();
      [...peers.keys()].forEach(drop);
    },
  };
}

/**
 * A viewer's side: asks the streamer for the stream and plays it in `video`.
 *
 * @param onState called with 'connecting', 'connected', 'failed' or 'closed'
 * @returns {{ stop(): void }}
 */
export function watchStream(db, streamId, uid, video, onState) {
  const session = newSession();
  const pc = new RTCPeerConnection(ICE);
  const mine = doc(db, 'streams', streamId, 'peers', uid);
  const remote = new MediaStream();
  const unsubs = [];
  let stopped = false;

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = e => {
    remote.addTrack(e.track);
    if (video.srcObject !== remote) video.srcObject = remote;
    video.play().catch(() => {});
  };
  pc.onicecandidate = e => {
    if (!e.candidate) return;
    addDoc(collection(mine, 'viewer'), { session, c: e.candidate.toJSON() }).catch(() => {});
  };
  pc.onconnectionstatechange = () => onState && onState(pc.connectionState);
  onState && onState('connecting');

  (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (stopped) return;
    await setDoc(mine, { offer: plain(offer), session, at: serverTimestamp() });

    unsubs.push(onSnapshot(mine, snap => {
      const d = snap.data();
      if (d && d.answer && d.answered === session && !pc.currentRemoteDescription) {
        pc.setRemoteDescription(d.answer).catch(() => onState && onState('failed'));
      }
    }));
    unsubs.push(onSnapshot(collection(mine, 'host'), snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (d.session === session) pc.addIceCandidate(d.c).catch(() => {});
      });
    }));
  })().catch(() => onState && onState('failed'));

  return {
    stop() {
      stopped = true;
      unsubs.forEach(u => { try { u(); } catch (e) {} });
      try { pc.close(); } catch (e) {}
      deleteDoc(mine).catch(() => {});
    },
  };
}

/**
 * Records a stream on the streamer's own machine while it runs, so it can be
 * kept afterwards without anything having been uploaded during the stream.
 * MP4 where the browser can write it (it plays everywhere), WebM otherwise.
 */
export function recorder(media) {
  const kinds = [
    'video/mp4;codecs=avc1,opus', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  const type = kinds.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  let rec;
  try {
    rec = new MediaRecorder(media, type ? { mimeType: type, videoBitsPerSecond: 2500000 } : undefined);
  } catch (e) {
    return null;       // no recording on this browser; the stream still runs
  }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(1000);
  return {
    stop: () => new Promise(resolve => {
      rec.onstop = () => {
        const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
        resolve(new Blob(chunks, { type: mime }));
      };
      try { rec.stop(); } catch (e) { resolve(new Blob(chunks, { type: 'video/webm' })); }
    }),
  };
}

/**
 * The cameras and microphones this machine has — OBS's virtual camera among
 * them when OBS is running with it started. Names only appear once the page
 * has been allowed to use a camera or microphone at least once.
 */
export async function devices() {
  const all = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
    ? await navigator.mediaDevices.enumerateDevices() : [];
  const named = (kind, fallback) => all
    .filter(d => d.kind === kind && d.deviceId)
    .map((d, i) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
  return { cams: named('videoinput', 'Camera'), mics: named('audioinput', 'Microphone') };
}

/**
 * Something to stream: a camera, or the screen with the microphone laid over it.
 *
 * @param source 'camera' | 'screen'
 * @param opts   { cam, mic }: device ids from devices(); the defaults when absent
 */
export async function capture(source, opts = {}) {
  const mic = opts.mic ? { deviceId: { exact: opts.mic } } : true;
  if (source === 'screen') {
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 }, audio: true,
    });
    // The microphone too, so people can talk over what they are showing. If it
    // is refused, the screen goes out on its own.
    try {
      const voice = await navigator.mediaDevices.getUserMedia({ audio: mic });
      voice.getAudioTracks().forEach(t => screen.addTrack(t));
    } catch (e) { /* no microphone: screen only */ }
    return screen;
  }
  return navigator.mediaDevices.getUserMedia({
    video: Object.assign(
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      opts.cam ? { deviceId: { exact: opts.cam } } : {},
    ),
    audio: mic,
  });
}

/**
 * One steady picture and one steady sound, whatever feeds them.
 *
 * Viewers' connections and the recording both take this mixer's output rather
 * than the camera itself, so the streamer can switch camera, microphone or
 * screen mid-stream: the mixer starts drawing from the new source and nobody's
 * connection or the recording notices a thing. (A recording stops outright if
 * the tracks it records change, and a switch would otherwise mean every viewer
 * reconnecting.)
 *
 * The picture is redrawn onto a canvas 30 times a second, timed from a worker
 * so it keeps going while the tab is in the background, and the sound goes
 * through Web Audio, where every audio track of a source is mixed together —
 * a screen's own sound and the microphone, say.
 */
export function mixer(first) {
  const settings = (first.getVideoTracks()[0] && first.getVideoTracks()[0].getSettings()) || {};
  const upright = settings.width && settings.height && settings.height > settings.width;
  const canvas = document.createElement('canvas');
  canvas.width = upright ? 720 : 1280;
  canvas.height = upright ? 1280 : 720;
  const g = canvas.getContext('2d');

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  const audio = new AudioContext();
  const out = audio.createMediaStreamDestination();
  let voices = [];
  let source = null;

  // Fits the source into the frame without stretching it, on black.
  function draw() {
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (video.readyState < 2 || !video.videoWidth) return;
    const s = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * s, h = video.videoHeight * s;
    g.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  const ticker = new Worker(URL.createObjectURL(new Blob(
    ['setInterval(() => postMessage(0), 1000 / 30);'], { type: 'text/javascript' })));
  ticker.onmessage = draw;

  function use(stream) {
    const was = source;
    source = stream;
    video.srcObject = new MediaStream(stream.getVideoTracks());
    video.play().catch(() => {});
    voices.forEach(v => { try { v.disconnect(); } catch (e) {} });
    voices = stream.getAudioTracks().map(t => {
      const node = audio.createMediaStreamSource(new MediaStream([t]));
      node.connect(out);
      return node;
    });
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    if (was && was !== stream) was.getTracks().forEach(t => t.stop());
  }

  use(first);
  draw();
  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...out.stream.getAudioTracks(),
  ]);

  return {
    stream,
    use,
    current: () => source,
    stop() {
      ticker.terminate();
      if (source) source.getTracks().forEach(t => t.stop());
      stream.getTracks().forEach(t => t.stop());
      audio.close().catch(() => {});
    },
  };
}

/** Whether this browser can stream at all. */
export const canStream = () => !!(navigator.mediaDevices && window.RTCPeerConnection);

/** Seconds as h:mm:ss or m:ss. */
export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
