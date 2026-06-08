import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export default function Button({ title, onPress, loading, disabled, variant = 'primary', style }: Props) {
  const bgColor = variant === 'primary' ? '#1E4E8C' : variant === 'danger' ? '#E53935' : '#E8EFF8';
  const textColor = variant === 'secondary' ? '#1E4E8C' : '#FFFFFF';

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bgColor, opacity: disabled || loading ? 0.6 : 1 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
