import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  FuelIcon, ShieldIcon, GearIcon, ChevronIcon, TrendUpIcon,
} from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];
const BAR_HEIGHTS = [40, 35, 44, 38, 56, 63, 78, 66];

type CostItem = {
  iconKey: 'fuel' | 'card' | 'shield' | 'tax' | 'wrench';
  label: string;
  amount: string;
  changePct: string | null;
  stable: boolean;
  subAmount: string | null;
  barPct: number;
  barColor: string;
};

const COST_ITEMS: CostItem[] = [
  {
    iconKey: 'fuel',   label: 'Fuel / Energy',
    amount: '€142.80', changePct: '8% vs last month', stable: false,
    subAmount: '€10.20/day', barPct: 55, barColor: TEAL,
  },
  {
    iconKey: 'card',   label: 'Leasing / Finance',
    amount: '€180.00', changePct: null, stable: true,
    subAmount: null, barPct: 70, barColor: '#F5A623',
  },
  {
    iconKey: 'shield', label: 'Insurance',
    amount: '€48',     changePct: null, stable: true,
    subAmount: null, barPct: 50, barColor: '#5B9BD5',
  },
  {
    iconKey: 'tax',    label: 'Tax',
    amount: '€24',     changePct: null, stable: true,
    subAmount: null, barPct: 40, barColor: '#E040FB',
  },
  {
    iconKey: 'wrench', label: 'Service & Maintenance',
    amount: '€17.80',  changePct: '12% vs last month', stable: false,
    subAmount: null, barPct: 35, barColor: TEAL,
  },
];

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

function ItemIcon({ iconKey, size = 18 }: { iconKey: CostItem['iconKey']; size?: number }) {
  const color = '#888';
  switch (iconKey) {
    case 'fuel':   return <FuelIcon color={color} size={size} />;
    case 'card':   return <CreditCardIcon color={color} size={size} />;
    case 'shield': return <ShieldIcon color={color} size={size} />;
    case 'tax':    return <ReceiptIcon color={color} size={size} />;
    case 'wrench': return <ToolIcon color={color} size={size} />;
  }
}

// ── Weekly bar chart ───────────────────────────────────────────────────────

function WeeklyChart() {
  const MAX_H = 74;
  return (
    <View style={chartSt.wrapper}>
      {BAR_HEIGHTS.map((pct, i) => (
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

function CostItemCard({ item }: { item: CostItem }) {
  return (
    <View style={styles.costCard}>
      <View style={styles.costTop}>
        {/* Left: icon + label + optional change% */}
        <View style={styles.costLeft}>
          <View style={styles.costLabelRow}>
            <ItemIcon iconKey={item.iconKey} />
            <Text style={styles.costLabel}>{item.label}</Text>
          </View>
          {item.changePct && (
            <View style={styles.changeRow}>
              <TrendUpIcon color={TEAL} size={12} />
              <Text style={styles.changeText}> {item.changePct}</Text>
            </View>
          )}
        </View>
        {/* Right: amount + optional sub/stable */}
        <View style={styles.costRight}>
          <Text style={styles.costAmount}>{item.amount}</Text>
          {item.stable
            ? <Text style={styles.stableText}>Stable</Text>
            : item.subAmount
              ? <Text style={styles.subAmountText}>{item.subAmount}</Text>
              : null}
        </View>
      </View>
      {/* Progress bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, {
          width: `${item.barPct}%` as any,
          backgroundColor: item.barColor,
        }]} />
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [activeTab, setActiveTab] = useState<'Analytics' | 'Prediction'>('Analytics');
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function selectTime(t: string) {
    setSelectedTime(t);
    setDropdownOpen(false);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Expenses</Text>
          <TouchableOpacity hitSlop={HIT}>
            <GearIcon color="#1A1A1A" size={22} />
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

        {/* Timeframe pills — wrapper gives the absolute dropdown a positioning context */}
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
          <Text style={styles.totalAmount}>€412.60</Text>
          <Text style={styles.totalLabel}>Total Vehicle Cost</Text>
          <Text style={styles.perDay}>€29.47/day</Text>
          <WeeklyChart />
          <View style={styles.cardDivider} />
          <View style={styles.projRow}>
            <View>
              <Text style={styles.projLabel}>Monthly (Projected):</Text>
              <Text style={styles.projValue}>€890.00</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.projLabel}>Annual</Text>
              <Text style={styles.projValue}>€10,680.00</Text>
            </View>
          </View>
        </View>

        {/* Cost Breakdown */}
        <Text style={styles.sectionTitle}>COST BREAKDOWN</Text>
        {COST_ITEMS.map((item, i) => (
          <CostItemCard key={i} item={item} />
        ))}

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: TEAL }]} />
            <Text style={styles.legendText}>Last {selectedTime}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#CCCCCC' }]} />
            <Text style={styles.legendText}>Previous Month</Text>
          </View>
        </View>

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

  // Dropdown — absolutely positioned so it overlaps content below
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
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  changeText: { fontSize: 12, fontWeight: '600', color: TEAL },
  costRight: { alignItems: 'flex-end' },
  costAmount: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  stableText: { fontSize: 12, color: '#AAAAAA', marginTop: 2 },
  subAmountText: { fontSize: 12, color: '#888', marginTop: 2 },

  // Progress bar
  barTrack: { height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },

  // Legend
  legendRow: { flexDirection: 'row', columnGap: 20, marginTop: 6, marginBottom: 4, paddingLeft: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', columnGap: 7 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 13, color: '#888' },
});
