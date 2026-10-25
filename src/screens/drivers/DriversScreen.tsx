import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { fetchDrivers, selectDriver, removeDriver, viewDriverSlot } from '../../store/slices/driverSlice';
import { effectiveViewedSlot } from '../../utils/tripDriver';
import Button from '../../components/common/Button';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Driver } from '../../types/driver.types';
import { driverRoleLabel, driverSlot } from '../../utils/driverRoles';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

export default function DriversScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<MainStackNavigationProp>();
  const { drivers, selectedDriver, isLoading, viewedSlot } = useAppSelector(s => s.drivers);
  const viewing = effectiveViewedSlot(drivers, viewedSlot);

  useEffect(() => {
    dispatch(fetchDrivers());
  }, [dispatch]);

  // Tap = look at this driver's Driver Score, Eco Score and Trip History.
  function handleView(driver: Driver) {
    dispatch(viewDriverSlot(driverSlot(driver.role)));
  }

  // Separate, explicit action: who records the next trip.
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
        ListHeaderComponent={drivers.length > 1 ? (
          <Text style={styles.hint}>
            Tap a driver to see their Driver Score, Eco Score and trips.
          </Text>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No drivers yet. Add a driver profile.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isViewed = driverSlot(item.role) === viewing;
          const isDriving = item.id === selectedDriver?.id;
          return (
            <TouchableOpacity
              style={[styles.card, isViewed && styles.cardSelected]}
              onPress={() => handleView(item)}
              onLongPress={() => handleRemove(item)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <Text style={styles.driverName}>{item.name}</Text>
                <View style={styles.badges}>
                  {isViewed && <Text style={styles.viewingBadge}>Viewing</Text>}
                  {isDriving && <Text style={styles.activeBadge}>Driving</Text>}
                </View>
              </View>
              <Text style={styles.driverSub}>
                {driverRoleLabel(item.role)}{item.isDefault ? ' · Default' : ''}
              </Text>
              {!isDriving && (
                <TouchableOpacity onPress={() => handleSelect(item)} hitSlop={HIT} style={styles.useButton}>
                  <Text style={styles.useButtonText}>Use for my trips</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
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
  viewingBadge: { fontSize: 12, color: '#1E4E8C', backgroundColor: '#E8EFF8', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginRight: 6 },
  badges: { flexDirection: 'row', alignItems: 'center' },
  hint: { fontSize: 13, color: '#6D6D72', marginBottom: 12 },
  useButton: { alignSelf: 'flex-start', marginTop: 10 },
  useButtonText: { fontSize: 14, fontWeight: '600', color: '#1E4E8C' },
  driverSub: { fontSize: 14, color: '#6D6D72', marginTop: 4, textTransform: 'capitalize' },
});
