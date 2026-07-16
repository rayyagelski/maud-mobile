import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Button from '../../components/common/Button';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// Adding a vehicle requires setting up its insurance, leasing/financing,
// registration, and service/repair records — a multi-step onboarding flow
// that only exists on the web app. There is no mobile API for it, by design.
const ADD_VEHICLE_URL = 'https://myautodata.com/onboarding/upload';

export default function AddVehicleScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();

  function handleContinue() {
    navigation.navigate('WebView', { url: ADD_VEHICLE_URL, title: 'Add Vehicle' });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Add a vehicle on the web</Text>
        <Text style={styles.body}>
          Adding a vehicle involves setting up insurance, leasing/financing, registration,
          and service details — this is done on the MAUD web app.
        </Text>
        <Button title="Continue to Web" onPress={handleContinue} style={styles.btn} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: '#6D6D72', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  btn: { marginTop: 8 },
});
