import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { subscribeDiagnostics, clearDiagnostics, type DiagnosticLogEntry } from '../../services/diagnosticsLog';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

function formatEntry(entry: DiagnosticLogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `${time} — ${entry.message}${data}`;
}

// Standalone/QA debug builds have no Metro or adb access to read
// console.warn output — this screen surfaces the same trip-auto-start
// diagnostic trail (see diagnosticsLog.ts, populated by
// useTripAutoDetection.ts) directly in the app so a tester can read or
// share it after a drive without any dev tooling.
export default function DiagnosticsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [entries, setEntries] = useState<DiagnosticLogEntry[]>([]);

  useEffect(() => subscribeDiagnostics(setEntries), []);

  function handleShare() {
    if (entries.length === 0) return;
    Share.share({ message: entries.map(formatEntry).reverse().join('\n') }).catch(() => {});
  }

  function handleClear() {
    Alert.alert('Clear Diagnostics', 'Remove all logged entries?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearDiagnostics },
    ]);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Diagnostics</Text>
          <TouchableOpacity onPress={handleShare} hitSlop={HIT} disabled={entries.length === 0}>
            <Text style={[styles.shareText, entries.length === 0 && styles.shareTextDisabled]}>Share</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No diagnostic events yet. This fills in automatically while driving — e.g. if trip auto-start
            doesn't fire, check back here for exactly why.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.entry}>
              <Text style={styles.entryTime}>{new Date(item.timestamp).toLocaleString()}</Text>
              <Text style={styles.entryMessage}>{item.message}</Text>
              {item.data && <Text style={styles.entryData}>{JSON.stringify(item.data)}</Text>}
            </View>
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  shareText: { fontSize: 15, fontWeight: '600', color: '#3ABFBF' },
  shareTextDisabled: { color: '#CCCCCC' },
  divider: { height: 1, backgroundColor: '#E0E0E0' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },

  list: { padding: 16 },
  entry: {
    backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  entryTime: { fontSize: 11, color: '#AAAAAA', marginBottom: 4 },
  entryMessage: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  entryData: { fontSize: 12, color: '#666666', marginTop: 4, fontFamily: 'monospace' },

  clearButton: { alignItems: 'center', paddingVertical: 16 },
  clearButtonText: { fontSize: 14, fontWeight: '600', color: '#E74C3C' },
});
