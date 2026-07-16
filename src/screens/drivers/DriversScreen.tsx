import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { fetchDrivers, selectDriver, removeDriver } from '../../store/slices/driverSlice';
import Button from '../../components/common/Button';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Driver } from '../../types/driver.types';

export default function DriversScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<MainStackNavigationProp>();
  const { drivers, selectedDriver, isLoading } = useAppSelector(s => s.drivers);

  useEffect(() => {
    dispatch(fetchDrivers());
  }, [dispatch]);

  function handleSelect(driver: Driver) {
    dispatch(selectDriver(driver));
  }

  function handleRemove(driver: Driver) {
    Alert.alert('Remove driver', `Remove ${driver.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dispatch(removeDriver(driver.id)) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={drivers}
        keyExtractor={d => d.id}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={() => dispatch(fetchDrivers())}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No drivers yet. Add a driver profile.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.id === selectedDriver?.id && styles.cardSelected]}
            onPress={() => handleSelect(item)}
            onLongPress={() => handleRemove(item)}
            activeOpacity={0.8}
          >
            <View style={styles.cardRow}>
              <Text style={styles.driverName}>{item.name}</Text>
              {item.id === selectedDriver?.id && <Text style={styles.activeBadge}>Selected</Text>}
            </View>
            <Text style={styles.driverSub}>
              {item.role}{item.isDefault ? ' · Default' : ''}
            </Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <Button
            title="Add New Driver"
            onPress={() => navigation.navigate('AddDriver')}
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
  driverName: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  activeBadge: { fontSize: 12, color: '#FFFFFF', backgroundColor: '#1E4E8C', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  driverSub: { fontSize: 14, color: '#6D6D72', marginTop: 4, textTransform: 'capitalize' },
});
