import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { PinIcon, PhoneIcon, ShareIcon, DropletIcon, RefreshIcon } from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Data ───────────────────────────────────────────────────────────────────

type DetailLine = { label: string; value: string | null; bold?: boolean };
type ServiceItem = {
  iconType: 'droplet' | 'refresh';
  name: string;
  cost: string;
  details: DetailLine[];
};

const SERVICES: ServiceItem[] = [
  {
    iconType: 'droplet',
    name: 'Oil Change',
    cost: '€70.00',
    details: [
      { label: 'Cost of Labor 1.0 hr @ €70/hr', value: null },
      { label: 'Cost of Parts', value: '€45.00' },
      { label: 'Subtotal:', value: '€115.00', bold: true },
    ],
  },
  {
    iconType: 'refresh',
    name: 'Tire Rotation',
    cost: '€49.00',
    details: [
      { label: 'Subtotal:', value: '€49.00', bold: true },
    ],
  },
];

// ── Local icon ─────────────────────────────────────────────────────────────

function DownloadIcon({ color = 'white', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function InvoiceScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();

  return (
    <View style={styles.root}>

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invoice</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      {/* Scrollable content */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Shop info card */}
        <View style={styles.shopCard}>
          <View style={styles.shopTop}>
            <View style={styles.shopAvatar}>
              <Text style={styles.shopAvatarText}>G</Text>
            </View>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>Greenway Auto Repair</Text>
              <View style={styles.shopDetailRow}>
                <PinIcon color="#888" size={14} />
                <Text style={styles.shopDetailText}>
                  {'  '}123 Maple Street, Springfield,{'\n  '}IL 62701
                </Text>
              </View>
              <View style={styles.shopDetailRow}>
                <PhoneIcon color="#888" size={14} />
                <Text style={styles.shopDetailText}>{'  '}(555) 123-4567</Text>
              </View>
            </View>
          </View>
          <View style={styles.shopDivider} />
          <View style={styles.invoiceNums}>
            <Text style={styles.invoiceNumText}>
              Invoice #:<Text style={styles.invoiceNumBold}>02549</Text>
            </Text>
            <Text style={styles.invoiceNumText}>
              Customer #:<Text style={styles.invoiceNumBold}>14786</Text>
            </Text>
          </View>
        </View>

        {/* Services performed */}
        <Text style={styles.sectionTitle}>SERVICES PERFORMED</Text>
        <View style={styles.servicesCard}>
          {SERVICES.map((svc, i) => (
            <View key={svc.name}>
              {/* Service header */}
              <View style={styles.svcHeader}>
                <View style={styles.svcIconBox}>
                  {svc.iconType === 'droplet'
                    ? <DropletIcon color="#888" size={20} />
                    : <RefreshIcon color="#888" size={20} />}
                </View>
                <Text style={styles.svcName}>{svc.name}</Text>
                <Text style={styles.svcCost}>{svc.cost}</Text>
              </View>
              {/* Detail lines */}
              {svc.details.map((line, j) => (
                <View key={j} style={styles.detailRow}>
                  <Text style={[styles.detailLabel, line.bold && styles.detailBold]}>
                    {line.label}
                  </Text>
                  {line.value != null && (
                    <Text style={[styles.detailValue, line.bold && styles.detailBold]}>
                      {line.value}
                    </Text>
                  )}
                </View>
              ))}
              {i < SERVICES.length - 1 && <View style={styles.svcDivider} />}
            </View>
          ))}

          {/* Total */}
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Cost:</Text>
            <Text style={styles.totalAmount}>€295.00</Text>
          </View>
        </View>

      </ScrollView>

      {/* Fixed bottom action bar */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8}>
          <ShareIcon color="#1A1A1A" size={20} />
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.downloadBtn} activeOpacity={0.85}>
          <DownloadIcon color="white" size={20} />
          <Text style={styles.downloadBtnText}>Download PDF</Text>
        </TouchableOpacity>
      </SafeAreaView>

    </View>
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
  scroll: { padding: 16, paddingBottom: 24 },

  // Shop card
  shopCard: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  shopTop: { flexDirection: 'row', marginBottom: 4 },
  shopAvatar: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#E6F5F5', justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  shopAvatarText: { fontSize: 22, fontWeight: '800', color: TEAL },
  shopInfo: { flex: 1 },
  shopName: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 7 },
  shopDetailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  shopDetailText: { fontSize: 13, color: '#555', lineHeight: 19, flex: 1 },
  shopDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },
  invoiceNums: { flexDirection: 'row', justifyContent: 'space-between' },
  invoiceNumText: { fontSize: 13, color: '#888' },
  invoiceNumBold: { fontWeight: '700', color: '#1A1A1A' },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.3, marginBottom: 12 },

  // Services card
  servicesCard: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  svcHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  svcIconBox: { width: 28, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  svcName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  svcCost: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingLeft: 38, paddingVertical: 3,
  },
  detailLabel: { flex: 1, fontSize: 13, color: '#888' },
  detailValue: { fontSize: 13, color: '#888' },
  detailBold: { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },
  svcDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },
  totalDivider: { height: 1, backgroundColor: '#DDDDDD', marginVertical: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  totalAmount: { fontSize: 26, fontWeight: '800', color: '#1A1A1A' },

  // Bottom action bar
  bottomBar: {
    flexDirection: 'row', backgroundColor: 'white',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: '#EEEEEE', columnGap: 12,
  },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'white', borderWidth: 1.5, borderColor: '#E0E0E0',
    borderRadius: 14, paddingVertical: 14, columnGap: 8,
  },
  shareBtnText: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  downloadBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: TEAL, borderRadius: 14, paddingVertical: 14, columnGap: 8,
  },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: 'white' },
});
