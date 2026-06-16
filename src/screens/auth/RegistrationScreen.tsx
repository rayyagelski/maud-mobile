import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { AuthNavigationProp } from '../../types/navigation.types';
import BackArrowIcon from '../../components/common/BackArrowIcon';

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh',
  'Belarus', 'Belgium', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana',
  'Brazil', 'Bulgaria', 'Cambodia', 'Cameroon', 'Canada', 'Chile', 'China',
  'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
  'Estonia', 'Ethiopia', 'Finland', 'France', 'Georgia', 'Germany', 'Ghana',
  'Greece', 'Guatemala', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica',
  'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Latvia', 'Lebanon',
  'Libya', 'Lithuania', 'Luxembourg', 'Malaysia', 'Malta', 'Mexico',
  'Moldova', 'Morocco', 'Mozambique', 'Myanmar', 'Nepal', 'Netherlands',
  'New Zealand', 'Nigeria', 'North Macedonia', 'Norway', 'Oman', 'Pakistan',
  'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar', 'Romania', 'Russia', 'Saudi Arabia', 'Senegal', 'Serbia',
  'Singapore', 'Slovakia', 'Slovenia', 'South Africa', 'South Korea',
  'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tanzania', 'Thailand', 'Tunisia', 'Turkey', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zimbabwe',
];

export default function RegistrationScreen() {
  const navigation = useNavigation<AuthNavigationProp>();
  const [country, setCountry] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [vehicleUse, setVehicleUse] = useState<'private' | 'business'>('private');

  const filtered = search
    ? COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : COUNTRIES;

  const canContinue = country.length > 0 && agreed;

  function handleContinue() {
    navigation.navigate('WebView', {
      url: 'https://myautodata.com/',
      title: 'Registration',
    });
  }

  function closePicker() {
    setShowPicker(false);
    setSearch('');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BackArrowIcon size={22} color="#00D4C8" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Account</Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>A few details before we get started</Text>

        <Text style={styles.label}>Country of Residence</Text>
        <TouchableOpacity
          style={styles.field}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.8}
        >
          <Text style={country ? styles.fieldValue : styles.fieldPlaceholder}>
            {country || 'Select your country'}
          </Text>
          <Text style={styles.fieldChevron}>›</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Vehicle Use</Text>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, vehicleUse === 'private' && styles.toggleBtnActive]}
            onPress={() => setVehicleUse('private')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, vehicleUse === 'private' && styles.toggleTextActive]}>
              Private
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, vehicleUse === 'business' && styles.toggleBtnActive]}
            onPress={() => setVehicleUse('business')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, vehicleUse === 'business' && styles.toggleTextActive]}>
              Business
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAgreed(v => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkText}>
            I have read and agree to the{' '}
            <Text style={styles.link}>Privacy Policy</Text>
            {' '}and{' '}
            <Text style={styles.link}>Terms of Service</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, !canContinue && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Continue</Text>
          <Text style={styles.btnArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.signInLink}>
          <Text style={styles.signInText}>
            Already have an account?{' '}
            <Text style={styles.signInBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      <Modal
        visible={showPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePicker}
      >
        <View style={styles.modalRoot}>
          <SafeAreaView edges={['top']} style={styles.modalSafeTop}>
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity onPress={closePicker}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Country</Text>
              <View style={styles.modalHeaderSpacer} />
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={search}
              onChangeText={setSearch}
              autoFocus
              returnKeyType="search"
            />
          </SafeAreaView>
          <FlatList
            data={filtered}
            keyExtractor={item => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.countryItem}
                onPress={() => { setCountry(item); closePicker(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.countryText}>{item}</Text>
                {item === country && <Text style={styles.countryCheck}>✓</Text>}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </Modal>
    </View>
  );
}

const TEAL = '#00D4C8';
const BG = '#0B0E1A';
const CARD = '#161B2E';
const BORDER = 'rgba(0,212,200,0.15)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeTop: { backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  headerSpacer: { width: 22 },

  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  subtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    marginBottom: 28,
  },

  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 20,
  },

  field: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
  },
  fieldValue: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  fieldPlaceholder: { flex: 1, color: 'rgba(255,255,255,0.35)', fontSize: 15 },
  fieldChevron: { color: TEAL, fontSize: 22, fontWeight: '300' },

  toggle: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: TEAL },
  toggleText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  toggleTextActive: { color: '#0B0E1A' },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 28,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: TEAL, borderColor: TEAL },
  checkmark: { color: '#0B0E1A', fontSize: 13, fontWeight: '700' },
  checkText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20 },
  link: { color: TEAL, fontWeight: '600' },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  btn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#0B0E1A', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  btnArrow: { color: '#0B0E1A', fontSize: 20, fontWeight: '700' },

  modalRoot: { flex: 1, backgroundColor: BG },
  modalSafeTop: { backgroundColor: BG },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalCancel: { color: TEAL, fontSize: 16, width: 60 },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  modalHeaderSpacer: { width: 60 },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    height: 44,
    color: '#FFFFFF',
    fontSize: 15,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  countryText: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  countryCheck: { color: TEAL, fontSize: 16, fontWeight: '700' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16 },

  signInLink: { alignItems: 'center', paddingVertical: 14 },
  signInText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  signInBold: { color: TEAL, fontWeight: '600' },
});
