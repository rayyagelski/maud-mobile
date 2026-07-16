import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import ShieldCheckIcon from '../../components/common/ShieldCheckIcon';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import OTPInput from '../../components/common/OTPInput';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { requestPasswordReset } from '../../store/slices/authSlice';
import type { AuthNavigationProp } from '../../types/navigation.types';
import type { RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../types/navigation.types';

type VerifyRoute = RouteProp<AuthStackParamList, 'VerifyEmail'>;

const RESEND_COOLDOWN = 60;

export default function VerifyEmailScreen() {
  const navigation = useNavigation<AuthNavigationProp>();
  const dispatch = useAppDispatch();
  const route = useRoute<VerifyRoute>();
  const { email } = route.params;

  const [code, setCode] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleVerify() {
    if (code.length < 6) {
      Alert.alert('Incomplete Code', 'Please enter all 6 digits.');
      return;
    }
    // The code itself is only actually validated server-side at the final
    // "set new password" step (see CreateNewPasswordScreen) — this screen is
    // just a length gate, avoiding a redundant verify round-trip.
    if (route.params.mode === 'reset') {
      navigation.navigate('CreateNewPassword', { email, code });
    } else {
      navigation.navigate('Login');
    }
  }

  async function handleResend() {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      const result = await dispatch(requestPasswordReset(email));
      if (requestPasswordReset.fulfilled.match(result)) {
        setCooldown(RESEND_COOLDOWN);
        Alert.alert('Code Sent', `A new code has been sent to ${email}.`);
      } else {
        Alert.alert('Something went wrong', 'Please check your connection and try again.');
      }
    } finally {
      setIsResending(false);
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

          {/* Shield icon badge */}
          <View style={styles.iconBadge}>
            <ShieldCheckIcon size={28} color="#3ECFBF" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit verification code to your{'\n'}email.
          </Text>

          {/* OTP */}
          <Text style={styles.label}>Verification Code</Text>
          <OTPInput value={code} onChange={setCode} length={6} />

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.verifyBtn, code.length < 6 && styles.verifyBtnDisabled]}
            onPress={handleVerify}
            disabled={code.length < 6}
            activeOpacity={0.85}
          >
            <Text style={styles.verifyBtnText}>Verify</Text>
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive the code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || isResending}>
              <Text style={[styles.resendLink, (cooldown > 0 || isResending) && styles.resendLinkDisabled]}>
                {isResending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 12,
  },
  verifyBtn: {
    backgroundColor: '#3ECFBF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    shadowColor: '#3ECFBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  verifyBtnDisabled: {
    opacity: 0.6,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  resendText: {
    fontSize: 14,
    color: '#6B7280',
  },
  resendLink: {
    fontSize: 14,
    color: '#3ECFBF',
    fontWeight: '600',
  },
  resendLinkDisabled: {
    color: '#9CA3AF',
  },
});
