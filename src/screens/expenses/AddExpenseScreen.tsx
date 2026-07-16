import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { createExpense } from '../../store/slices/expenseSlice';
import type { MainStackNavigationProp, AddExpenseRouteProp } from '../../types/navigation.types';
import type { ExpenseCategory } from '../../types/expense.types';

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'fuel', label: 'Fuel / Energy' },
  { value: 'leasing', label: 'Leasing / Finance' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'tax', label: 'Tax' },
  { value: 'other', label: 'Other' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddExpenseScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const route = useRoute<AddExpenseRouteProp>();
  const dispatch = useAppDispatch();
  const vehicleId = route.params.vehicleId;

  const [category, setCategory] = useState<ExpenseCategory>('fuel');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than 0.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      Alert.alert('Invalid date', 'Enter the date as YYYY-MM-DD.');
      return;
    }

    setIsSaving(true);
    const result = await dispatch(createExpense({
      vehicleId,
      data: {
        category,
        amount: parsedAmount,
        expenseDate,
        vendor: vendor.trim() || undefined,
        notes: notes.trim() || undefined,
      },
    }));
    setIsSaving(false);

    if (createExpense.fulfilled.match(result)) {
      navigation.goBack();
    } else if (result.payload === 'offline_queued') {
      Alert.alert('Saved offline', "This expense will sync automatically once you're back online.");
      navigation.goBack();
    } else {
      Alert.alert('Could not save', 'Please try again.');
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Expense</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.value}
              style={[styles.categoryPill, category === c.value && styles.categoryPillActive]}
              onPress={() => setCategory(c.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryText, category === c.value && styles.categoryTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor="#AAAAAA"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#AAAAAA"
          value={expenseDate}
          onChangeText={setExpenseDate}
        />

        <Text style={styles.label}>Vendor (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Shell, Allianz…"
          placeholderTextColor="#AAAAAA"
          value={vendor}
          onChangeText={setVendor}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Anything else worth remembering"
          placeholderTextColor="#AAAAAA"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.88}
        >
          <Text style={styles.saveBtnText}>{isSaving ? 'Saving…' : 'Save Expense'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#EEEEEE' },
  scroll: { padding: 16, paddingBottom: 40 },

  label: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 8, marginTop: 16 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 8 },
  categoryPill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#DDD', backgroundColor: 'white',
  },
  categoryPillActive: { backgroundColor: TEAL, borderColor: TEAL },
  categoryText: { fontSize: 13, fontWeight: '500', color: '#555' },
  categoryTextActive: { color: 'white', fontWeight: '700' },

  input: {
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1A1A1A',
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },

  saveBtn: {
    backgroundColor: TEAL, borderRadius: 28, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: 'white' },
});
