import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaymentRequiredModal } from '../components/PaymentRequiredModal';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading, paymentRequired } = useAuth();

  useEffect(() => {
    handleDeepLink();
    const subscription = Linking.addEventListener('url', handleDeepLinkEvent);
    return () => subscription.remove();
  }, []);

  const handleDeepLinkEvent = ({ url }: { url: string }) => {
    handleDeepLinkUrl(url);
  };

  const handleDeepLink = async () => {
    const url = await Linking.getInitialURL();
    if (url) {
      handleDeepLinkUrl(url);
    }
  };

  const handleDeepLinkUrl = async (url: string) => {
    // Handle invite links: app://invite/CODE or https://yourapp.com/invite/CODE
    const inviteMatch = url.match(/invite\/([A-Z0-9]+)/i);
    if (inviteMatch) {
      const inviteCode = inviteMatch[1];
      await AsyncStorage.setItem('invite_code', inviteCode);
      
      // If not logged in, go to login
      // The login screen will pick up the invite code
      if (!user) {
        router.replace('/login');
      }
    }
  };

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
      
      if (!user) {
        router.replace('/login');
      } else {
        router.replace('/(tabs)/add');
      }
    }
  }, [user, loading]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="property-details" options={{ 
          presentation: 'modal',
          headerShown: true,
          headerTitle: 'Property Details',
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#fff'
        }} />
        <Stack.Screen name="organization" options={{ 
          presentation: 'card',
          headerShown: true,
          headerTitle: 'Organization',
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#fff'
        }} />
        <Stack.Screen name="subscription" options={{ 
          presentation: 'card',
          headerShown: true,
          headerTitle: 'Subscription Plans',
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#fff'
        }} />
      </Stack>
      
      {/* Payment Required Modal - blocks app if payment failed */}
      <PaymentRequiredModal visible={paymentRequired} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
