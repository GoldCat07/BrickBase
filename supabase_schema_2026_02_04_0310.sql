-- ============================================================================
-- BRICKBASE MOBILE APP - CLEAN SCHEMA v1.0
-- Date: 2026-02-04
-- 
-- This is a fresh, simplified schema designed to avoid RLS recursion issues.
-- Tables: profiles, organizations, organization_members, subscriptions, 
--         properties, devices, app_config, pricing
-- ============================================================================

-- ============================================================================
-- PART 1: CLEANUP (Drop existing objects if re-running)
-- ============================================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS sync_subscription_status ON public.subscriptions;
DROP TRIGGER IF EXISTS enforce_property_limit ON public.properties;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS update_properties_updated_at ON public.properties;
DROP TRIGGER IF EXISTS update_devices_updated_at ON public.devices;
DROP TRIGGER IF EXISTS update_app_config_updated_at ON public.app_config;
DROP TRIGGER IF EXISTS update_pricing_updated_at ON public.pricing;

-- Drop existing functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.sync_subscription_to_profile() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_property_posting_limit() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Drop existing tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS public.user_message_status CASCADE;
DROP TABLE IF EXISTS public.in_app_messages CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.properties CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.pricing CASCADE;
DROP TABLE IF EXISTS public.app_config CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================================
-- PART 2: HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate unique invite code for organizations
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: CORE TABLES
-- ============================================================================

-- 1. PROFILES TABLE
-- Stores user profile information
-- Role: 'broker' (default), 'pro_broker' (paid), 'employee' (via invite)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Required fields (set during signup)
  mobile TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  firm_name TEXT NOT NULL,
  city TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  
  -- Role: broker (default), pro_broker (after payment), employee (via invite)
  role TEXT NOT NULL DEFAULT 'broker' CHECK (role IN ('broker', 'pro_broker', 'employee')),
  
  -- Profile photo URL (from Supabase Storage)
  profile_photo TEXT,
  
  -- For employees only - who invited them
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code_used TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles. Role determines access: broker (free), pro_broker (paid), employee (invited by pro_broker)';

-- 2. ORGANIZATIONS TABLE
-- Only pro_brokers can create organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL DEFAULT public.generate_invite_code(),
  
  -- Employee seats management
  max_employee_seats INTEGER DEFAULT 0,
  used_employee_seats INTEGER DEFAULT 0,
  
  -- Status: when owner downgrades to broker, org becomes frozen
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT seats_limit CHECK (used_employee_seats <= max_employee_seats)
);

COMMENT ON TABLE public.organizations IS 'Organizations created by pro_brokers. Becomes frozen when owner is no longer pro_broker.';

-- 3. ORGANIZATION MEMBERS TABLE
-- Links employees to organizations
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Role within org: owner or employee
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'employee')),
  
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One active membership per user per org
  UNIQUE(organization_id, user_id)
);

-- 4. SUBSCRIPTIONS TABLE
-- Records subscription payments from Razorpay
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Plan type
  plan_type TEXT NOT NULL CHECK (plan_type IN (
    'pro_broker_monthly', 
    'pro_broker_annual',
    'employee_seats'
  )),
  
  -- Status (updated by Razorpay webhook)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'active', 
    'expired', 
    'payment_failed', 
    'cancelled',
    'pending'
  )),
  
  -- Payment details
  amount DECIMAL(10, 2) NOT NULL,
  employee_seats INTEGER DEFAULT 0,
  
  -- Razorpay fields (filled by webhook)
  razorpay_subscription_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  
  -- Subscription period
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS 'Subscription records. Latest row per user determines their pro status. Managed via Razorpay webhooks.';

-- 5. PROPERTIES TABLE
-- Property listings posted by users
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Property details
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT,
  
  -- Media
  property_photos JSONB DEFAULT '[]',
  property_videos JSONB DEFAULT '[]',
  cover_photo_index INTEGER DEFAULT 0,
  
  -- Pricing
  price DECIMAL(15, 2),
  price_unit TEXT DEFAULT 'cr' CHECK (price_unit IN ('cr', 'lakh', 'lakh_per_month')),
  
  -- Builder info
  builders JSONB DEFAULT '[]',
  builder_name TEXT,
  builder_phone TEXT,
  
  -- Property details
  case_type TEXT CHECK (case_type IN ('REGISTRY_CASE', 'TRANSFER_CASE', 'RENTAL', 'LEASE_HOLD', 'OTHER')),
  address JSONB DEFAULT '{}',
  sizes JSONB DEFAULT '[]',
  floors JSONB DEFAULT '[]',
  
  -- Age and possession
  age_type TEXT CHECK (age_type IN ('Fresh', 'Resale', 'UnderConstruction')),
  property_age INTEGER,
  possession_month INTEGER CHECK (possession_month IS NULL OR (possession_month >= 1 AND possession_month <= 12)),
  possession_year INTEGER,
  
  -- Amenities
  club_property BOOLEAN DEFAULT FALSE,
  pool_property BOOLEAN DEFAULT FALSE,
  park_property BOOLEAN DEFAULT FALSE,
  gated_property BOOLEAN DEFAULT FALSE,
  
  -- Files and notes
  important_files JSONB DEFAULT '[]',
  payment_plan TEXT,
  additional_notes TEXT,
  
  -- Location (from photo EXIF or manual)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Status
  is_sold BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. DEVICES TABLE
-- Track user devices for multi-device login control
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  device_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  push_token TEXT,
  
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, device_id)
);

COMMENT ON TABLE public.devices IS 'Tracks user devices. Max devices per role controlled by app_config.';

-- 7. APP_CONFIG TABLE
-- Backend-controlled settings
CREATE TABLE public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PRICING TABLE
-- Subscription pricing (uniform for MVP, city-wise later)
CREATE TABLE public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL DEFAULT 'default',
  
  -- Pro broker pricing
  pro_broker_monthly DECIMAL(10, 2) NOT NULL DEFAULT 3599,
  pro_broker_annual DECIMAL(10, 2) NOT NULL DEFAULT 35990,
  
  -- Employee seat pricing tiers
  employee_tier_1 DECIMAL(10, 2) NOT NULL DEFAULT 399,  -- 1-7 employees
  employee_tier_2 DECIMAL(10, 2) NOT NULL DEFAULT 759,  -- 8-14 employees
  employee_tier_3 DECIMAL(10, 2) NOT NULL DEFAULT 1299, -- 15+ employees
  
  -- Tier boundaries (configurable)
  tier_1_max INTEGER DEFAULT 7,
  tier_2_max INTEGER DEFAULT 14,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: INDEXES
-- ============================================================================

CREATE INDEX idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);

CREATE INDEX idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX idx_organizations_invite ON public.organizations(invite_code);

CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

CREATE INDEX idx_properties_user ON public.properties(user_id);
CREATE INDEX idx_properties_active ON public.properties(user_id, is_active, is_sold);

CREATE INDEX idx_devices_user ON public.devices(user_id);

CREATE INDEX idx_app_config_key ON public.app_config(key);

-- ============================================================================
-- PART 5: TRIGGERS
-- ============================================================================

-- Auto-create profile when user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, mobile, name, firm_name, city, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'firm_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'city', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'broker')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sync subscription status to profile role
-- When a new subscription row is inserted, update the user's role
CREATE OR REPLACE FUNCTION public.sync_subscription_to_profile()
RETURNS TRIGGER AS $$
DECLARE
  latest_sub RECORD;
BEGIN
  -- Get the latest subscription for this user
  SELECT * INTO latest_sub
  FROM public.subscriptions
  WHERE user_id = NEW.user_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Update profile role based on subscription status
  IF latest_sub.status = 'active' AND latest_sub.plan_type IN ('pro_broker_monthly', 'pro_broker_annual') THEN
    UPDATE public.profiles SET role = 'pro_broker' WHERE id = NEW.user_id;
  ELSIF latest_sub.status IN ('expired', 'payment_failed', 'cancelled') THEN
    -- Only downgrade if they were a pro_broker (not an employee)
    UPDATE public.profiles 
    SET role = 'broker' 
    WHERE id = NEW.user_id AND role = 'pro_broker';
    
    -- Freeze their organization if they have one
    UPDATE public.organizations 
    SET is_active = FALSE 
    WHERE owner_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_subscription_status
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_to_profile();

-- Enforce property posting limit for free users
CREATE OR REPLACE FUNCTION public.enforce_property_posting_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  current_count INTEGER;
  max_allowed INTEGER;
  org_active BOOLEAN;
BEGIN
  -- Get user role
  SELECT role INTO user_role FROM public.profiles WHERE id = NEW.user_id;
  
  -- Pro brokers have no limit
  IF user_role = 'pro_broker' THEN
    RETURN NEW;
  END IF;
  
  -- Employees: check if their organization is active
  IF user_role = 'employee' THEN
    SELECT o.is_active INTO org_active
    FROM public.organization_members om
    JOIN public.organizations o ON om.organization_id = o.id
    WHERE om.user_id = NEW.user_id AND om.is_active = TRUE
    LIMIT 1;
    
    -- If org is active (owner is pro), no limit
    IF org_active = TRUE THEN
      RETURN NEW;
    END IF;
  END IF;
  
  -- Get property limit from app_config
  SELECT (value->>'free_property_limit')::INTEGER INTO max_allowed
  FROM public.app_config
  WHERE key = 'limits' AND is_active = TRUE;
  
  max_allowed := COALESCE(max_allowed, 3);
  
  -- Count current active properties
  SELECT COUNT(*) INTO current_count
  FROM public.properties
  WHERE user_id = NEW.user_id AND is_active = TRUE AND is_sold = FALSE;
  
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Property limit reached. Maximum % properties allowed for free accounts.', max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_posting_limit();

-- Updated_at triggers for all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_app_config_updated_at BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pricing_updated_at BEFORE UPDATE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 7: RLS POLICIES (Simple, Non-Recursive)
-- ============================================================================

-- PROFILES: Users can read/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Note: INSERT is handled by trigger, no INSERT policy needed for users

-- ORGANIZATIONS: Owner can manage, members can view
CREATE POLICY "organizations_select_own" ON public.organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS: Owner can manage, users can view their own membership
CREATE POLICY "org_members_select_own" ON public.organization_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "org_members_select_as_owner" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- SUBSCRIPTIONS: Users can only view their own
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- Note: INSERT/UPDATE handled by service_role via webhooks

-- PROPERTIES: Users can manage their own properties
CREATE POLICY "properties_select_own" ON public.properties
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "properties_insert_own" ON public.properties
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "properties_update_own" ON public.properties
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "properties_delete_own" ON public.properties
  FOR DELETE USING (user_id = auth.uid());

-- DEVICES: Users can manage their own devices
CREATE POLICY "devices_select_own" ON public.devices
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "devices_insert_own" ON public.devices
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "devices_update_own" ON public.devices
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "devices_delete_own" ON public.devices
  FOR DELETE USING (user_id = auth.uid());

-- APP_CONFIG: Everyone can read active config
CREATE POLICY "app_config_select" ON public.app_config
  FOR SELECT USING (is_active = TRUE);

-- PRICING: Everyone can read active pricing
CREATE POLICY "pricing_select" ON public.pricing
  FOR SELECT USING (is_active = TRUE);

-- ============================================================================
-- PART 8: STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('profile-photos', 'profile-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('property-photos', 'property-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('property-videos', 'property-videos', true, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
  ('property-files', 'property-files', true, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: Users can upload to their own folder
CREATE POLICY "storage_profile_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_profile_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos');

CREATE POLICY "storage_profile_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_property_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_property_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-photos');

CREATE POLICY "storage_property_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-photos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_property_videos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-videos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_property_videos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-videos');

CREATE POLICY "storage_property_videos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-videos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_property_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-files' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_property_files_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-files');

CREATE POLICY "storage_property_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-files' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- PART 9: DEFAULT DATA
-- ============================================================================

-- App configuration
INSERT INTO public.app_config (key, value, description) VALUES
  ('limits', '{
    "free_property_limit": 3,
    "frozen_org_property_view_limit": 3
  }', 'Property limits for free users and frozen organizations'),
  
  ('max_devices', '{
    "broker": 2,
    "pro_broker": 4,
    "employee": 1
  }', 'Maximum devices per role'),
  
  ('messages', '{
    "ios": {
      "property_limit": "Currently in this beta version you are limited to 3 properties only. Thanks for your patience!",
      "organization_coming_soon": "Organizations feature is coming soon! We will let you know when it rolls out."
    },
    "android": {
      "property_limit": "You have reached the maximum number of properties. Upgrade to Pro Broker to post unlimited properties!",
      "organization_upgrade": "Only Pro Brokers can create organizations and add employees. Upgrade now!"
    }
  }', 'Platform-specific messages'),
  
  ('feature_flags', '{
    "organizations_enabled_ios": false,
    "organizations_enabled_android": true,
    "payments_enabled_ios": false,
    "payments_enabled_android": true
  }', 'Feature flags per platform')
  
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Default pricing (uniform for MVP)
INSERT INTO public.pricing (city, pro_broker_monthly, pro_broker_annual, employee_tier_1, employee_tier_2, employee_tier_3)
VALUES 
  ('default', 3599, 35990, 399, 759, 1299)
ON CONFLICT (city) DO UPDATE SET
  pro_broker_monthly = EXCLUDED.pro_broker_monthly,
  pro_broker_annual = EXCLUDED.pro_broker_annual,
  employee_tier_1 = EXCLUDED.employee_tier_1,
  employee_tier_2 = EXCLUDED.employee_tier_2,
  employee_tier_3 = EXCLUDED.employee_tier_3,
  updated_at = NOW();

-- ============================================================================
-- PART 10: GRANT PERMISSIONS
-- ============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant table permissions to authenticated users
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.organization_members TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT SELECT ON public.app_config TO authenticated;
GRANT SELECT ON public.pricing TO authenticated;

-- ============================================================================
-- DONE!
-- ============================================================================
-- 
-- NEXT STEPS:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Delete all existing data (this script does that automatically)
-- 3. The app will work with fresh data
--
-- NOTES:
-- - Profile is auto-created when user signs up via OTP
-- - Property limit is enforced at database level (3 for free users)
-- - Subscription changes automatically update user role
-- - Organization becomes frozen when owner's subscription expires
-- - RLS policies are simple and non-recursive
--
-- FOR MANUAL PRO UPGRADE (via Supabase Dashboard):
-- UPDATE profiles SET role = 'pro_broker' WHERE id = 'user-uuid';
--
-- ============================================================================
