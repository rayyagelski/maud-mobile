// Lightweight pub/sub so useHarshEventTracker can react to every GPS fix
// produced by useTripAutoDetection's single Geolocation.watchPosition
// subscription, without opening a second GPS subscription of its own.
import type { GpsPoint } from '../types/trip.types';

type GpsFixListener = (speedMs: number, timestamp: number, point: GpsPoint) => void;

let listeners: GpsFixListener[] = [];

export function publishGpsFix(speedMs: number, timestamp: number, point: GpsPoint): void {
  listeners.forEach(listener => listener(speedMs, timestamp, point));
}

export function subscribeGpsFix(listener: GpsFixListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}
