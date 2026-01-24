-- ============================================================================
-- SUPABASE SCHEMA V2 - REAL ESTATE APP
-- With Admin Dashboard, Remote Config & In-App Messaging
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: DROP OLD TABLES IF NEEDED (Run only if you ran V1 before)
-- ============================================================================
-- Uncomment these if you need to reset:
-- DROP TABLE IF EXISTS public.otp_verifications CASCADE;
-- DROP TABLE IF EXISTS public.properties CASCADE;
-- DROP TABLE IF EXISTS public.subscriptions CASCADE;
-- DROP TABLE IF EXISTS public.pricing CASCADE;
-- DROP TABLE IF EXISTS public.organization_members CASCADE;
-- DROP TABLE IF EXISTS public.organizations CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================================
-- PART 2: MOBILE APP TABLES
-- ============================================================================

-- 1. PROFILES TABLE (Mobile app users - Brokers & Employees)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT UNIQUE NOT NULL,
  name TEXT,
  firm_name TEXT,
  city TEXT,
  email TEXT,
  role TEXT DEFAULT 'broker' CHECK (role IN ('broker', 'employee')),
  is_pro_broker BOOLEAN DEFAULT FALSE,
  profile_photo TEXT,
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'pending_payment', NULL)),
  organization_id UUID,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  device_token TEXT, -- For push notifications
  device_id TEXT,    -- For single device login
  last_login_at TIMESTAMPTZ,
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

-- Add foreign key for organization_id in profiles
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

-- 4. PRICING TABLE (city-wise pricing - Admin controlled)
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
  plan_type TEXT NOT NULL CHECK (plan_type IN ('pro_broker_monthly', 'pro_broker_annual', 'admin_granted')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending_payment', 'cancelled')),
  employee_seats INTEGER DEFAULT 0,
  amount DECIMAL(10, 2) NOT NULL,
  payment_id TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  granted_by UUID, -- Admin who granted (if admin_granted)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  property_category TEXT CHECK (property_category IN ('Residential', 'Commercial')),
  property_type TEXT,
  
  -- Media (stored as JSONB arrays of URLs)
  property_photos JSONB DEFAULT '[]',
  property_videos JSONB DEFAULT '[]',
  
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
-- PART 3: ADMIN DASHBOARD TABLES
-- ============================================================================

-- 7. ADMIN USERS TABLE (Completely separate from mobile users)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'salesperson')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ADMIN PERMISSIONS TABLE (List of all available permissions)
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g., 'manage_users', 'edit_pricing'
  name TEXT NOT NULL,        -- Display name
  description TEXT,
  category TEXT NOT NULL,    -- Group permissions: 'users', 'pricing', 'subscriptions', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ADMIN ROLE PERMISSIONS TABLE (Which role has which permissions)
CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'salesperson')),
  permission_id UUID NOT NULL REFERENCES public.admin_permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission_id)
);

-- 10. ADMIN ACTIVITY LOG (Track admin actions)
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id),
  action TEXT NOT NULL, -- 'grant_subscription', 'update_pricing', etc.
  target_type TEXT,     -- 'user', 'pricing', 'subscription'
  target_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: REMOTE CONFIG & IN-APP MESSAGING TABLES
-- ============================================================================

-- 11. APP CONFIG TABLE (Remote configuration - backend-driven UI)
CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. IN-APP MESSAGES TABLE (Dynamic popups/announcements)
CREATE TABLE IF NOT EXISTS public.in_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  action_type TEXT CHECK (action_type IN ('none', 'link', 'screen', 'deeplink')),
  action_value TEXT,       -- URL or screen name
  button_text TEXT,        -- CTA button text
  style TEXT DEFAULT 'popup' CHECK (style IN ('popup', 'banner', 'fullscreen', 'bottom_sheet')),
  
  -- Targeting
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'region', 'user_ids', 'role', 'pro_only', 'non_pro')),
  target_value JSONB,      -- Array of cities, user IDs, etc.
  
  -- Scheduling
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  
  -- Display rules
  show_once BOOLEAN DEFAULT FALSE,  -- Show only once per user
  priority INTEGER DEFAULT 0,        -- Higher = more important
  is_active BOOLEAN DEFAULT TRUE,
  
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. USER MESSAGE STATUS (Track which messages users have seen/dismissed)
CREATE TABLE IF NOT EXISTS public.user_message_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.in_app_messages(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  clicked_action BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, message_id)
);

-- 14. PUSH NOTIFICATION LOG (Track sent notifications)
CREATE TABLE IF NOT EXISTS public.push_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  
  -- Targeting (same as in_app_messages)
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'region', 'user_ids', 'role', 'pro_only', 'non_pro')),
  target_value JSONB,
  
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  sent_by UUID REFERENCES public.admin_users(id),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 5: CREATE INDEXES
-- ============================================================================

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON public.profiles(mobile);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro ON public.profiles(is_pro_broker);
CREATE INDEX IF NOT EXISTS idx_profiles_device_token ON public.profiles(device_token);

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_invite_code ON public.organizations(invite_code);

-- Organization Members
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Properties
CREATE INDEX IF NOT EXISTS idx_properties_user ON public.properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_category ON public.properties(property_category);
CREATE INDEX IF NOT EXISTS idx_properties_is_sold ON public.properties(is_sold);
CREATE INDEX IF NOT EXISTS idx_properties_location ON public.properties(latitude, longitude);

-- Admin
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_activity_admin ON public.admin_activity_log(admin_id);

-- In-App Messages
CREATE INDEX IF NOT EXISTS idx_messages_active ON public.in_app_messages(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_user_message_status ON public.user_message_status(user_id, message_id);

-- App Config
CREATE INDEX IF NOT EXISTS idx_app_config_key ON public.app_config(key);

-- Pricing
CREATE INDEX IF NOT EXISTS idx_pricing_city ON public.pricing(city);

-- ============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 7: RLS POLICIES - MOBILE APP TABLES
-- ============================================================================

-- PROFILES
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can read org members profiles" ON public.profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id::text = auth.uid()::text
    )
  );

CREATE POLICY "Service role can manage profiles" ON public.profiles
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ORGANIZATIONS
CREATE POLICY "Users can read own organizations" ON public.organizations
  FOR SELECT USING (
    owner_id::text = auth.uid()::text OR
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id::text = auth.uid()::text)
  );

CREATE POLICY "Pro brokers can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (owner_id::text = auth.uid()::text);

CREATE POLICY "Owners can update organizations" ON public.organizations
  FOR UPDATE USING (owner_id::text = auth.uid()::text);

CREATE POLICY "Service role can manage organizations" ON public.organizations
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ORGANIZATION MEMBERS
CREATE POLICY "Users can read org members" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id::text = auth.uid()::text)
    OR user_id::text = auth.uid()::text
  );

CREATE POLICY "Service role can manage org members" ON public.organization_members
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- PRICING (Read-only for users, service_role for modifications)
CREATE POLICY "Anyone can read pricing" ON public.pricing
  FOR SELECT USING (true);

CREATE POLICY "Only service role can modify pricing" ON public.pricing
  FOR INSERT USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Only service role can update pricing" ON public.pricing
  FOR UPDATE USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Only service role can delete pricing" ON public.pricing
  FOR DELETE USING (auth.jwt()->>'role' = 'service_role');

-- SUBSCRIPTIONS
CREATE POLICY "Users can read own subscriptions" ON public.subscriptions
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- PROPERTIES
CREATE POLICY "Users can read own and org properties" ON public.properties
  FOR SELECT USING (
    user_id::text = auth.uid()::text OR
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id::text = auth.uid()::text)
  );

CREATE POLICY "Users can create properties" ON public.properties
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own properties" ON public.properties
  FOR UPDATE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can delete own properties" ON public.properties
  FOR DELETE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Service role can manage properties" ON public.properties
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 8: RLS POLICIES - ADMIN TABLES (Service role only)
-- ============================================================================

CREATE POLICY "Service role only for admin_users" ON public.admin_users
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role only for admin_permissions" ON public.admin_permissions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role only for admin_role_permissions" ON public.admin_role_permissions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role only for admin_activity_log" ON public.admin_activity_log
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role only for push_notifications" ON public.push_notifications
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 9: RLS POLICIES - CONFIG & MESSAGING
-- ============================================================================

-- APP CONFIG (Read for all, write for service_role)
CREATE POLICY "Anyone can read active config" ON public.app_config
  FOR SELECT USING (is_active = true);

CREATE POLICY "Service role can manage config" ON public.app_config
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- IN-APP MESSAGES (Read active messages, service_role for management)
CREATE POLICY "Users can read active messages" ON public.in_app_messages
  FOR SELECT USING (
    is_active = true 
    AND (start_date IS NULL OR start_date <= NOW())
    AND (end_date IS NULL OR end_date >= NOW())
  );

CREATE POLICY "Service role can manage messages" ON public.in_app_messages
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- USER MESSAGE STATUS
CREATE POLICY "Users can read own message status" ON public.user_message_status
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert own message status" ON public.user_message_status
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own message status" ON public.user_message_status
  FOR UPDATE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Service role can manage message status" ON public.user_message_status
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 10: STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('profile-photos', 'profile-photos', true),
  ('property-photos', 'property-photos', true),
  ('property-videos', 'property-videos', true),
  ('property-files', 'property-files', true),
  ('admin-assets', 'admin-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload profile photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view profile photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos');

CREATE POLICY "Users can upload property photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'property-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view property photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-photos');

CREATE POLICY "Users can upload property videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'property-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view property videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-videos');

CREATE POLICY "Users can upload property files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'property-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Org members can view property files" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-files');

CREATE POLICY "Service role can manage admin assets" ON storage.objects
  FOR ALL USING (bucket_id = 'admin-assets' AND auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Anyone can view admin assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'admin-assets');

-- ============================================================================
-- PART 11: INSERT DEFAULT DATA
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

-- Default Admin Permissions
INSERT INTO public.admin_permissions (code, name, description, category) VALUES
  -- User Management
  ('view_users', 'View Users', 'View list of all mobile app users', 'users'),
  ('view_user_details', 'View User Details', 'View detailed user profile and subscription', 'users'),
  ('edit_user_subscription', 'Edit User Subscription', 'Grant or modify user subscriptions', 'users'),
  ('delete_user', 'Delete User', 'Delete user accounts', 'users'),
  
  -- Pricing Management
  ('view_pricing', 'View Pricing', 'View city-wise pricing', 'pricing'),
  ('edit_pricing', 'Edit Pricing', 'Modify city-wise pricing', 'pricing'),
  
  -- Organization Management
  ('view_organizations', 'View Organizations', 'View all organizations', 'organizations'),
  ('edit_organizations', 'Edit Organizations', 'Modify organization details', 'organizations'),
  
  -- Property Management
  ('view_all_properties', 'View All Properties', 'View properties from all users', 'properties'),
  ('delete_any_property', 'Delete Any Property', 'Delete properties from any user', 'properties'),
  
  -- Messaging
  ('send_notifications', 'Send Notifications', 'Send push notifications to users', 'messaging'),
  ('create_in_app_messages', 'Create In-App Messages', 'Create popup messages for app', 'messaging'),
  ('manage_app_config', 'Manage App Config', 'Update remote app configuration', 'messaging'),
  
  -- Admin Management
  ('view_admins', 'View Admins', 'View list of admin users', 'admin'),
  ('create_admin', 'Create Admin', 'Create new admin users', 'admin'),
  ('edit_admin_permissions', 'Edit Admin Permissions', 'Modify role permissions', 'admin'),
  ('view_activity_log', 'View Activity Log', 'View admin activity history', 'admin')
ON CONFLICT (code) DO NOTHING;

-- Grant all permissions to super_admin
INSERT INTO public.admin_role_permissions (role, permission_id)
SELECT 'super_admin', id FROM public.admin_permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Grant limited permissions to admin
INSERT INTO public.admin_role_permissions (role, permission_id)
SELECT 'admin', id FROM public.admin_permissions 
WHERE code IN (
  'view_users', 'view_user_details', 'edit_user_subscription',
  'view_pricing', 'view_organizations',
  'view_all_properties', 'send_notifications', 'create_in_app_messages',
  'view_activity_log'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Grant very limited permissions to salesperson
INSERT INTO public.admin_role_permissions (role, permission_id)
SELECT 'salesperson', id FROM public.admin_permissions 
WHERE code IN (
  'view_users', 'view_user_details', 'edit_user_subscription',
  'view_organizations'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Default App Config
INSERT INTO public.app_config (key, value, description) VALUES
  ('app_version_required', '{"ios": "1.0.0", "android": "1.0.0"}', 'Minimum required app version'),
  ('maintenance_mode', '{"enabled": false, "message": "App is under maintenance"}', 'Maintenance mode settings'),
  ('feature_flags', '{"video_upload": true, "deep_linking": true}', 'Feature toggles'),
  ('contact_info', '{"email": "support@example.com", "phone": "+91-XXX"}', 'Support contact information')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 12: HELPER FUNCTIONS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
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
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END $$;

-- Generate invite code function
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
-- DONE! Now run the SUPER ADMIN SETUP below separately.
-- ============================================================================
