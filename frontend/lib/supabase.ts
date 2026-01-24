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

// Database types
export interface Profile {
  id: string;
  mobile: string;
  name: string | null;
  firm_name: string | null;
  city: string | null;
  email: string | null;
  role: 'broker' | 'employee';
  is_pro_broker: boolean;
  profile_photo: string | null;
  subscription_status: 'active' | 'expired' | 'pending_payment' | null;
  organization_id: string | null;
  latitude: number | null;
  longitude: number | null;
  device_token: string | null;
  device_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  employee_seats: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'broker' | 'employee';
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
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: 'pro_broker_monthly' | 'pro_broker_annual' | 'admin_granted';
  status: 'active' | 'expired' | 'pending_payment' | 'cancelled';
  employee_seats: number;
  amount: number;
  payment_id: string | null;
  start_date: string;
  end_date: string;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  property_category: 'Residential' | 'Commercial' | null;
  property_type: string | null;
  property_photos: string[];
  property_videos: string[];
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
  user_id: string;
  organization_id: string | null;
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
