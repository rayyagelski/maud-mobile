import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { GaugeIcon } from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { vehiclesApi } from '../../api';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

function EditIcon({ color = 'white', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function OdometerScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const vehicleId = (selectedVehicle ?? vehicles[0])?.id;

  const [odometer, setOdometer] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!vehicleId) {
      setIsLoading(false);
      return;
    }
    vehiclesApi.getOdometer(vehicleId)
      .then(res => setOdometer(res.data.odometer))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [vehicleId]);

  function openModal() {
    setInputValue(odometer != null ? String(Math.round(odometer)) : '');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!vehicleId) return;
    const parsed = parseFloat(inputValue.replace(',', '.'));
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid value', 'Enter a valid mileage.');
      return;
    }
    setIsSaving(true);
    try {
      await vehiclesApi.updateOdometer(vehicleId, parsed);
      setOdometer(parsed);
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Could not update mileage. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Odometer</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      {/* Background */}
      <View style={styles.bg}>
        <View style={styles.card}>
          {/* Gauge icon circle */}
          <View style={styles.iconCircle}>
            <GaugeIcon color="white" size={52} />
          </View>

          <Text style={styles.mileageLabel}>Current Mileage</Text>
          {isLoading ? (
            <ActivityIndicator color={TEAL} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.mileageValue}>
              {odometer != null ? Math.round(odometer).toLocaleString() : '—'}
            </Text>
          )}
          <Text style={styles.mileageUnit}>kilometers</Text>

          <TouchableOpacity
            style={[styles.updateBtn, !vehicleId && styles.updateBtnDisabled]}
            activeOpacity={0.85}
            onPress={openModal}
            disabled={!vehicleId}
          >
            <EditIcon color="white" size={18} />
            <Text style={styles.updateBtnText}>Update Mileage</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Mileage</Text>
            <TextInput
              style={styles.modalInput}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="decimal-pad"
              placeholder="e.g. 45280"
              placeholderTextColor="#AAAAAA"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setModalVisible(false)}
                disabled={isSaving}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.modalBtnSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF1F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#E0E0E0' },

  bg: { flex: 1, padding: 20, paddingTop: 28 },

  card: {
    backgroundColor: 'white', borderRadius: 28, padding: 32,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },

  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: TEAL,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 22,
  },

  mileageLabel: { fontSize: 15, color: '#888', marginBottom: 8 },
  mileageValue: { fontSize: 52, fontWeight: '800', color: '#1A1A1A', letterSpacing: -1 },
  mileageUnit: { fontSize: 15, color: '#888', marginBottom: 28 },

  updateBtn: {
    flexDirection: 'row', alignItems: 'center', columnGap: 10,
    backgroundColor: TEAL, borderRadius: 28,
    paddingVertical: 16, paddingHorizontal: 40,
  },
  updateBtnDisabled: { opacity: 0.5 },
  updateBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: 'white', borderRadius: 20, padding: 24,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 16, textAlign: 'center' },
  modalInput: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, fontWeight: '700',
    color: '#1A1A1A', textAlign: 'center', marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', columnGap: 12 },
  modalBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#F0F0F0' },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600', color: '#555' },
  modalBtnSave: { backgroundColor: TEAL },
  modalBtnSaveText: { fontSize: 15, fontWeight: '700', color: 'white' },
});
