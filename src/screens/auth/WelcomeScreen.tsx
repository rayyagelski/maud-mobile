import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { AuthNavigationProp } from '../../types/navigation.types';

const { width } = Dimensions.get('window');
// Original image ratio: 1125 x 2556
const IMAGE_HEIGHT = width * (2556 / 1125);

export default function WelcomeScreen() {
  const navigation = useNavigation<AuthNavigationProp>();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Image
          source={require('../../assets/images/splash_bg.png')}
          style={{ width, height: IMAGE_HEIGHT }}
          resizeMode="cover"
        />
      </ScrollView>

      {/* Floating CTA at bottom */}
      <SafeAreaView edges={['bottom']} style={styles.cta}>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Get Started</Text>
          <Text style={styles.btnArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.signInLink}>
          <Text style={styles.signInText}>Already have an account? <Text style={styles.signInBold}>Sign in</Text></Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E1A' },
  scroll: { flexGrow: 1 },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'rgba(11,14,26,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,212,200,0.15)',
  },
  btn: {
    backgroundColor: '#00D4C8',
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnText: { color: '#0B0E1A', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  btnArrow: { color: '#0B0E1A', fontSize: 20, fontWeight: '700' },
  signInLink: { alignItems: 'center', paddingVertical: 14 },
  signInText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  signInBold: { color: '#00D4C8', fontWeight: '600' },
});
