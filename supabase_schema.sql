-- ============================================================================
-- SUPABASE SCHEMA FOR REAL ESTATE APP
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE TABLES
-- ============================================================================

-- 1. PROFILES TABLE (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile TEXT UNIQUE NOT NULL,
  name TEXT,
  firm_name TEXT,
  city TEXT,
  email TEXT,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'employee')),
  is_pro BOOLEAN DEFAULT FALSE,
  profile_photo TEXT,
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'pending_payment', NULL)),
  organization_id UUID,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  device_token TEXT,
  last_login_device TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  employee_seats INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key for organization_id in profiles (after organizations table exists)
ALTER TABLE public.profiles 
ADD CONSTRAINT fk_profiles_organization 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 3. ORGANIZATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'employee')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- 4. PRICING TABLE (city-wise pricing)
CREATE TABLE IF NOT EXISTS public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL,
  pro_owner_monthly DECIMAL(10, 2) NOT NULL DEFAULT 3599,
  pro_owner_annual DECIMAL(10, 2) NOT NULL DEFAULT 35990,
  employee_tier_1 DECIMAL(10, 2) NOT NULL DEFAULT 399,  -- 1-7 employees
  employee_tier_2 DECIMAL(10, 2) NOT NULL DEFAULT 759,  -- 8-14 employees
  employee_tier_3 DECIMAL(10, 2) NOT NULL DEFAULT 1299, -- 15+ employees
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('pro_owner_monthly', 'pro_owner_annual', 'admin_granted')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending_payment', 'cancelled')),
  employee_seats INTEGER DEFAULT 0,
  amount DECIMAL(10, 2) NOT NULL,
  payment_id TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PROPERTIES TABLE (with all fields from your add property screen)
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT,
  
  -- Photos (stored as JSONB array of URLs)
  property_photos JSONB DEFAULT '[]',
  
  -- Pricing - Single price or multi-floor
  price DECIMAL(15, 2),
  price_unit TEXT DEFAULT 'cr' CHECK (price_unit IN ('cr', 'lakh', 'lakh_per_month')),
  floors JSONB DEFAULT '[]', -- Array of {floorNumber, price, priceUnit, isSold}
  
  -- Builder Info (JSONB array)
  builders JSONB DEFAULT '[]', -- Array of {name, phoneNumber, countryCode}
  builder_name TEXT,
  builder_phone TEXT,
  
  -- Case Type
  case_type TEXT CHECK (case_type IN ('REGISTRY_CASE', 'TRANSFER_CASE', 'RENTAL', 'LEASE_HOLD', 'OTHER')),
  
  -- Address (JSONB object)
  address JSONB DEFAULT '{}', -- {unitNo, block, sector, city}
  
  -- Sizes (JSONB array)
  sizes JSONB DEFAULT '[]', -- Array of {type, value, unit}
  
  -- Age & Possession
  age_type TEXT CHECK (age_type IN ('Fresh', 'Resale', 'UnderConstruction')),
  property_age INTEGER,
  possession_month INTEGER CHECK (possession_month >= 1 AND possession_month <= 12),
  possession_year INTEGER,
  
  -- Important Files (JSONB array)
  important_files JSONB DEFAULT '[]', -- Array of {name, uri, mimeType}
  
  -- Other Details
  payment_plan TEXT,
  additional_notes TEXT,
  
  -- Features (booleans)
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
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. OTP VERIFICATIONS TABLE (for custom OTP during development)
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT NOT NULL,
  country_code TEXT DEFAULT '+91',
  otp TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON public.profiles(is_pro);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_invite_code ON public.organizations(invite_code);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_properties_user ON public.properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_category ON public.properties(property_category);
CREATE INDEX IF NOT EXISTS idx_properties_type ON public.properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_is_sold ON public.properties(is_sold);
CREATE INDEX IF NOT EXISTS idx_properties_location ON public.properties(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_otp_mobile ON public.otp_verifications(mobile);
CREATE INDEX IF NOT EXISTS idx_pricing_city ON public.pricing(city);

-- ============================================================================
-- PART 3: ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4: CREATE RLS POLICIES
-- ============================================================================

-- PROFILES POLICIES
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read org members profiles" ON public.profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Allow service role to create profiles (for signup)
CREATE POLICY "Service can create profiles" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- ORGANIZATIONS POLICIES
CREATE POLICY "Users can read own organizations" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Pro owners can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update organizations" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete organizations" ON public.organizations
  FOR DELETE USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS POLICIES
CREATE POLICY "Users can read org members" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    ) OR user_id = auth.uid()
  );

CREATE POLICY "Owners can add members" ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can remove members" ON public.organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    ) AND user_id != auth.uid()
  );

-- Service role can add members during signup
CREATE POLICY "Service can add members" ON public.organization_members
  FOR INSERT WITH CHECK (true);

-- PRICING POLICIES (public read, admin write)
CREATE POLICY "Anyone can read pricing" ON public.pricing
  FOR SELECT USING (true);

-- SUBSCRIPTIONS POLICIES
CREATE POLICY "Users can read own subscriptions" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create subscriptions" ON public.subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own subscriptions" ON public.subscriptions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- PROPERTIES POLICIES
CREATE POLICY "Users can read own properties" ON public.properties
  FOR SELECT USING (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create properties" ON public.properties
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own properties" ON public.properties
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own properties" ON public.properties
  FOR DELETE USING (user_id = auth.uid());

-- OTP VERIFICATIONS POLICIES (open for development)
CREATE POLICY "Anyone can manage OTP" ON public.otp_verifications
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 5: CREATE STORAGE BUCKETS
-- ============================================================================

-- Create storage buckets for files
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('profile-photos', 'profile-photos', true),
  ('property-photos', 'property-photos', true),
  ('property-files', 'property-files', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 6: STORAGE RLS POLICIES
-- ============================================================================

-- Profile Photos: Users can manage their own photos
CREATE POLICY "Users can upload profile photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update profile photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete profile photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view profile photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos');

-- Property Photos: Users can manage their own property photos
CREATE POLICY "Users can upload property photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update property photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete property photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view property photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-photos');

-- Property Files: Users can manage their own property files
CREATE POLICY "Users can upload property files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update property files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete property files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Org members can view property files" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-files');

-- ============================================================================
-- PART 7: INSERT DEFAULT PRICING DATA
-- ============================================================================

INSERT INTO public.pricing (city, pro_owner_monthly, pro_owner_annual, employee_tier_1, employee_tier_2, employee_tier_3)
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

-- ============================================================================
-- PART 8: HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_updated_at
  BEFORE UPDATE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate random invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
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
-- DONE! Your Supabase database is ready.
-- ============================================================================
