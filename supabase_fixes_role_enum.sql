-- ============================================================================
-- FIX SCRIPT - Role ENUM + Schema Corrections
-- Date: 2026-02-04
-- Fixes: Role enum, trigger issues, and schema cleanup
-- ============================================================================

-- STEP 1: Create ENUM type for user_role
DO $$ 
BEGIN
  -- Drop existing enum if it exists
  DROP TYPE IF EXISTS user_role CASCADE;
  
  -- Create new enum
  CREATE TYPE user_role AS ENUM ('broker', 'pro_broker', 'employee');
END $$;

-- STEP 2: Update profiles table to use ENUM instead of TEXT
ALTER TABLE public.profiles 
  ALTER COLUMN role TYPE user_role USING role::user_role;

-- Set default using the enum
ALTER TABLE public.profiles 
  ALTER COLUMN role SET DEFAULT 'broker'::user_role;

-- STEP 3: Fix the handle_new_user trigger to NOT create empty profiles
-- Strategy: Only create profile AFTER user completes signup form
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- NEW APPROACH: Don't auto-create profile, let frontend create it after signup form
-- This fixes the "bypass signup form" bug

-- STEP 4: Add helper function to check if profile needs completion
CREATE OR REPLACE FUNCTION public.profile_is_complete(profile_record public.profiles)
RETURNS BOOLEAN AS $$
BEGIN
  -- Profile is complete if it has name, firm_name, city, and email
  RETURN (
    profile_record.name IS NOT NULL AND profile_record.name != '' AND
    profile_record.firm_name IS NOT NULL AND profile_record.firm_name != '' AND
    profile_record.city IS NOT NULL AND profile_record.city != '' AND
    profile_record.email IS NOT NULL AND profile_record.email != ''
  );
END;
$$ LANGUAGE plpgsql;

-- STEP 5: Grant INSERT permission on profiles to authenticated users
-- (Previously only SELECT/UPDATE was granted)
GRANT INSERT ON public.profiles TO authenticated;

-- STEP 6: Add RLS policy for profile INSERT
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- STEP 7: Remove any existing empty profiles (cleanup)
-- These would have been created by the old trigger
DELETE FROM public.profiles 
WHERE name = '' OR name IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES (Run these to check)
-- ============================================================================

-- Check role enum is working
-- SELECT id, mobile, role::text FROM profiles LIMIT 5;

-- Check for empty profiles
-- SELECT COUNT(*) FROM profiles WHERE name = '' OR name IS NULL;

-- Check RLS policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies WHERE tablename = 'profiles';

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. After this fix, OTP verification will NOT create a profile automatically
-- 2. Frontend must explicitly INSERT profile after user fills signup form
-- 3. Role field is now a proper ENUM (can be changed via Supabase dropdown)
-- 4. Empty profiles have been cleaned up
-- ============================================================================
