-- ============================================================================
-- SUPER ADMIN SETUP V3 - SECURITY HARDENED
-- Run this AFTER running supabase_schema_v3.sql
-- ============================================================================

-- ============================================================================
-- STEP 1: FIRST, CREATE YOUR SUPABASE AUTH USER
-- ============================================================================
-- 
-- IMPORTANT: You must first create an auth.users entry!
-- 
-- Option A: Via Supabase Dashboard (Recommended)
--   1. Go to Supabase Dashboard → Authentication → Users
--   2. Click "Add User" → "Create New User"
--   3. Enter your email (must be @goddswaytechnologies.com or @brickbase.co.in)
--   4. Set a password (or use auto-generate)
--   5. Click "Create User"
--   6. Copy the User UID from the list (you'll need it below)
--
-- Option B: Via SQL (if you know what you're doing)
--   This requires inserting directly into auth.users which is NOT recommended
--   Use the Dashboard instead.
--
-- ============================================================================

-- ============================================================================
-- STEP 2: CREATE ADMIN_USERS ENTRY
-- ============================================================================
-- 
-- Replace 'YOUR_AUTH_USER_ID_HERE' with the UUID from Step 1
-- Replace 'your-email@brickbase.co.in' with your actual email
-- 

-- Example (MODIFY BEFORE RUNNING):
/*
INSERT INTO public.admin_users (
  auth_user_id,
  email, 
  name, 
  role, 
  is_active
)
VALUES (
  'YOUR_AUTH_USER_ID_HERE'::uuid,  -- The UUID from auth.users
  'your-email@brickbase.co.in',    -- Must match the email in auth.users
  'Super Admin',                    -- Your name
  'super_admin',                   
  true
);
*/

-- ============================================================================
-- STEP 3: ADD INITIAL AUDIT LOG ENTRY (Optional but recommended)
-- ============================================================================
/*
INSERT INTO public.admin_activity_log (
  admin_id,
  action,
  details
)
SELECT 
  id,
  'SYSTEM_INITIALIZATION',
  '{"note": "Super admin account created manually"}'::jsonb
FROM public.admin_users 
WHERE role = 'super_admin'
LIMIT 1;
*/

-- ============================================================================
-- HOW ADMIN LOGIN WORKS (Secure Flow):
-- ============================================================================
-- 
-- 1. Admin goes to dashboard login page
-- 2. Admin enters email → clicks "Send Magic Link"
-- 3. Supabase Auth sends magic link to email
-- 4. Admin clicks link → authenticated in Supabase Auth
-- 5. Dashboard checks:
--    a) Is auth.uid() in admin_users.auth_user_id? 
--    b) Is admin_users.is_active = true?
--    c) What is their role? (super_admin or admin)
-- 6. If all checks pass → show dashboard with appropriate permissions
-- 
-- SECURITY BENEFITS:
-- - auth_user_id binds admin to Supabase Auth securely
-- - Email alone isn't enough - must have matching auth.users entry
-- - RLS policy ensures admins can only read their own record
-- - Service role used for admin management operations
-- - Domain restriction prevents unauthorized email signups
--
-- ============================================================================

-- ============================================================================
-- HELPER: View all current admins (run to verify)
-- ============================================================================
-- SELECT id, auth_user_id, email, name, role, is_active, created_at 
-- FROM public.admin_users;

-- ============================================================================
-- HELPER: Create a new admin (run as super_admin via dashboard backend)
-- ============================================================================
-- This would be done through the admin dashboard UI, not directly in SQL
-- The dashboard backend uses service_role to:
-- 1. Invite user via Supabase Auth
-- 2. Create admin_users entry with their auth_user_id
-- 3. Log the action in admin_activity_log

-- ============================================================================
-- NOTES FOR FUTURE ADMINS:
-- ============================================================================
-- 
-- Only emails matching these domains can be admins:
--   - @goddswaytechnologies.com
--   - @brickbase.co.in
-- 
-- Only ONE super_admin can exist (enforced by unique index)
-- 
-- To add a regular admin:
-- 1. Invite them via Supabase Auth
-- 2. Insert into admin_users with role='admin'
-- 3. Their access is limited compared to super_admin
--
-- ============================================================================
