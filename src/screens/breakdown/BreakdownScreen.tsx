import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { UsersIcon, BuildingIcon, PhoneIcon } from '../../components/icons';
import type { MainTabNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';

interface Contact {
  label: string;
  phone: string;
  Icon: React.ComponentType<{ color?: string; size?: number }>;
}

const QUICK_CONTACTS: Contact[] = [
  { label: 'Auto Club',     phone: '+18002224357', Icon: UsersIcon },
  { label: 'Manufacturer',  phone: '+18006637237', Icon: BuildingIcon },
  { label: 'Insurance',     phone: '+18005550123', Icon: PhoneIcon },
];

interface Garage {
  name: string;
  address: string;
  phone: string;
}

const NEARBY_GARAGES: Garage[] = [
  { name: 'Elite Auto Repairs', address: 'Oak Street. 0.7 miles', phone: '+18005550001' },
  { name: 'Premier Car Care',   address: 'Oak Street. 0.8 miles', phone: '+18005550002' },
];

function dial(phone: string) {
  Linking.openURL(`tel:${phone}`);
}

export default function BreakdownScreen() {
  const navigation = useNavigation<MainTabNavigationProp>();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BackArrowIcon size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Breakdown Assistance</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerSeparator} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Need Help? banner */}
        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>Need Help?</Text>
          <Text style={styles.bannerBody}>
            Contact your auto club, manufacturer, or insurance provider for immediate roadside assistance.
          </Text>
        </View>

        {/* Quick Contacts */}
        <Text style={styles.sectionLabel}>QUICK CONTACTS</Text>

        <View style={styles.contactGroup}>
          {QUICK_CONTACTS.map(({ label, phone, Icon }, i) => (
            <View key={label}>
              <View style={styles.contactRow}>
                <View style={styles.iconBox}>
                  <Icon color="white" size={26} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{label}</Text>
                  <Text style={styles.contactPhone}>{phone}</Text>
                </View>
                <TouchableOpacity onPress={() => dial(phone)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
                  <PhoneIcon color="#BBBBBB" size={22} />
                </TouchableOpacity>
              </View>
              {i < QUICK_CONTACTS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Nearby Garages */}
        <Text style={styles.sectionLabel}>NEARBY GARAGES</Text>

        <View style={styles.contactGroup}>
          {NEARBY_GARAGES.map(({ name, address, phone }, i) => (
            <View key={name}>
              <View style={styles.contactRow}>
                <View style={styles.garageInfo}>
                  <Text style={styles.contactName}>{name}</Text>
                  <Text style={styles.contactPhone}>{address}</Text>
                </View>
                <TouchableOpacity onPress={() => dial(phone)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
                  <PhoneIcon color="#BBBBBB" size={22} />
                </TouchableOpacity>
              </View>
              {i < NEARBY_GARAGES.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSpacer: { width: 32 },
  headerSeparator: { height: 1, backgroundColor: '#EBEBEB' },

  scroll: { padding: 20, rowGap: 16 },

  bannerCard: {
    backgroundColor: '#EBF4FA',
    borderRadius: 16,
    padding: 20,
  },
  bannerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  bannerBody: { fontSize: 14, color: '#555555', lineHeight: 22 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.8,
    marginBottom: -4,
  },

  contactGroup: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: TEAL,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  contactInfo: { flex: 1 },
  garageInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  contactPhone: { fontSize: 13, color: '#888888' },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 16 },
});
