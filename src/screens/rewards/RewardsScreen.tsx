import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MedalIcon, LeafIcon, GaugeIcon,
  ShareIcon, FlashIcon, ClockIcon, GiftIcon,
  StarOutlineIcon, SparkleIcon, ShieldIcon,
  FuelIcon, WashIcon, CoffeeIcon,
} from '../../components/icons';

const TEAL = '#3ABFBF';
const BRONZE_COLOR = '#E07820';
const SILVER_COLOR = '#9E9E9E';
const GOLD_COLOR = '#F9A825';
const RED = '#E53935';
const GREEN = '#27AE60';

// ── Donut chart ────────────────────────────────────────────────────────────

function DonutChart({ percent = 75, size = 84, strokeWidth = 9 }: {
  percent?: number; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * Math.min(percent, 100) / 100;

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

const TIERS = [
  { label: 'Bronze', pts: '600+ pts/month', color: BRONZE_COLOR, current: false, done: true },
  { label: 'Silver', pts: '700+ pts/month', color: SILVER_COLOR, current: true, done: false },
  { label: 'Gold',   pts: '850+ pts/month', color: GOLD_COLOR,   current: false, done: false },
];

function TierProgress() {
  return (
    <View style={styles.tierCard}>
      {/* Circles + connecting lines */}
      <View style={styles.tierCircleRow}>
        {TIERS.map((t, i) => (
          <React.Fragment key={t.label}>
            <View style={[
              styles.tierCircle,
              { backgroundColor: t.color },
              t.current && styles.tierCircleCurrent,
            ]}>
              <MedalIcon color="white" size={22} />
            </View>
            {i < TIERS.length - 1 && (
              <View style={[
                styles.tierLine,
                i === 0 ? styles.tierLineSolid : styles.tierLineDashed,
              ]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* Labels */}
      <View style={styles.tierLabelRow}>
        {TIERS.map(t => (
          <View key={t.label} style={styles.tierLabelItem}>
            <Text style={[styles.tierLabelName, t.current && { color: TEAL }]}>{t.label}</Text>
            <Text style={styles.tierLabelPts}>{t.pts}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── How to level up rows ───────────────────────────────────────────────────

const LEVEL_UP_TIPS = [
  { Icon: FlashIcon, label: 'Drive eco-friendly trips', pts: '+160 pts', progress: 1.0 },
  { Icon: GaugeIcon, label: 'Maintain optimal speed',  pts: '+80 pts',  progress: 0.65 },
  { Icon: ClockIcon, label: 'Drive during peak hours', pts: '+70 pts',  progress: 0.3 },
];

function LevelUpCard() {
  return (
    <View style={styles.card}>
      {LEVEL_UP_TIPS.map(({ Icon, label, pts, progress }, i) => (
        <View key={label}>
          <View style={styles.levelRow}>
            <View style={styles.levelIconBox}>
              <Icon color={TEAL} size={18} />
            </View>
            <Text style={styles.levelLabel}>{label}</Text>
            <Text style={styles.levelPts}>{pts}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          {i < LEVEL_UP_TIPS.length - 1 && <View style={styles.rowDivider} />}
        </View>
      ))}
    </View>
  );
}

// ── Score circle ───────────────────────────────────────────────────────────

function ScoreItem({ Icon, score, delta, label, iconBg }: {
  Icon: React.ComponentType<{ color?: string; size?: number }>;
  score: number; delta: number; label: string; iconBg: string;
}) {
  const sign = delta >= 0 ? '+' : '';
  const deltaColor = delta >= 0 ? TEAL : RED;
  return (
    <View style={styles.scoreItem}>
      <View style={[styles.scoreIconCircle, { backgroundColor: iconBg }]}>
        <Icon color="white" size={20} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={[styles.scoreDelta, { color: deltaColor }]}> {sign}{delta}</Text>
      </View>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

// ── Rewards summary row ────────────────────────────────────────────────────

function SummaryRow({ icon, label, pts, dollars, ptsColor, highlighted }: {
  icon: React.ReactNode; label: string; pts: string; dollars: string;
  ptsColor: string; highlighted?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, highlighted && styles.summaryRowHighlighted]}>
      {icon}
      <Text style={[styles.summaryLabel, highlighted && { color: TEAL, fontWeight: '700' }]}>
        {label}
      </Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.summaryPts, { color: ptsColor }]}>{pts}</Text>
        <Text style={[styles.summaryDollar, { color: ptsColor }]}>= {dollars}</Text>
      </View>
    </View>
  );
}

// ── Redeem card ────────────────────────────────────────────────────────────

function RedeemCard({ Icon, title, pts }: {
  Icon: React.ComponentType<{ color?: string; size?: number }>;
  title: string; pts: string;
}) {
  return (
    <TouchableOpacity style={styles.redeemCard} activeOpacity={0.8}>
      <Icon color={TEAL} size={30} />
      <Text style={styles.redeemTitle}>{title}</Text>
      <View style={styles.redeemPill}>
        <Text style={styles.redeemPts}>{pts}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function RewardsScreen() {
  const navigation = useNavigation();

  function handleShare() {
    Share.share({ message: 'I\'m a Silver Driver on MAUD Connect! Top 12% this month 🏆' });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
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
      <View style={styles.headerSeparator} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero status card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadgeWrap}>
            <View style={styles.heroBadge}>
              <MedalIcon color={SILVER_COLOR} size={44} />
            </View>
            <View style={styles.heroBadgeStar}>
              <StarOutlineIcon color="white" size={12} />
            </View>
          </View>
          <Text style={styles.heroTier}>SILVER DRIVER</Text>
          <Text style={styles.heroSub}>Top 12% this month</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <ShareIcon color="white" size={16} />
            <Text style={styles.shareBtnText}>Share Your Status</Text>
          </TouchableOpacity>
        </View>

        {/* ── Path to gold ── */}
        <SectionHeader icon={<MedalIcon color={TEAL} size={18} />} title="YOUR PATH TO GOLD" />
        <TierProgress />

        {/* ── How to level up ── */}
        <SectionHeader icon={<GiftIcon color={TEAL} size={18} />} title="HOW TO LEVEL UP TO GOLD" />
        <LevelUpCard />

        {/* ── Monthly progress ── */}
        <SectionHeader icon={<SparkleIcon color={TEAL} size={18} />} title="MONTHLY PROGRESS" />
        <View style={styles.card}>
          <Text style={styles.overallLabel}>Overall Score</Text>
          <View style={styles.progressRow}>
            {/* Donut + label */}
            <View style={styles.donutWrap}>
              <DonutChart percent={72} />
              <View style={styles.donutCenter}>
                <Text style={styles.donutText}>+12%</Text>
              </View>
            </View>
            <View style={styles.progressMid}>
              <Text style={styles.progressPct}>↑ +12%</Text>
              <Text style={styles.progressVs}>vs last month</Text>
            </View>
            <View style={styles.co2Box}>
              <View style={styles.co2Circle}>
                <LeafIcon color="white" size={22} />
              </View>
              <Text style={styles.co2Value}>2,420</Text>
              <Text style={styles.co2Label}>lbs Co2{'\n'}Avoided</Text>
            </View>
          </View>

          <View style={styles.scoreDivider} />

          <View style={styles.scoreRow}>
            <ScoreItem Icon={GaugeIcon}  score={82} delta={4}  label="Driver Score"  iconBg={TEAL} />
            <ScoreItem Icon={LeafIcon}   score={91} delta={9}  label="Eco Score"     iconBg={GREEN} />
            <ScoreItem Icon={ShieldIcon} score={88} delta={-1} label="Safe Driving"  iconBg="#F47920" />
          </View>
        </View>

        {/* ── Rewards summary ── */}
        <SectionHeader icon={<GiftIcon color={TEAL} size={18} />} title="REWARDS SUMMARY" />
        <View style={styles.card}>
          <SummaryRow
            icon={<StarOutlineIcon color={TEAL} size={20} />}
            label="Earned This Month"
            pts="+1,240 pts"
            dollars="$12.40"
            ptsColor={TEAL}
          />
          <View style={styles.rowDivider} />
          <SummaryRow
            icon={<SparkleIcon color={TEAL} size={20} />}
            label="Accrued (Lifetime)"
            pts="+4,880 pts"
            dollars="$48.80"
            ptsColor={TEAL}
          />
          <View style={styles.rowDivider} />
          <SummaryRow
            icon={<GiftIcon color={RED} size={20} />}
            label="Redeemed"
            pts="-3,000 pts"
            dollars="$30.00"
            ptsColor={RED}
          />
          <View style={styles.rowDivider} />
          <SummaryRow
            icon={<MedalIcon color={TEAL} size={20} />}
            label="Balance"
            pts="1,880 pts"
            dollars="$18.80"
            ptsColor={TEAL}
            highlighted
          />
        </View>

        {/* ── Redeem your points ── */}
        <SectionHeader icon={<GiftIcon color={TEAL} size={18} />} title="REDEEM YOUR POINTS" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.redeemScroll}>
          <RedeemCard Icon={FuelIcon}   title={'$10.00\nFUEL CARD'}    pts="500 PTS" />
          <RedeemCard Icon={WashIcon}   title={'20% OFF\nCAR WASH'}    pts="400 PTS" />
          <RedeemCard Icon={CoffeeIcon} title={'20% OFF\nCOFFEE'}      pts="300 PTS" />
          <TouchableOpacity style={styles.redeemMoreBtn} activeOpacity={0.8}>
            <Text style={styles.redeemMoreArrow}>→</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 32 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  headerSeparator: { height: 1, backgroundColor: '#EBEBEB' },

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
    backgroundColor: '#E8ECEF',
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
  heroTier: { fontSize: 22, fontWeight: '800', color: TEAL, letterSpacing: 1.5, marginBottom: 4 },
  heroSub: { fontSize: 14, color: TEAL, marginBottom: 18 },
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
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
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

  // ── Level up rows
  levelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, columnGap: 10 },
  levelIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EFF9F9', justifyContent: 'center', alignItems: 'center' },
  levelLabel: { flex: 1, fontSize: 14, color: '#1A1A1A' },
  levelPts: { fontSize: 14, fontWeight: '700', color: TEAL },
  progressTrack: { height: 5, backgroundColor: '#E8ECEF', borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 5, backgroundColor: TEAL, borderRadius: 3 },
  rowDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 2 },

  // ── Monthly progress
  overallLabel: { fontSize: 13, color: '#888', marginBottom: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', columnGap: 12 },
  donutWrap: { position: 'relative', width: 84, height: 84 },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  donutText: { fontSize: 15, fontWeight: '800', color: TEAL },
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
  scoreValue: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  scoreDelta: { fontSize: 13, fontWeight: '600' },
  scoreLabel: { fontSize: 12, color: '#888', marginTop: 4 },

  // ── Summary rows
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, columnGap: 10 },
  summaryRowHighlighted: { backgroundColor: '#EFF9F9', borderRadius: 10, paddingHorizontal: 10, marginHorizontal: -4 },
  summaryLabel: { flex: 1, fontSize: 14, color: '#1A1A1A' },
  summaryPts: { fontSize: 14, fontWeight: '700' },
  summaryDollar: { fontSize: 12, marginTop: 2 },

  // ── Redeem
  redeemScroll: { columnGap: 12, paddingBottom: 4 },
  redeemCard: {
    width: 110,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    rowGap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  redeemTitle: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', lineHeight: 18 },
  redeemPill: { backgroundColor: '#EFF9F9', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  redeemPts: { fontSize: 11, fontWeight: '700', color: TEAL },
  redeemMoreBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginLeft: 4,
  },
  redeemMoreArrow: { fontSize: 22, color: 'white', fontWeight: '700' },
});
