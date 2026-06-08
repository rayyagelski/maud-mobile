import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useAppSelector } from '../../hooks/useAppSelector';
import { createVehicle } from '../../store/slices/vehicleSlice';
import type { FuelType, VehicleType } from '../../types/vehicle.types';

const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'electric', 'hydrogen', 'hybrid'];
const VEHICLE_TYPES: VehicleType[] = ['car', 'truck', 'scooter'];

export default function AddVehicleScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { isLoading } = useAppSelector(s => s.vehicles);

  const [form, setForm] = useState({
    make: '', model: '', vin: '',
    year: String(new Date().getFullYear()),
    engineSize: '',
  });
  const [fuelType, setFuelType] = useState<FuelType>('petrol');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(key: keyof typeof form) {
    return (val: string) => setForm(p => ({ ...p, [key]: val }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.make.trim()) e.make = 'Required';
    if (!form.model.trim()) e.model = 'Required';
    const y = parseInt(form.year, 10);
    if (!form.year || isNaN(y) || y < 1900 || y > new Date().getFullYear() + 1) e.year = 'Invalid year';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    const result = await dispatch(createVehicle({
      make: form.make.trim(),
      model: form.model.trim(),
      year: parseInt(form.year, 10),
      fuelType,
      vehicleType,
      vin: form.vin.trim() || undefined,
      engineSize: form.engineSize ? parseFloat(form.engineSize) : undefined,
    }));
    if (createVehicle.fulfilled.match(result)) {
      navigation.goBack();
    } else {
      Alert.alert('Error', result.payload as string);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Input label="Make" value={form.make} onChangeText={set('make')} placeholder="e.g. Toyota" error={errors.make} />
        <Input label="Model" value={form.model} onChangeText={set('model')} placeholder="e.g. Corolla" error={errors.model} />
        <Input label="Year" value={form.year} onChangeText={set('year')} keyboardType="numeric" placeholder="e.g. 2020" error={errors.year} />
        <Input label="VIN (optional)" value={form.vin} onChangeText={set('vin')} autoCapitalize="characters" placeholder="17-character VIN" />
        <Input label="Engine Size (L, optional)" value={form.engineSize} onChangeText={set('engineSize')} keyboardType="decimal-pad" placeholder="e.g. 1.6" />

        <Text style={styles.groupLabel}>Fuel Type</Text>
        <View style={styles.chips}>
          {FUEL_TYPES.map(f => (
            <TouchableOpacity key={f} style={[styles.chip, fuelType === f && styles.chipSelected]} onPress={() => setFuelType(f)}>
              <Text style={[styles.chipText, fuelType === f && styles.chipTextSelected]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.groupLabel}>Vehicle Type</Text>
        <View style={styles.chips}>
          {VEHICLE_TYPES.map(v => (
            <TouchableOpacity key={v} style={[styles.chip, vehicleType === v && styles.chipSelected]} onPress={() => setVehicleType(v)}>
              <Text style={[styles.chipText, vehicleType === v && styles.chipTextSelected]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button title="Save Vehicle" onPress={handleSave} loading={isLoading} style={styles.btn} />
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
  btn: { marginTop: 8 },
});
