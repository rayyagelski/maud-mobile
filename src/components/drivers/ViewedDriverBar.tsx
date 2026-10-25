import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { driverForSlot, effectiveViewedSlot } from '../../utils/tripDriver';
import { driverRoleLabel } from '../../utils/driverRoles';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// "Showing: Alex · Child   Change" — whose scores/trips a screen shows.
// Hidden for single-driver accounts, where there is nothing to switch.
export default function ViewedDriverBar() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const drivers = useAppSelector(s => s.drivers.drivers);
  const viewedSlot = useAppSelector(s => s.drivers.viewedSlot);
  if (drivers.length < 2) return null;

  const slot = effectiveViewedSlot(drivers, viewedSlot);
  const driver = driverForSlot(drivers, slot);
  const name = driver?.name ?? 'Me';
  const label = driverRoleLabel(driver?.role ?? 'self');

  return (
    <View style={styles.bar}>
      <Text style={styles.text} numberOfLines={1}>
        Showing: <Text style={styles.name}>{name}</Text> · {label}
      </Text>
      <TouchableOpacity onPress={() => navigation.navigate('Drivers')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.change}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E8EFF8',
  },
  text: { flex: 1, fontSize: 13, color: '#3A3A3C', marginRight: 12 },
  name: { fontWeight: '700', color: '#1E4E8C' },
  change: { fontSize: 13, fontWeight: '600', color: '#1E4E8C' },
});
