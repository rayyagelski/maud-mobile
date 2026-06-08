import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { selectVehicle } from '../../store/slices/vehicleSlice';
import Button from '../../components/common/Button';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Vehicle } from '../../types/vehicle.types';

export default function VehicleListScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<MainStackNavigationProp>();
  const { vehicles, selectedVehicle, isLoading } = useAppSelector(s => s.vehicles);

  async function handleSelect(vehicle: Vehicle) {
    await dispatch(selectVehicle(vehicle.id));
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={vehicles}
        keyExtractor={v => v.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No vehicles yet. Add your first vehicle.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.id === selectedVehicle?.id && styles.cardSelected]}
            onPress={() => handleSelect(item)}
            activeOpacity={0.8}
          >
            <View style={styles.cardRow}>
              <Text style={styles.vehicleName}>{item.make} {item.model}</Text>
              {item.id === selectedVehicle?.id && <Text style={styles.activeBadge}>Active</Text>}
            </View>
            <Text style={styles.vehicleSub}>{item.year} · {item.fuelType} · {item.vehicleType}</Text>
            {item.vin && <Text style={styles.vin}>VIN: {item.vin}</Text>}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <Button
            title="Add New Vehicle"
            onPress={() => navigation.navigate('AddVehicle')}
            variant="secondary"
            style={{ marginTop: 8 }}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  list: { padding: 20 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#8E8E93', fontSize: 15 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSelected: { borderColor: '#1E4E8C' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleName: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  activeBadge: { fontSize: 12, color: '#FFFFFF', backgroundColor: '#1E4E8C', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  vehicleSub: { fontSize: 14, color: '#6D6D72', marginTop: 4, textTransform: 'capitalize' },
  vin: { fontSize: 11, color: '#AEAEB2', marginTop: 4 },
});
