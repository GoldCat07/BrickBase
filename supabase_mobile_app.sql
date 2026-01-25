-- ============================================================================
-- SUPABASE SCHEMA - BRICKBASE MOBILE APP (CLEAN - NO ADMIN)
-- Security-hardened, production-ready
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: CLEANUP (Uncomment if needed)
-- ============================================================================
-- DROP TABLE IF EXISTS public.user_message_status CASCADE;
-- DROP TABLE IF EXISTS public.in_app_messages CASCADE;
-- DROP TABLE IF EXISTS public.app_config CASCADE;
-- DROP TABLE IF EXISTS public.properties CASCADE;
-- DROP TABLE IF EXISTS public.subscriptions CASCADE;
-- DROP TABLE IF EXISTS public.pricing CASCADE;
-- DROP TABLE IF EXISTS public.organization_members CASCADE;
-- DROP TABLE IF EXISTS public.organizations CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
-- DROP FUNCTION IF EXISTS public.generate_invite_code() CASCADE;
-- DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

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

-- 1. PROFILES TABLE (Brokers & Employees)
-- CRITICAL: id REFERENCES auth.users(id) - profile auto-created on signup
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile TEXT UNIQUE,
  name TEXT,
  firm_name TEXT,
  city TEXT,
  email TEXT,
  role TEXT DEFAULT 'broker' CHECK (role IN ('broker', 'employee')),
  is_pro_broker BOOLEAN DEFAULT FALSE,
  profile_photo TEXT,
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'pending_payment', NULL)),
  organization_id UUID,
  -- Deep link tracking
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code_used TEXT,
  -- Location for map features
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  -- Push notifications & device
  device_token TEXT,
  device_id TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL DEFAULT public.generate_invite_code(),
  employee_seats INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add organization FK to profiles
ALTER TABLE public.profiles 
ADD CONSTRAINT fk_profiles_organization 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 3. ORGANIZATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('broker', 'employee')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- 4. PRICING TABLE (City-wise pricing)
CREATE TABLE IF NOT EXISTS public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL,
  pro_broker_monthly DECIMAL(10, 2) NOT NULL DEFAULT 3599,
  pro_broker_annual DECIMAL(10, 2) NOT NULL DEFAULT 35990,
  employee_tier_1 DECIMAL(10, 2) NOT NULL DEFAULT 399,
  employee_tier_2 DECIMAL(10, 2) NOT NULL DEFAULT 759,
  employee_tier_3 DECIMAL(10, 2) NOT NULL DEFAULT 1299,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('pro_broker_monthly', 'pro_broker_annual', 'employee_tier_1', 'employee_tier_2', 'employee_tier_3')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending_payment', 'cancelled')),
  employee_seats INTEGER DEFAULT 0,
  amount DECIMAL(10, 2) NOT NULL,
  payment_id TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent invalid date ranges
  CONSTRAINT valid_subscription_dates CHECK (end_date > start_date)
);

-- 6. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT,
  
  -- Media
  property_photos JSONB DEFAULT '[]',
  property_videos JSONB DEFAULT '[]',
  cover_photo_index INTEGER DEFAULT 0,
  
  -- Pricing
  price DECIMAL(15, 2),
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
  property_age INTEGER,
  possession_month INTEGER CHECK (possession_month >= 1 AND possession_month <= 12),
  possession_year INTEGER,
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
  
  -- Ownership
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: REMOTE CONFIG & IN-APP MESSAGING (App reads these)
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

-- 8. IN-APP MESSAGES (Announcements - you create via Supabase Dashboard)
CREATE TABLE IF NOT EXISTS public.in_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  action_type TEXT CHECK (action_type IN ('none', 'link', 'screen', 'deeplink')),
  action_value TEXT,
  button_text TEXT,
  style TEXT DEFAULT 'popup' CHECK (style IN ('popup', 'banner', 'fullscreen', 'bottom_sheet')),
  
  -- Targeting
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'region', 'user_ids', 'role', 'pro_only', 'non_pro')),
  target_value JSONB,
  
  -- Scheduling
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  
  -- Display rules
  show_once BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. USER MESSAGE STATUS (Track seen/dismissed messages)
CREATE TABLE IF NOT EXISTS public.user_message_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.in_app_messages(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  clicked_action BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, message_id)
);

-- ============================================================================
-- PART 5: AUTO-CREATE PROFILE ON SIGNUP (TRIGGER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_code_param TEXT;
  inviter_id UUID;
  user_role TEXT := 'broker';
BEGIN
  -- Check if user signed up with invite code (deep link)
  invite_code_param := NEW.raw_user_meta_data->>'invite_code';
  
  IF invite_code_param IS NOT NULL THEN
    SELECT o.owner_id INTO inviter_id
    FROM public.organizations o
    WHERE o.invite_code = invite_code_param;
    
    IF inviter_id IS NOT NULL THEN
      user_role := 'employee';
    END IF;
  END IF;

  -- Create profile automatically
  INSERT INTO public.profiles (
    id, 
    mobile, 
    email, 
    role, 
    invited_by, 
    invite_code_used
  )
  VALUES (
    NEW.id,
    NEW.phone,
    NEW.email,
    user_role,
    inviter_id,
    invite_code_param
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- PART 6: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON public.profiles(is_pro_broker);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_invite_code ON public.organizations(invite_code);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_properties_user ON public.properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_category ON public.properties(property_category);
CREATE INDEX IF NOT EXISTS idx_properties_is_sold ON public.properties(is_sold);
CREATE INDEX IF NOT EXISTS idx_properties_location ON public.properties(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_messages_active ON public.in_app_messages(is_active, start_date, end_date);
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

-- PROFILES --
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can read org members profiles" ON public.profiles
  FOR SELECT USING (
    organization_id IS NOT NULL AND
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ORGANIZATIONS --
CREATE POLICY "Users can read own organizations" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Pro brokers can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_pro_broker = true
    )
  );

CREATE POLICY "Owners can update organizations" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete organizations" ON public.organizations
  FOR DELETE USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS --
CREATE POLICY "Users can read org members" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Org owners can add members" ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

CREATE POLICY "Org owners can remove members" ON public.organization_members
  FOR DELETE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- PRICING (Public read) --
CREATE POLICY "Anyone can read pricing" ON public.pricing
  FOR SELECT USING (true);

-- SUBSCRIPTIONS --
CREATE POLICY "Users can read own subscriptions" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- PROPERTIES --
CREATE POLICY "Users can read own properties" ON public.properties
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can read org properties" ON public.properties
  FOR SELECT USING (
    organization_id IS NOT NULL AND
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create properties" ON public.properties
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own properties" ON public.properties
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own properties" ON public.properties
  FOR DELETE USING (user_id = auth.uid());

-- APP CONFIG (Public read) --
CREATE POLICY "Anyone can read active config" ON public.app_config
  FOR SELECT USING (is_active = true);

-- IN-APP MESSAGES (Read active only) --
CREATE POLICY "Users can read active messages" ON public.in_app_messages
  FOR SELECT USING (
    is_active = true 
    AND (start_date IS NULL OR start_date <= NOW())
    AND (end_date IS NULL OR end_date >= NOW())
  );

-- USER MESSAGE STATUS --
CREATE POLICY "Users can read own message status" ON public.user_message_status
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own message status" ON public.user_message_status
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own message status" ON public.user_message_status
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- PART 9: STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('profile-photos', 'profile-photos', true),
  ('property-photos', 'property-photos', true),
  ('property-videos', 'property-videos', true),
  ('property-files', 'property-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies - format: {user_id}/{filename}

-- Profile photos
CREATE POLICY "Users can upload profile photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' AND 
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own profile photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own profile photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view profile photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos');

-- Property photos
CREATE POLICY "Users can upload property photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-photos' AND 
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own property photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-photos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own property photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-photos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view property photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-photos');

-- Property videos
CREATE POLICY "Users can upload property videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-videos' AND 
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own property videos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-videos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own property videos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-videos' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view property videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-videos');

-- Property files (documents)
CREATE POLICY "Users can upload property files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-files' AND 
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own property files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-files' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own property files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-files' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view property files" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-files');

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
  ('other_cities', 3599, 35990, 399, 759, 1299),
  ('international', 7198, 71980, 798, 1518, 2598)
ON CONFLICT (city) DO NOTHING;

-- Default App Config
INSERT INTO public.app_config (key, value, description) VALUES
  ('app_version_required', '{"ios": "1.0.0", "android": "1.0.0"}', 'Minimum required app version'),
  ('maintenance_mode', '{"enabled": false, "message": "App is under maintenance"}', 'Maintenance mode settings'),
  ('feature_flags', '{"video_upload": true, "deep_linking": true, "cover_photo": true}', 'Feature toggles'),
  ('contact_info', '{"email": "support@brickbase.co.in", "phone": "+91-XXX"}', 'Support contact information')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- DONE! Your mobile app database is ready.
-- ============================================================================
-- 
-- WHAT'S INCLUDED:
-- ✅ profiles (auto-created on signup via trigger)
-- ✅ organizations (with auto-generated invite codes)
-- ✅ organization_members
-- ✅ pricing (city-wise, public read)
-- ✅ subscriptions
-- ✅ properties (with cover_photo_index for map display)
-- ✅ app_config (remote configuration)
-- ✅ in_app_messages (announcements)
-- ✅ user_message_status (track seen messages)
-- ✅ Storage buckets for photos, videos, files
-- ✅ All RLS policies properly linked to auth.uid()
--
-- TO ADD DATA LATER (via Supabase Dashboard):
-- - Pricing: Update in "pricing" table
-- - App Config: Update in "app_config" table  
-- - Announcements: Insert into "in_app_messages" table
--
-- ============================================================================
