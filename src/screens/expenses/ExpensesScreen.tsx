import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  FuelIcon, ShieldIcon, GearIcon, ChevronIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { fetchExpenses, fetchExpenseSummary } from '../../store/slices/expenseSlice';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Expense, ExpenseSummaryCategory } from '../../types/expense.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];

const CATEGORY_META: Record<ExpenseSummaryCategory, { label: string; iconKey: IconKey; color: string }> = {
  fuel: { label: 'Fuel / Energy', iconKey: 'fuel', color: TEAL },
  leasing: { label: 'Leasing / Finance', iconKey: 'card', color: '#F5A623' },
  insurance: { label: 'Insurance', iconKey: 'shield', color: '#5B9BD5' },
  tax: { label: 'Tax', iconKey: 'tax', color: '#E040FB' },
  service: { label: 'Service & Maintenance', iconKey: 'wrench', color: TEAL },
  other: { label: 'Other', iconKey: 'other', color: '#9CA3AF' },
};
const CATEGORY_ORDER: ExpenseSummaryCategory[] = ['fuel', 'leasing', 'insurance', 'tax', 'service', 'other'];

type IconKey = 'fuel' | 'card' | 'shield' | 'tax' | 'wrench' | 'other';

function timeframeDays(label: string): number {
  return parseInt(label, 10) || 28;
}

function currencySymbol(code: string): string {
  return { EUR: '€', USD: '$', GBP: '£' }[code] ?? code;
}

function buildWeeklyBuckets(expenses: Expense[], days: number): number[] {
  const weeks = Math.min(8, Math.max(1, Math.ceil(days / 7)));
  const now = Date.now();
  const totals = new Array(weeks).fill(0);
  for (const expense of expenses) {
    const ageDays = (now - new Date(expense.expenseDate).getTime()) / (24 * 60 * 60 * 1000);
    const bucketIndex = weeks - 1 - Math.floor(ageDays / 7);
    if (bucketIndex >= 0 && bucketIndex < weeks) {
      totals[bucketIndex] += expense.amount;
    }
  }
  const max = Math.max(1, ...totals);
  return totals.map(t => Math.round((t / max) * 100));
}

// ── Local icons ────────────────────────────────────────────────────────────

function CreditCardIcon({ color = '#888', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={1} y={4} width={22} height={16} rx={2} stroke={color} strokeWidth={1.8} />
      <Path d="M1 10h22" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function ReceiptIcon({ color = '#888', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16l3-2 2 2 3-2 3 2 2-2 3 2V4a2 2 0 00-2-2z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M9 9h6M9 13h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function ToolIcon({ color = '#888', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusIcon({ color = 'white', size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function ItemIcon({ iconKey, size = 18 }: { iconKey: IconKey; size?: number }) {
  const color = '#888';
  switch (iconKey) {
    case 'fuel': return <FuelIcon color={color} size={size} />;
    case 'card': return <CreditCardIcon color={color} size={size} />;
    case 'shield': return <ShieldIcon color={color} size={size} />;
    case 'tax': return <ReceiptIcon color={color} size={size} />;
    case 'wrench': return <ToolIcon color={color} size={size} />;
    case 'other': return <GearIcon color={color} size={size} />;
  }
}

// ── Weekly bar chart ───────────────────────────────────────────────────────

function WeeklyChart({ bars }: { bars: number[] }) {
  const MAX_H = 74;
  return (
    <View style={chartSt.wrapper}>
      {bars.map((pct, i) => (
        <View key={i} style={chartSt.col}>
          <View style={[chartSt.bar, { height: Math.round((pct / 100) * MAX_H) }]} />
          <Text style={chartSt.lbl}>W{i + 1}</Text>
        </View>
      ))}
    </View>
  );
}
const chartSt = StyleSheet.create({
  wrapper: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: 94, columnGap: 5, marginVertical: 16,
  },
  col: { flex: 1, alignItems: 'center' },
  bar: {
    width: '100%', backgroundColor: TEAL,
    borderTopLeftRadius: 4, borderTopRightRadius: 4, borderRadius: 3,
  },
  lbl: { fontSize: 10, color: '#AAAAAA', marginTop: 5 },
});

// ── Cost item card ─────────────────────────────────────────────────────────

function CostItemCard({ category, amount, maxAmount, currencyCode }: {
  category: ExpenseSummaryCategory; amount: number; maxAmount: number; currencyCode: string;
}) {
  const meta = CATEGORY_META[category];
  const barPct = maxAmount > 0 ? Math.round((amount / maxAmount) * 100) : 0;
  return (
    <View style={styles.costCard}>
      <View style={styles.costTop}>
        <View style={styles.costLeft}>
          <View style={styles.costLabelRow}>
            <ItemIcon iconKey={meta.iconKey} />
            <Text style={styles.costLabel}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.costRight}>
          <Text style={styles.costAmount}>{currencySymbol(currencyCode)}{amount.toFixed(2)}</Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${barPct}%` as any, backgroundColor: meta.color }]} />
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const dispatch = useAppDispatch();
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { expenses, summary } = useAppSelector(s => s.expenses);
  const vehicleId = (selectedVehicle ?? vehicles[0])?.id;

  const [activeTab, setActiveTab] = useState<'Analytics' | 'Prediction'>('Analytics');
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const days = timeframeDays(selectedTime);

  useEffect(() => {
    if (!vehicleId) return;
    dispatch(fetchExpenses({ vehicleId, days }));
    dispatch(fetchExpenseSummary({ vehicleId, days }));
  }, [vehicleId, days, dispatch]);

  function selectTime(t: string) {
    setSelectedTime(t);
    setDropdownOpen(false);
  }

  const dataset = activeTab === 'Analytics' ? summary?.actual : summary?.predicted;
  const total = activeTab === 'Analytics' ? summary?.totalActual ?? 0 : summary?.totalPredicted ?? 0;
  const currencyCode = summary?.currencyCode ?? 'EUR';
  const monthlyProjected = (total / Math.max(1, days)) * 30;
  const annualProjected = monthlyProjected * 12;
  const perDay = total / Math.max(1, days);
  const maxCategoryAmount = Math.max(1, ...Object.values(dataset ?? {}));
  const weeklyBars = useMemo(() => buildWeeklyBuckets(expenses, days), [expenses, days]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Expenses</Text>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={() => vehicleId && navigation.navigate('AddExpense', { vehicleId })}
            disabled={!vehicleId}
          >
            <View style={styles.addBtn}>
              <PlusIcon size={18} />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Analytics / Prediction segment */}
        <View style={styles.segment}>
          {(['Analytics', 'Prediction'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.segTab, activeTab === tab && styles.segTabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.85}
            >
              <Text style={[styles.segText, activeTab === tab && styles.segTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Timeframe pills */}
        <View style={styles.pillWrapper}>
          <View style={styles.pillRow}>
            {TIMEFRAMES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, selectedTime === t && styles.pillActive]}
                onPress={() => selectTime(t)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, selectedTime === t && styles.pillTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.pill, dropdownOpen && styles.pillActive]}
              onPress={() => setDropdownOpen(v => !v)}
              activeOpacity={0.8}
            >
              <ChevronIcon open={dropdownOpen} color={dropdownOpen ? 'white' : '#555'} size={18} />
            </TouchableOpacity>
          </View>
          {dropdownOpen && (
            <View style={styles.dropdownCard}>
              {DROPDOWN_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.dropdownItem, i < DROPDOWN_OPTIONS.length - 1 && styles.dropdownItemBorder]}
                  onPress={() => selectTime(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dropdownText, selectedTime === opt && styles.dropdownTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Vehicle Operating Costs card */}
        <View style={styles.card}>
          <View style={styles.costsHeader}>
            <Text style={styles.costsTitle}>Vehicle Operating Costs</Text>
            <Text style={styles.costsChip}>Last {selectedTime}</Text>
          </View>
          <Text style={styles.totalAmount}>{currencySymbol(currencyCode)}{total.toFixed(2)}</Text>
          <Text style={styles.totalLabel}>Total Vehicle Cost</Text>
          <Text style={styles.perDay}>{currencySymbol(currencyCode)}{perDay.toFixed(2)}/day</Text>
          <WeeklyChart bars={weeklyBars} />
          <View style={styles.cardDivider} />
          <View style={styles.projRow}>
            <View>
              <Text style={styles.projLabel}>Monthly (Projected):</Text>
              <Text style={styles.projValue}>{currencySymbol(currencyCode)}{monthlyProjected.toFixed(2)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.projLabel}>Annual</Text>
              <Text style={styles.projValue}>{currencySymbol(currencyCode)}{annualProjected.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Cost Breakdown */}
        <Text style={styles.sectionTitle}>COST BREAKDOWN</Text>
        {CATEGORY_ORDER.filter(cat => (dataset?.[cat] ?? 0) > 0).map(cat => (
          <CostItemCard
            key={cat}
            category={cat}
            amount={dataset?.[cat] ?? 0}
            maxAmount={maxCategoryAmount}
            currencyCode={currencyCode}
          />
        ))}
        {(!dataset || Object.keys(dataset).length === 0) && (
          <Text style={styles.emptyText}>
            {activeTab === 'Analytics'
              ? 'No expenses logged in this range yet.'
              : 'Not enough history yet to project future costs.'}
          </Text>
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
  divider: { height: 1, backgroundColor: '#EEEEEE' },
  scroll: { padding: 16, paddingBottom: 40 },

  addBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: TEAL,
    justifyContent: 'center', alignItems: 'center',
  },

  // Segment control
  segment: {
    flexDirection: 'row', backgroundColor: '#EEEEEE', borderRadius: 14,
    padding: 4, marginBottom: 20,
  },
  segTab: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  segTabActive: { backgroundColor: TEAL },
  segText: { fontSize: 15, fontWeight: '600', color: '#888' },
  segTextActive: { color: 'white' },

  // Pills
  pillWrapper: { marginBottom: 16, zIndex: 20 },
  pillRow: { flexDirection: 'row', columnGap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#DDD', backgroundColor: 'white',
    justifyContent: 'center', alignItems: 'center',
  },
  pillActive: { backgroundColor: TEAL, borderColor: TEAL },
  pillText: { fontSize: 14, fontWeight: '500', color: '#555' },
  pillTextActive: { color: 'white', fontWeight: '600' },

  // Dropdown
  dropdownCard: {
    position: 'absolute', top: 50, right: 0,
    backgroundColor: 'white', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15,
    shadowRadius: 12, elevation: 20, minWidth: 150, zIndex: 30,
  },
  dropdownItem: { paddingHorizontal: 20, paddingVertical: 14 },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropdownText: { fontSize: 14, color: '#333', fontWeight: '500' },
  dropdownTextActive: { color: TEAL, fontWeight: '700' },

  // Card base
  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Operating costs card internals
  costsHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  costsTitle: { fontSize: 13, color: '#888' },
  costsChip: { fontSize: 12, color: '#AAAAAA' },
  totalAmount: { fontSize: 34, fontWeight: '800', color: '#1A1A1A', marginBottom: 2 },
  totalLabel: { fontSize: 13, color: '#999', marginBottom: 4 },
  perDay: { fontSize: 18, fontWeight: '700', color: TEAL },
  cardDivider: { height: 1, backgroundColor: '#F0F0F0', marginTop: 4, marginBottom: 14 },
  projRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  projLabel: { fontSize: 13, color: '#888', marginBottom: 3 },
  projValue: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.3, marginBottom: 12 },

  // Cost item card
  costCard: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  costTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  costLeft: { flex: 1, paddingRight: 12 },
  costLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  costLabel: { fontSize: 14, color: '#444', marginLeft: 8 },
  costRight: { alignItems: 'flex-end' },
  costAmount: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },

  // Progress bar
  barTrack: { height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },

  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 16 },
});
