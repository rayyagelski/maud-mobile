import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MailIcon from '../../components/common/MailIcon';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { requestPasswordReset } from '../../store/slices/authSlice';
import type { AuthNavigationProp } from '../../types/navigation.types';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<AuthNavigationProp>();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    if (!email.trim()) { setEmailError('Email is required'); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Invalid email address'); return false; }
    setEmailError('');
    return true;
  }

  async function handleSendCode() {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const result = await dispatch(requestPasswordReset(email.trim()));
      if (requestPasswordReset.fulfilled.match(result)) {
        // The backend always returns success here regardless of whether the
        // email matched an account — never reveal account existence.
        navigation.navigate('VerifyEmail', { email: email.trim(), mode: 'reset' });
      } else {
        Alert.alert('Something went wrong', 'Please check your connection and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.content}>
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <BackArrowIcon size={18} color="#4B5563" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Mail icon badge */}
          <View style={styles.iconBadge}>
            <MailIcon size={28} color="#3ECFBF" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a code{'\n'}to reset your password.
          </Text>

          {/* Email field */}
          <Text style={styles.label}>Email</Text>
          <View style={[styles.inputWrapper, emailError ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={v => { setEmail(v); setEmailError(''); }}
              placeholder="Enter your email"
              placeholderTextColor="#B0B8C1"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          {/* Send Code button */}
          <TouchableOpacity
            style={[styles.sendBtn, isLoading && styles.sendBtnDisabled]}
            onPress={handleSendCode}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.sendBtnText}>{isLoading ? 'Sending…' : 'Send Code'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F0F5',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    color: '#4B5563',
    fontWeight: '500',
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#E6F9F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 8,
  },
  inputWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 20,
    height: 54,
    justifyContent: 'center',
    marginBottom: 4,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  input: {
    fontSize: 15,
    color: '#1A1A2E',
  },
  fieldError: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 12,
    marginLeft: 4,
  },
  sendBtn: {
    backgroundColor: '#3ECFBF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#3ECFBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
