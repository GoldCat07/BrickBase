import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types - Matches schema v1.0 (2026-02-04)
export interface Profile {
  id: string;
  mobile: string;
  name: string;
  firm_name: string;
  city: string;
  email: string;
  role: 'broker' | 'pro_broker' | 'employee';
  profile_photo: string | null;
  invite_code_used: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  max_employee_seats: number;
  used_employee_seats: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'employee';
  is_active: boolean;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface Pricing {
  id: string;
  city: string;
  pro_broker_monthly: number;
  pro_broker_annual: number;
  employee_tier_1: number;
  employee_tier_2: number;
  employee_tier_3: number;
  tier_1_max: number;
  tier_2_max: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: 'pro_broker_monthly' | 'pro_broker_annual' | 'employee_seats';
  status: 'active' | 'expired' | 'payment_failed' | 'cancelled' | 'pending';
  amount: number;
  employee_seats: number;
  razorpay_subscription_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string | null;
  platform: 'ios' | 'android' | null;
  push_token: string | null;
  last_active_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  user_id: string;
  property_category: 'Residential' | 'Commercial' | null;
  property_type: string | null;
  property_photos: string[];
  property_videos: string[];
  cover_photo_index: number;
  price: number | null;
  price_unit: 'cr' | 'lakh' | 'lakh_per_month' | null;
  floors: Array<{
    floorNumber: number;
    price: number;
    priceUnit: string;
    isSold?: boolean;
  }>;
  builders: Array<{
    name?: string;
    phoneNumber?: string;
    countryCode?: string;
  }>;
  builder_name: string | null;
  builder_phone: string | null;
  case_type: string | null;
  address: {
    unitNo?: string;
    block?: string;
    sector?: string;
    city?: string;
  } | null;
  sizes: Array<{
    type: string;
    value: number;
    unit: string;
  }>;
  age_type: 'Fresh' | 'Resale' | 'UnderConstruction' | null;
  property_age: number | null;
  possession_month: number | null;
  possession_year: number | null;
  important_files: Array<{
    name: string;
    uri: string;
    mimeType?: string;
  }>;
  payment_plan: string | null;
  additional_notes: string | null;
  club_property: boolean;
  pool_property: boolean;
  park_property: boolean;
  gated_property: boolean;
  latitude: number | null;
  longitude: number | null;
  is_sold: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// In-App Messaging Types
export interface InAppMessage {
  id: string;
  title: string;
  message: string | null;
  image_url: string | null;
  action_type: 'none' | 'link' | 'screen' | 'deeplink' | null;
  action_value: string | null;
  button_text: string | null;
  style: 'popup' | 'banner' | 'fullscreen' | 'bottom_sheet';
  target_type: 'all' | 'region' | 'user_ids' | 'role' | 'pro_only' | 'non_pro';
  target_value: any;
  start_date: string;
  end_date: string | null;
  show_once: boolean;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppConfig {
  id: string;
  key: string;
  value: any;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
