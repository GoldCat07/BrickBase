-- ============================================================================
-- BRICKBASE MOBILE APP - PRODUCTION SQL SCHEMA v5 (FINAL)
-- Clean first-time setup - no ALTER statements
-- Simplified admin_granted_pro on profiles
-- ============================================================================

-- ============================================================================
-- PART 1: HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Robust invite code generation
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  max_attempts INTEGER := 100;
  attempt INTEGER := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..12 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE invite_code = result) THEN
      RETURN result;
    END IF;
    
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      result := upper(replace(gen_random_uuid()::text, '-', ''));
      result := substr(result, 1, 12);
      
      IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE invite_code = result) THEN
        RETURN result;
      END IF;
      
      RETURN result || attempt::text;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Safe UUID validation for storage policies
CREATE OR REPLACE FUNCTION public.is_valid_uuid(str TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF str IS NULL OR str = '' THEN
    RETURN FALSE;
  END IF;
  
  PERFORM str::uuid;
  RETURN TRUE;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- PART 2: CORE TABLES
-- ============================================================================

-- 1. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Contact info with validation
  mobile TEXT UNIQUE CHECK (
    mobile IS NULL OR 
    (length(mobile) BETWEEN 8 AND 16 AND mobile ~ '^\+?[0-9]+$')
  ),
  email TEXT UNIQUE CHECK (
    email IS NULL OR 
    (length(email) BETWEEN 5 AND 254 AND email ~ '^[^@]+@[^@]+\.[^@]+$')
  ),
  
  -- Profile info
  name TEXT CHECK (name IS NULL OR length(name) BETWEEN 1 AND 100),
  firm_name TEXT CHECK (firm_name IS NULL OR length(firm_name) BETWEEN 1 AND 200),
  city TEXT CHECK (city IS NULL OR length(city) BETWEEN 1 AND 100),
  profile_photo TEXT CHECK (profile_photo IS NULL OR length(profile_photo) <= 2048),
  
  -- Role: broker (default), employee (via invite link)
  -- PROTECTED: Only set at creation or by service_role
  role TEXT DEFAULT 'broker' CHECK (role IN ('broker', 'employee')),
  
  -- Pro status - computed from subscriptions OR admin grant
  -- PROTECTED: Only modified by sync trigger or service_role
  is_pro_broker BOOLEAN DEFAULT FALSE,
  
  -- ADMIN OVERRIDE: Set this to true via service_role to manually grant pro
  -- PROTECTED: Only modifiable by service_role
  admin_granted_pro BOOLEAN DEFAULT FALSE,
  
  -- Notes for why admin granted pro (for your reference)
  admin_pro_notes TEXT CHECK (admin_pro_notes IS NULL OR length(admin_pro_notes) <= 500),
  
  -- Subscription status - synced from best active subscription
  -- PROTECTED: Only modified by sync trigger or service_role
  subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('active', 'expired', 'pending_payment', 'none')),
  
  -- Deep link tracking (immutable after creation)
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code_used TEXT CHECK (invite_code_used IS NULL OR length(invite_code_used) <= 20),
  
  -- Location
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Device management
  device_token TEXT CHECK (device_token IS NULL OR length(device_token) <= 500),
  device_id TEXT CHECK (device_id IS NULL OR length(device_id) <= 200),
  device_platform TEXT CHECK (device_platform IN ('ios', 'android', NULL)),
  
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN public.profiles.is_pro_broker IS 'Computed: TRUE if has active pro subscription OR admin_granted_pro = true';
COMMENT ON COLUMN public.profiles.admin_granted_pro IS 'Manual override by admin. Set via service_role to grant pro without subscription.';
COMMENT ON COLUMN public.profiles.admin_pro_notes IS 'Optional: Why this user was granted pro manually (e.g., "Paid via UPI on 2025-01-15")';

-- 2. ORGANIZATIONS TABLE
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL DEFAULT public.generate_invite_code(),
  
  -- Employee seats management
  used_employee_seats INTEGER DEFAULT 0 CHECK (used_employee_seats >= 0),
  max_employee_seats INTEGER DEFAULT 10 CHECK (max_employee_seats BETWEEN 1 AND 1000),
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT seats_within_limit CHECK (used_employee_seats <= max_employee_seats)
);

-- 3. ORGANIZATION MEMBERS TABLE
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'employee')),
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: one active membership per user per org
CREATE UNIQUE INDEX idx_org_members_unique_active 
ON public.organization_members (organization_id, user_id) 
WHERE is_active = true;

-- 4. PRICING TABLE
CREATE TABLE public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 100),
  
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

-- 5. SUBSCRIPTIONS TABLE (Simplified - no admin_granted plan type)
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Plan types - only actual subscription plans
  plan_type TEXT NOT NULL CHECK (plan_type IN (
    'pro_broker_monthly', 
    'pro_broker_annual', 
    'employee_tier_1', 
    'employee_tier_2', 
    'employee_tier_3'
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
  currency TEXT DEFAULT 'INR' CHECK (length(currency) = 3),
  
  -- Payment info (from Razorpay)
  payment_provider TEXT CHECK (payment_provider IN ('razorpay', 'manual', NULL)),
  payment_id TEXT CHECK (payment_id IS NULL OR length(payment_id) <= 100),
  payment_order_id TEXT CHECK (payment_order_id IS NULL OR length(payment_order_id) <= 100),
  payment_signature TEXT CHECK (payment_signature IS NULL OR length(payment_signature) <= 500),
  razorpay_subscription_id TEXT CHECK (razorpay_subscription_id IS NULL OR length(razorpay_subscription_id) <= 100),
  
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  last_payment_date TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  
  auto_renew BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_subscription_dates CHECK (end_date > start_date)
);

COMMENT ON TABLE public.subscriptions IS 'Managed via service_role/webhooks only. No user INSERT/UPDATE policies.';

-- Composite index for sync trigger performance
CREATE INDEX idx_subscriptions_user_status ON public.subscriptions(user_id, status);

-- Prevent duplicate active pro subscriptions
CREATE UNIQUE INDEX idx_unique_active_pro_subscription 
ON public.subscriptions (user_id) 
WHERE status = 'active' AND plan_type LIKE 'pro_broker%';

-- 6. PROPERTIES TABLE
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT CHECK (property_type IS NULL OR length(property_type) <= 100),
  
  facing TEXT CHECK (facing IN (
    'North', 'South', 'East', 'West',
    'North-East', 'North-West', 'South-East', 'South-West',
    NULL
  )),
  
  property_photos JSONB DEFAULT '[]' CHECK (jsonb_typeof(property_photos) = 'array'),
  property_videos JSONB DEFAULT '[]' CHECK (jsonb_typeof(property_videos) = 'array'),
  cover_photo_index INTEGER DEFAULT 0 CHECK (cover_photo_index >= 0),
  
  price DECIMAL(15, 2) CHECK (price >= 0),
  price_unit TEXT DEFAULT 'cr' CHECK (price_unit IN ('cr', 'lakh', 'lakh_per_month')),
  floors JSONB DEFAULT '[]' CHECK (jsonb_typeof(floors) = 'array'),
  
  builders JSONB DEFAULT '[]' CHECK (jsonb_typeof(builders) = 'array'),
  builder_name TEXT CHECK (builder_name IS NULL OR length(builder_name) <= 200),
  builder_phone TEXT CHECK (
    builder_phone IS NULL OR 
    (length(builder_phone) BETWEEN 8 AND 16 AND builder_phone ~ '^\+?[0-9]+$')
  ),
  
  case_type TEXT CHECK (case_type IN ('REGISTRY_CASE', 'TRANSFER_CASE', 'RENTAL', 'LEASE_HOLD', 'OTHER')),
  address JSONB DEFAULT '{}' CHECK (jsonb_typeof(address) = 'object'),
  sizes JSONB DEFAULT '[]' CHECK (jsonb_typeof(sizes) = 'array'),
  age_type TEXT CHECK (age_type IN ('Fresh', 'Resale', 'UnderConstruction')),
  property_age INTEGER CHECK (property_age IS NULL OR (property_age >= 0 AND property_age <= 200)),
  possession_month INTEGER CHECK (possession_month IS NULL OR (possession_month >= 1 AND possession_month <= 12)),
  possession_year INTEGER CHECK (possession_year IS NULL OR (possession_year >= 2000 AND possession_year <= 2100)),
  important_files JSONB DEFAULT '[]' CHECK (jsonb_typeof(important_files) = 'array'),
  payment_plan TEXT CHECK (payment_plan IS NULL OR length(payment_plan) <= 2000),
  additional_notes TEXT CHECK (additional_notes IS NULL OR length(additional_notes) <= 5000),
  
  club_property BOOLEAN DEFAULT FALSE,
  pool_property BOOLEAN DEFAULT FALSE,
  park_property BOOLEAN DEFAULT FALSE,
  gated_property BOOLEAN DEFAULT FALSE,
  
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  is_sold BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: APP CONFIG & IN-APP MESSAGING
-- ============================================================================

CREATE TABLE public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL CHECK (length(key) BETWEEN 1 AND 100),
  value JSONB NOT NULL,
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.in_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  message TEXT CHECK (message IS NULL OR length(message) <= 2000),
  image_url TEXT CHECK (image_url IS NULL OR length(image_url) <= 2048),
  
  action_type TEXT CHECK (action_type IN ('none', 'link', 'screen', 'deeplink')),
  action_value TEXT CHECK (action_value IS NULL OR length(action_value) <= 500),
  button_text TEXT CHECK (button_text IS NULL OR length(button_text) <= 50),
  
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
  frequency_days INTEGER DEFAULT 1 CHECK (frequency_days BETWEEN 1 AND 365),
  max_impressions INTEGER CHECK (max_impressions IS NULL OR max_impressions > 0),
  
  priority INTEGER DEFAULT 0 CHECK (priority BETWEEN -100 AND 100),
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.user_message_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.in_app_messages(id) ON DELETE CASCADE,
  
  impression_count INTEGER DEFAULT 1 CHECK (impression_count > 0),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  clicked_action BOOLEAN DEFAULT FALSE,
  
  UNIQUE(user_id, message_id)
);

-- ============================================================================
-- PART 4: HELPER FUNCTIONS FOR QUERIES
-- ============================================================================

-- Secure function to get active subscriptions (for admin queries)
CREATE OR REPLACE FUNCTION public.get_active_subscriptions_secure(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
  subscription_id UUID,
  user_id UUID,
  user_name TEXT,
  plan_type TEXT,
  status TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
) AS $$
BEGIN
  IF current_setting('request.role', true) = 'service_role' AND p_user_id IS NOT NULL THEN
    RETURN QUERY
    SELECT s.id, s.user_id, p.name, s.plan_type, s.status, s.start_date, s.end_date
    FROM public.subscriptions s
    JOIN public.profiles p ON s.user_id = p.id
    WHERE s.user_id = p_user_id AND s.status = 'active';
  ELSE
    RETURN QUERY
    SELECT s.id, s.user_id, p.name, s.plan_type, s.status, s.start_date, s.end_date
    FROM public.subscriptions s
    JOIN public.profiles p ON s.user_id = p.id
    WHERE s.user_id = auth.uid() AND s.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get property limit for a user
CREATE OR REPLACE FUNCTION public.get_property_limit_for_user(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  user_platform TEXT;
  user_is_pro BOOLEAN;
  config_value JSONB;
  limit_value INTEGER;
BEGIN
  SELECT device_platform, is_pro_broker INTO user_platform, user_is_pro
  FROM public.profiles WHERE id = p_user_id;
  
  IF user_is_pro THEN
    RETURN 999999;
  END IF;
  
  SELECT value INTO config_value
  FROM public.app_config WHERE key = 'property_limits' AND is_active = true;
  
  IF config_value IS NULL THEN
    RETURN 3;
  END IF;
  
  IF user_platform = 'ios' THEN
    limit_value := (config_value->'ios'->>'max_properties_free')::INTEGER;
  ELSIF user_platform = 'android' THEN
    limit_value := (config_value->'android'->>'max_properties_free')::INTEGER;
  ELSE
    limit_value := LEAST(
      COALESCE((config_value->'ios'->>'max_properties_free')::INTEGER, 3),
      COALESCE((config_value->'android'->>'max_properties_free')::INTEGER, 3)
    );
  END IF;
  
  RETURN COALESCE(limit_value, 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin function: Reconcile employee seat counts (service_role only)
CREATE OR REPLACE FUNCTION public.reconcile_employee_seats(p_org_id UUID DEFAULT NULL)
RETURNS TABLE(org_id UUID, old_count INTEGER, new_count INTEGER, corrected BOOLEAN) AS $$
DECLARE
  org RECORD;
  actual_count INTEGER;
  caller_role TEXT;
BEGIN
  caller_role := COALESCE(current_setting('request.role', true), '');
  IF caller_role NOT IN ('service_role', '') THEN
    IF caller_role = 'authenticated' THEN
      RAISE EXCEPTION 'Access denied: only administrators can reconcile seats';
    END IF;
  END IF;

  FOR org IN 
    SELECT o.id, o.used_employee_seats, o.owner_id
    FROM public.organizations o
    WHERE (p_org_id IS NULL OR o.id = p_org_id) AND o.is_active = true
  LOOP
    SELECT COUNT(*) INTO actual_count
    FROM public.organization_members om
    WHERE om.organization_id = org.id 
      AND om.is_active = true 
      AND om.user_id != org.owner_id;
    
    org_id := org.id;
    old_count := org.used_employee_seats;
    new_count := actual_count;
    corrected := (old_count != actual_count);
    
    IF old_count != actual_count THEN
      UPDATE public.organizations
      SET used_employee_seats = actual_count, updated_at = NOW()
      WHERE id = org.id;
    END IF;
    
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 5: SECURITY TRIGGERS
-- ============================================================================

-- A. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_code_param TEXT;
  inviter_org RECORD;
  user_role TEXT := 'broker';
BEGIN
  invite_code_param := NEW.raw_user_meta_data->>'invite_code';
  
  IF invite_code_param IS NOT NULL AND invite_code_param != '' THEN
    SELECT o.id, o.owner_id INTO inviter_org
    FROM public.organizations o
    WHERE o.invite_code = invite_code_param AND o.is_active = true;
    
    IF inviter_org.id IS NOT NULL THEN
      user_role := 'employee';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id, mobile, email, role,
    invite_code_used, 
    invited_by,
    device_platform, 
    subscription_status
  ) VALUES (
    NEW.id, 
    NEW.phone, 
    NEW.email, 
    user_role,
    invite_code_param, 
    inviter_org.owner_id,
    NEW.raw_user_meta_data->>'platform', 
    'none'
  );
  
  -- Add to organization_members if invited
  IF inviter_org.id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active, joined_at)
    VALUES (inviter_org.id, NEW.id, 'employee', true, NOW());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B. Restrict profile field updates
CREATE OR REPLACE FUNCTION public.enforce_profile_restrictions()
RETURNS TRIGGER AS $$
DECLARE
  is_service_role BOOLEAN;
  bypass_flag TEXT;
BEGIN
  is_service_role := COALESCE(current_setting('request.role', true), '') = 'service_role';
  
  IF is_service_role THEN
    RETURN NEW;
  END IF;
  
  bypass_flag := COALESCE(current_setting('app.bypass_profile_restrictions', true), 'false');
  IF bypass_flag = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- Protected fields - cannot be modified by users
  IF OLD.is_pro_broker IS DISTINCT FROM NEW.is_pro_broker THEN
    RAISE EXCEPTION 'Cannot modify is_pro_broker';
  END IF;
  
  IF OLD.admin_granted_pro IS DISTINCT FROM NEW.admin_granted_pro THEN
    RAISE EXCEPTION 'Cannot modify admin_granted_pro';
  END IF;
  
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
    RAISE EXCEPTION 'Cannot modify subscription_status';
  END IF;
  
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Cannot modify role';
  END IF;
  
  -- Allow invited_by to be set to NULL (cascade deletion)
  IF OLD.invited_by IS DISTINCT FROM NEW.invited_by THEN
    IF NEW.invited_by IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot modify invited_by';
    END IF;
  END IF;
  
  IF OLD.invite_code_used IS DISTINCT FROM NEW.invite_code_used THEN
    RAISE EXCEPTION 'Cannot modify invite_code_used';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_profile_update_restrictions
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_restrictions();

-- C. Sync subscription status to profile
-- is_pro_broker = (has_active_pro_subscription OR admin_granted_pro)
CREATE OR REPLACE FUNCTION public.sync_profile_subscription_status()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  best_subscription RECORD;
  has_any_active_pro BOOLEAN;
  profile_admin_granted BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user_id := OLD.user_id;
  ELSE
    target_user_id := NEW.user_id;
  END IF;
  
  BEGIN
    PERFORM set_config('app.bypass_profile_restrictions', 'true', true);
    
    -- Get admin_granted_pro from profile
    SELECT admin_granted_pro INTO profile_admin_granted
    FROM public.profiles WHERE id = target_user_id;
    
    -- Find the BEST subscription
    SELECT 
      status,
      plan_type,
      end_date
    INTO best_subscription
    FROM public.subscriptions
    WHERE user_id = target_user_id
    ORDER BY 
      CASE WHEN status = 'active' AND end_date > NOW() THEN 1
           WHEN status = 'active' AND end_date <= NOW() THEN 3
           WHEN status = 'pending_payment' THEN 2
           WHEN status = 'payment_failed' THEN 4
           WHEN status = 'expired' THEN 5
           WHEN status = 'cancelled' THEN 6
           ELSE 7
      END,
      CASE 
        WHEN plan_type = 'pro_broker_annual' THEN 1
        WHEN plan_type = 'pro_broker_monthly' THEN 2
        ELSE 3
      END,
      end_date DESC
    LIMIT 1;
    
    -- Check if user has ANY active pro subscription
    SELECT EXISTS(
      SELECT 1 FROM public.subscriptions
      WHERE user_id = target_user_id
        AND status = 'active'
        AND end_date > NOW()
        AND plan_type LIKE 'pro_broker%'
    ) INTO has_any_active_pro;
    
    -- Update profile
    IF best_subscription IS NULL THEN
      UPDATE public.profiles
      SET 
        subscription_status = 'none',
        -- is_pro_broker = subscription OR admin_granted_pro
        is_pro_broker = COALESCE(profile_admin_granted, FALSE),
        updated_at = NOW()
      WHERE id = target_user_id;
    ELSE
      UPDATE public.profiles
      SET 
        subscription_status = CASE 
          WHEN best_subscription.status = 'active' AND best_subscription.end_date <= NOW() THEN 'expired'
          ELSE best_subscription.status
        END,
        -- is_pro_broker = subscription OR admin_granted_pro
        is_pro_broker = (has_any_active_pro OR COALESCE(profile_admin_granted, FALSE)),
        updated_at = NOW()
      WHERE id = target_user_id;
    END IF;
    
    PERFORM set_config('app.bypass_profile_restrictions', 'false', true);
    
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_profile_restrictions', 'false', true);
    RAISE;
  END;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_subscription_status
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_subscription_status();

-- D. Enforce employee seat limits (BEFORE trigger)
CREATE OR REPLACE FUNCTION public.enforce_employee_seats_before()
RETURNS TRIGGER AS $$
DECLARE
  org_record RECORD;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_active = FALSE AND NEW.is_active = TRUE) THEN
    SELECT id, used_employee_seats, max_employee_seats, owner_id
    INTO org_record
    FROM public.organizations
    WHERE id = NEW.organization_id AND is_active = true
    FOR UPDATE;
    
    IF org_record IS NULL THEN
      RAISE EXCEPTION 'Organization not found or inactive';
    END IF;
    
    IF NEW.user_id = org_record.owner_id THEN
      IF NEW.role = 'employee' THEN
        RAISE EXCEPTION 'Organization owner cannot be added as an employee';
      END IF;
      RETURN NEW;
    END IF;
    
    IF org_record.used_employee_seats >= org_record.max_employee_seats THEN
      RAISE EXCEPTION 'Organization has reached maximum employee seats (% of %)', 
        org_record.used_employee_seats, org_record.max_employee_seats;
    END IF;
    
    UPDATE public.organizations
    SET used_employee_seats = used_employee_seats + 1, updated_at = NOW()
    WHERE id = NEW.organization_id;
  
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
    SELECT id, owner_id INTO org_record
    FROM public.organizations
    WHERE id = OLD.organization_id
    FOR UPDATE;
    
    NEW.left_at := NOW();
    
    IF org_record IS NOT NULL AND OLD.user_id != org_record.owner_id THEN
      UPDATE public.organizations
      SET used_employee_seats = GREATEST(0, used_employee_seats - 1), updated_at = NOW()
      WHERE id = OLD.organization_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- AFTER trigger for DELETE
CREATE OR REPLACE FUNCTION public.enforce_employee_seats_after_delete()
RETURNS TRIGGER AS $$
DECLARE
  org_owner_id UUID;
BEGIN
  IF OLD.is_active = TRUE THEN
    SELECT owner_id INTO org_owner_id
    FROM public.organizations WHERE id = OLD.organization_id;
    
    IF org_owner_id IS NOT NULL AND OLD.user_id != org_owner_id THEN
      UPDATE public.organizations
      SET used_employee_seats = GREATEST(0, used_employee_seats - 1), updated_at = NOW()
      WHERE id = OLD.organization_id;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_employee_seat_limit_before
  BEFORE INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_seats_before();

CREATE TRIGGER enforce_employee_seat_decrement_after
  AFTER DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_seats_after_delete();

-- E. Enforce property posting limits
CREATE OR REPLACE FUNCTION public.enforce_property_posting_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  SELECT COUNT(*) INTO current_count
  FROM public.properties
  WHERE user_id = NEW.user_id AND is_active = true;
  
  max_allowed := public.get_property_limit_for_user(NEW.user_id);
  
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Property posting limit reached. You have % properties, maximum allowed is %', 
      current_count, max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_posting_limit();

-- ============================================================================
-- PART 6: INDEXES
-- ============================================================================

CREATE INDEX idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_city ON public.profiles(city);
CREATE INDEX idx_profiles_is_pro ON public.profiles(is_pro_broker);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_platform ON public.profiles(device_platform);
CREATE INDEX idx_profiles_subscription ON public.profiles(subscription_status);

CREATE INDEX idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX idx_organizations_invite ON public.organizations(invite_code);
CREATE INDEX idx_organizations_active ON public.organizations(is_active);

CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_active ON public.organization_members(organization_id, is_active);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON public.subscriptions(end_date);

CREATE INDEX idx_properties_user ON public.properties(user_id);
CREATE INDEX idx_properties_category ON public.properties(property_category);
CREATE INDEX idx_properties_active ON public.properties(user_id, is_active);
CREATE INDEX idx_properties_location ON public.properties(latitude, longitude);
CREATE INDEX idx_properties_created ON public.properties(created_at DESC);

CREATE INDEX idx_messages_active ON public.in_app_messages(is_active, start_date, end_date);
CREATE INDEX idx_user_message_status ON public.user_message_status(user_id, message_id);
CREATE INDEX idx_app_config_key ON public.app_config(key);
CREATE INDEX idx_pricing_city ON public.pricing(city);

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

-- PROFILES
CREATE POLICY 'profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY 'profiles_select_org_members ON public.profiles
  FOR SELECT USING (
    id IN (
      SELECT om2.user_id FROM public.organization_members om1
      JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
    )
  );

CREATE POLICY 'profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ORGANIZATIONS
CREATE POLICY 'organizations_select ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY 'organizations_insert_pro ON public.organizations
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_pro_broker = true
    )
  );

CREATE POLICY 'organizations_update_owner ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY 'organizations_delete_owner ON public.organizations
  FOR DELETE USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS
CREATE POLICY 'org_members_select ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY 'org_members_insert ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

CREATE POLICY 'org_members_update_owner ON public.organization_members
  FOR UPDATE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- Allow employees to leave (deactivate themselves)
CREATE POLICY 'org_members_update_self_leave ON public.organization_members
  FOR UPDATE USING (user_id = auth.uid() AND is_active = true)
  WITH CHECK (user_id = auth.uid() AND is_active = false);

CREATE POLICY 'org_members_delete ON public.organization_members
  FOR DELETE USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- PRICING
CREATE POLICY 'pricing_select ON public.pricing
  FOR SELECT USING (auth.role() = 'authenticated');

-- SUBSCRIPTIONS (select only - managed by service_role)
CREATE POLICY 'subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- PROPERTIES
CREATE POLICY 'properties_select_own ON public.properties
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY 'properties_select_org ON public.properties
  FOR SELECT USING (
    user_id IN (
      SELECT om2.user_id FROM public.organization_members om1
      JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
    )
  );

CREATE POLICY 'properties_insert ON public.properties
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY 'properties_update_own ON public.properties
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY 'properties_delete_own ON public.properties
  FOR DELETE USING (user_id = auth.uid());

-- APP CONFIG
CREATE POLICY 'app_config_select ON public.app_config
  FOR SELECT USING (is_active = true AND auth.role() = 'authenticated');

-- IN-APP MESSAGES
CREATE POLICY 'messages_select ON public.in_app_messages
  FOR SELECT USING (
    auth.role() = 'authenticated' AND is_active = true AND
    (start_date IS NULL OR start_date <= NOW()) AND
    (end_date IS NULL OR end_date >= NOW())
  );

-- USER MESSAGE STATUS
CREATE POLICY 'message_status_select_own ON public.user_message_status
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY 'message_status_insert_own ON public.user_message_status
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY 'message_status_update_own ON public.user_message_status
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- PART 9: STORAGE BUCKETS & POLICIES
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

-- Profile photos
CREATE POLICY 'profile_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'profile_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'profile_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'profile_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos' AND auth.role() = 'authenticated');

-- Property photos with safe UUID validation
CREATE POLICY 'property_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_photos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-photos' AND auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (
        public.is_valid_uuid((storage.foldername(name))[1]) AND
        (storage.foldername(name))[1]::uuid IN (
          SELECT om2.user_id FROM public.organization_members om1
          JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
          WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
        )
      )
    )
  );

-- Property videos
CREATE POLICY 'property_videos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_videos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_videos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_videos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-videos' AND auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (
        public.is_valid_uuid((storage.foldername(name))[1]) AND
        (storage.foldername(name))[1]::uuid IN (
          SELECT om2.user_id FROM public.organization_members om1
          JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
          WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
        )
      )
    )
  );

-- Property files
CREATE POLICY 'property_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_files_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY 'property_files_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-files' AND auth.role() = 'authenticated' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      (
        public.is_valid_uuid((storage.foldername(name))[1]) AND
        (storage.foldername(name))[1]::uuid IN (
          SELECT om2.user_id FROM public.organization_members om1
          JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
          WHERE om1.user_id = auth.uid() AND om1.is_active = true AND om2.is_active = true
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
-- DONE! v5 - Clean first-time setup
-- ============================================================================
--
-- SIMPLIFIED ADMIN PRO GRANT:
-- 
-- To manually make someone pro (via service_role):
--   UPDATE profiles 
--   SET admin_granted_pro = true, admin_pro_notes = 'Paid via UPI on 2025-01-15'
--   WHERE id = 'user-uuid';
--
-- To revoke:
--   UPDATE profiles SET admin_granted_pro = false WHERE id = 'user-uuid';
--
-- The sync trigger computes: is_pro_broker = (has_active_subscription OR admin_granted_pro)
--
-- RAZORPAY FLOW:
-- 1. User subscribes → create subscription row with status='active', end_date=30 days
-- 2. Razorpay sends webhook on renewal → extend end_date
-- 3. If payment fails → webhook sets status='payment_failed'
-- 4. Sync trigger automatically updates profile.is_pro_broker
--
-- CROSS-PLATFORM:
-- User subscribes on Android → logs into iOS → still has pro (tied to profile, not device)
--
-- ============================================================================
