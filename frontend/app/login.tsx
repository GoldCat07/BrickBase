import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Step = 'mobile' | 'otp' | 'signup';

interface LocationData {
  latitude: number;
  longitude: number;
  city: string;
}

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteOrg, setInviteOrg] = useState<{ name: string; owner: string } | null>(null);
  
  // Sign up form fields
  const [name, setName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  
  const { sendOTP, verifyOTP, signUp } = useAuth();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    checkInviteCode();
  }, []);

  const checkInviteCode = async () => {
    try {
      const code = await AsyncStorage.getItem('invite_code');
      if (code) {
        setInviteCode(code);
        // Fetch org details
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/auth/check-invite/${code}`
        );
        if (response.ok) {
          const data = await response.json();
          setInviteOrg({ name: data.organization_name, owner: data.owner_name });
          setFirmName(data.organization_name);
        }
      }
    } catch (error) {
      console.error('Error checking invite code:', error);
    }
  };

  const requestLocationPermission = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Required',
          'Please enable location access to auto-fill your city.',
          [{ text: 'OK' }]
        );
        setLocationLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      
      // Reverse geocode to get city
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const detectedCity = address?.city || address?.subregion || address?.region || '';
      
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        city: detectedCity,
      });
      setCity(detectedCity);
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Error', 'Could not get your location. Please enter city manually.');
    } finally {
      setLocationLoading(false);
    }
  };

  const animateTransition = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
    setTimeout(callback, 150);
  };

  const handleSendOTP = async () => {
    if (mobile.length < 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      await sendOTP(mobile);
      animateTransition(() => setStep('otp'));
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOTP(mobile, otp);
      
      if (result.isNewUser) {
        // Request location before showing signup form
        await requestLocationPermission();
        animateTransition(() => setStep('signup'));
      } else {
        // Existing user - navigate to app
        router.replace('/(tabs)/add');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!firmName.trim()) {
      Alert.alert('Error', 'Please enter your firm name');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Error', 'Please enter your city');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await signUp({
        mobile,
        name,
        firm_name: firmName,
        city,
        email,
        latitude: location?.latitude,
        longitude: location?.longitude,
        invite_code: inviteCode || undefined,
      });
      
      // Clear invite code after successful signup
      await AsyncStorage.removeItem('invite_code');
      
      // Show congratulations if joining via invite
      if (inviteOrg) {
        router.replace({
          pathname: '/welcome',
          params: { orgName: inviteOrg.name }
        });
      } else {
        router.replace('/(tabs)/add');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderMobileStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="phone-portrait" size={64} color="#fff" />
      </View>
      
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>Enter your mobile number to continue</Text>

      {inviteOrg && (
        <View style={styles.inviteBanner}>
          <Ionicons name="business" size={20} color="#4CAF50" />
          <Text style={styles.inviteText}>
            You're invited to join <Text style={styles.inviteOrgName}>{inviteOrg.name}</Text>
          </Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Mobile Number</Text>
        <View style={styles.phoneInputContainer}>
          <View style={styles.countryCode}>
            <Text style={styles.countryCodeText}>+91</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="Enter 10-digit number"
            placeholderTextColor="#666"
            value={mobile}
            onChangeText={(text) => setMobile(text.replace(/[^0-9]/g, '').slice(0, 10))}
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSendOTP}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Send OTP</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderOTPStep = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => animateTransition(() => setStep('mobile'))}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <Ionicons name="keypad" size={64} color="#fff" />
      </View>
      
      <Text style={styles.title}>Verify OTP</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to +91 {mobile}</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>OTP Code</Text>
        <TextInput
          style={styles.otpInput}
          placeholder="000000"
          placeholderTextColor="#666"
          value={otp}
          onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
        />
        <Text style={styles.hint}>Use 000000 for testing</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerifyOTP}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.resendButton}
        onPress={handleSendOTP}
        disabled={loading}
      >
        <Text style={styles.resendText}>Resend OTP</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSignUpStep = () => (
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.stepContainer}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => animateTransition(() => setStep('otp'))}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.iconContainer}>
          <Ionicons name="person-add" size={64} color="#fff" />
        </View>
        
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>Tell us a bit about yourself</Text>

        {locationLoading && (
          <View style={styles.locationLoading}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.locationLoadingText}>Getting your location...</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Firm Name</Text>
            <TextInput
              style={[styles.input, inviteOrg && styles.inputDisabled]}
              placeholder="Enter your firm name"
              placeholderTextColor="#666"
              value={firmName}
              onChangeText={setFirmName}
              autoCapitalize="words"
              editable={!inviteOrg}
            />
            {inviteOrg && (
              <Text style={styles.inviteNote}>Firm name set by organization</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>City of Operations</Text>
            <View style={styles.cityInputContainer}>
              <TextInput
                style={styles.cityInput}
                placeholder="Enter your city"
                placeholderTextColor="#666"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
              />
              <TouchableOpacity 
                style={styles.locationButton}
                onPress={requestLocationPermission}
                disabled={locationLoading}
              >
                <Ionicons 
                  name="location" 
                  size={20} 
                  color={locationLoading ? '#666' : '#4CAF50'} 
                />
              </TouchableOpacity>
            </View>
            {location && (
              <Text style={styles.autoFilledText}>Auto-filled from your location</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email address"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View style={[styles.animatedContainer, { opacity: fadeAnim }]}>
          {step === 'mobile' && renderMobileStep()}
          {step === 'otp' && renderOTPStep()}
          {step === 'signup' && renderSignUpStep()}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  keyboardView: {
    flex: 1,
  },
  animatedContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  stepContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 24,
    padding: 8,
    zIndex: 10,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  inviteText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  inviteOrgName: {
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#0f0f0f',
    opacity: 0.7,
  },
  inviteNote: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countryCode: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    minWidth: 70,
    alignItems: 'center',
  },
  countryCodeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  otpInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    color: '#fff',
    letterSpacing: 8,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  cityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  locationButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderLeftWidth: 0,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    padding: 16,
  },
  autoFilledText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  locationLoadingText: {
    color: '#999',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resendButton: {
    padding: 16,
    alignItems: 'center',
  },
  resendText: {
    color: '#fff',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
