# Supabase Migration Guide

## Step 1: Run the SQL Schema

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard/project/zolmdmbalbieltuhzbjb
2. Click on **SQL Editor** in the left sidebar
3. Click **New query**
4. Copy and paste the contents of `/app/supabase_schema.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)

## Tables Created

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (linked to auth.users) |
| `organizations` | Firms/Companies |
| `organization_members` | Employee memberships |
| `pricing` | City-wise pricing |
| `subscriptions` | Pro subscriptions |
| `properties` | Real estate listings |
| `otp_verifications` | OTP codes for dev testing |

## Storage Buckets Created

| Bucket | Purpose |
|--------|---------|
| `profile-photos` | User profile pictures |
| `property-photos` | Property images |
| `property-files` | PDFs and documents |

## Default Pricing Initialized

Cities with pricing:
- faridabad, gurugram, noida, delhi, mumbai, bangalore, pune, hyderabad, ahmedabad
- other_cities (fallback)
- international (2x pricing)

## Step 2: Enable Phone Auth (Optional - for later)

1. Go to **Authentication → Providers**
2. Enable **Phone** provider
3. Configure Twilio for SMS delivery

## Step 3: Verify Setup

After running the SQL, verify by:
1. Go to **Table Editor** → You should see all tables
2. Go to **Storage** → You should see 3 buckets
3. Check **pricing** table → Should have 11 city rows

## Architecture Change

**Before (MongoDB + FastAPI):**
```
Mobile App → FastAPI Backend → MongoDB
```

**After (Supabase BaaS):**
```
Mobile App → Supabase (Auth + Database + Storage)
```

No backend server needed! The app connects directly to Supabase.
