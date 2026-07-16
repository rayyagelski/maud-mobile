import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useAppSelector } from '../../hooks/useAppSelector';
import { createDriver } from '../../store/slices/driverSlice';
import type { Driver } from '../../types/driver.types';

const ROLES: Driver['role'][] = ['self', 'family', 'other'];

export default function AddDriverScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { isLoading } = useAppSelector(s => s.drivers);

  const [name, setName] = useState('');
  const [role, setRole] = useState<Driver['role']>('family');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) {
      setError('Required');
      return;
    }
    setError('');

    const result = await dispatch(createDriver({ name: name.trim(), role, isDefault }));
    if (createDriver.fulfilled.match(result)) {
      navigation.goBack();
    } else {
      Alert.alert('Error', result.payload as string);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Alex" error={error} />

        <Text style={styles.groupLabel}>Role</Text>
        <View style={styles.chips}>
          {ROLES.map(r => (
            <TouchableOpacity key={r} style={[styles.chip, role === r && styles.chipSelected]} onPress={() => setRole(r)}>
              <Text style={[styles.chipText, role === r && styles.chipTextSelected]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.defaultRow} onPress={() => setIsDefault(v => !v)} activeOpacity={0.7}>
          <View style={[styles.checkbox, isDefault && styles.checkboxChecked]} />
          <Text style={styles.defaultLabel}>Set as default driver</Text>
        </TouchableOpacity>

        <Button title="Save Driver" onPress={handleSave} loading={isLoading} style={styles.btn} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  scroll: { padding: 20 },
  groupLabel: { fontSize: 14, fontWeight: '500', color: '#3A3A3C', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E5E5EA', borderWidth: 1, borderColor: 'transparent' },
  chipSelected: { backgroundColor: '#E8EFF8', borderColor: '#1E4E8C' },
  chipText: { fontSize: 14, color: '#3A3A3C', textTransform: 'capitalize' },
  chipTextSelected: { color: '#1E4E8C', fontWeight: '600' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#C7C7CC', marginRight: 10 },
  checkboxChecked: { backgroundColor: '#1E4E8C', borderColor: '#1E4E8C' },
  defaultLabel: { fontSize: 15, color: '#3A3A3C' },
  btn: { marginTop: 8 },
});
