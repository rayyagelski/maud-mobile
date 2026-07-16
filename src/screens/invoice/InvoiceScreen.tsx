import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { PinIcon, PhoneIcon, ShareIcon, RefreshIcon } from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { fetchServiceRecord } from '../../store/slices/serviceRecordSlice';
import type { MainStackNavigationProp, InvoiceRouteProp } from '../../types/navigation.types';
import type { ServiceRecord } from '../../types/serviceRecord.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

function currencySymbol(code: string): string {
  return { EUR: '€', USD: '$', GBP: '£' }[code] ?? code;
}

function buildShareText(record: ServiceRecord): string {
  const lines = [
    `Invoice — ${record.shop.name}`,
    record.date ? `Date: ${new Date(record.date).toLocaleDateString()}` : null,
    record.invoiceNumber ? `Invoice #: ${record.invoiceNumber}` : null,
    '',
    ...record.completedWorks.map(work => {
      const subtotal = (work.costOfLabour ?? 0) + (work.costOfParts ?? 0);
      return `${work.description ?? 'Service'} — €${subtotal.toFixed(2)}`;
    }),
    '',
    `Total: €${record.totalCost.toFixed(2)}`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function InvoiceScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const route = useRoute<InvoiceRouteProp>();
  const dispatch = useAppDispatch();
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const vehicleId = (selectedVehicle ?? vehicles[0])?.id;
  const record = useAppSelector(s => s.serviceRecords.selectedRecord);

  useEffect(() => {
    if (!vehicleId || !route.params.serviceId) return;
    dispatch(fetchServiceRecord({ vehicleId, id: route.params.serviceId }));
  }, [vehicleId, route.params.serviceId, dispatch]);

  async function handleShare() {
    if (!record) return;
    try {
      await Share.share({ message: buildShareText(record) });
    } catch {
      // user cancelled or share sheet failed — nothing to recover
    }
  }

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

      {!record ? (
        <View style={styles.shopCard}>
          <Text style={styles.emptyText}>Loading invoice…</Text>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Shop info card */}
        <View style={styles.shopCard}>
          <View style={styles.shopTop}>
            <View style={styles.shopAvatar}>
              <Text style={styles.shopAvatarText}>{record.shop.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>{record.shop.name}</Text>
              {record.shop.address && (
                <View style={styles.shopDetailRow}>
                  <PinIcon color="#888" size={14} />
                  <Text style={styles.shopDetailText}>{'  '}{record.shop.address}</Text>
                </View>
              )}
              {record.shop.phone && (
                <View style={styles.shopDetailRow}>
                  <PhoneIcon color="#888" size={14} />
                  <Text style={styles.shopDetailText}>{'  '}{record.shop.phone}</Text>
                </View>
              )}
            </View>
          </View>
          {(record.invoiceNumber || record.customerId) && (
            <>
              <View style={styles.shopDivider} />
              <View style={styles.invoiceNums}>
                {record.invoiceNumber && (
                  <Text style={styles.invoiceNumText}>
                    Invoice #: <Text style={styles.invoiceNumBold}>{record.invoiceNumber}</Text>
                  </Text>
                )}
                {record.customerId && (
                  <Text style={styles.invoiceNumText}>
                    Customer #: <Text style={styles.invoiceNumBold}>{record.customerId}</Text>
                  </Text>
                )}
              </View>
            </>
          )}
        </View>

        {/* Services performed */}
        <Text style={styles.sectionTitle}>SERVICES PERFORMED</Text>
        <View style={styles.servicesCard}>
          {record.completedWorks.length === 0 && (
            <Text style={styles.emptyText}>No itemized line items recorded for this visit.</Text>
          )}
          {record.completedWorks.map((work, i) => {
            const subtotal = (work.costOfLabour ?? 0) + (work.costOfParts ?? 0);
            return (
              <View key={i}>
                <View style={styles.svcHeader}>
                  <View style={styles.svcIconBox}>
                    <RefreshIcon color="#888" size={20} />
                  </View>
                  <Text style={styles.svcName}>{work.description ?? 'Service item'}</Text>
                  <Text style={styles.svcCost}>{currencySymbol('EUR')}{subtotal.toFixed(2)}</Text>
                </View>
                {work.costOfLabour != null && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cost of Labor</Text>
                    <Text style={styles.detailValue}>{currencySymbol('EUR')}{work.costOfLabour.toFixed(2)}</Text>
                  </View>
                )}
                {work.costOfParts != null && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cost of Parts</Text>
                    <Text style={styles.detailValue}>{currencySymbol('EUR')}{work.costOfParts.toFixed(2)}</Text>
                  </View>
                )}
                {i < record.completedWorks.length - 1 && <View style={styles.svcDivider} />}
              </View>
            );
          })}

          {/* Total */}
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Cost:</Text>
            <Text style={styles.totalAmount}>{currencySymbol('EUR')}{record.totalCost.toFixed(2)}</Text>
          </View>
        </View>

      </ScrollView>
      )}

      {/* Fixed bottom action bar */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8} onPress={handleShare} disabled={!record}>
          <ShareIcon color="#1A1A1A" size={20} />
          <Text style={styles.shareBtnText}>Share Invoice</Text>
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
  invoiceNums: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 4 },
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
  svcDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },
  totalDivider: { height: 1, backgroundColor: '#DDDDDD', marginVertical: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  totalAmount: { fontSize: 26, fontWeight: '800', color: '#1A1A1A' },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', padding: 24 },

  // Bottom action bar
  bottomBar: {
    flexDirection: 'row', backgroundColor: 'white',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: '#EEEEEE', columnGap: 12,
  },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: TEAL, borderRadius: 14, paddingVertical: 14, columnGap: 8,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: 'white' },
});
