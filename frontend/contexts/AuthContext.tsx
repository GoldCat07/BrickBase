import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { authService, subscriptionService } from '../lib/supabaseService';
import { Profile } from '../lib/supabase';

interface User {
  id: string;
  mobile: string;
  name: string | null;
  firm_name: string | null;
  city: string | null;
  email: string | null;
  role: 'broker' | 'employee';
  is_pro_broker: boolean;
  organization_id: string | null;
  profile_photo: string | null;
  subscription_status: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sendOTP: (mobile: string) => Promise<void>;
  verifyOTP: (mobile: string, otp: string) => Promise<{ isNewUser: boolean; mobile?: string }>;
  signUp: (data: SignUpData) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  paymentRequired: boolean;
  setPaymentRequired: (value: boolean) => void;
}

interface SignUpData {
  mobile: string;
  name: string;
  firm_name: string;
  city: string;
  email: string;
  latitude?: number;
  longitude?: number;
  invite_code?: string;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  sendOTP: async () => {},
  verifyOTP: async () => ({ isNewUser: true }),
  signUp: async () => {},
  signOut: async () => {},
  refreshUser: async () => {},
  paymentRequired: false,
  setPaymentRequired: () => {},
});

export const useAuth = () => useContext(AuthContext);

// Convert Profile to User format
const profileToUser = (profile: Profile): User => ({
  id: profile.id,
  mobile: profile.mobile,
  name: profile.name,
  firm_name: profile.firm_name,
  city: profile.city,
  email: profile.email,
  role: profile.role,
  is_pro: profile.is_pro,
  organization_id: profile.organization_id,
  profile_photo: profile.profile_photo,
  subscription_status: profile.subscription_status,
  created_at: profile.created_at,
  updated_at: profile.updated_at,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check for stored user ID (our custom auth, not Supabase Auth yet)
      const userId = await AsyncStorage.getItem('user_id');
      const userStr = await AsyncStorage.getItem('user');
      
      if (userId && userStr) {
        // Set cached user data immediately for fast UI
        const cachedUser = JSON.parse(userStr);
        setUser(cachedUser);
        
        // Then fetch fresh data from Supabase
        try {
          const profile = await authService.getProfile(userId);
          if (profile) {
            const userData = profileToUser(profile);
            setUser(userData);
            await AsyncStorage.setItem('user', JSON.stringify(userData));
            
            // Check subscription status
            const subscription = await subscriptionService.get(userId);
            if (profile.role === 'owner' && !subscription && profile.subscription_status === 'expired') {
              setPaymentRequired(true);
            }
          } else {
            // User not found in database, clear local storage
            await AsyncStorage.removeItem('user_id');
            await AsyncStorage.removeItem('user');
            setUser(null);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
          // Keep cached user on network error
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendOTP = async (mobile: string) => {
    try {
      await authService.sendOTP(mobile);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to send OTP');
    }
  };

  const verifyOTP = async (mobile: string, otp: string) => {
    try {
      const result = await authService.verifyOTP(mobile, otp);
      
      if (!result.isNewUser && result.profile) {
        // Existing user - save user data
        const userData = profileToUser(result.profile);
        await AsyncStorage.setItem('user_id', result.profile.id);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        
        // Check payment status
        const subscription = await subscriptionService.get(result.profile.id);
        if (result.profile.role === 'owner' && !subscription && result.profile.subscription_status === 'expired') {
          setPaymentRequired(true);
        }
        
        return { isNewUser: false };
      }
      
      return { isNewUser: true, mobile: result.mobile };
    } catch (error: any) {
      throw new Error(error.message || 'OTP verification failed');
    }
  };

  const signUp = async (data: SignUpData) => {
    try {
      const profile = await authService.signUp(data);
      const userData = profileToUser(profile);
      
      await AsyncStorage.setItem('user_id', profile.id);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.message || 'Registration failed');
    }
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('user_id');
    await AsyncStorage.removeItem('user');
    setUser(null);
    setPaymentRequired(false);
    router.replace('/login');
  };

  const refreshUser = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      
      const profile = await authService.getProfile(userId);
      if (profile) {
        const userData = profileToUser(profile);
        setUser(userData);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        
        // Check subscription status
        const subscription = await subscriptionService.get(userId);
        if (profile.role === 'owner' && !subscription && profile.subscription_status === 'expired') {
          setPaymentRequired(true);
        } else {
          setPaymentRequired(false);
        }
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      sendOTP, 
      verifyOTP, 
      signUp, 
      signOut,
      refreshUser,
      paymentRequired,
      setPaymentRequired
    }}>
      {children}
    </AuthContext.Provider>
  );
};
