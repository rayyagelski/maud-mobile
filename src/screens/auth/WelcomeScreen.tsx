import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { AuthNavigationProp } from '../../types/navigation.types';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation<AuthNavigationProp>();

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/splash_bg.png')}
        style={styles.bg}
        resizeMode="cover"
      />

      {/* Circular arrow button — matches design position */}
      <TouchableOpacity
        style={styles.arrowBtn}
        onPress={() => navigation.navigate('Registration')}
        activeOpacity={0.85}
      >
        <Text style={styles.arrowText}>→</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E1A' },
  bg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width,
    height,
  },
  arrowBtn: {
    position: 'absolute',
    right: 28,
    top: height * 0.35,
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#00D4C8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D4C8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
  arrowText: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginLeft: 2, marginBottom: 6 },
});
