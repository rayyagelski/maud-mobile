import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { accountApi } from '../../api/endpoints/account';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useAppSelector } from '../../hooks/useAppSelector';
import { clearDiagnostics } from '../../services/diagnosticsLog';
import { logout } from '../../store/slices/authSlice';
import { clearAllTrips } from '../../store/slices/tripSlice';
import { accountDeletionErrorMessage } from '../../utils/accountDeletion';
import { HEADLESS_LOCATION_QUEUE_KEY } from '../../utils/constants';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const RED = '#D32F2F';
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const DELETED_ITEMS = [
  'Your account and every driver profile on it, including family members',
  'All trips, GPS data and driving scores',
  'Vehicles, expenses and service records',
  'Your reward points, which cannot be restored or paid out',
];

export default function DeleteAccountScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const dispatch = useAppDispatch();
  const isTracking = useAppSelector(s => s.trips.isTracking);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setIsDeleting(true);
    setError(null);
    try {
      await accountApi.delete(password);
    } catch (err) {
      setError(accountDeletionErrorMessage(err as { status?: number; errMessage?: string }));
      setIsDeleting(false);
      return;
    }
    // Nothing of the account stays on the phone. logout() clears vehicles,
    // drivers, Bluetooth pairings, queued uploads and the login, but not trips.
    clearDiagnostics();
    BackgroundGeolocation.destroyLocations().catch(() => {});
    AsyncStorage.removeItem(HEADLESS_LOCATION_QUEUE_KEY).catch(() => {});
    dispatch(clearAllTrips());
    dispatch(logout());
    Alert.alert('Account Deleted', 'Your account and data have been deleted.');
  }

  function confirmDelete() {
    Alert.alert(
      'Delete Account?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: deleteAccount },
      ],
    );
  }

  const canDelete = password.length > 0 && !isDeleting && !isTracking;

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT} disabled={isDeleting}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Delete Account</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>This permanently deletes:</Text>
            {DELETED_ITEMS.map(item => (
              <Text key={item} style={styles.item}>{`•  ${item}`}</Text>
            ))}
            <Text style={styles.note}>
              Any active subscription is cancelled. Payment records are kept as long as the law requires.
            </Text>
          </View>

          {isTracking && (
            <Text style={styles.error}>End your current trip before deleting your account.</Text>
          )}

          <Text style={styles.label}>Enter your password to confirm</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(value) => { setPassword(value); setError(null); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isDeleting}
            placeholder="Password"
            placeholderTextColor="#999"
          />
          {error != null && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, !canDelete && styles.buttonDisabled]}
            onPress={confirmDelete}
            disabled={!canDelete}
            activeOpacity={0.8}
          >
            {isDeleting
              ? <ActivityIndicator color="white" />
              : <Text style={styles.buttonText}>Delete My Account</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  flex: { flex: 1 },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#E0E0E0' },

  body: { padding: 16 },
  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  item: { fontSize: 14, color: '#1A1A1A', lineHeight: 20, marginBottom: 6 },
  note: { fontSize: 12, color: '#888', lineHeight: 16, marginTop: 6 },

  label: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  input: {
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1A1A1A',
  },
  error: { fontSize: 13, color: RED, lineHeight: 18, marginTop: 10 },

  button: {
    backgroundColor: RED, borderRadius: 24, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 15, fontWeight: '700', color: 'white' },
});
