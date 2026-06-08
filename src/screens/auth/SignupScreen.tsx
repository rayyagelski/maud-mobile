import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useAppSelector } from '../../hooks/useAppSelector';
import { register, clearError } from '../../store/slices/authSlice';
import type { AuthNavigationProp } from '../../types/navigation.types';

export default function SignupScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<AuthNavigationProp>();
  const { isLoading, error } = useAppSelector(s => s.auth);

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function set(key: keyof typeof form) {
    return (val: string) => setForm(prev => ({ ...prev, [key]: val }));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim()) errors.firstName = 'Required';
    if (!form.lastName.trim()) errors.lastName = 'Required';
    if (!form.email.trim()) errors.email = 'Required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errors.email = 'Invalid email';
    if (!form.password) errors.password = 'Required';
    else if (form.password.length < 8) errors.password = 'Min 8 characters';
    if (form.password !== form.confirm) errors.confirm = 'Passwords do not match';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSignup() {
    if (!validate()) return;
    dispatch(clearError());
    const result = await dispatch(
      register({ email: form.email.trim(), password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim() }),
    );
    if (register.rejected.match(result)) {
      Alert.alert('Registration Failed', result.payload as string);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>MAUD</Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Get started</Text>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Input label="First Name" value={form.firstName} onChangeText={set('firstName')} error={fieldErrors.firstName} placeholder="John" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Input label="Last Name" value={form.lastName} onChangeText={set('lastName')} error={fieldErrors.lastName} placeholder="Doe" />
              </View>
            </View>

            <Input label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={fieldErrors.email} placeholder="you@example.com" />
            <Input label="Password" value={form.password} onChangeText={set('password')} secureTextEntry error={fieldErrors.password} placeholder="Min 8 characters" />
            <Input label="Confirm Password" value={form.confirm} onChangeText={set('confirm')} secureTextEntry error={fieldErrors.confirm} placeholder="Repeat password" />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button title="Create Account" onPress={handleSignup} loading={isLoading} style={styles.btn} />

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
              <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign in</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1E4E8C' },
  scroll: { flexGrow: 1 },
  header: { alignItems: 'center', paddingVertical: 40 },
  logo: { fontSize: 48, fontWeight: '800', color: '#FFFFFF', letterSpacing: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingTop: 32,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },
  row: { flexDirection: 'row' },
  errorText: { color: '#E53935', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  btn: { marginTop: 8 },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { fontSize: 14, color: '#6D6D72' },
  linkBold: { color: '#1E4E8C', fontWeight: '600' },
});
