import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MedalIcon, LeafIcon, GaugeIcon,
  ShareIcon, GiftIcon,
  StarOutlineIcon, SparkleIcon, ShieldIcon,
  FuelIcon, CoffeeIcon, EVChargingIcon, GroceryIcon, RestaurantIcon,
  ArrowRightIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';
import { fetchRewardOverview } from '../../store/slices/rewardSlice';
import type { MonthlyRewardSummary, RewardStatus } from '../../types/reward.types';

const TEAL = '#3ABFBF';
const BRONZE_COLOR = '#E07820';
const SILVER_COLOR = '#A8B0B8';
const GOLD_COLOR = '#F9A825';
const GREY = '#9E9E9E';
const EARNED_GREEN = '#27AE60';
const ACCRUED_BLUE = '#3B82F6';
const REDEEMED_RED = '#E74C3C';

const TIER_CIRCLE_SIZE = 52;
const TIER_GRADIENTS: Record<'bronze' | 'silver' | 'gold', [string, string]> = {
  bronze: ['#F3B27E', '#D9691E'],
  silver: ['#F4F6F8', '#AEB6BD'],
  gold: ['#FFE18C', '#F9A825'],
};

const STATUS_ORDER: RewardStatus[] = ['none', 'bronze', 'silver', 'gold'];
const STATUS_META: Record<RewardStatus, { label: string; color: string }> = {
  none: { label: 'GETTING STARTED', color: GREY },
  bronze: { label: 'BRONZE DRIVER', color: BRONZE_COLOR },
  silver: { label: 'SILVER DRIVER', color: SILVER_COLOR },
  gold: { label: 'GOLD DRIVER', color: GOLD_COLOR },
};

function buildTips(m: MonthlyRewardSummary): string[] {
  const tips: string[] = [];
  if (!m.meetsEligibility) {
    if (m.eligibilityGap.kmStillNeeded > 0) {
      tips.push(`Drive ${m.eligibilityGap.kmStillNeeded.toFixed(0)} more km this month to qualify for rewards.`);
    }
    if (m.eligibilityGap.tripsStillNeeded > 0) {
      tips.push(`Complete ${m.eligibilityGap.tripsStillNeeded} more trip${m.eligibilityGap.tripsStillNeeded === 1 ? '' : 's'} this month to qualify.`);
    }
  } else if (m.progress.nextStatus && m.progress.pointsToNext != null) {
    tips.push(`${m.progress.pointsToNext} more points to reach ${m.progress.nextStatus} status.`);
  } else {
    tips.push("You've reached the top tier — great driving!");
  }
  if (m.phoneBlocksGold) {
    tips.push('Reduce phone usage while driving — it currently caps you below Gold.');
  }
  if (m.goldStreakMonths > 0) {
    tips.push(`You're on a ${m.goldStreakMonths}-month Gold streak! 🔥`);
  }
  return tips;
}

// ── Donut chart ────────────────────────────────────────────────────────────

function DonutChart({ percent, size = 84, strokeWidth = 9 }: {
  percent: number; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * Math.min(Math.max(percent, 0), 100) / 100;

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} stroke="#E8ECEF" strokeWidth={strokeWidth} fill="none" />
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={TEAL}
        strokeWidth={strokeWidth}
        strokeDasharray={`${arc} ${circumference}`}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx},${cy}`}
        fill="none"
      />
    </Svg>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Tier progress ──────────────────────────────────────────────────────────

function TierProgress({ summary }: { summary: MonthlyRewardSummary }) {
  const currentIdx = STATUS_ORDER.indexOf(summary.status);
  const tiers: { label: string; pts: string; color: string; status: 'bronze' | 'silver' | 'gold' }[] = [
    { label: 'Bronze', pts: `${summary.thresholds.bronze}+ pts/month`, color: BRONZE_COLOR, status: 'bronze' },
    { label: 'Silver', pts: `${summary.thresholds.silver}+ pts/month`, color: SILVER_COLOR, status: 'silver' },
    { label: 'Gold', pts: `${summary.thresholds.gold}+ pts/month`, color: GOLD_COLOR, status: 'gold' },
  ];

  return (
    <View style={styles.tierCard}>
      <View style={styles.tierCircleRow}>
        {tiers.map((t, i) => {
          const tierIdx = STATUS_ORDER.indexOf(t.status);
          const isCurrent = tierIdx === currentIdx;
          return (
            <React.Fragment key={t.label}>
              <View style={[styles.tierCircle, isCurrent && styles.tierCircleCurrent]}>
                <Svg width={TIER_CIRCLE_SIZE} height={TIER_CIRCLE_SIZE} style={StyleSheet.absoluteFill}>
                  <Defs>
                    <RadialGradient id={`tierGrad-${t.status}`} cx="35%" cy="30%" r="75%">
                      <Stop offset="0" stopColor={TIER_GRADIENTS[t.status][0]} />
                      <Stop offset="1" stopColor={TIER_GRADIENTS[t.status][1]} />
                    </RadialGradient>
                  </Defs>
                  <Circle
                    cx={TIER_CIRCLE_SIZE / 2}
                    cy={TIER_CIRCLE_SIZE / 2}
                    r={TIER_CIRCLE_SIZE / 2}
                    fill={`url(#tierGrad-${t.status})`}
                  />
                </Svg>
                <MedalIcon color="white" size={22} />
              </View>
              {i < tiers.length - 1 && (
                <View style={[
                  styles.tierLine,
                  tierIdx < currentIdx ? styles.tierLineSolid : styles.tierLineDashed,
                ]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.tierLabelRow}>
        {tiers.map(t => (
          <View key={t.label} style={styles.tierLabelItem}>
            <Text style={[styles.tierLabelName, t.status === summary.status && { color: TEAL }]}>{t.label}</Text>
            <Text style={styles.tierLabelPts}>{t.pts}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Tips card ──────────────────────────────────────────────────────────────

function TipsCard({ tips }: { tips: string[] }) {
  return (
    <View style={styles.card}>
      {tips.map((tip, i) => (
        <View key={i} style={[styles.tipRow, i < tips.length - 1 && styles.rowDivider]}>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Score circle ───────────────────────────────────────────────────────────

function ScoreItem({ Icon, score, label, iconBg }: {
  Icon: React.ComponentType<{ color?: string; size?: number }>;
  score: number; label: string; iconBg: string;
}) {
  return (
    <View style={styles.scoreItem}>
      <View style={[styles.scoreIconCircle, { backgroundColor: iconBg }]}>
        <Icon color="white" size={20} />
      </View>
      <Text style={styles.scoreValue}>{Math.round(score)}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

// ── Rewards summary row ────────────────────────────────────────────────────

function SummaryRow({ icon, iconBg, label, dollars, dollarColor, highlighted, divider }: {
  icon: React.ReactNode; iconBg: string; label: string; dollars: string;
  dollarColor: string; highlighted?: boolean; divider?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, divider && styles.rowDivider, highlighted && styles.summaryRowHighlighted]}>
      <View style={[styles.summaryIconCircle, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <Text style={[styles.summaryLabel, highlighted && { color: TEAL, fontWeight: '700' }]}>
        {label}
      </Text>
      <Text style={[styles.summaryDollar, { color: dollarColor }]}>{dollars}</Text>
    </View>
  );
}

// ── Redeem points ──────────────────────────────────────────────────────────

const REDEEM_ITEMS: {
  key: string; Icon: React.ComponentType<{ color?: string; size?: number }>;
  color: string; value: string; label: string; pts: string;
}[] = [
  { key: 'fuel', Icon: FuelIcon, color: '#27AE60', value: '$10.00', label: 'FUEL CARD', pts: '500 PTS' },
  { key: 'coffee', Icon: CoffeeIcon, color: '#B4703A', value: '20% OFF', label: 'COFFEE', pts: '300 PTS' },
  { key: 'ev', Icon: EVChargingIcon, color: ACCRUED_BLUE, value: '20% OFF', label: 'EV CHARGING', pts: '400 PTS' },
  { key: 'grocery', Icon: GroceryIcon, color: GOLD_COLOR, value: '10% OFF', label: 'GROCERY', pts: '350 PTS' },
  { key: 'restaurant', Icon: RestaurantIcon, color: REDEEMED_RED, value: '15% OFF', label: 'RESTAURANT', pts: '450 PTS' },
];

function RedeemCard({ Icon, color, value, label, pts }: {
  Icon: React.ComponentType<{ color?: string; size?: number }>;
  color: string; value: string; label: string; pts: string;
}) {
  return (
    <View style={styles.redeemCard}>
      <Icon color={color} size={26} />
      <Text style={styles.redeemValue}>{value}</Text>
      <Text style={styles.redeemLabel}>{label}</Text>
      <View style={styles.redeemPtsPill}>
        <Text style={styles.redeemPtsText}>{pts}</Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function RewardsScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { currentMonth, previousMonth } = useAppSelector(s => s.rewards);
  const trips = useAppSelector(s => s.trips.trips);
  const currencySymbol = useCurrencySymbol();

  useEffect(() => {
    dispatch(fetchRewardOverview());
  }, [dispatch]);

  const monthlyTripMetrics = useMemo(() => {
    const now = new Date();
    const thisMonthTrips = trips.filter(t => {
      const d = new Date(t.startTime);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && t.reward;
    });
    const co2AvoidedGrams = thisMonthTrips.reduce((sum, t) => sum + (t.reward?.co2AvoidedGrams ?? 0), 0);
    const avgSafetyScore = thisMonthTrips.length
      ? thisMonthTrips.reduce((s, t) => s + (t.reward?.safetyScore ?? 0), 0) / thisMonthTrips.length
      : 0;
    const avgEcoScore = thisMonthTrips.length
      ? thisMonthTrips.reduce((s, t) => s + (t.reward?.ecoScore ?? 0), 0) / thisMonthTrips.length
      : 0;
    return { co2AvoidedGrams, avgSafetyScore, avgEcoScore };
  }, [trips]);

  function handleShare() {
    if (!currentMonth) return;
    const tierLabel = STATUS_META[currentMonth.status].label;
    Share.share({
      message: `I'm a ${tierLabel} on MAUD Connect this month — ${currentMonth.monthlyPoints} points earned! 🏆`,
    });
  }

  if (!currentMonth) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <SafeAreaView edges={['top']} style={styles.safeHeader}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <BackArrowIcon size={22} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Rewards</Text>
            <View style={{ width: 22 }} />
          </View>
        </SafeAreaView>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading rewards…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const scoreDeltaPct = previousMonth && previousMonth.monthlyRewardScore > 0
    ? Math.round(((currentMonth.monthlyRewardScore - previousMonth.monthlyRewardScore) / previousMonth.monthlyRewardScore) * 100)
    : null;
  const tips = buildTips(currentMonth);
  const earnedLabel = `${currencySymbol}${(currentMonth.cashRewardCents / 100).toFixed(2)}`;
  const accruedLabel = `${currencySymbol}${((currentMonth.lifetimeEarnedCents ?? 0) / 100).toFixed(2)}`;
  const redeemedLabel = `${currencySymbol}${((currentMonth.lifetimeRedeemedCents ?? 0) / 100).toFixed(2)}`;
  const balanceLabel = `${currencySymbol}${((currentMonth.balanceCents ?? 0) / 100).toFixed(2)}`;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rewards</Text>
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ShareIcon color="#1A1A1A" size={22} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.headerSeparator} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero status card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadgeWrap}>
            <View style={[styles.heroBadge, { backgroundColor: '#E8ECEF' }]}>
              <MedalIcon color={STATUS_META[currentMonth.status].color} size={44} />
            </View>
            <View style={styles.heroBadgeStar}>
              <StarOutlineIcon color="white" size={12} />
            </View>
          </View>
          <Text style={[styles.heroTier, { color: STATUS_META[currentMonth.status].color }]}>
            {STATUS_META[currentMonth.status].label}
          </Text>
          <Text style={styles.heroSub}>
            {currentMonth.tripCount} trip{currentMonth.tripCount === 1 ? '' : 's'} · {currentMonth.totalDistanceKm.toFixed(0)} km this month
          </Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <ShareIcon color="white" size={16} />
            <Text style={styles.shareBtnText}>Share Your Status</Text>
          </TouchableOpacity>
        </View>

        {/* ── Path to next tier ── */}
        <SectionHeader icon={<MedalIcon color={TEAL} size={18} />} title="YOUR PATH TO GOLD" />
        <TierProgress summary={currentMonth} />

        {/* ── Tips ── */}
        <SectionHeader icon={<GiftIcon color={TEAL} size={18} />} title="HOW TO LEVEL UP" />
        <TipsCard tips={tips} />

        {/* ── Monthly progress ── */}
        <SectionHeader icon={<SparkleIcon color={TEAL} size={18} />} title="MONTHLY PROGRESS" />
        <View style={styles.card}>
          <Text style={styles.overallLabel}>Overall Score</Text>
          <View style={styles.progressRow}>
            <View style={styles.donutWrap}>
              <DonutChart percent={currentMonth.monthlyRewardScore} />
              <View style={styles.donutCenter}>
                <Text style={styles.donutText}>{Math.round(currentMonth.monthlyRewardScore)}</Text>
              </View>
            </View>
            <View style={styles.progressMid}>
              {scoreDeltaPct !== null ? (
                <>
                  <Text style={styles.progressPct}>{scoreDeltaPct >= 0 ? '↑' : '↓'} {scoreDeltaPct >= 0 ? '+' : ''}{scoreDeltaPct}%</Text>
                  <Text style={styles.progressVs}>vs last month</Text>
                </>
              ) : (
                <Text style={styles.progressVs}>No prior month to compare yet</Text>
              )}
            </View>
            <View style={styles.co2Box}>
              <View style={styles.co2Circle}>
                <LeafIcon color="white" size={22} />
              </View>
              <Text style={styles.co2Value}>{(monthlyTripMetrics.co2AvoidedGrams / 1000).toFixed(1)}</Text>
              <Text style={styles.co2Label}>kg CO2{'\n'}Avoided</Text>
            </View>
          </View>

          <View style={styles.scoreDivider} />

          <View style={styles.scoreRow}>
            <ScoreItem Icon={GaugeIcon} score={monthlyTripMetrics.avgSafetyScore} label="Driver Score" iconBg={TEAL} />
            <ScoreItem Icon={LeafIcon} score={monthlyTripMetrics.avgEcoScore} label="Eco Score" iconBg="#27AE60" />
            <ScoreItem Icon={ShieldIcon} score={currentMonth.monthlyPhoneSubscore} label="Phone Safety" iconBg="#F47920" />
          </View>
        </View>

        {/* ── Rewards summary ── */}
        <SectionHeader icon={<GiftIcon color={TEAL} size={18} />} title="REWARDS SUMMARY" />
        <View style={styles.card}>
          <SummaryRow
            icon={<StarOutlineIcon color={EARNED_GREEN} size={20} />}
            iconBg="#E3F5E9"
            label="Earned This Month"
            dollars={earnedLabel}
            dollarColor={EARNED_GREEN}
            divider
          />
          <SummaryRow
            icon={<SparkleIcon color={ACCRUED_BLUE} size={20} />}
            iconBg="#E6EEFE"
            label="Accrued (Lifetime)"
            dollars={accruedLabel}
            dollarColor={ACCRUED_BLUE}
            divider
          />
          <SummaryRow
            icon={<GiftIcon color={REDEEMED_RED} size={20} />}
            iconBg="#FBE7E5"
            label="Redeemed"
            dollars={redeemedLabel}
            dollarColor={REDEEMED_RED}
            divider
          />
          <SummaryRow
            icon={<MedalIcon color="white" size={20} />}
            iconBg={TEAL}
            label="Balance"
            dollars={balanceLabel}
            dollarColor={TEAL}
            highlighted
          />
        </View>

        {/* ── Redeem points ── */}
        <SectionHeader icon={<GiftIcon color={TEAL} size={18} />} title="REDEEM YOUR POINTS" />
        <View style={[styles.card, styles.redeemCardOuter]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.redeemRow}
            style={styles.redeemScroll}
          >
            {REDEEM_ITEMS.map(item => (
              <RedeemCard key={item.key} Icon={item.Icon} color={item.color} value={item.value} label={item.label} pts={item.pts} />
            ))}
          </ScrollView>
          <View style={styles.redeemArrowBtn}>
            <ArrowRightIcon color="white" size={18} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  headerSeparator: { height: 1, backgroundColor: '#EBEBEB' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, color: '#888' },

  scroll: { padding: 16, rowGap: 14, paddingBottom: 36 },

  // ── Hero card
  heroCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  heroBadgeWrap: { position: 'relative', marginBottom: 14 },
  heroBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBadgeStar: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: TEAL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTier: { fontSize: 22, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  heroSub: { fontSize: 14, color: '#888', marginBottom: 18 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TEAL,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    columnGap: 8,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: 'white' },

  // ── Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', letterSpacing: 0.6 },

  // ── Card base
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // ── Tier progress
  tierCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tierCircleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tierCircle: {
    width: TIER_CIRCLE_SIZE,
    height: TIER_CIRCLE_SIZE,
    borderRadius: TIER_CIRCLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  tierCircleCurrent: {
    borderWidth: 3,
    borderColor: TEAL,
  },
  tierLine: { flex: 1, height: 2 },
  tierLineSolid: { backgroundColor: TEAL },
  tierLineDashed: { borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#CCCCCC' },
  tierLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tierLabelItem: { width: 52, alignItems: 'center' },
  tierLabelName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  tierLabelPts: { fontSize: 10, color: '#888', textAlign: 'center' },

  // ── Tips
  tipRow: { paddingVertical: 10 },
  tipText: { fontSize: 14, color: '#1A1A1A', lineHeight: 20 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },

  // ── Monthly progress
  overallLabel: { fontSize: 13, color: '#888', marginBottom: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', columnGap: 12 },
  donutWrap: { position: 'relative', width: 84, height: 84 },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  donutText: { fontSize: 20, fontWeight: '800', color: TEAL },
  progressMid: { flex: 1 },
  progressPct: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  progressVs: { fontSize: 12, color: '#888', marginTop: 2 },
  co2Box: { alignItems: 'center' },
  co2Circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TEAL,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  co2Value: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
  co2Label: { fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 16 },
  scoreDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-around' },
  scoreItem: { alignItems: 'center' },
  scoreIconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scoreValue: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginTop: 6 },
  scoreLabel: { fontSize: 12, color: '#888', marginTop: 4 },

  // ── Summary rows
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, columnGap: 12 },
  summaryRowHighlighted: { backgroundColor: '#EFF9F9', borderRadius: 10, paddingHorizontal: 10, marginHorizontal: -4 },
  summaryIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  summaryLabel: { flex: 1, fontSize: 14, color: '#1A1A1A' },
  summaryDollar: { fontSize: 15, fontWeight: '700' },

  // ── Redeem points
  redeemCardOuter: { flexDirection: 'row', alignItems: 'center', columnGap: 10, padding: 12 },
  redeemScroll: { flex: 1 },
  redeemRow: { flexDirection: 'row', columnGap: 10 },
  redeemCard: {
    width: 108,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDEDED',
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    rowGap: 6,
  },
  redeemValue: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  redeemLabel: { fontSize: 10, fontWeight: '700', color: '#888', letterSpacing: 0.3 },
  redeemPtsPill: { backgroundColor: '#EAF7F5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  redeemPtsText: { fontSize: 11, fontWeight: '700', color: TEAL },
  redeemArrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: TEAL,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
