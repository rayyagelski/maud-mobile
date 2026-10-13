import { useEffect, useState } from 'react';
import Tts from 'react-native-tts';

// getInitStatus() only needs to resolve once per app session — cached across
// hook instances so every screen using voice playback doesn't re-trigger it.
let ttsReady: Promise<void> | null = null;
function ensureTtsReady(): Promise<void> {
  if (!ttsReady) {
    ttsReady = Tts.getInitStatus().then(() => undefined).catch(() => undefined);
  }
  return ttsReady;
}

// One speech queue for the whole app. Every screen/hook shares the same Tts
// engine, so the rules have to live at module level:
//  - A MORE urgent message interrupts what is playing.
//  - An equally or less urgent one WAITS for it to finish, then plays —
//    unless it has gone stale by then (see MAX_WAIT_MS).
//
// Interrupting on equal priority (the previous rule) cut messages off in
// real use: "Trip recording started" was stopped within a second by the
// first turn-by-turn instruction, spoken on the very next GPS fix (fixes
// come every second during a trip), and the Bluetooth "Trip will be
// recorded under …" message was cut off by the Route Planner's route
// recommendation.
export type VoicePriority = 'critical' | 'high' | 'normal';
const PRIORITY_RANK: Record<VoicePriority, number> = { critical: 2, high: 1, normal: 0 };

// How long a message may wait in the queue before it is dropped as no longer
// relevant: a turn instruction or speed-zone warning played much later would
// come at the wrong place; information like the Bluetooth message can wait.
const MAX_WAIT_MS: Record<VoicePriority, number> = { critical: 8000, high: 5000, normal: 20000 };

// If the engine never reports the end of an utterance, the queue must not
// stall forever: assume it is done after a generous estimate of its length.
function estimatedDurationMs(text: string): number {
  return 3000 + text.length * 90;
}

interface QueuedMessage { text: string; priority: VoicePriority; queuedAt: number }

// id: the engine's utterance id (resolved by Tts.speak), so finish/cancel
// events of an utterance we interrupted can't be mistaken for this one's.
let current: { priority: VoicePriority; text: string; id: string | null } | null = null;
const queue: QueuedMessage[] = [];
let watchdog: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;
const speakingListeners = new Set<(speaking: boolean) => void>();

function notifySpeaking(speaking: boolean) {
  speakingListeners.forEach(listener => listener(speaking));
}

function play(message: QueuedMessage) {
  const playing = { priority: message.priority, text: message.text, id: null as string | null };
  current = playing;
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(onUtteranceDone, estimatedDurationMs(message.text));
  Promise.resolve(Tts.speak(message.text) as unknown as Promise<string | number>)
    .then((id) => { if (current === playing) playing.id = String(id); })
    .catch(() => { if (current === playing) onUtteranceDone(); });
}

function playNext() {
  const now = Date.now();
  while (queue.length > 0) {
    // Most urgent first; among equals, oldest first.
    queue.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.queuedAt - b.queuedAt);
    const next = queue.shift() as QueuedMessage;
    if (now - next.queuedAt <= MAX_WAIT_MS[next.priority]) {
      play(next);
      return;
    }
  }
  notifySpeaking(false);
}

function onUtteranceDone() {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
  current = null;
  playNext();
}

function installListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;
  Tts.addEventListener('tts-start', () => notifySpeaking(true));
  // Interrupted utterances report 'tts-cancel' (Android onStop), never
  // 'tts-finish', so a finish always belongs to what is playing — unless
  // its id is known and differs.
  Tts.addEventListener('tts-finish', (event) => {
    if (current?.id != null && String(event?.utteranceId) !== current.id) return;
    onUtteranceDone();
  });
  // A cancel only ends the current message when it is provably that one;
  // the cancel of the message we just interrupted arrives after the more
  // urgent one already started. The watchdog covers anything missed.
  Tts.addEventListener('tts-cancel', (event) => {
    if (current?.id == null || String(event?.utteranceId) !== current.id) return;
    onUtteranceDone();
  });
}

export async function enqueueSpeech(text: string, priority: VoicePriority = 'normal'): Promise<void> {
  if (!text) return;
  try {
    await ensureTtsReady();
    installListeners();
  } catch {
    return; // Fail-soft — see the hook's doc comment.
  }
  const message: QueuedMessage = { text, priority, queuedAt: Date.now() };

  if (current == null) {
    play(message);
    return;
  }
  if (PRIORITY_RANK[priority] > PRIORITY_RANK[current.priority]) {
    // More urgent: interrupt. What was playing is dropped, not resumed —
    // replaying it from the start after an interruption sounds broken.
    try { Tts.stop(); } catch { /* ignore */ }
    play(message);
    return;
  }
  queue.push(message);
}

/**
 * Thin wrapper around react-native-tts — used to speak the AI route
 * recommendation (Route Planner), turn-by-turn maneuvers, speed-zone
 * warnings, trip lifecycle announcements, and the trip-end
 * voice_payload.script the backend generates. Fail-soft throughout: a TTS
 * engine/init failure just means nothing plays, never crashes the screen.
 *
 * Priorities: turn-by-turn and trip start/end announcements pass 'critical',
 * speed-zone/compliance warnings 'high', everything else 'normal'. See the
 * queue rules above.
 */
export function useVoicePlayback() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    speakingListeners.add(setIsSpeaking);
    return () => { speakingListeners.delete(setIsSpeaking); };
  }, []);

  function speak(text: string, priority: VoicePriority = 'normal') {
    return enqueueSpeech(text, priority);
  }

  return { speak, isSpeaking };
}
