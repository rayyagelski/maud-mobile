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

/**
 * Thin wrapper around react-native-tts — used to speak the AI route
 * recommendation (Route Planner) and the trip-end voice_payload.script the
 * backend has generated since Phase 1 of this session but the app never
 * spoke aloud. Fail-soft throughout: a TTS engine/init failure just means
 * nothing plays, never crashes the screen — same convention as every other
 * auxiliary feature in this app (weather, AI tip, reward submission).
 */
export function useVoicePlayback() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const onStart = () => setIsSpeaking(true);
    const onFinish = () => setIsSpeaking(false);
    const onCancel = () => setIsSpeaking(false);

    Tts.addEventListener('tts-start', onStart);
    Tts.addEventListener('tts-finish', onFinish);
    Tts.addEventListener('tts-cancel', onCancel);

    return () => {
      Tts.removeEventListener('tts-start', onStart);
      Tts.removeEventListener('tts-finish', onFinish);
      Tts.removeEventListener('tts-cancel', onCancel);
    };
  }, []);

  async function speak(text: string) {
    if (!text) return;
    try {
      await ensureTtsReady();
      Tts.stop(); // interrupt any in-progress utterance rather than queueing
      Tts.speak(text);
    } catch {
      // Fail-soft — see file doc comment.
    }
  }

  return { speak, isSpeaking };
}
