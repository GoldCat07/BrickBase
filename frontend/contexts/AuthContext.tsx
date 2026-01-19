import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../lib/api';

interface User {
  id: string;
  mobile: string;
  name: string;
  firm_name: string;
  city: string;
  email: string;
  role: 'owner' | 'employee';
  is_pro: boolean;
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const userStr = await AsyncStorage.getItem('user');
      
      if (token && userStr) {
        const userData = JSON.parse(userStr);
        setUser(userData);
        
        try {
          const response = await api.get('/auth/me');
          setUser(response.data);
          await AsyncStorage.setItem('user', JSON.stringify(response.data));
          
          // Check if payment is required (subscription expired)
          if (response.data.role === 'owner' && 
              response.data.is_pro === false && 
              response.data.subscription_status === 'expired') {
            setPaymentRequired(true);
          }
        } catch (error) {
          await AsyncStorage.removeItem('access_token');
          await AsyncStorage.removeItem('user');
          setUser(null);
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
      await api.post('/auth/send-otp', { mobile, country_code: '+91' });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to send OTP');
    }
  };

  const verifyOTP = async (mobile: string, otp: string) => {
    try {
      const response = await api.post('/auth/verify-otp', { mobile, otp });
      
      if (!response.data.is_new_user) {
        // Existing user - save token and user data
        await AsyncStorage.setItem('access_token', response.data.access_token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        
        // Check payment status
        if (response.data.user.role === 'owner' && 
            response.data.user.is_pro === false && 
            response.data.user.subscription_status === 'expired') {
          setPaymentRequired(true);
        }
        
        return { isNewUser: false };
      }
      
      return { isNewUser: true, mobile: response.data.mobile };
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'OTP verification failed');
    }
  };

  const signUp = async (data: SignUpData) => {
    try {
      const response = await api.post('/auth/signup', data);
      const { access_token, user: userData } = response.data;
      
      await AsyncStorage.setItem('access_token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('access_token');
    await AsyncStorage.removeItem('user');
    setUser(null);
    setPaymentRequired(false);
    router.replace('/login');
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      await AsyncStorage.setItem('user', JSON.stringify(response.data));
      
      if (response.data.role === 'owner' && 
          response.data.is_pro === false && 
          response.data.subscription_status === 'expired') {
        setPaymentRequired(true);
      } else {
        setPaymentRequired(false);
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
