import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { PhoneIcon, WarningTriangleIcon } from '../../components/icons';
import type { MainTabNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';
const RED = '#E53935';

export default function EmergencyScreen() {
  const navigation = useNavigation<MainTabNavigationProp>();
  const [confirmVisible, setConfirmVisible] = useState(false);

  function handleCallNow() {
    setConfirmVisible(false);
    Linking.openURL('tel:911');
  }

  return (
    <View style={styles.safe}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Emergency</Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>
      <View style={styles.headerSeparator} />

      {/* Body */}
      <View style={styles.body}>
        {/* SOS circle button */}
        <TouchableOpacity
          style={styles.sosButton}
          onPress={() => setConfirmVisible(true)}
          activeOpacity={0.85}
        >
          <PhoneIcon color="white" size={62} />
          <Text style={styles.sosLabel}>SOS</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Emergency Services</Text>
        <Text style={styles.subtitle}>
          {'Press the button to call emergency\nservices immediately'}
        </Text>

        {/* Warning card */}
        <View style={styles.warningCard}>
          <View style={styles.warningRow}>
            <WarningTriangleIcon color={RED} size={18} />
            <Text style={styles.warningTitle}>  For Emergencies Only</Text>
          </View>
          <Text style={styles.warningBody}>
            This button connects you directly to emergency services (911). Use only in genuine emergencies.
          </Text>
        </View>
      </View>

      {/* Confirmation bottom sheet */}
      <Modal
        transparent
        visible={confirmVisible}
        animationType="slide"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayDismiss} activeOpacity={1} onPress={() => setConfirmVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{'Are you sure you\nwant to call?'}</Text>

            <TouchableOpacity style={styles.callBtn} onPress={handleCallNow} activeOpacity={0.85}>
              <PhoneIcon color="white" size={20} />
              <Text style={styles.callBtnText}>Call now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmVisible(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSpacer: { width: 32 },
  headerSeparator: { height: 1, backgroundColor: '#EBEBEB' },

  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 52,
  },

  sosButton: {
    width: 184,
    height: 184,
    borderRadius: 92,
    backgroundColor: RED,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 12,
  },
  sosLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    letterSpacing: 2,
    marginTop: 8,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 32,
  },

  warningCard: {
    width: '100%',
    backgroundColor: '#FFF0F0',
    borderRadius: 16,
    padding: 20,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: RED,
    marginLeft: 6,
  },
  warningBody: {
    fontSize: 14,
    color: '#444444',
    lineHeight: 22,
  },

  // Bottom sheet modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayDismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 28,
  },
  callBtn: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    backgroundColor: TEAL,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 12,
  },
  callBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  cancelBtn: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
});
