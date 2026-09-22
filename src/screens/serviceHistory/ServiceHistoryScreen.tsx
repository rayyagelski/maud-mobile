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
  ComponentCondition, ComponentConditionStatus, UpcomingServicesResponse, VehicleComponent,
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

// "Upcoming Services" = the manufacturer-listed jobs at the vehicle's next
// service visit (the one the header describes) — not independent per-job
// predictions. Every row shares that visit's date, shown in the calendar
// slot on the right.
function formatCalendarDate(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  };
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
  const [upcoming, setUpcoming] = useState<UpcomingServicesResponse | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    dispatch(fetchServiceRecords(vehicleId));
    vehiclesApi.getOdometer(vehicleId)
      .then(res => setOdometer(res.data.odometer))
      .catch(() => setOdometer(null));
    serviceRecordsApi.getCondition(vehicleId)
      .then(setCondition)
      .catch(() => setCondition(null));
    serviceRecordsApi.getUpcomingServices(vehicleId)
      .then(setUpcoming)
      .catch(() => setUpcoming(null));
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

  const upcomingServices = upcoming?.available ? upcoming.services : [];
  // The visit's milestone in the manufacturer's own unit (miles) or km.
  const milestoneLabel = upcoming?.nextService
    ? `${(isImperial ? upcoming.nextService.milestoneMileageMiles : Math.round(upcoming.nextService.milestoneMileageKm)).toLocaleString()} ${distanceUnit}`
    : null;

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
            {milestoneLabel && (
              <Text style={styles.nextCardMilestone}>{milestoneLabel}</Text>
            )}
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

        {/* Upcoming Services — the jobs at the next service visit */}
        <SectionHeader
          title="UPCOMING SERVICES"
          expanded={alertsOpen}
          onToggle={() => setAlertsOpen(v => !v)}
        />
        {alertsOpen && (
          <View style={styles.card}>
            {upcomingServices.length > 0 && (
              <Text style={styles.upcomingIntro}>
                Manufacturer schedule for the service above
                {upcoming?.nextService?.anchor === 'odometer' ? ' (based on your current mileage)' : ''}:
              </Text>
            )}
            {upcomingServices.map((service, i) => {
              const cal = service.dueDate ? formatCalendarDate(service.dueDate) : null;
              return (
                <View
                  key={service.name}
                  style={[styles.alertRow, i < upcomingServices.length - 1 && styles.rowBorder]}
                >
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertTitle}>{service.name}</Text>
                    {service.action && (
                      <Text style={styles.alertSub}>{service.action}</Text>
                    )}
                  </View>
                  {cal ? (
                    <View style={styles.calendar} accessibilityLabel={`Due ${new Date(service.dueDate as string).toLocaleDateString()}`}>
                      <Text style={styles.calendarMonth}>{cal.month}</Text>
                      <Text style={styles.calendarDay}>{cal.day}</Text>
                    </View>
                  ) : (
                    <View style={[styles.calendar, styles.calendarEmpty]}>
                      <Text style={styles.calendarMonth}>DATE</Text>
                      <Text style={styles.calendarDash}>—</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {(upcoming === null || !upcoming.available) && (
              <Text style={styles.emptyText}>Maintenance schedule unavailable for this vehicle right now.</Text>
            )}
            {upcoming?.available && upcomingServices.length === 0 && (
              <Text style={styles.emptyText}>No manufacturer services listed for the next interval.</Text>
            )}
            {upcoming?.available && upcomingServices.length > 0 && !upcoming.nextService?.dueDate && (
              <Text style={styles.condHint}>
                Add a service record to get a due date — the mileage comes from the manufacturer schedule.
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
  // The manufacturer schedule milestone (e.g. "37,500 miles") — the
  // number that actually determines which services are listed below,
  // promoted above the date/mileage detail rows per user request.
  nextCardMilestone: { fontSize: 30, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },
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
  upcomingIntro: { fontSize: 13, color: '#666', paddingTop: 14, paddingBottom: 4 },
  // Calendar-page tile in the slot the old action button occupied.
  calendar: {
    width: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center',
    backgroundColor: 'white', borderWidth: 1, borderColor: '#E3E3E3',
  },
  calendarEmpty: { opacity: 0.5 },
  calendarMonth: {
    alignSelf: 'stretch', textAlign: 'center', backgroundColor: TEAL, color: 'white',
    fontSize: 10, fontWeight: '800', letterSpacing: 0.5, paddingVertical: 3,
  },
  calendarDay: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', paddingVertical: 4 },
  calendarDash: { fontSize: 18, color: '#999', paddingVertical: 5 },

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
