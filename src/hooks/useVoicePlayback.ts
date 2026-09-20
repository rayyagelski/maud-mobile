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

// Every screen/hook that calls speak() shares the same underlying Tts
// singleton, but each used to call Tts.stop()+Tts.speak() with no idea
// whether anything else was already talking — whichever call happened to
// land last always won. Real-drive symptom this caused: a speed-zone
// warning or AI-recommendation announcement firing on the same GPS fix a
// turn-by-turn maneuver ("turn left") was spoken could silently stomp it a
// fraction of a second later, and the one-time "Trip recording started"
// confirmation could just as easily be cut off by whatever else happened to
// speak next. `currentPriority` is module-level (not per-hook-instance
// state) because it has to be shared across every independent
// useVoicePlayback() call site to mean anything.
export type VoicePriority = 'critical' | 'high' | 'normal';
const PRIORITY_RANK: Record<VoicePriority, number> = { critical: 2, high: 1, normal: 0 };
let currentPriority: VoicePriority | null = null;

/**
 * Thin wrapper around react-native-tts — used to speak the AI route
 * recommendation (Route Planner), turn-by-turn maneuvers, speed-zone
 * warnings, trip lifecycle announcements, and the trip-end
 * voice_payload.script the backend generates. Fail-soft throughout: a TTS
 * engine/init failure just means nothing plays, never crashes the screen —
 * same convention as every other auxiliary feature in this app (weather, AI
 * tip, reward submission).
 */
export function useVoicePlayback() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const onStart = () => setIsSpeaking(true);
    const onFinish = () => { setIsSpeaking(false); currentPriority = null; };
    const onCancel = () => { setIsSpeaking(false); currentPriority = null; };

    Tts.addEventListener('tts-start', onStart);
    Tts.addEventListener('tts-finish', onFinish);
    Tts.addEventListener('tts-cancel', onCancel);

    return () => {
      Tts.removeEventListener('tts-start', onStart);
      Tts.removeEventListener('tts-finish', onFinish);
      Tts.removeEventListener('tts-cancel', onCancel);
    };
  }, []);

  // priority defaults to 'normal' (the old, unprioritized behavior) for
  // every caller that hasn't been given a reason to ask for more — turn-by-
  // turn maneuvers and trip start/end announcements pass 'critical',
  // speed-zone/compliance warnings pass 'high'. A lower-priority call that
  // arrives while something higher-priority is still likely playing is
  // dropped outright rather than queued — a speed-zone warning replayed a
  // few seconds late, after whatever it interrupted finishes, would land at
  // the wrong moment/distance anyway (same "skip it, don't queue stale
  // context" reasoning as turnByTurnLogic.ts's off-route muting), so
  // silently losing that one announcement is the better failure mode.
  async function speak(text: string, priority: VoicePriority = 'normal') {
    if (!text) return;
    if (currentPriority != null && PRIORITY_RANK[priority] < PRIORITY_RANK[currentPriority]) {
      return;
    }
    try {
      await ensureTtsReady();
      currentPriority = priority;
      Tts.stop(); // interrupt any in-progress utterance rather than queueing
      Tts.speak(text);
    } catch {
      currentPriority = null;
      // Fail-soft — see file doc comment.
    }
  }

  return { speak, isSpeaking };
}
