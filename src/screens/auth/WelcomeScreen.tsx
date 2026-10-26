import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { AuthNavigationProp } from '../../types/navigation.types';
import ShieldCheckIcon from '../../components/common/ShieldCheckIcon';
import LockIcon from '../../components/common/LockIcon';
import {
  LeafIcon,
  StarOutlineIcon,
  PersonIcon,
  ArrowRightIcon,
} from '../../components/icons';

const TEAL = '#3ECFBF';
const BG = '#0A0E1B';
const CARD_BG = '#101828';
const CARD_BORDER = 'rgba(255,255,255,0.10)';

function CarOutlineIcon({ color = TEAL, size = 30 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 36 22" fill="none">
      <Path
        d="M3.5 14.5V11.8c0-.7.35-1.35.95-1.73l3.4-2.15c.5-.32 1.05-.53 1.63-.6l4.62-.6a8 8 0 013.9.5l3.9 1.5c.4.15.83.24 1.26.24H26a3.5 3.5 0 013.5 3.5v2.34"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 14.5h1.5M29.5 14.5H32a1 1 0 001-1v-1a2 2 0 00-1.3-1.87l-2.7-1"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 7.7V11h13.5V8.6" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12.6 7.3v3.6M8.3 11h13" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Circle cx="10" cy="15.5" r="2.6" stroke={color} strokeWidth={1.7} />
      <Circle cx="25" cy="15.5" r="2.6" stroke={color} strokeWidth={1.7} />
      <Path d="M8.5 14.5h13" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function PieChartIcon({ color = TEAL, size = 30 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
      <Path d="M12 3v9h9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 12L5.5 18.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Bar chart in a rounded frame — "Smarter" bubble.
function ChartIcon({ color = '#3B82F6', size = 26 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={3} stroke={color} strokeWidth={1.8} />
      <Path d="M8 17v-4M12 17V8M16 17v-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Trophy — "Achieve" bubble.
function TrophyIcon({ color = '#3B82F6', size = 26 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4h10v5a5 5 0 01-10 0V4z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M7 6H4.5v1.5A3.5 3.5 0 008 11M17 6h2.5v1.5A3.5 3.5 0 0116 11" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 14v3M8.5 20.5h7M9.5 20.5c0-1.9 1.1-3.5 2.5-3.5s2.5 1.6 2.5 3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const CORNER_LABELS = [
  { key: 'safer', label: 'Safer', icon: <ShieldCheckIcon color={TEAL} size={26} /> },
  { key: 'greener', label: 'Greener', icon: <LeafIcon color="#4CAF50" size={26} /> },
  { key: 'smarter', label: 'Smarter', icon: <ChartIcon color="#3B82F6" size={24} /> },
  { key: 'achieve', label: 'Achieve', icon: <TrophyIcon color="#3B82F6" size={24} /> },
];

export default function WelcomeScreen() {
  const navigation = useNavigation<AuthNavigationProp>();
  const { width } = useWindowDimensions();

  const diagramSize = Math.min(width * 0.72, 280);
  const cornerSize = diagramSize * 0.2;
  const centerSize = diagramSize * 0.52;
  const half = diagramSize / 2;

  const cornerRadius = diagramSize * 0.42;
  const cornerAngles = [-135, -45, 135, 45]; // safer, greener, smarter, achieve
  const cornerPositions = cornerAngles.map(angle => {
    const rad = (angle * Math.PI) / 180;
    return {
      top: half + Math.sin(rad) * cornerRadius - cornerSize / 2,
      left: half + Math.cos(rad) * cornerRadius - cornerSize / 2,
    };
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Image
          source={require('../../assets/images/logo_horizontal.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        <Text style={styles.tagline}>MOBILITY AI CO-PILOT</Text>

        <Text style={styles.headline}>
          Drive smarter.{'\n'}
          <Text style={styles.headlineAccent}>Live better.</Text>
        </Text>

        <Text style={styles.subtext}>
          Your AI co-pilot for safer, smarter{'\n'}and more rewarding mobility.
        </Text>

        {/* Diagram */}
        <View style={[styles.diagram, { width: diagramSize, height: diagramSize }]}>
          <View style={[styles.outerRing, { width: diagramSize * 0.86, height: diagramSize * 0.86, borderRadius: (diagramSize * 0.86) / 2, top: diagramSize * 0.07, left: diagramSize * 0.07 }]} />
          <View style={[styles.middleRing, { width: diagramSize * 0.7, height: diagramSize * 0.7, borderRadius: (diagramSize * 0.7) / 2, top: diagramSize * 0.15, left: diagramSize * 0.15 }]} />

          {/* connector dashes */}
          <View style={[styles.connectorLayer, { width: diagramSize, height: diagramSize }]} pointerEvents="none">
            {[45, -45, 135, -135].map(angle => (
              <View
                key={angle}
                style={[
                  styles.dashLine,
                  {
                    width: diagramSize * 0.14,
                    top: half - 0.75,
                    left: half - (diagramSize * 0.14) / 2,
                    transform: [
                      { translateX: (Math.cos((angle * Math.PI) / 180) * diagramSize * 0.32) },
                      { translateY: (Math.sin((angle * Math.PI) / 180) * diagramSize * 0.32) },
                      { rotate: `${angle}deg` },
                    ],
                  },
                ]}
              />
            ))}
          </View>

          {/* center circle */}
          <View
            style={[
              styles.centerCircle,
              {
                width: centerSize,
                height: centerSize,
                borderRadius: centerSize / 2,
                top: half - centerSize / 2,
                left: half - centerSize / 2,
              },
            ]}
          >
            <Image
              source={require('../../assets/images/car_front.png')}
              style={{ width: centerSize * 0.62, height: centerSize * 0.5 }}
              resizeMode="contain"
            />
            <Text style={styles.centerLabel}>AI CO-PILOT</Text>
          </View>

          {/* corner bubbles */}
          {CORNER_LABELS.map((item, idx) => (
            <View
              key={item.key}
              style={[
                styles.cornerWrap,
                cornerPositions[idx],
                { width: cornerSize, height: cornerSize + 22 },
              ]}
            >
              <View style={[styles.cornerCircle, { width: cornerSize, height: cornerSize, borderRadius: cornerSize / 2 }]}>
                {item.icon}
              </View>
              <Text style={styles.cornerLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Feature cards */}
        {/* Each icon sits in a slot of the same height, so the three titles
            line up (the car icon is much flatter than the other two). */}
        <View style={styles.cardsRow}>
          <View style={styles.card}>
            <View style={styles.cardIconSlot}><CarOutlineIcon color={TEAL} size={30} /></View>
            <Text style={styles.cardTitle}>DRIVE</Text>
            <View style={styles.cardUnderline} />
            <Text style={styles.cardText}>Smarter driving with real-time AI insights.</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.cardIconSlot}><PieChartIcon color={TEAL} size={26} /></View>
            <Text style={styles.cardTitle}>SAVE</Text>
            <View style={styles.cardUnderline} />
            <Text style={styles.cardText}>Understand fuel, charging and vehicle cost.</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.cardIconSlot}><StarOutlineIcon color={TEAL} size={24} /></View>
            <Text style={styles.cardTitle}>ACHIEVE</Text>
            <View style={styles.cardUnderline} />
            <Text style={styles.cardText}>Earn points and build your Bronze, Silver and Gold status.</Text>
          </View>
        </View>

        {/* Privacy row */}
        <View style={styles.privacyBox}>
          <LockIcon color={TEAL} size={26} />
          <View style={styles.privacyTextWrap}>
            <Text style={styles.privacyTitle}>Your mobility. Your data. Your choice.</Text>
            <Text style={styles.privacySubtitle}>
              Privacy-first <Text style={styles.dot}>•</Text> Smartphone-powered <Text style={styles.dot}>•</Text> Works with almost any car
            </Text>
          </View>
        </View>

        {/* Description row */}
        <View style={styles.descRow}>
          <PersonIcon color={TEAL} size={24} />
          <Text style={styles.descText}>
            MAUD Connect is an integral part of the privacy-first MAUD platform. Registration and
            some initial profile and vehicle information are required to personalize your AI
            co-pilot and deliver the best experience.
          </Text>
        </View>

        {/* Get started */}
        <TouchableOpacity
          style={styles.getStartedBtn}
          onPress={() => navigation.navigate('Registration')}
          activeOpacity={0.85}
        >
          <Text style={styles.getStartedText}>GET STARTED</Text>
          <ArrowRightIcon color="#0A0E1B" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signInRow}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <Text style={styles.signInText}>
            Already registered? <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>

        {/* Reachable before login: when the app stalls at this screen, the
            Diagnostics log is the only way to report why. */}
        <TouchableOpacity
          style={styles.diagnosticsRow}
          onPress={() => navigation.navigate('Diagnostics')}
          activeOpacity={0.7}
        >
          <Text style={styles.diagnosticsText}>Diagnostics</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  logoImage: { width: 300, height: 88 },
  tagline: { color: TEAL, fontSize: 12, fontWeight: '600', letterSpacing: 3, marginTop: 10 },
  headline: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 38,
    letterSpacing: 0.3,
  },
  headlineAccent: { color: TEAL },
  subtext: {
    color: '#C7CCD6',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  diagram: { marginTop: 0, alignSelf: 'center', position: 'relative' },
  connectorLayer: { position: 'absolute', top: 0, left: 0 },
  outerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(62,207,191,0.25)',
  },
  middleRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(62,207,191,0.45)',
    borderStyle: 'dashed',
  },
  dashLine: {
    position: 'absolute',
    height: 1.5,
    borderTopWidth: 1.5,
    borderColor: 'rgba(62,207,191,0.6)',
    borderStyle: 'dashed',
  },
  centerCircle: {
    position: 'absolute',
    backgroundColor: '#101B33',
    borderWidth: 2,
    borderColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: { color: TEAL, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginTop: 8 },
  cornerWrap: { position: 'absolute', alignItems: 'center' },
  cornerCircle: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  cornerLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginTop: 6 },
  cardsRow: {
    flexDirection: 'row',
    marginTop: 8,
    width: '100%',
    gap: 10,
  },
  card: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  cardIconSlot: { height: 28, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.8, marginTop: 10 },
  cardUnderline: { width: 20, height: 2, backgroundColor: TEAL, marginTop: 6, borderRadius: 1 },
  cardText: { color: '#9AA3B2', fontSize: 11.5, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  privacyTextWrap: { marginLeft: 12, flex: 1 },
  privacyTitle: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
  privacySubtitle: { color: '#9AA3B2', fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  dot: { color: TEAL },
  descRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 18,
    gap: 12,
  },
  descText: { flex: 1, color: '#9AA3B2', fontSize: 13, lineHeight: 19 },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TEAL,
    borderRadius: 28,
    height: 54,
    width: '100%',
    marginTop: 24,
    gap: 10,
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  getStartedText: { color: '#0A0E1B', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  signInRow: { marginTop: 16, alignItems: 'center' },
  signInText: { color: '#C7CCD6', fontSize: 14 },
  signInLink: { color: TEAL, fontWeight: '700' },
  diagnosticsRow: { marginTop: 28, alignItems: 'center', paddingVertical: 8 },
  diagnosticsText: { color: '#5C6575', fontSize: 12 },
});
