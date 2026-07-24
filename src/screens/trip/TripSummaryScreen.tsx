import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  FlashIcon, PhoneIcon, GiftIcon,
  LeafIcon, DollarIcon, HourglassIcon,
  PersonIcon, ThumbsUpIcon, ThumbsDownIcon, SparkleIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { haversineDistanceKm, formatDistance, formatDuration } from '../../utils/helpers';
import type { MainStackNavigationProp, TripSummaryRouteProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';

function ratingLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Great';
  if (score >= 60) return 'Good';
  return 'Needs Work';
}

// ── Score arc ──────────────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number }) {
  const SIZE = 112;
  const SW = 9;
  const r = (SIZE - SW * 2) / 2;
  const C = 2 * Math.PI * r;
  const arcFull = C * 0.75;
  const arcFill = (score / 100) * arcFull;
  const cx = SIZE / 2;

  return (
    <View style={{ width: SIZE, height: SIZE, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <G rotation="-225" origin={`${cx},${cx}`}>
          <Circle cx={cx} cy={cx} r={r}
            stroke="#E5E5E5" strokeWidth={SW} fill="none"
            strokeDasharray={`${arcFull} ${C}`} strokeLinecap="round" />
          <Circle cx={cx} cy={cx} r={r}
            stroke={TEAL} strokeWidth={SW} fill="none"
            strokeDasharray={`${arcFill} ${C}`} strokeLinecap="round" />
        </G>
      </Svg>
      <Text style={arcSt.score}>{score}</Text>
      <Text style={arcSt.label}>✦ {ratingLabel(score)}</Text>
    </View>
  );
}

const arcSt = StyleSheet.create({
  score: { fontSize: 28, fontWeight: '800', color: TEAL },
  label: { fontSize: 11, color: TEAL, marginTop: 2 },
});

// ── Score row ──────────────────────────────────────────────────────────────

function ScoreRow({ icon, label, rating, score, barColor }: {
  icon: React.ReactNode;
  label: string;
  rating: string;
  score: number;
  barColor: string;
}) {
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreTop}>
        <View style={styles.scoreIconBox}>{icon}</View>
        <Text style={styles.scoreLabel}>{label}</Text>
        <Text style={styles.scoreRating}>{rating}</Text>
        <Text style={styles.scoreNum}>{score}/100</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${score}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

const SUMMARY_TITLES: Record<string, string> = {
  excellent_drive: 'EXCELLENT DRIVE!',
  good_drive: 'GREAT DRIVE!',
  average_drive: 'GOOD DRIVE',
  needs_improvement: 'TRIP COMPLETE',
};

export default function TripSummaryScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const route = useRoute<TripSummaryRouteProp>();
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));
  const reward = trip?.reward;
  const isImperial = useIsImperialUnits();

  const distanceKm = trip
    ? trip.route.reduce(
        (sum, point, i) => (i === 0 ? 0 : sum + haversineDistanceKm(trip.route[i - 1], point)),
        0,
      )
    : reward?.distanceKm ?? 0;
  const durationSeconds = trip?.endTime ? Math.round((trip.endTime - trip.startTime) / 1000) : 0;
  const avgSpeedKmh = durationSeconds > 0 ? (distanceKm / durationSeconds) * 3600 : 0;

  const heroTitle = (reward && SUMMARY_TITLES[reward.voicePayload.summaryKey]) ?? 'TRIP COMPLETE';
  const moneySavedLabel =
    reward?.moneySavedCents != null && reward.currencyCode
      ? `${(reward.moneySavedCents / 100).toFixed(2)} ${reward.currencyCode}`
      : '—';
  const co2Label = reward?.co2AvoidedGrams != null ? `${(reward.co2AvoidedGrams / 1000).toFixed(1)} kg` : '—';

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Summary</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero title */}
        <Text style={styles.heroTitle}>{heroTitle}</Text>
        <Text style={styles.heroSub}>Every smart choice makes a difference.</Text>

        {/* Score card */}
        <View style={styles.card}>
          <View style={styles.heroRow}>
            <ScoreArc score={reward ? Math.round(reward.tripRewardScore) : 0} />
            <View style={styles.savingsCol}>
              <Text style={styles.savingsLabel}>You saved</Text>
              <View style={styles.savingsRow}>
                <Text style={styles.savingsAmountLarge}>{moneySavedLabel}</Text>
                <View style={[styles.badge, { backgroundColor: '#F5A623' }]}>
                  <DollarIcon color="white" size={20} />
                </View>
              </View>
              <Text style={[styles.savingsLabel, { marginTop: 14 }]}>CO2 Avoided</Text>
              <View style={styles.savingsRow}>
                <Text style={styles.savingsAmount}>{co2Label}</Text>
                <View style={[styles.badge, { backgroundColor: '#27AE60' }]}>
                  <LeafIcon color="white" size={20} />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Trip stats */}
        <View style={[styles.card, styles.statsCard]}>
          <View style={styles.statItem}>
            <PersonIcon color="#BBBBBB" size={22} />
            <Text style={styles.statVal}>{formatDistance(distanceKm, isImperial)}</Text>
            <Text style={styles.statMeta}>Distance</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <HourglassIcon color="#BBBBBB" size={22} />
            <Text style={styles.statVal}>{formatDuration(durationSeconds)}</Text>
            <Text style={styles.statMeta}>Duration</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <FlashIcon color="#BBBBBB" size={22} />
            <Text style={styles.statVal}>{Math.round(avgSpeedKmh)} km/h</Text>
            <Text style={styles.statMeta}>Avg. Speed</Text>
          </View>
        </View>

        {reward ? (
          <>
            {/* How you scored header */}
            <View style={styles.scoredHeader}>
              <Text style={styles.scoredTitle}>HOW YOU SCORED</Text>
              <Text style={styles.scoredPts}>+{reward.tripPointsEarned} pts</Text>
            </View>

            {/* Scores card — sourced directly from the backend's scoring pipeline */}
            <View style={styles.card}>
              <ScoreRow icon={<LeafIcon color="#888" size={16} />}
                label="Eco Driving" rating={ratingLabel(reward.ecoScore)}
                score={Math.round(reward.ecoScore)} barColor="#F5A623" />
              <View style={styles.rowDiv} />
              <ScoreRow icon={<PhoneIcon color="#888" size={16} />}
                label="Phone Usage" rating={ratingLabel(reward.phoneSubscore)}
                score={Math.round(reward.phoneSubscore)} barColor={TEAL} />
              <View style={styles.rowDiv} />
              <ScoreRow icon={<FlashIcon color="#888" size={16} />}
                label="Overall Safety" rating={ratingLabel(reward.safetyScore)}
                score={Math.round(reward.safetyScore)} barColor={TEAL} />
            </View>

            {/* Rewards card */}
            <View style={styles.card}>
              <View style={styles.rewardsRow}>
                <View style={styles.giftBox}>
                  <GiftIcon color={TEAL} size={28} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardsTitle}>
                    Nice Work! You earned {reward.tripPointsEarned} point{reward.tripPointsEarned === 1 ? '' : 's'}
                  </Text>
                  <Text style={styles.rewardsSub}>Keep it up to unlock bigger rewards over time.</Text>
                </View>
              </View>
            </View>

            {reward.aiNarrativeTip && (
              <View style={styles.card}>
                <View style={styles.rewardsRow}>
                  <View style={[styles.giftBox, { backgroundColor: '#EFF9F9' }]}>
                    <SparkleIcon color={TEAL} size={26} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rewardsTitle}>AI Driving Tip</Text>
                    <Text style={styles.rewardsSub}>{reward.aiNarrativeTip}</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.rewardsSub}>
              This trip couldn't be scored yet — it may have been submitted while offline. Your route is still saved, and scoring will complete automatically once you're back online.
            </Text>
          </View>
        )}

        {/* Trip feedback */}
        <Text style={styles.feedTitle}>How was your Trip?</Text>
        <Text style={styles.feedSub}>Your feedback helps MAUD get even smarter for you.</Text>
        <View style={[styles.card, styles.thumbsCard]}>
          <TouchableOpacity
            style={[styles.thumbBtn, feedback === 'down' && styles.thumbBtnActive]}
            onPress={() => setFeedback(f => f === 'down' ? null : 'down')}
            activeOpacity={0.8}
          >
            <ThumbsDownIcon color={feedback === 'down' ? TEAL : '#AAAAAA'} size={28} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.thumbBtn, feedback === 'up' && styles.thumbBtnActive]}
            onPress={() => setFeedback(f => f === 'up' ? null : 'up')}
            activeOpacity={0.8}
          >
            <ThumbsUpIcon color={feedback === 'up' ? TEAL : '#AAAAAA'} size={28} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Done button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneBtn}
          activeOpacity={0.88}
          onPress={() => navigation.navigate('MainTabs')}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#EEEEEE' },

  scroll: { padding: 16, paddingBottom: 16 },

  heroTitle: { fontSize: 26, fontWeight: '900', color: '#1A1A1A', marginBottom: 4, letterSpacing: 0.4 },
  heroSub: { fontSize: 14, color: '#888888', marginBottom: 16 },

  card: {
    backgroundColor: 'white', borderRadius: 18,
    padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Score hero
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  savingsCol: { flex: 1, paddingLeft: 18 },
  savingsLabel: { fontSize: 12, color: '#888888', marginBottom: 4 },
  savingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savingsAmountLarge: { fontSize: 30, fontWeight: '900', color: '#1A1A1A' },
  savingsAmount: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  badge: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  // Stats
  statsCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  statItem: { flex: 1, alignItems: 'center', rowGap: 6 },
  statSep: { width: 1, height: 48, backgroundColor: '#F0F0F0' },
  statVal: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  statMeta: { fontSize: 12, color: '#AAAAAA' },

  // How you scored
  scoredHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  scoredTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.5 },
  scoredPts: { fontSize: 15, fontWeight: '700', color: TEAL },

  // Score rows
  scoreRow: { paddingVertical: 10 },
  scoreTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  scoreIconBox: {
    width: 28, height: 28, borderRadius: 7, backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  scoreLabel: { flex: 1, fontSize: 14, color: '#333333' },
  scoreRating: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginRight: 8 },
  scoreNum: { fontSize: 14, fontWeight: '700', color: TEAL },
  barBg: { height: 7, backgroundColor: '#EEEEEE', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  rowDiv: { height: 1, backgroundColor: '#F5F5F5' },

  // Rewards
  rewardsRow: { flexDirection: 'row', alignItems: 'flex-start', columnGap: 14 },
  giftBox: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#EFF9F9', justifyContent: 'center', alignItems: 'center',
  },
  rewardsTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  rewardsSub: { fontSize: 12, color: '#888888', lineHeight: 18 },

  // Feedback
  feedTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  feedSub: { fontSize: 13, color: '#888888', marginBottom: 12 },
  thumbsCard: {
    flexDirection: 'row', justifyContent: 'center',
    columnGap: 28, paddingVertical: 18,
  },
  thumbBtn: {
    width: 66, height: 66, borderRadius: 33,
    borderWidth: 1.5, borderColor: '#DDDDDD',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'white',
  },
  thumbBtnActive: { borderColor: TEAL, backgroundColor: '#EFF9F9' },

  // Footer
  footer: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8, backgroundColor: '#F5F5F5' },
  doneBtn: {
    backgroundColor: TEAL, borderRadius: 28,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: TEAL, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  doneBtnText: { fontSize: 17, fontWeight: '700', color: 'white' },
});
