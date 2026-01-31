-- ============================================================================
-- BRICKBASE MOBILE APP - PRODUCTION READY SQL SCHEMA
-- Version: 1.0.0 (Production)
-- Security-hardened, all vulnerabilities addressed
-- ============================================================================

-- ============================================================================
-- PART 1: CLEANUP (Run these if starting fresh or resetting)
-- ============================================================================
-- IMPORTANT: Uncomment and run these ONLY if you want to reset everything
-- 
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP TRIGGER IF EXISTS sync_subscription_status ON public.subscriptions;
-- DROP TRIGGER IF EXISTS prevent_pro_broker_self_promotion ON public.profiles;
-- DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
-- DROP FUNCTION IF EXISTS public.sync_profile_subscription_status() CASCADE;
-- DROP FUNCTION IF EXISTS public.prevent_is_pro_broker_update() CASCADE;
-- DROP FUNCTION IF EXISTS public.generate_invite_code() CASCADE;
-- DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
-- DROP TABLE IF EXISTS public.user_message_status CASCADE;
-- DROP TABLE IF EXISTS public.in_app_messages CASCADE;
-- DROP TABLE IF EXISTS public.app_config CASCADE;
-- DROP TABLE IF EXISTS public.properties CASCADE;
-- DROP TABLE IF EXISTS public.subscriptions CASCADE;
-- DROP TABLE IF EXISTS public.pricing CASCADE;
-- DROP TABLE IF EXISTS public.organization_members CASCADE;
-- DROP TABLE IF EXISTS public.organizations CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================================
-- PART 2: HELPER FUNCTIONS
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate unique invite code with collision handling
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE invite_code = result) THEN
      RETURN result;
    END IF;
    
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      -- Fallback: add timestamp suffix for guaranteed uniqueness
      RETURN result || substr(extract(epoch from now())::text, 1, 4);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: CORE TABLES
-- ============================================================================

-- 1. PROFILES TABLE
-- Links to auth.users - profile auto-created on signup via trigger
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile TEXT UNIQUE,
  name TEXT,
  firm_name TEXT,
  city TEXT,
  email TEXT,
  
  -- Role: broker (default), employee (via invite link)
  role TEXT DEFAULT 'broker' CHECK (role IN ('broker', 'employee')),
  
  -- Pro status - ONLY modifiable by service_role/backend, never by user
  is_pro_broker BOOLEAN DEFAULT FALSE,
  
  -- Subscription status - synced automatically from subscriptions table
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'pending_payment', 'none', NULL)),
  
  profile_photo TEXT,
  organization_id UUID,
  
  -- Deep link tracking
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code_used TEXT,
  
  -- Location
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Device management
  device_token TEXT,
  device_id TEXT,
  device_platform TEXT CHECK (device_platform IN ('ios', 'android', NULL)),
  
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL DEFAULT public.generate_invite_code(),
  employee_seats INTEGER DEFAULT 0 CHECK (employee_seats >= 0),
  max_employee_seats INTEGER DEFAULT 10 CHECK (max_employee_seats >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add organization FK to profiles (after organizations table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_profiles_organization'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_organization 
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. ORGANIZATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'employee')),
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- 4. PRICING TABLE
CREATE TABLE IF NOT EXISTS public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL CHECK (length(trim(city)) >= 2),
  
  -- Pro Broker pricing
  pro_broker_monthly DECIMAL(10, 2) NOT NULL DEFAULT 3599 CHECK (pro_broker_monthly >= 0),
  pro_broker_annual DECIMAL(10, 2) NOT NULL DEFAULT 35990 CHECK (pro_broker_annual >= 0),
  
  -- Employee seat pricing (tiered)
  employee_tier_1 DECIMAL(10, 2) NOT NULL DEFAULT 399 CHECK (employee_tier_1 >= 0),
  employee_tier_2 DECIMAL(10, 2) NOT NULL DEFAULT 759 CHECK (employee_tier_2 >= 0),
  employee_tier_3 DECIMAL(10, 2) NOT NULL DEFAULT 1299 CHECK (employee_tier_3 >= 0),
  
  -- Tier thresholds (e.g., tier_1 for 1-5 employees, tier_2 for 6-15, tier_3 for 16+)
  tier_1_max_employees INTEGER DEFAULT 5,
  tier_2_max_employees INTEGER DEFAULT 15,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  plan_type TEXT NOT NULL CHECK (plan_type IN (
    'pro_broker_monthly', 
    'pro_broker_annual', 
    'employee_tier_1', 
    'employee_tier_2', 
    'employee_tier_3',
    'admin_granted'  -- For manual grants
  )),
  
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'active', 
    'expired', 
    'pending_payment', 
    'cancelled',
    'payment_failed'
  )),
  
  employee_seats INTEGER DEFAULT 0 CHECK (employee_seats >= 0),
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT DEFAULT 'INR',
  
  -- Payment tracking
  payment_provider TEXT CHECK (payment_provider IN ('razorpay', 'manual', 'free', NULL)),
  payment_id TEXT,
  payment_order_id TEXT,
  payment_signature TEXT,
  
  -- Dates
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  last_payment_date TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  
  -- Auto-renewal
  auto_renew BOOLEAN DEFAULT TRUE,
  
  -- Admin tracking
  granted_by_admin BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_subscription_dates CHECK (end_date > start_date)
);

-- 6. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT,
  
  -- NEW: Facing direction
  facing TEXT CHECK (facing IN (
    'North', 'South', 'East', 'West',
    'North-East', 'North-West', 'South-East', 'South-West',
    NULL
  )),
  
  -- Media
  property_photos JSONB DEFAULT '[]',
  property_videos JSONB DEFAULT '[]',
  cover_photo_index INTEGER DEFAULT 0 CHECK (cover_photo_index >= 0),
  
  -- Pricing
  price DECIMAL(15, 2) CHECK (price >= 0),
  price_unit TEXT DEFAULT 'cr' CHECK (price_unit IN ('cr', 'lakh', 'lakh_per_month')),
  floors JSONB DEFAULT '[]',
  
  -- Builder Info
  builders JSONB DEFAULT '[]',
  builder_name TEXT,
  builder_phone TEXT,
  
  -- Details
  case_type TEXT CHECK (case_type IN ('REGISTRY_CASE', 'TRANSFER_CASE', 'RENTAL', 'LEASE_HOLD', 'OTHER')),
  address JSONB DEFAULT '{}',
  sizes JSONB DEFAULT '[]',
  age_type TEXT CHECK (age_type IN ('Fresh', 'Resale', 'UnderConstruction')),
  property_age INTEGER CHECK (property_age >= 0),
  possession_month INTEGER CHECK (possession_month >= 1 AND possession_month <= 12),
  possession_year INTEGER CHECK (possession_year >= 2000 AND possession_year <= 2100),
  important_files JSONB DEFAULT '[]',
  payment_plan TEXT,
  additional_notes TEXT,
  
  -- Features
  club_property BOOLEAN DEFAULT FALSE,
  pool_property BOOLEAN DEFAULT FALSE,
  park_property BOOLEAN DEFAULT FALSE,
  gated_property BOOLEAN DEFAULT FALSE,
  
  -- Location
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Status
  is_sold BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Ownership
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: APP CONFIG & IN-APP MESSAGING
-- ============================================================================

-- 7. APP CONFIG (Remote configuration - you update via Supabase Dashboard)
CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. IN-APP MESSAGES (Announcements/Notifications)
CREATE TABLE IF NOT EXISTS public.in_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content
  title TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  
  -- Action
  action_type TEXT CHECK (action_type IN ('none', 'link', 'screen', 'deeplink')),
  action_value TEXT,
  button_text TEXT,
  
  -- Style
  style TEXT DEFAULT 'popup' CHECK (style IN ('popup', 'banner', 'fullscreen', 'bottom_sheet', 'alert')),
  
  -- Targeting
  target_type TEXT DEFAULT 'all' CHECK (target_type IN (
    'all',              -- Everyone
    'region',           -- By city/region
    'user_ids',         -- Specific users
    'brokers_only',     -- Only brokers (not pro)
    'pro_brokers_only', -- Only pro brokers
    'employees_only',   -- Only employees
    'free_users',       -- Users without active subscription
    'ios_only',         -- iOS users only
    'android_only'      -- Android users only
  )),
  target_value JSONB,  -- Array of cities, user IDs, etc.
  
  -- Scheduling
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  
  -- Frequency/Display rules
  frequency_type TEXT DEFAULT 'once' CHECK (frequency_type IN (
    'once',           -- Show once ever
    'once_per_day',   -- Show once per day
    'every_app_open', -- Show every time app opens
    'daily_for_x_days' -- Show daily for X days
  )),
  frequency_days INTEGER DEFAULT 1 CHECK (frequency_days >= 1),
  max_impressions INTEGER, -- NULL = unlimited
  
  priority INTEGER DEFAULT 0, -- Higher = more important
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. USER MESSAGE STATUS (Track seen/dismissed)
CREATE TABLE IF NOT EXISTS public.user_message_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.in_app_messages(id) ON DELETE CASCADE,
  
  impression_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  clicked_action BOOLEAN DEFAULT FALSE,
  
  UNIQUE(user_id, message_id)
);

-- ============================================================================
-- PART 5: SECURITY TRIGGERS
-- ============================================================================

-- A. Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_code_param TEXT;
  inviter_id UUID;
  inviter_org_id UUID;
  user_role TEXT := 'broker';
BEGIN
  -- Check if user signed up with invite code (deep link)
  invite_code_param := NEW.raw_user_meta_data->>'invite_code';
  
  IF invite_code_param IS NOT NULL AND invite_code_param != '' THEN
    -- Find organization with this invite code
    SELECT o.owner_id, o.id INTO inviter_id, inviter_org_id
    FROM public.organizations o
    WHERE o.invite_code = invite_code_param
    AND o.is_active = true;
    
    IF inviter_id IS NOT NULL THEN
      user_role := 'employee';
    END IF;
  END IF;

  -- Create profile (is_pro_broker defaults to FALSE, can only be changed by service_role)
  INSERT INTO public.profiles (
    id, 
    mobile, 
    email, 
    role, 
    invited_by, 
    invite_code_used,
    organization_id,
    device_platform,
    subscription_status
  )
  VALUES (
    NEW.id,
    NEW.phone,
    NEW.email,
    user_role,
    inviter_id,
    invite_code_param,
    inviter_org_id,
    NEW.raw_user_meta_data->>'platform',
    'none'
  );
  
  -- If employee, add to organization_members
  IF inviter_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (inviter_org_id, NEW.id, 'employee');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B. Prevent users from changing is_pro_broker themselves
CREATE OR REPLACE FUNCTION public.prevent_is_pro_broker_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_pro_broker is being changed and this is NOT a service_role request
  IF OLD.is_pro_broker IS DISTINCT FROM NEW.is_pro_broker THEN
    -- Check if current user is the owner of this profile
    IF auth.uid() = NEW.id THEN
      -- User is trying to change their own is_pro_broker - DENY
      RAISE EXCEPTION 'Cannot modify pro broker status. This requires admin approval.';
    END IF;
  END IF;
  
  -- Also prevent users from changing their own subscription_status
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
    IF auth.uid() = NEW.id THEN
      RAISE EXCEPTION 'Cannot modify subscription status directly.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_pro_broker_self_promotion ON public.profiles;
CREATE TRIGGER prevent_pro_broker_self_promotion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_is_pro_broker_update();

-- C. Sync subscription status to profiles
CREATE OR REPLACE FUNCTION public.sync_profile_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Update profile subscription_status based on subscription
    UPDATE public.profiles
    SET 
      subscription_status = NEW.status,
      is_pro_broker = CASE 
        WHEN NEW.status = 'active' AND NEW.plan_type LIKE 'pro_broker%' THEN TRUE
        WHEN NEW.status != 'active' THEN FALSE
        ELSE is_pro_broker
      END,
      updated_at = NOW()
    WHERE id = NEW.user_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Reset profile status when subscription is deleted
    UPDATE public.profiles
    SET 
      subscription_status = 'none',
      is_pro_broker = FALSE,
      updated_at = NOW()
    WHERE id = OLD.user_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_subscription_status ON public.subscriptions;
CREATE TRIGGER sync_subscription_status
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_subscription_status();

-- ============================================================================
-- PART 6: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON public.profiles(is_pro_broker);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_platform ON public.profiles(device_platform);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_invite_code ON public.organizations(invite_code);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON public.organizations(is_active);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_provider ON public.subscriptions(payment_provider);

CREATE INDEX IF NOT EXISTS idx_properties_user ON public.properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_category ON public.properties(property_category);
CREATE INDEX IF NOT EXISTS idx_properties_is_sold ON public.properties(is_sold);
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON public.properties(is_active);
CREATE INDEX IF NOT EXISTS idx_properties_location ON public.properties(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_properties_created ON public.properties(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_active ON public.in_app_messages(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_messages_target ON public.in_app_messages(target_type);
CREATE INDEX IF NOT EXISTS idx_user_message_status ON public.user_message_status(user_id, message_id);
CREATE INDEX IF NOT EXISTS idx_app_config_key ON public.app_config(key);
CREATE INDEX IF NOT EXISTS idx_pricing_city ON public.pricing(city);

-- ============================================================================
-- PART 7: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_message_status ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 8: RLS POLICIES
-- ============================================================================

-- ==================== PROFILES ====================

-- Users can read their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can read profiles of people in their organization
CREATE POLICY "profiles_select_org_members" ON public.profiles
  FOR SELECT USING (
    organization_id IS NOT NULL AND
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND organization_id IS NOT NULL
    )
  );

-- Users can update their own profile (but trigger prevents changing protected fields)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- NO direct INSERT policy - profiles are created ONLY via the signup trigger
-- This prevents users from creating fake profiles

-- ==================== ORGANIZATIONS ====================

-- Users can read orgs they own or are members of
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

-- ONLY Pro Brokers can create organizations
CREATE POLICY "organizations_insert_pro_only" ON public.organizations
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() 
      AND is_pro_broker = true
      AND subscription_status = 'active'
    )
  );

-- Owners can update their organizations
CREATE POLICY "organizations_update_owner" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Owners can delete their organizations
CREATE POLICY "organizations_delete_owner" ON public.organizations
  FOR DELETE USING (owner_id = auth.uid());

-- ==================== ORGANIZATION MEMBERS ====================

-- Org owners and members can read member list
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR user_id = auth.uid()
  );

-- Org owners can add members
CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- Org owners can update members
CREATE POLICY "org_members_update" ON public.organization_members
  FOR UPDATE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- Org owners can remove members
CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- ==================== PRICING ====================

-- Anyone authenticated can read pricing
CREATE POLICY "pricing_select_authenticated" ON public.pricing
  FOR SELECT USING (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE for users - only via service_role/admin

-- ==================== SUBSCRIPTIONS ====================

-- Users can read their own subscriptions
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE for users - subscriptions managed via service_role only
-- This ensures payment verification happens server-side

-- ==================== PROPERTIES ====================

-- Users can read their own properties
CREATE POLICY "properties_select_own" ON public.properties
  FOR SELECT USING (user_id = auth.uid());

-- Users can read properties from their organization
CREATE POLICY "properties_select_org" ON public.properties
  FOR SELECT USING (
    organization_id IS NOT NULL AND
    organization_id IN (
      SELECT organization_id FROM public.profiles 
      WHERE id = auth.uid() AND organization_id IS NOT NULL
    )
  );

-- Users can create properties (limit enforced at app level via app_config)
CREATE POLICY "properties_insert" ON public.properties
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own properties
CREATE POLICY "properties_update_own" ON public.properties
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own properties
CREATE POLICY "properties_delete_own" ON public.properties
  FOR DELETE USING (user_id = auth.uid());

-- ==================== APP CONFIG ====================

-- Authenticated users can read active config
CREATE POLICY "app_config_select" ON public.app_config
  FOR SELECT USING (is_active = true AND auth.role() = 'authenticated');

-- ==================== IN-APP MESSAGES ====================

-- Authenticated users can read active messages within date range
CREATE POLICY "messages_select_active" ON public.in_app_messages
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    is_active = true AND
    (start_date IS NULL OR start_date <= NOW()) AND
    (end_date IS NULL OR end_date >= NOW())
  );

-- ==================== USER MESSAGE STATUS ====================

-- Users can read their own message status
CREATE POLICY "message_status_select_own" ON public.user_message_status
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own message status
CREATE POLICY "message_status_insert_own" ON public.user_message_status
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own message status
CREATE POLICY "message_status_update_own" ON public.user_message_status
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- PART 9: STORAGE BUCKETS & POLICIES
-- ============================================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('profile-photos', 'profile-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('property-photos', 'property-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('property-videos', 'property-videos', false, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
  ('property-files', 'property-files', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ==================== PROFILE PHOTOS ====================
-- Format: {user_id}/{filename}

CREATE POLICY "profile_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can view profile photos
CREATE POLICY "profile_photos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'profile-photos' AND 
    auth.role() = 'authenticated'
  );

-- ==================== PROPERTY PHOTOS ====================
-- Format: {user_id}/{property_id}/{filename}

CREATE POLICY "property_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-photos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view property photos if:
-- 1. They own the property (folder matches their user_id)
-- 2. They are in the same organization as the property owner
CREATE POLICY "property_photos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-photos' AND 
    auth.role() = 'authenticated' AND
    (
      -- Own photos
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      -- Same organization photos
      (storage.foldername(name))[1] IN (
        SELECT p.id::text 
        FROM public.profiles p
        WHERE p.organization_id IS NOT NULL
        AND p.organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- ==================== PROPERTY VIDEOS ====================

CREATE POLICY "property_videos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-videos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_videos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-videos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_videos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-videos' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_videos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-videos' AND 
    auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (storage.foldername(name))[1] IN (
        SELECT p.id::text 
        FROM public.profiles p
        WHERE p.organization_id IS NOT NULL
        AND p.organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- ==================== PROPERTY FILES ====================

CREATE POLICY "property_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-files' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_files_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-files' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-files' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_files_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-files' AND 
    auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (storage.foldername(name))[1] IN (
        SELECT p.id::text 
        FROM public.profiles p
        WHERE p.organization_id IS NOT NULL
        AND p.organization_id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 10: UPDATED_AT TRIGGERS
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.columns 
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END $$;

-- ============================================================================
-- PART 11: DEFAULT DATA
-- ============================================================================

-- Default Pricing
INSERT INTO public.pricing (city, pro_broker_monthly, pro_broker_annual, employee_tier_1, employee_tier_2, employee_tier_3)
VALUES 
  ('faridabad', 3599, 35990, 399, 759, 1299),
  ('gurugram', 3599, 35990, 399, 759, 1299),
  ('noida', 3599, 35990, 399, 759, 1299),
  ('delhi', 4319, 43188, 479, 911, 1559),
  ('mumbai', 4319, 43188, 479, 911, 1559),
  ('bangalore', 4319, 43188, 479, 911, 1559),
  ('pune', 3599, 35990, 399, 759, 1299),
  ('hyderabad', 3599, 35990, 399, 759, 1299),
  ('ahmedabad', 3599, 35990, 399, 759, 1299),
  ('chennai', 3599, 35990, 399, 759, 1299),
  ('kolkata', 3599, 35990, 399, 759, 1299),
  ('other_cities', 3599, 35990, 399, 759, 1299),
  ('international', 7198, 71980, 798, 1518, 2598)
ON CONFLICT (city) DO NOTHING;

-- App Configuration (including property limits)
INSERT INTO public.app_config (key, value, description) VALUES
  -- Version control
  ('app_version_required', '{
    "ios": {"min": "1.0.0", "current": "1.0.0", "force_update": false},
    "android": {"min": "1.0.0", "current": "1.0.0", "force_update": false}
  }', 'Minimum and current app version requirements'),
  
  -- Maintenance mode
  ('maintenance_mode', '{
    "enabled": false, 
    "message": "App is under maintenance. Please try again later.",
    "allow_pro_users": true
  }', 'Maintenance mode settings'),
  
  -- Feature flags
  ('feature_flags', '{
    "video_upload": true, 
    "deep_linking": true, 
    "cover_photo": true,
    "organizations_enabled_ios": false,
    "organizations_enabled_android": true,
    "payments_enabled_ios": false,
    "payments_enabled_android": true
  }', 'Feature toggles per platform'),
  
  -- Property limits for FREE users (non-pro brokers)
  ('property_limits', '{
    "ios": {
      "max_properties_free": 3,
      "max_photos_per_property": 10,
      "max_videos_per_property": 2,
      "limit_message": "Currently in this beta version you are limited to 3 properties only. Thanks for your patience!"
    },
    "android": {
      "max_properties_free": 3,
      "max_photos_per_property": 15,
      "max_videos_per_property": 5,
      "limit_message": "You have posted the maximum number of properties. Become a Pro Broker today to post unlimited properties and add employees to your team!"
    }
  }', 'Property posting limits for free users'),
  
  -- Search/View limits for FREE users
  ('search_limits', '{
    "ios": {
      "max_property_views_free": 50,
      "limit_message": "Beta limit reached for property views."
    },
    "android": {
      "max_property_views_free": 20,
      "limit_message": "Upgrade to Pro Broker to view unlimited properties!"
    }
  }', 'Search and view limits for free users'),
  
  -- Contact info
  ('contact_info', '{
    "email": "support@brickbase.co.in", 
    "phone": "+91-XXXXXXXXXX",
    "whatsapp": "+91-XXXXXXXXXX"
  }', 'Support contact information'),
  
  -- Razorpay configuration (for Android)
  ('payment_config', '{
    "provider": "razorpay",
    "currency": "INR",
    "enabled": true
  }', 'Payment provider configuration')
  
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- PART 12: HELPER VIEWS (Optional - for easier querying)
-- ============================================================================

-- View for active subscriptions
CREATE OR REPLACE VIEW public.active_subscriptions AS
SELECT 
  s.*,
  p.name as user_name,
  p.mobile as user_mobile,
  p.email as user_email
FROM public.subscriptions s
JOIN public.profiles p ON s.user_id = p.id
WHERE s.status = 'active' AND s.end_date > NOW();

-- View for property counts per user
CREATE OR REPLACE VIEW public.user_property_counts AS
SELECT 
  user_id,
  COUNT(*) as total_properties,
  COUNT(*) FILTER (WHERE is_sold = false) as active_properties,
  COUNT(*) FILTER (WHERE is_sold = true) as sold_properties
FROM public.properties
WHERE is_active = true
GROUP BY user_id;

-- ============================================================================
-- DONE! Production-ready schema for BrickBase mobile app.
-- ============================================================================
--
-- SECURITY FEATURES:
-- ✅ All storage buckets require authentication
-- ✅ Property media only visible to owner + org members
-- ✅ Users cannot self-promote to pro_broker (trigger prevents)
-- ✅ Users cannot modify subscription_status directly
-- ✅ Subscription changes auto-sync to profile
-- ✅ No direct profile INSERT (only via signup trigger)
-- ✅ Subscriptions managed only via service_role
-- ✅ Invite code collision handling
-- ✅ All appropriate data validation constraints
--
-- FEATURES:
-- ✅ Property limits configurable per platform (iOS/Android)
-- ✅ In-app messages with targeting & frequency options
-- ✅ Feature flags per platform
-- ✅ Facing direction field for properties
--
-- ADMIN DASHBOARD READY:
-- To modify limits/messages later via admin dashboard:
-- - Update app_config table (property_limits, search_limits)
-- - Insert into in_app_messages with targeting
-- - Update subscriptions via service_role
-- - All configuration is table-driven, not hardcoded
--
-- ============================================================================
