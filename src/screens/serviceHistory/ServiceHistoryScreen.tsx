import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { CalendarIcon, ChevronIcon } from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { fetchServiceRecords } from '../../store/slices/serviceRecordSlice';
import { vehiclesApi, serviceRecordsApi } from '../../api';
import { kmToMiles } from '../../utils/helpers';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type {
  ComponentCondition, ComponentConditionStatus, ServicePrediction, ServiceUrgency, VehicleComponent,
} from '../../types/serviceRecord.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const GREEN = '#27AE60';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// Driver-reported condition — there is no wear sensor source (no OBD, no
// telemetry), so this is explicitly the driver's own three-state rating,
// tapped through in place and synced to the backend so the web sees the
// same value.
const COMPONENT_LABELS: Record<VehicleComponent, string> = {
  brakes: 'Brakes',
  tires: 'Tires',
  battery: 'Battery',
  alignment: 'Alignment',
};
const CONDITION_ORDER: VehicleComponent[] = ['brakes', 'tires', 'battery', 'alignment'];
const STATUS_CYCLE: ComponentConditionStatus[] = ['good', 'warning', 'bad'];
const STATUS_META: Record<ComponentConditionStatus, { label: string; color: string }> = {
  good: { label: 'Good', color: GREEN },
  warning: { label: 'Warning', color: '#F5A623' },
  bad: { label: 'Bad', color: '#E5484D' },
};

// Predictive alerts come from the backend's ServicePredictionService (one
// per catalog job, most urgent first). Only the actionable band is listed
// here — an "ok" job months/thousands of km away isn't an alert.
const ALERT_URGENCIES: ServiceUrgency[] = ['overdue', 'due_soon', 'upcoming'];
const MAX_ALERTS = 6;

function describePrediction(p: ServicePrediction, isImperial: boolean): string {
  const parts: string[] = [];
  if (p.kmRemaining != null) {
    const dist = isImperial ? kmToMiles(p.kmRemaining) : p.kmRemaining;
    const unit = isImperial ? 'mi' : 'km';
    parts.push(dist < 0
      ? `${Math.round(-dist).toLocaleString()} ${unit} overdue`
      : `~${Math.round(dist).toLocaleString()} ${unit}`);
  }
  if (p.daysRemaining != null) {
    parts.push(p.daysRemaining < 0
      ? `${-p.daysRemaining} days overdue`
      : `~${p.daysRemaining} days`);
  }
  const when = parts.join(' · ') || 'Due date unknown';
  return p.estimated ? `${when} · estimated` : when;
}

function currencySymbol(code: string): string {
  return { EUR: '€', USD: '$', GBP: '£' }[code] ?? code;
}

// ── Local icons ────────────────────────────────────────────────────────────

function SearchIcon({ color = '#1A1A1A', size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={1.8} />
      <Path d="M21 21l-4.35-4.35" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function WrenchIcon({ color = 'white', size = 24 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({
  title, expanded, onToggle,
}: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ChevronIcon open={expanded} color="#1A1A1A" size={20} />
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function ServiceHistoryScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const dispatch = useAppDispatch();
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { records } = useAppSelector(s => s.serviceRecords);
  const vehicleId = (selectedVehicle ?? vehicles[0])?.id;
  const isImperial = useIsImperialUnits();

  const [conditionOpen, setConditionOpen] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(true);
  // Always canonical km, matching the backend/VGD schema — converted to
  // miles only at the display edge below, for imperial-locale customers.
  const [odometer, setOdometer] = useState<number | null>(null);
  const displayOdometer = odometer != null && isImperial ? kmToMiles(odometer) : odometer;
  const [condition, setCondition] = useState<ComponentCondition[] | null>(null);
  const [savingComponent, setSavingComponent] = useState<VehicleComponent | null>(null);
  const [predictions, setPredictions] = useState<ServicePrediction[] | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    dispatch(fetchServiceRecords(vehicleId));
    vehiclesApi.getOdometer(vehicleId)
      .then(res => setOdometer(res.data.odometer))
      .catch(() => setOdometer(null));
    serviceRecordsApi.getCondition(vehicleId)
      .then(setCondition)
      .catch(() => setCondition(null));
    serviceRecordsApi.getPredictions(vehicleId)
      .then(setPredictions)
      .catch(() => setPredictions(null));
  }, [vehicleId, dispatch]);

  // Tap cycles good -> warning -> bad -> good. Optimistic: the pill changes
  // immediately, and reverts to the server's answer only if the save fails.
  async function cycleCondition(component: VehicleComponent) {
    if (!vehicleId || savingComponent || !condition) return;
    const current = condition.find(c => c.component === component)?.status ?? 'good';
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    const previous = condition;
    setCondition(condition.map(c => (c.component === component ? { ...c, status: next } : c)));
    setSavingComponent(component);
    try {
      setCondition(await serviceRecordsApi.setCondition(vehicleId, component, next));
    } catch {
      setCondition(previous);
    } finally {
      setSavingComponent(null);
    }
  }

  const sortedRecords = [...records].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const mostRecentWithDueDate = sortedRecords.find(r => r.nextDueDate);
  const daysUntilDue = mostRecentWithDueDate?.nextDueDate
    ? Math.round((new Date(mostRecentWithDueDate.nextDueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  // Next-due mileage from the same record as the date (km on the wire).
  const nextDueMileageKm = mostRecentWithDueDate?.nextDueMileage ?? null;
  const displayNextDueMileage = nextDueMileageKm != null && isImperial ? kmToMiles(nextDueMileageKm) : nextDueMileageKm;
  const distanceUntilDue = displayNextDueMileage != null && displayOdometer != null
    ? displayNextDueMileage - displayOdometer : null;
  const distanceUnit = isImperial ? 'miles' : 'km';

  const alerts = (predictions ?? [])
    .filter(p => ALERT_URGENCIES.includes(p.urgency))
    .slice(0, MAX_ALERTS);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Service History</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity hitSlop={HIT}>
              <SearchIcon />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Next Service Due card */}
        <View style={styles.nextCard}>
          <View style={styles.nextCardTop}>
            <View style={styles.serviceIconBox}>
              <WrenchIcon color="white" size={26} />
            </View>
            <Text style={styles.nextCardTitle}>Next Service Due</Text>
          </View>
          <View style={styles.nextCardBody}>
            {mostRecentWithDueDate?.nextDueDate ? (
              <View style={styles.infoRow}>
                <CalendarIcon color="#555" size={15} />
                <Text style={styles.infoText}>
                  {'  '}Due {new Date(mostRecentWithDueDate.nextDueDate).toLocaleDateString()}
                  {daysUntilDue !== null && (
                    <Text style={styles.infoGray}> (~{daysUntilDue} days)</Text>
                  )}
                </Text>
              </View>
            ) : (
              <Text style={styles.infoText}>No upcoming service scheduled.</Text>
            )}
            {displayNextDueMileage != null && (
              <View style={styles.infoRow}>
                <WrenchIcon color="#555" size={15} />
                <Text style={styles.infoText}>
                  {'  '}At {Math.round(displayNextDueMileage).toLocaleString()} {distanceUnit}
                  {distanceUntilDue != null && (
                    <Text style={styles.infoGray}>
                      {distanceUntilDue >= 0
                        ? ` (~${Math.round(distanceUntilDue).toLocaleString()} ${distanceUnit} to go)`
                        : ` (${Math.round(-distanceUntilDue).toLocaleString()} ${distanceUnit} overdue)`}
                    </Text>
                  )}
                </Text>
              </View>
            )}
            {displayOdometer !== null && (
              <Text style={styles.currentKm}>
                Currently at <Text style={styles.currentKmBold}>
                  {Math.round(displayOdometer).toLocaleString()} {distanceUnit}
                </Text>
              </Text>
            )}
          </View>
        </View>

        {/* Overall Vehicle Condition */}
        <SectionHeader
          title="OVERALL VEHICLE CONDITION"
          expanded={conditionOpen}
          onToggle={() => setConditionOpen(v => !v)}
        />
        {conditionOpen && (
          <View style={styles.card}>
            {CONDITION_ORDER.map((component, i) => {
              const status = condition?.find(c => c.component === component)?.status ?? 'good';
              const meta = STATUS_META[status];
              return (
                <View
                  key={component}
                  style={[styles.condRow, i < CONDITION_ORDER.length - 1 && styles.rowBorder]}
                >
                  <Text style={styles.condLabel}>{COMPONENT_LABELS[component]}</Text>
                  <TouchableOpacity
                    style={[styles.condPill, { backgroundColor: meta.color }, savingComponent === component && styles.condPillSaving]}
                    onPress={() => cycleCondition(component)}
                    disabled={!condition || savingComponent !== null}
                    activeOpacity={0.7}
                    accessibilityLabel={`${COMPONENT_LABELS[component]} condition: ${meta.label}. Tap to change.`}
                  >
                    <Text style={styles.condPillText}>{meta.label}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <Text style={styles.condHint}>Tap a rating to change it.</Text>
          </View>
        )}

        {/* Predictive Alerts */}
        <SectionHeader
          title="PREDICTIVE ALERTS"
          expanded={alertsOpen}
          onToggle={() => setAlertsOpen(v => !v)}
        />
        {alertsOpen && (
          <View style={styles.card}>
            {alerts.map((alert, i) => {
              const urgent = alert.urgency === 'overdue' || alert.urgency === 'due_soon';
              return (
                <View
                  key={alert.jobType}
                  style={[styles.alertRow, i < alerts.length - 1 && styles.rowBorder]}
                >
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertTitle}>{alert.label}</Text>
                    <Text style={[styles.alertSub, alert.urgency === 'overdue' && styles.alertSubOverdue]}>
                      {describePrediction(alert, isImperial)}
                    </Text>
                  </View>
                  <View style={[styles.actionBtn, urgent ? styles.actionPrimary : styles.actionSecondary]}>
                    <Text style={[styles.actionText, !urgent && styles.actionTextSecondary]}>
                      {alert.urgency === 'overdue' ? 'Overdue' : urgent ? 'Due soon' : 'Upcoming'}
                    </Text>
                  </View>
                </View>
              );
            })}
            {predictions === null && (
              <Text style={styles.emptyText}>Predictions unavailable right now.</Text>
            )}
            {predictions !== null && alerts.length === 0 && (
              <Text style={styles.emptyText}>Nothing due in the next few months.</Text>
            )}
            {alerts.some(a => a.estimated) && (
              <Text style={styles.condHint}>
                "Estimated" items have no recorded service yet and assume the typical interval for this job.
              </Text>
            )}
          </View>
        )}

        {/* Past Service */}
        <SectionHeader
          title="PAST SERVICE"
          expanded={pastOpen}
          onToggle={() => setPastOpen(v => !v)}
        />
        {pastOpen && (
          <View style={styles.card}>
            {sortedRecords.map((record, i) => (
              <TouchableOpacity
                key={record.id}
                style={[styles.pastRow, i < sortedRecords.length - 1 && styles.rowBorder]}
                onPress={() => navigation.navigate('Invoice', { serviceId: String(record.id), vehicleId: String(vehicleId) })}
                activeOpacity={0.7}
              >
                <View style={styles.pastInfo}>
                  <Text style={styles.pastDate}>
                    {record.date ? new Date(record.date).toLocaleDateString() : '—'}
                  </Text>
                  <Text style={styles.pastShop}>{record.shop.name}</Text>
                </View>
                <Text style={styles.pastCost}>{currencySymbol(record.currencyCode)}{record.totalCost.toFixed(2)}</Text>
                <Text style={styles.pastArrow}>›</Text>
              </TouchableOpacity>
            ))}
            {sortedRecords.length === 0 && (
              <Text style={styles.emptyText}>No service records yet.</Text>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#EEEEEE' },
  scroll: { padding: 16, paddingBottom: 40 },

  // Next Service Due card
  nextCard: {
    backgroundColor: '#E6F5F5', borderRadius: 18, padding: 16, marginBottom: 24,
  },
  nextCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  serviceIconBox: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: TEAL, justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  nextCardTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  nextCardBody: { paddingLeft: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  infoText: { fontSize: 14, color: '#333' },
  infoGray: { color: '#888' },
  currentKm: { fontSize: 13, color: '#888', marginTop: 2 },
  currentKmBold: { fontWeight: '700', color: '#555' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.3 },

  // Card base
  card: {
    backgroundColor: 'white', borderRadius: 18, paddingHorizontal: 16, marginBottom: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },

  // Condition rows
  condRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
  },
  condLabel: { fontSize: 15, color: '#333' },
  condPill: {
    borderRadius: 22, paddingHorizontal: 22, paddingVertical: 9, minWidth: 96, alignItems: 'center',
  },
  condPillSaving: { opacity: 0.6 },
  condPillText: { fontSize: 14, fontWeight: '700', color: 'white' },
  condHint: { fontSize: 12, color: '#999', textAlign: 'center', paddingVertical: 10 },

  // Alert rows
  alertRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
  },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  alertSub: { fontSize: 13, color: '#888' },
  alertSubOverdue: { color: '#E5484D', fontWeight: '600' },
  actionBtn: { borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 },
  actionPrimary: { backgroundColor: '#F57C00' },
  actionSecondary: { backgroundColor: '#EEEEEE' },
  actionText: { fontSize: 14, fontWeight: '700', color: 'white' },
  actionTextSecondary: { color: '#555' },

  // Past service rows
  pastRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
  },
  pastInfo: { flex: 1 },
  pastDate: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  pastShop: { fontSize: 13, color: '#888' },
  pastCost: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginRight: 10 },
  pastArrow: { fontSize: 20, color: '#CCCCCC' },
  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 16 },
});
