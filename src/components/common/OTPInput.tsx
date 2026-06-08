import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

interface Props {
  length?: number;
  value: string;
  onChange: (code: string) => void;
}

export default function OTPInput({ length = 6, value, onChange }: Props) {
  const inputs = useRef<(TextInput | null)[]>([]);
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  function handleChange(text: string, index: number) {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    onChange(next.join(''));
    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  return (
    <View style={styles.row}>
      {digits.map((digit, i) => (
        <TextInput
          key={i}
          ref={el => { inputs.current[i] = el; }}
          style={[styles.box, digit ? styles.boxFilled : null]}
          value={digit}
          onChangeText={text => handleChange(text, i)}
          onKeyPress={e => handleKeyPress(e, i)}
          keyboardType="number-pad"
          maxLength={1}
          textAlign="center"
          selectTextOnFocus
          caretHidden
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  box: {
    flex: 1,
    height: 54,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  boxFilled: {
    borderColor: '#3ECFBF',
  },
});
