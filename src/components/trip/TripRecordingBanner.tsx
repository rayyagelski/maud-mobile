import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { endTrip } from '../../store/slices/tripSlice';
import { formatDuration } from '../../utils/helpers';
import { navigationRef } from '../../navigation/navigationRef';

const RED = '#E53935';

// Rendered inside AppNavigator's shared top-of-screen banner stack (see
// RootBannerStack there) — surfaces "a trip is currently recording" from any
// screen, with a one-tap Stop, rather than requiring the user to know to go
// find the Start/End Trip toggle buried in Route Planner. Matters most for a
// trip auto-detection mis-started (e.g. GPS jitter during onboarding) far
// from Route Planner ever being opened. Does not position itself — the
// shared stack owns layout (see BluetoothVehiclePromptBanner for why).
export default function TripRecordingBanner() {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (!activeTrip) return;
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - activeTrip.startTime) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeTrip]);

  if (!isTracking || !activeTrip) return null;

  async function handleStop() {
    if (!activeTrip) return;
    setIsStopping(true);
    const tripId = activeTrip.id;
    await dispatch(endTrip(tripId));
    setIsStopping(false);
    if (navigationRef.isReady()) navigationRef.navigate('TripSummary', { tripId } as never);
  }

  return (
    <View style={styles.banner}>
      <View style={styles.status}>
        <View style={styles.dot} />
        <Text style={styles.label}>Recording trip · {formatDuration(elapsedSeconds)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.stopBtn, isStopping && styles.stopBtnDisabled]}
        onPress={handleStop}
        disabled={isStopping}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.stopBtnText}>{isStopping ? 'Stopping…' : 'Stop'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: 12, marginBottom: 0, borderRadius: 14, padding: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
    borderLeftWidth: 4, borderLeftColor: RED,
  },
  status: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  label: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  stopBtn: { backgroundColor: RED, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  stopBtnDisabled: { opacity: 0.6 },
  stopBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
