// Every touch the user starts anywhere in the app, published from the app
// root (see App.tsx). useHarshEventTracker listens during a trip to record
// phone handling while driving — the one kind of phone use the screen-state
// check can't see, because MAUD itself is the app on screen.

type Listener = () => void;

const listeners = new Set<Listener>();

export function publishUserTouch(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener's failure must never affect the touch itself.
    }
  });
}

export function subscribeUserTouch(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
