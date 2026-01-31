-- ============================================================================
-- BRICKBASE MOBILE APP - PRODUCTION SQL SCHEMA v2
-- All critical, high, and medium severity issues addressed
-- ============================================================================

-- ============================================================================
-- PART 1: CLEANUP (Uncomment if resetting)
-- ============================================================================
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP TRIGGER IF EXISTS sync_subscription_status ON public.subscriptions;
-- DROP TRIGGER IF EXISTS enforce_profile_update_restrictions ON public.profiles;
-- DROP TRIGGER IF EXISTS enforce_employee_seat_limit ON public.organization_members;
-- DROP TRIGGER IF EXISTS enforce_property_limit ON public.properties;
-- DROP TRIGGER IF EXISTS sync_org_membership ON public.organization_members;
-- DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
-- DROP FUNCTION IF EXISTS public.sync_profile_subscription_status() CASCADE;
-- DROP FUNCTION IF EXISTS public.enforce_profile_restrictions() CASCADE;
-- DROP FUNCTION IF EXISTS public.enforce_employee_seats() CASCADE;
-- DROP FUNCTION IF EXISTS public.enforce_property_posting_limit() CASCADE;
-- DROP FUNCTION IF EXISTS public.sync_organization_membership() CASCADE;
-- DROP FUNCTION IF EXISTS public.generate_invite_code() CASCADE;
-- DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
-- DROP FUNCTION IF EXISTS public.get_user_active_property_count(UUID) CASCADE;
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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
    
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE invite_code = result) THEN
      RETURN result;
    END IF;
    
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      RETURN result || substr(extract(epoch from now())::text, 1, 4);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: CORE TABLES
-- ============================================================================

-- 1. PROFILES TABLE
-- organization_id is REMOVED - we use organization_members as single source of truth
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile TEXT UNIQUE,
  name TEXT,
  firm_name TEXT,
  city TEXT,
  email TEXT,
  
  -- Role: broker (default), employee (via invite link)
  -- PROTECTED: Can only be set at creation or by service_role
  role TEXT DEFAULT 'broker' CHECK (role IN ('broker', 'employee')),
  
  -- Pro status - ONLY modifiable via subscription sync trigger
  is_pro_broker BOOLEAN DEFAULT FALSE,
  
  -- Subscription status - synced from best active subscription
  subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('active', 'expired', 'pending_payment', 'none')),
  
  profile_photo TEXT,
  
  -- Deep link tracking (immutable after creation)
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
  
  -- Employee seats - enforced at database level
  used_employee_seats INTEGER DEFAULT 0 CHECK (used_employee_seats >= 0),
  max_employee_seats INTEGER DEFAULT 10 CHECK (max_employee_seats >= 1),
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure used doesn't exceed max
  CONSTRAINT seats_within_limit CHECK (used_employee_seats <= max_employee_seats)
);

-- 3. ORGANIZATION MEMBERS TABLE (Single source of truth for membership)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'employee')),
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ, -- Set when deactivated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One active membership per user per org
  UNIQUE(organization_id, user_id)
);

-- 4. PRICING TABLE
CREATE TABLE IF NOT EXISTS public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL CHECK (length(trim(city)) >= 2),
  
  pro_broker_monthly DECIMAL(10, 2) NOT NULL DEFAULT 3599 CHECK (pro_broker_monthly >= 0),
  pro_broker_annual DECIMAL(10, 2) NOT NULL DEFAULT 35990 CHECK (pro_broker_annual >= 0),
  employee_tier_1 DECIMAL(10, 2) NOT NULL DEFAULT 399 CHECK (employee_tier_1 >= 0),
  employee_tier_2 DECIMAL(10, 2) NOT NULL DEFAULT 759 CHECK (employee_tier_2 >= 0),
  employee_tier_3 DECIMAL(10, 2) NOT NULL DEFAULT 1299 CHECK (employee_tier_3 >= 0),
  
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
    'admin_granted'
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
  
  payment_provider TEXT CHECK (payment_provider IN ('razorpay', 'manual', 'free', NULL)),
  payment_id TEXT,
  payment_order_id TEXT,
  payment_signature TEXT,
  
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  last_payment_date TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  
  auto_renew BOOLEAN DEFAULT TRUE,
  granted_by_admin BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_subscription_dates CHECK (end_date > start_date)
);

-- CRITICAL: Prevent duplicate active pro subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_pro_subscription 
ON public.subscriptions (user_id) 
WHERE status = 'active' AND plan_type LIKE 'pro_broker%';

-- 6. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT,
  
  facing TEXT CHECK (facing IN (
    'North', 'South', 'East', 'West',
    'North-East', 'North-West', 'South-East', 'South-West',
    NULL
  )),
  
  property_photos JSONB DEFAULT '[]',
  property_videos JSONB DEFAULT '[]',
  cover_photo_index INTEGER DEFAULT 0 CHECK (cover_photo_index >= 0),
  
  price DECIMAL(15, 2) CHECK (price >= 0),
  price_unit TEXT DEFAULT 'cr' CHECK (price_unit IN ('cr', 'lakh', 'lakh_per_month')),
  floors JSONB DEFAULT '[]',
  
  builders JSONB DEFAULT '[]',
  builder_name TEXT,
  builder_phone TEXT,
  
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
  
  club_property BOOLEAN DEFAULT FALSE,
  pool_property BOOLEAN DEFAULT FALSE,
  park_property BOOLEAN DEFAULT FALSE,
  gated_property BOOLEAN DEFAULT FALSE,
  
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  is_sold BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Organization derived from user's membership, not stored directly
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: APP CONFIG & IN-APP MESSAGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.in_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  title TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  
  action_type TEXT CHECK (action_type IN ('none', 'link', 'screen', 'deeplink')),
  action_value TEXT,
  button_text TEXT,
  
  style TEXT DEFAULT 'popup' CHECK (style IN ('popup', 'banner', 'fullscreen', 'bottom_sheet', 'alert')),
  
  target_type TEXT DEFAULT 'all' CHECK (target_type IN (
    'all', 'region', 'user_ids', 'brokers_only', 'pro_brokers_only', 
    'employees_only', 'free_users', 'ios_only', 'android_only'
  )),
  target_value JSONB,
  
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  
  frequency_type TEXT DEFAULT 'once' CHECK (frequency_type IN (
    'once', 'once_per_day', 'every_app_open', 'daily_for_x_days'
  )),
  frequency_days INTEGER DEFAULT 1 CHECK (frequency_days >= 1),
  max_impressions INTEGER,
  
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
-- PART 5: HELPER FUNCTION - Get property limit for user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_property_limit_for_user(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  user_platform TEXT;
  user_is_pro BOOLEAN;
  config_value JSONB;
  limit_value INTEGER;
BEGIN
  -- Get user's platform and pro status
  SELECT device_platform, is_pro_broker INTO user_platform, user_is_pro
  FROM public.profiles WHERE id = p_user_id;
  
  -- Pro users have unlimited (return high number)
  IF user_is_pro THEN
    RETURN 999999;
  END IF;
  
  -- Get config
  SELECT value INTO config_value
  FROM public.app_config WHERE key = 'property_limits' AND is_active = true;
  
  IF config_value IS NULL THEN
    RETURN 3; -- Default fallback
  END IF;
  
  -- Get platform-specific limit
  IF user_platform = 'ios' THEN
    limit_value := (config_value->'ios'->>'max_properties_free')::INTEGER;
  ELSIF user_platform = 'android' THEN
    limit_value := (config_value->'android'->>'max_properties_free')::INTEGER;
  ELSE
    -- Unknown platform, use more restrictive
    limit_value := LEAST(
      (config_value->'ios'->>'max_properties_free')::INTEGER,
      (config_value->'android'->>'max_properties_free')::INTEGER
    );
  END IF;
  
  RETURN COALESCE(limit_value, 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6: SECURITY TRIGGERS
-- ============================================================================

-- A. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_code_param TEXT;
  inviter_org_id UUID;
  user_role TEXT := 'broker';
BEGIN
  invite_code_param := NEW.raw_user_meta_data->>'invite_code';
  
  IF invite_code_param IS NOT NULL AND invite_code_param != '' THEN
    SELECT o.id INTO inviter_org_id
    FROM public.organizations o
    WHERE o.invite_code = invite_code_param AND o.is_active = true;
    
    IF inviter_org_id IS NOT NULL THEN
      user_role := 'employee';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id, mobile, email, role,
    invite_code_used, device_platform, subscription_status
  ) VALUES (
    NEW.id, NEW.phone, NEW.email, user_role,
    invite_code_param, NEW.raw_user_meta_data->>'platform', 'none'
  );
  
  -- If employee via invite, add to organization_members
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

-- B. CRITICAL FIX: Restrict what users can update on their own profile
CREATE OR REPLACE FUNCTION public.enforce_profile_restrictions()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is a user updating their own profile (not service_role)
  IF auth.uid() = NEW.id THEN
    -- BLOCK changes to protected fields
    IF OLD.is_pro_broker IS DISTINCT FROM NEW.is_pro_broker THEN
      RAISE EXCEPTION 'Cannot modify pro broker status';
    END IF;
    
    IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
      RAISE EXCEPTION 'Cannot modify subscription status';
    END IF;
    
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'Cannot modify role';
    END IF;
    
    IF OLD.invited_by IS DISTINCT FROM NEW.invited_by THEN
      RAISE EXCEPTION 'Cannot modify invited_by';
    END IF;
    
    IF OLD.invite_code_used IS DISTINCT FROM NEW.invite_code_used THEN
      RAISE EXCEPTION 'Cannot modify invite_code_used';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_profile_update_restrictions ON public.profiles;
CREATE TRIGGER enforce_profile_update_restrictions
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_restrictions();

-- C. CRITICAL FIX: Sync subscription status from BEST active subscription
CREATE OR REPLACE FUNCTION public.sync_profile_subscription_status()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  best_subscription RECORD;
BEGIN
  -- Determine which user to update
  IF TG_OP = 'DELETE' THEN
    target_user_id := OLD.user_id;
  ELSE
    target_user_id := NEW.user_id;
  END IF;
  
  -- Find the BEST active subscription for this user
  -- Priority: active > pending_payment > payment_failed > expired > cancelled
  -- Within active: pro_broker_annual > pro_broker_monthly > employee tiers
  SELECT 
    status,
    plan_type,
    end_date
  INTO best_subscription
  FROM public.subscriptions
  WHERE user_id = target_user_id
  ORDER BY 
    CASE status
      WHEN 'active' THEN 1
      WHEN 'pending_payment' THEN 2
      WHEN 'payment_failed' THEN 3
      WHEN 'expired' THEN 4
      WHEN 'cancelled' THEN 5
      ELSE 6
    END,
    CASE 
      WHEN plan_type = 'pro_broker_annual' THEN 1
      WHEN plan_type = 'pro_broker_monthly' THEN 2
      WHEN plan_type = 'admin_granted' THEN 3
      ELSE 4
    END,
    end_date DESC
  LIMIT 1;
  
  -- Update profile based on best subscription (or lack thereof)
  IF best_subscription IS NULL THEN
    -- No subscriptions at all
    UPDATE public.profiles
    SET 
      subscription_status = 'none',
      is_pro_broker = FALSE,
      updated_at = NOW()
    WHERE id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET 
      subscription_status = best_subscription.status,
      is_pro_broker = (
        best_subscription.status = 'active' AND 
        best_subscription.plan_type LIKE 'pro_broker%'
      ),
      updated_at = NOW()
    WHERE id = target_user_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_subscription_status ON public.subscriptions;
CREATE TRIGGER sync_subscription_status
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_subscription_status();

-- D. Enforce employee seat limits
CREATE OR REPLACE FUNCTION public.enforce_employee_seats()
RETURNS TRIGGER AS $$
DECLARE
  org_record RECORD;
  current_employee_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_active = FALSE AND NEW.is_active = TRUE) THEN
    -- Get org details
    SELECT id, used_employee_seats, max_employee_seats, owner_id
    INTO org_record
    FROM public.organizations
    WHERE id = NEW.organization_id AND is_active = true;
    
    IF org_record IS NULL THEN
      RAISE EXCEPTION 'Organization not found or inactive';
    END IF;
    
    -- Don't count owner as employee
    IF NEW.user_id = org_record.owner_id THEN
      RETURN NEW;
    END IF;
    
    -- Check seat limit
    IF org_record.used_employee_seats >= org_record.max_employee_seats THEN
      RAISE EXCEPTION 'Organization has reached maximum employee seats (% of %)', 
        org_record.used_employee_seats, org_record.max_employee_seats;
    END IF;
    
    -- Increment seat count
    UPDATE public.organizations
    SET used_employee_seats = used_employee_seats + 1, updated_at = NOW()
    WHERE id = NEW.organization_id;
    
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.is_active = TRUE AND NEW.is_active = FALSE) THEN
    -- Get org owner to check if this was an employee
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id AND owner_id = OLD.user_id) THEN
      -- Decrement seat count (only for employees, not owner)
      UPDATE public.organizations
      SET used_employee_seats = GREATEST(0, used_employee_seats - 1), updated_at = NOW()
      WHERE id = OLD.organization_id;
    END IF;
    
    -- Set left_at timestamp if deactivating
    IF TG_OP = 'UPDATE' AND NEW.is_active = FALSE THEN
      NEW.left_at := NOW();
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_employee_seat_limit ON public.organization_members;
CREATE TRIGGER enforce_employee_seat_limit
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_seats();

-- E. CRITICAL: Enforce property posting limits at database level
CREATE OR REPLACE FUNCTION public.enforce_property_posting_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  -- Only check on INSERT
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Get current active property count for user
  SELECT COUNT(*) INTO current_count
  FROM public.properties
  WHERE user_id = NEW.user_id AND is_active = true;
  
  -- Get limit for this user
  max_allowed := public.get_property_limit_for_user(NEW.user_id);
  
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Property posting limit reached. You have % properties, maximum allowed is %', 
      current_count, max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_property_limit ON public.properties;
CREATE TRIGGER enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_posting_limit();

-- ============================================================================
-- PART 7: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON public.profiles(is_pro_broker);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_platform ON public.profiles(device_platform);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON public.profiles(subscription_status);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_invite ON public.organizations(invite_code);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON public.organizations(is_active);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_active ON public.organization_members(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);

CREATE INDEX IF NOT EXISTS idx_properties_user ON public.properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_category ON public.properties(property_category);
CREATE INDEX IF NOT EXISTS idx_properties_active ON public.properties(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_properties_location ON public.properties(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_properties_created ON public.properties(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_active ON public.in_app_messages(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_user_message_status ON public.user_message_status(user_id, message_id);
CREATE INDEX IF NOT EXISTS idx_app_config_key ON public.app_config(key);
CREATE INDEX IF NOT EXISTS idx_pricing_city ON public.pricing(city);

-- ============================================================================
-- PART 8: ENABLE ROW LEVEL SECURITY
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
-- PART 9: RLS POLICIES
-- ============================================================================

-- PROFILES
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Can see org members via organization_members table
CREATE POLICY "profiles_select_org_members" ON public.profiles
  FOR SELECT USING (
    id IN (
      SELECT om2.user_id FROM public.organization_members om1
      JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
    )
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ORGANIZATIONS
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "organizations_insert_pro" ON public.organizations
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_pro_broker = true AND subscription_status = 'active'
    )
  );

CREATE POLICY "organizations_update_owner" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete_owner" ON public.organizations
  FOR DELETE USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

CREATE POLICY "org_members_update" ON public.organization_members
  FOR UPDATE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- PRICING
CREATE POLICY "pricing_select" ON public.pricing
  FOR SELECT USING (auth.role() = 'authenticated');

-- SUBSCRIPTIONS
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- PROPERTIES
CREATE POLICY "properties_select_own" ON public.properties
  FOR SELECT USING (user_id = auth.uid());

-- Can see properties from ACTIVE org members
CREATE POLICY "properties_select_org" ON public.properties
  FOR SELECT USING (
    user_id IN (
      SELECT om2.user_id FROM public.organization_members om1
      JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
    )
  );

CREATE POLICY "properties_insert" ON public.properties
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "properties_update_own" ON public.properties
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "properties_delete_own" ON public.properties
  FOR DELETE USING (user_id = auth.uid());

-- APP CONFIG
CREATE POLICY "app_config_select" ON public.app_config
  FOR SELECT USING (is_active = true AND auth.role() = 'authenticated');

-- IN-APP MESSAGES
CREATE POLICY "messages_select" ON public.in_app_messages
  FOR SELECT USING (
    auth.role() = 'authenticated' AND is_active = true AND
    (start_date IS NULL OR start_date <= NOW()) AND
    (end_date IS NULL OR end_date >= NOW())
  );

-- USER MESSAGE STATUS
CREATE POLICY "message_status_select_own" ON public.user_message_status
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "message_status_insert_own" ON public.user_message_status
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "message_status_update_own" ON public.user_message_status
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- PART 10: STORAGE BUCKETS & POLICIES
-- ============================================================================

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

-- Profile photos - owner can manage, authenticated can view
CREATE POLICY "profile_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos' AND auth.role() = 'authenticated');

-- Property media - owner can manage, ACTIVE org members can view
CREATE POLICY "property_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- FIXED: Only owner or ACTIVE org members can view
CREATE POLICY "property_photos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (storage.foldername(name))[1]::uuid IN (
        SELECT om2.user_id FROM public.organization_members om1
        JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
      )
    )
  );

-- Property videos (same pattern)
CREATE POLICY "property_videos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_videos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_videos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_videos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (storage.foldername(name))[1]::uuid IN (
        SELECT om2.user_id FROM public.organization_members om1
        JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
      )
    )
  );

-- Property files (same pattern)
CREATE POLICY "property_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_files_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_files_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (storage.foldername(name))[1]::uuid IN (
        SELECT om2.user_id FROM public.organization_members om1
        JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
      )
    )
  );

-- ============================================================================
-- PART 11: UPDATED_AT TRIGGERS
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
-- PART 12: DEFAULT DATA
-- ============================================================================

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

INSERT INTO public.app_config (key, value, description) VALUES
  ('app_version_required', '{
    "ios": {"min": "1.0.0", "current": "1.0.0", "force_update": false},
    "android": {"min": "1.0.0", "current": "1.0.0", "force_update": false}
  }', 'App version requirements'),
  
  ('maintenance_mode', '{
    "enabled": false, 
    "message": "App is under maintenance",
    "allow_pro_users": true
  }', 'Maintenance mode'),
  
  ('feature_flags', '{
    "video_upload": true, 
    "deep_linking": true, 
    "cover_photo": true,
    "organizations_enabled_ios": false,
    "organizations_enabled_android": true,
    "payments_enabled_ios": false,
    "payments_enabled_android": true
  }', 'Feature flags per platform'),
  
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
  }', 'Property limits for free users'),
  
  ('search_limits', '{
    "ios": {"max_property_views_free": 50, "limit_message": "Beta limit reached."},
    "android": {"max_property_views_free": 20, "limit_message": "Upgrade to Pro Broker for unlimited access!"}
  }', 'Search limits'),
  
  ('contact_info', '{
    "email": "support@brickbase.co.in", 
    "phone": "+91-XXXXXXXXXX"
  }', 'Contact info'),
  
  ('payment_config', '{
    "provider": "razorpay",
    "currency": "INR",
    "enabled": true
  }', 'Payment config')
  
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();

-- ============================================================================
-- DONE! Production-ready schema v2
-- ============================================================================
--
-- FIXES APPLIED:
-- ✅ Subscription sync queries BEST active subscription, not NEW.status
-- ✅ Users cannot change: is_pro_broker, subscription_status, role, invited_by
-- ✅ Employee seat limits enforced at database level
-- ✅ Only one active pro subscription per user (unique partial index)
-- ✅ Single source of truth: organization_members (removed profiles.organization_id)
-- ✅ Storage policies check is_active on organization_members
-- ✅ Property limits enforced at database level (not just app layer)
--
-- ============================================================================
