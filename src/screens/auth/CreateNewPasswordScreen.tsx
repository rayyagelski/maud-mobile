import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import LockIcon from '../../components/common/LockIcon';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import EyeIcon from '../../components/common/EyeIcon';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { changePasswordWithCode } from '../../store/slices/authSlice';
import type { AuthNavigationProp, AuthStackParamList } from '../../types/navigation.types';

type RouteProps = RouteProp<AuthStackParamList, 'CreateNewPassword'>;

export default function CreateNewPasswordScreen() {
  const navigation = useNavigation<AuthNavigationProp>();
  const dispatch = useAppDispatch();
  const route = useRoute<RouteProps>();
  const { email, code } = route.params;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const e: typeof errors = {};
    if (!newPassword) e.newPassword = 'Required';
    else if (newPassword.length < 8) e.newPassword = 'Min 8 characters';
    if (!confirmPassword) e.confirmPassword = 'Required';
    else if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleReset() {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const result = await dispatch(changePasswordWithCode({ email, code, newPassword }));
      if (changePasswordWithCode.fulfilled.match(result)) {
        navigation.navigate('PasswordResetSuccess');
      } else if (result.payload === 'invalid_code') {
        Alert.alert(
          'Code expired or incorrect',
          'Please go back and request a new code.',
        );
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <BackArrowIcon size={18} color="#4B5563" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Lock icon badge */}
          <View style={styles.iconBadge}>
            <LockIcon size={28} color="#3ECFBF" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Create New Password</Text>
          <Text style={styles.subtitle}>
            Your new password must be different{'\n'}from previously used passwords.
          </Text>

          {/* New Password */}
          <Text style={styles.label}>New Password</Text>
          <View style={[styles.inputWrapper, errors.newPassword ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={v => { setNewPassword(v); setErrors(e => ({ ...e, newPassword: undefined })); }}
              placeholder="Enter new password"
              placeholderTextColor="#B0B8C1"
              secureTextEntry={!showNew}
            />
            <TouchableOpacity
              onPress={() => setShowNew(v => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.eyeBtn}
            >
              <EyeIcon visible={showNew} size={22} color="#9BA3AF" />
            </TouchableOpacity>
          </View>
          {errors.newPassword ? <Text style={styles.fieldError}>{errors.newPassword}</Text> : null}

          {/* Confirm Password */}
          <Text style={[styles.label, { marginTop: 8 }]}>Confirm Password</Text>
          <View style={[styles.inputWrapper, errors.confirmPassword ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={v => { setConfirmPassword(v); setErrors(e => ({ ...e, confirmPassword: undefined })); }}
              placeholder="Confirm new password"
              placeholderTextColor="#B0B8C1"
              secureTextEntry={!showConfirm}
            />
            <TouchableOpacity
              onPress={() => setShowConfirm(v => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.eyeBtn}
            >
              <EyeIcon visible={showConfirm} size={22} color="#9BA3AF" />
            </TouchableOpacity>
          </View>
          {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}

          {/* Reset button */}
          <TouchableOpacity
            style={[styles.resetBtn, isLoading && styles.resetBtnDisabled]}
            onPress={handleReset}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.resetBtnText}>{isLoading ? 'Resetting…' : 'Reset Password'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F0F5',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 20,
    height: 54,
    marginBottom: 4,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A2E',
  },
  eyeBtn: {
    paddingLeft: 8,
  },
  fieldError: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 8,
    marginLeft: 4,
  },
  resetBtn: {
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
  resetBtnDisabled: {
    opacity: 0.6,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
