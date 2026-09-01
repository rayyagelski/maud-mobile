import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Callout, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MountainIcon, HourglassIcon, GaugeIcon, LeafIcon, FuelIcon, CloudIcon, WarningTriangleIcon, PhoneIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { useVgdTripDetails } from '../../hooks/useVgdTripDetails';
import { fetchHereRoute, geocodeAddress, type LatLng } from '../../services/here/hereRoutingClient';
import {
  formatDistance, formatDuration, formatSpeed, tripDistanceKm, tripDurationSeconds, tripAvgSpeedKmh,
} from '../../utils/helpers';
import type { MainStackNavigationProp, MyTripRouteProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_HEIGHT = Dimensions.get('window').height * 0.46;

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Sub-components ─────────────────────────────────────────────────────────

function WaypointPin({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.pinCircle, { backgroundColor: color }]}>
        <Text style={styles.pinLabel}>{label}</Text>
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

function PerfRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.perfRow}>
      <View style={styles.perfIconBox}>{icon}</View>
      <Text style={styles.perfLabel}>{label}</Text>
      <Text style={styles.perfValue}>{value}</Text>
    </View>
  );
}

interface BehaviorEvent {
  key: string;
  kind: 'speeding' | 'phone_usage';
  timeMs: number;
  address: string | null;
  actualSpeed: string | null;
  speedLimit: string | null;
  duration: string | null;
}

// mm:ss — these events run seconds to a few minutes, too short for
// formatDuration's whole-minute-or-hour granularity to read as anything but "0min".
function formatShortDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function BehaviorEventRow({ event, last }: { event: BehaviorEvent; last: boolean }) {
  const isSpeeding = event.kind === 'speeding';
  return (
    <>
      <View style={styles.behaviorRow}>
        <View style={styles.behaviorIconBox}>
          {isSpeeding
            ? <WarningTriangleIcon color="#F47920" size={18} />
            : <PhoneIcon color="#E0533D" size={18} />}
        </View>
        <View style={styles.behaviorMain}>
          <View style={styles.behaviorTopRow}>
            <Text style={styles.behaviorTitle}>{isSpeeding ? 'Speeding' : 'Phone Usage'}</Text>
            <Text style={styles.behaviorTime}>
              {new Date(event.timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {event.address && (
            <Text style={styles.behaviorAddress} numberOfLines={2}>{event.address}</Text>
          )}
          {(event.actualSpeed || event.duration) && (
            <Text style={styles.behaviorDetail}>
              {[
                event.actualSpeed && event.speedLimit
                  ? `${event.actualSpeed} in a ${event.speedLimit} zone`
                  : event.actualSpeed,
                event.duration ? `${event.duration} duration` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>
      {!last && <View style={styles.rowDiv} />}
    </>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function MyTripScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const routeProp = useRoute<MyTripRouteProp>();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === routeProp.params?.tripId));
  const isImperial = useIsImperialUnits();
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);

  const routeCoords = trip?.route.map(p => ({ latitude: p.latitude, longitude: p.longitude })) ?? [];
  const distanceKm = trip ? tripDistanceKm(trip) : 0;
  const durationSeconds = trip ? tripDurationSeconds(trip) : 0;
  const avgSpeedKmh = trip ? tripAvgSpeedKmh(trip) : 0;

  // Same VGD read-back TripDetailScreen uses, so this screen's waypoint
  // labels can show resolved addresses instead of always falling back to
  // raw coordinates.
  const vgdEnabled = Boolean(trip?.vgdTripId && trip?.vgdTripCreated);
  const {
    details: vgdDetails, events: vgdEvents, isLoading: vgdLoading, isProcessing: vgdProcessing,
  } = useVgdTripDetails(vgdEnabled ? trip?.vgdTripId : undefined, trip?.vehicleId ?? '');
  const vgdAnalytics = vgdDetails?.analytics;
  // "Resolving address…" instead of silently falling back straight to raw
  // coordinates — vgd_analytics processes asynchronously after trip-end, so
  // this can take a little while, and without a distinct pending state that
  // looked identical to "will never resolve" (real-drive feedback).
  const vgdAddressPending = vgdEnabled && (vgdLoading || vgdProcessing);
  // Over-speed-limit markers on the route, from VGD's server-side detection.
  // gps is filtered defensively here — legacy VGD trip data (this read path
  // only started actually returning data recently) can carry events with a
  // missing/malformed point.
  const speedLimitEvents = vgdEvents.filter(e => e.indicator === 'speed_limit' && e.gps);
  // Phone-usage markers — device-local only (useHarshEventTracker's AppState
  // backgrounding proxy, see MIN_PHONE_USAGE_EVENT_SECONDS), since there's no
  // VGD point parameter for phone usage to round-trip it through the server.
  const phoneUsageEvents = trip?.events.filter(e => e.type === 'phone_usage') ?? [];

  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtSpeedMs = (metersPerSecond: number) => formatSpeed(metersPerSecond * 3.6, isImperial);

  // Speeding/phone-usage events don't get pins on the map for a route-less
  // trip (no polyline to anchor a "where on the drive" callout to, and for
  // 'vgd'-source trips phoneUsageEvents is always empty anyway) — this list
  // is the fallback so the two most safety-relevant event types are still
  // visible with their real detail (address, actual speed, duration, time)
  // instead of silently disappearing along with the map pins.
  const behaviorEvents: BehaviorEvent[] = [
    ...speedLimitEvents.map((event, i): BehaviorEvent => ({
      key: `speed-${event.time}-${i}`,
      kind: 'speeding',
      timeMs: event.time * 1000,
      address: event.parameters.address ?? null,
      actualSpeed: event.parameters.speed != null ? fmtSpeedMs(event.parameters.speed) : null,
      speedLimit: event.parameters.speedLimit != null ? fmtSpeedMs(event.parameters.speedLimit) : null,
      duration: event.parameters.minutes != null
        ? formatShortDuration(event.parameters.minutes * 60)
        : null,
    })),
    ...phoneUsageEvents.map((event, i): BehaviorEvent => ({
      key: `phone-${event.id}-${i}`,
      kind: 'phone_usage',
      timeMs: event.timestamp,
      // No reverse-geocoding available client-side — only raw GpsPoint lat/lng
      // is recorded locally for phone-usage events, unlike VGD's speed_limit
      // events which already carry a server-resolved address.
      address: null,
      actualSpeed: null,
      speedLimit: null,
      duration: event.value != null ? formatShortDuration(event.value) : null,
    })),
  ].sort((a, b) => a.timeMs - b.timeMs);

  // Total CO2 for the trip (VGD's co2emissions is g/km — scale by distance).
  // co2emissions is a non-nullable field on VgdTripAnalytics — unlike
  // fuelConsumption/electricityConsumption it defaults to 0 (not null) when
  // the vehicle never sent co2 point parameters, so a literal 0 here means
  // "no data", not "zero emissions".
  const co2ImpactKg = vgdAnalytics?.co2emissions && distanceKm > 0
    ? (vgdAnalytics.co2emissions * distanceKm) / 1000
    : null;
  // Whichever consumption figure VGD actually has for this vehicle (mobile
  // only sends one of fuel/battery point parameters per vehicle type).
  const consumptionPct = vgdAnalytics?.fuelConsumption ?? vgdAnalytics?.electricityConsumption ?? null;
  const endWeather = vgdAnalytics?.endWeather;
  // skyInfo is a raw HERE sky-condition code (e.g. "7"), not human-readable
  // text — only temperatureDesc ("Hot") is fit to show to a driver.
  const weatherCondition = endWeather?.temperatureDesc ?? null;
  // endWeather.temperature is a bare Celsius numeric string from HERE
  // (see hereWeatherClient.ts) with no unit attached — convert/label it per
  // the user's unit preference instead of printing the raw number.
  const endWeatherTempF = (() => {
    const c = endWeather?.temperature ? parseFloat(endWeather.temperature) : NaN;
    if (!Number.isFinite(c)) return null;
    return isImperial ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
  })();

  // A `source: 'vgd'` trip (backfilled from the backend, see
  // tripHistorySync.ts) has no route — fall back to VGD's own trip_start/
  // trip_end events for waypoint pins, so a restored trip still shows A/B
  // markers even without a driven-path polyline.
  const vgdStartPoint = vgdEvents.find(e => e.indicator === 'trip_start')?.gps;
  const vgdEndPoint = vgdEvents.find(e => e.indicator === 'trip_end')?.gps;
  const eventStart = vgdStartPoint ? { latitude: vgdStartPoint.lat, longitude: vgdStartPoint.lon } : undefined;
  const eventEnd = vgdEndPoint ? { latitude: vgdEndPoint.lat, longitude: vgdEndPoint.lon } : undefined;

  // Last resort for older trips whose stored VGD events predate reliable
  // point data (no route, no trip_start/trip_end coordinates either) —
  // geocode VGD's resolved address strings so restored trips still get A/B
  // pins instead of no map at all. Never used when routeCoords or the VGD
  // events already have real coordinates, only when both are empty.
  const [geocodedStart, setGeocodedStart] = useState<LatLng | null>(null);
  const [geocodedEnd, setGeocodedEnd] = useState<LatLng | null>(null);
  const needsStartGeocode = routeCoords.length === 0 && !eventStart && Boolean(vgdAnalytics?.startAddress);
  const needsEndGeocode = routeCoords.length === 0 && !eventEnd && Boolean(vgdAnalytics?.endAddress);

  useEffect(() => {
    if (!needsStartGeocode || !vgdAnalytics?.startAddress) return undefined;
    let cancelled = false;
    geocodeAddress(vgdAnalytics.startAddress).then((coords) => {
      if (!cancelled && coords) setGeocodedStart(coords);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [needsStartGeocode, vgdAnalytics?.startAddress]);

  useEffect(() => {
    if (!needsEndGeocode || !vgdAnalytics?.endAddress) return undefined;
    let cancelled = false;
    geocodeAddress(vgdAnalytics.endAddress).then((coords) => {
      if (!cancelled && coords) setGeocodedEnd(coords);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [needsEndGeocode, vgdAnalytics?.endAddress]);

  const start = routeCoords[0] ?? eventStart ?? geocodedStart ?? undefined;
  const end = routeCoords[routeCoords.length - 1] ?? eventEnd ?? geocodedEnd ?? undefined;

  // No raw GPS log exists for a route-less trip (see the `route` comment on
  // the Trip type) — request the same HERE road route Route Planner uses
  // between the resolved A/B points as a plausible stand-in path. This is an
  // estimate, not the recorded drive, so it's rendered dashed/muted below
  // rather than in the same solid blue as a real route.
  const [simulatedRoute, setSimulatedRoute] = useState<LatLng[] | null>(null);
  const needsSimulatedRoute = routeCoords.length <= 1 && Boolean(start) && Boolean(end)
    && (start?.latitude !== end?.latitude || start?.longitude !== end?.longitude);

  useEffect(() => {
    if (!needsSimulatedRoute || !start || !end) return undefined;
    let cancelled = false;
    fetchHereRoute(start, end).then((route) => {
      if (!cancelled && route) setSimulatedRoute(route.coordinates);
    }).catch(() => {});
    return () => { cancelled = true; };
    // start/end are plain objects recomputed each render — key the effect off
    // their coordinate values so it doesn't refire every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSimulatedRoute, start?.latitude, start?.longitude, end?.latitude, end?.longitude]);

  useEffect(() => {
    if (!mapReady || !simulatedRoute || simulatedRoute.length < 2) return;
    mapRef.current?.fitToCoordinates(simulatedRoute, {
      edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
      animated: false,
    });
  }, [mapReady, simulatedRoute]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>

      {/* ── Map section ── */}
      <View style={styles.mapContainer}>
        {!start ? (
          // No route, no VGD trip_start/trip_end coordinates, and either no
          // resolved address to geocode yet or geocoding hasn't returned —
          // showing a map centered on some hardcoded fallback region here
          // would put an unrelated trip on a random city with no indication
          // it's not real, so skip the map entirely instead.
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>
              {needsStartGeocode || needsEndGeocode ? 'Locating trip on map…' : 'Map preview unavailable for this trip'}
            </Text>
          </View>
        ) : (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={{ ...start, latitudeDelta: 0.2, longitudeDelta: 0.2 }}
          onMapReady={() => {
            setMapReady(true);
            if (routeCoords.length > 1) {
              mapRef.current?.fitToCoordinates(routeCoords, {
                edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
                animated: false,
              });
            }
          }}
        >
          {mapReady && routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="rgba(255,255,255,0.9)"
              strokeWidth={10}
            />
          )}
          {mapReady && routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="#2B3DE8"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {mapReady && routeCoords.length <= 1 && simulatedRoute && simulatedRoute.length > 1 && (
            <Polyline
              coordinates={simulatedRoute}
              strokeColor="rgba(43,61,232,0.55)"
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={[1, 8]}
            />
          )}
          {mapReady && start && (
            <Marker coordinate={start} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <WaypointPin label="A" color="#3ABFBF" />
            </Marker>
          )}
          {mapReady && end && end !== start && (
            <Marker coordinate={end} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <WaypointPin label="B" color="#1A1A1A" />
            </Marker>
          )}
          {mapReady && speedLimitEvents.map((event, i) => (
            <Marker
              key={`speed-${event.time}-${i}`}
              coordinate={{ latitude: event.gps.lat, longitude: event.gps.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.eventDot} />
              <Callout tooltip={false}>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutTitle}>Over Speed Limit</Text>
                  {event.parameters.speedLimit != null && (
                    <Text style={styles.calloutRow}>Speed Limit: {fmtSpeedMs(event.parameters.speedLimit)}</Text>
                  )}
                  {event.parameters.speed != null && (
                    <Text style={styles.calloutRow}>Your Speed: {fmtSpeedMs(event.parameters.speed)}</Text>
                  )}
                  <Text style={styles.calloutMeta}>
                    {fmtTime(event.time * 1000)}
                    {event.parameters.address ? `, ${event.parameters.address}` : ''}
                  </Text>
                </View>
              </Callout>
            </Marker>
          ))}
          {mapReady && phoneUsageEvents.map((event, i) => (
            <Marker
              key={`phone-${event.id}-${i}`}
              coordinate={{ latitude: event.location.latitude, longitude: event.location.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.eventDot} />
              <Callout tooltip={false}>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutTitle}>Phone Usage</Text>
                  <Text style={styles.calloutMeta}>
                    {event.value != null
                      ? `${fmtTime(event.timestamp - event.value * 1000)} - ${fmtTime(event.timestamp)}`
                      : fmtTime(event.timestamp)}
                  </Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
        )}

        {/* Floating back button */}
        <SafeAreaView edges={['top']} style={styles.mapOverlay} pointerEvents="box-none">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          {routeCoords.length <= 1 && simulatedRoute && simulatedRoute.length > 1 && (
            <View style={styles.estimatedRouteBadge} pointerEvents="none">
              <Text style={styles.estimatedRouteBadgeText}>Estimated route</Text>
            </View>
          )}
        </SafeAreaView>
      </View>

      {/* ── Bottom scrollable panel ── */}
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {!trip ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>Trip not found.</Text>
          </View>
        ) : (
          <>
            {/* Route + stats (single card) */}
            <View style={styles.card}>
              <View style={styles.wpRow}>
                <View style={[styles.wpDot, styles.wpDotA]}>
                  <Text style={styles.wpDotText}>A</Text>
                </View>
                <View style={styles.wpInfo}>
                  <Text style={styles.wpMain}>
                    {vgdAnalytics?.startAddress
                      ?? (vgdAddressPending ? 'Resolving address…'
                        : (start ? `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}` : '—'))}
                  </Text>
                </View>
              </View>
              <View style={styles.wpConnector} />
              <View style={styles.wpRow}>
                <View style={[styles.wpDot, styles.wpDotB]}>
                  <Text style={styles.wpDotText}>B</Text>
                </View>
                <View style={styles.wpInfo}>
                  <Text style={styles.wpMain}>
                    {vgdAnalytics?.endAddress
                      ?? (vgdAddressPending ? 'Resolving address…'
                        : (end ? `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}` : '—'))}
                  </Text>
                </View>
              </View>
              <View style={styles.cardDivider} />
              <PerfRow icon={<MountainIcon color="#999" size={18} />} label="Distance" value={formatDistance(distanceKm, isImperial)} />
              <View style={styles.rowDiv} />
              <PerfRow icon={<HourglassIcon color="#999" size={18} />} label="Duration" value={formatDuration(durationSeconds)} />
              <View style={styles.rowDiv} />
              <PerfRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value={formatSpeed(avgSpeedKmh, isImperial)} />
            </View>

            {/* Driving behavior — speeding/phone-usage fallback list, since
                these events have no route/polyline to be pinned against for
                a route-less (VGD-backfilled) trip. */}
            {behaviorEvents.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>DRIVING BEHAVIOR</Text>
                <View style={styles.card}>
                  {behaviorEvents.map((event, i) => (
                    <BehaviorEventRow key={event.key} event={event} last={i === behaviorEvents.length - 1} />
                  ))}
                </View>
              </>
            )}

            {/* Cost & Consumption — trip-level VGD figures */}
            {vgdEnabled && (
              <>
                <Text style={styles.sectionLabel}>COST & CONSUMPTION</Text>
                <View style={styles.costRow}>
                  <View style={styles.costCard}>
                    <View style={styles.costCardHeader}>
                      <LeafIcon color="#999" size={16} />
                      <Text style={styles.costCardLabel}> CO₂ Emissions</Text>
                    </View>
                    <Text style={styles.costValue}>
                      {co2ImpactKg != null ? `${co2ImpactKg.toFixed(1)} kg` : '—'}
                    </Text>
                  </View>
                  <View style={styles.costCard}>
                    <View style={styles.costCardHeader}>
                      <FuelIcon color="#999" size={16} />
                      <Text style={styles.costCardLabel}> Consumption</Text>
                    </View>
                    <Text style={styles.costValue}>
                      {consumptionPct != null ? `${consumptionPct.toFixed(1)}%` : '—'}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Weather at trip end (destination) */}
            {endWeather && (endWeatherTempF || weatherCondition) && (
              <>
                <Text style={styles.sectionLabel}>WEATHER</Text>
                <View style={styles.weatherCard}>
                  <View style={styles.weatherTopRow}>
                    <Text style={styles.weatherDate}>
                      {trip.endTime ? new Date(trip.endTime).toLocaleDateString() : ''}
                    </Text>
                    {endWeatherTempF ? (
                      <Text style={styles.weatherTemp}>{endWeatherTempF}</Text>
                    ) : null}
                  </View>
                  <View style={styles.weatherBottomRow}>
                    <Text style={styles.weatherCity} numberOfLines={0}>
                      {vgdAnalytics?.endAddress ?? 'Destination'}
                    </Text>
                    <View style={styles.weatherConditionGroup}>
                      <CloudIcon color="#5B9BD5" size={20} />
                      {weatherCondition ? <Text style={styles.weatherCondition}>{weatherCondition}</Text> : null}
                    </View>
                  </View>
                </View>
              </>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  // Map
  mapContainer: { height: MAP_HEIGHT, backgroundColor: '#E8F0E8' },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  mapPlaceholderText: { fontSize: 14, color: '#888', textAlign: 'center' },
  mapOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  backBtn: {
    marginHorizontal: 16, marginTop: 8,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  estimatedRouteBadge: {
    marginHorizontal: 16, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  estimatedRouteBadgeText: { fontSize: 12, fontWeight: '600', color: '#555555' },

  // Waypoint pins
  pinCircle: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  pinLabel: { color: 'white', fontWeight: '800', fontSize: 13 },
  eventDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#E53935', borderWidth: 2, borderColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 4,
  },
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },

  // Bottom scroll
  scrollContainer: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 36 },

  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Waypoints
  wpRow: { flexDirection: 'row', alignItems: 'center' },
  wpDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  wpDotA: { backgroundColor: '#3ABFBF' },
  wpDotB: { backgroundColor: '#1A1A1A' },
  wpDotText: { fontSize: 12, fontWeight: '700', color: 'white' },
  wpInfo: { flex: 1 },
  wpMain: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 1 },
  wpSub: { fontSize: 12, color: '#999' },
  wpConnector: { width: 1.5, height: 14, backgroundColor: '#DDDDDD', marginLeft: 13, marginVertical: 5 },
  cardDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },

  // Perf rows
  rowDiv: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 2 },
  perfRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  perfIconBox: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  perfLabel: { flex: 1, fontSize: 14, color: '#555' },
  perfValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },

  // Section label
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.4, marginBottom: 10 },

  // Driving behavior (speeding / phone-usage list)
  behaviorRow: { flexDirection: 'row', paddingVertical: 12 },
  behaviorIconBox: { width: 26, height: 26, justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 1 },
  behaviorMain: { flex: 1 },
  behaviorTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  behaviorTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  behaviorTime: { fontSize: 13, color: '#888888' },
  behaviorAddress: { fontSize: 13, color: '#555555', marginTop: 2 },
  behaviorDetail: { fontSize: 13, color: '#888888', marginTop: 2 },

  // Cost & Consumption
  costRow: { flexDirection: 'row', columnGap: 12, marginBottom: 16 },
  costCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  costCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  costCardLabel: { fontSize: 12, color: '#888' },
  costValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },

  // Weather (trip end / destination)
  weatherCard: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  weatherTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weatherDate: { fontSize: 14, color: '#888888' },
  weatherTemp: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  weatherBottomRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginTop: 6, columnGap: 10,
  },
  weatherCity: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  weatherConditionGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', columnGap: 6 },
  weatherCondition: { fontSize: 14, color: '#666666' },

  // Event marker popups (speed limit / phone usage)
  calloutBox: { minWidth: 180, padding: 4 },
  calloutTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  calloutRow: { fontSize: 12, color: '#333333', marginBottom: 2 },
  calloutMeta: { fontSize: 11, color: '#888888', marginTop: 2 },

  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', padding: 24 },
});
