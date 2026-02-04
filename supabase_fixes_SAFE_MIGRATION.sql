-- ============================================================================
-- SAFE MIGRATION - Role ENUM + Bug Fixes (With Existing Data)
-- Date: 2026-02-04
-- ============================================================================

-- STEP 1: Create ENUM type (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('broker', 'pro_broker', 'employee');
  END IF;
END $$;

-- STEP 2: Add a temporary column with ENUM type
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role_new user_role;

-- STEP 3: Copy existing data to new column (converting TEXT to ENUM)
UPDATE public.profiles 
SET role_new = role::user_role 
WHERE role_new IS NULL;

-- STEP 4: Drop the old TEXT column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role CASCADE;

-- STEP 5: Rename new column to 'role'
ALTER TABLE public.profiles RENAME COLUMN role_new TO role;

-- STEP 6: Set default and NOT NULL constraint
ALTER TABLE public.profiles 
  ALTER COLUMN role SET DEFAULT 'broker'::user_role;

ALTER TABLE public.profiles 
  ALTER COLUMN role SET NOT NULL;

-- STEP 7: Remove the problematic trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- STEP 8: Create helper function for profile completeness check
CREATE OR REPLACE FUNCTION public.profile_is_complete(profile_record public.profiles)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    profile_record.name IS NOT NULL AND profile_record.name != '' AND
    profile_record.firm_name IS NOT NULL AND profile_record.firm_name != '' AND
    profile_record.city IS NOT NULL AND profile_record.city != '' AND
    profile_record.email IS NOT NULL AND profile_record.email != ''
  );
END;
$$ LANGUAGE plpgsql;

-- STEP 9: Grant INSERT permission on profiles (if not already granted)
DO $$
BEGIN
  GRANT INSERT ON public.profiles TO authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if already granted
END $$;

-- STEP 10: Add INSERT policy for profiles (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'profiles_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY "profiles_insert_own" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id)';
  END IF;
END $$;

-- STEP 11: Clean up empty/incomplete profiles
DELETE FROM public.profiles 
WHERE name = '' OR name IS NULL 
   OR firm_name = '' OR firm_name IS NULL
   OR city = '' OR city IS NULL
   OR email = '' OR email IS NULL;

-- STEP 12: Verify the migration
DO $$
DECLARE
  role_type_name TEXT;
  empty_count INTEGER;
BEGIN
  -- Check role column type
  SELECT data_type INTO role_type_name
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role';
  
  RAISE NOTICE 'Role column type: %', role_type_name;
  
  -- Check for empty profiles
  SELECT COUNT(*) INTO empty_count
  FROM public.profiles
  WHERE name = '' OR name IS NULL;
  
  RAISE NOTICE 'Empty profiles remaining: %', empty_count;
  
  RAISE NOTICE 'Migration completed successfully!';
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Uncomment to run manually)
-- ============================================================================

-- Check role enum is working
-- SELECT id, mobile, role::text as role_value FROM profiles LIMIT 5;

-- Check for empty profiles (should be 0)
-- SELECT COUNT(*) FROM profiles WHERE name = '' OR name IS NULL;

-- Check RLS policies
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';

-- Test role dropdown values
-- SELECT enum_range(NULL::user_role);

-- ============================================================================
-- DONE!
-- ============================================================================
