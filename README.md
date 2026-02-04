# BrickBase - Real Estate Inventory Mobile App

A mobile application for real estate brokers to manage their property inventory, built with **React Native (Expo)** and **Supabase**.

## Tech Stack

- **Frontend**: React Native with Expo (TypeScript)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Maps**: React Native Maps with Google Maps
- **State Management**: React Context API
- **Navigation**: Expo Router (file-based routing)

## Features

### Authentication
- Phone OTP authentication via Supabase Auth (Twilio)
- Auto location detection for city
- Profile management

### Property Management
- Add properties with multiple photos/videos
- Camera integration with GPS tagging
- Gallery photo picker with EXIF location extraction
- Property details: type, price, builder info, payment plans
- Mark properties as sold

### User Roles
- **Broker** (Free): Limited to 3 properties
- **Pro Broker** (Paid): Unlimited properties, can create organization
- **Employee**: Joins organization via invite link

### Organizations (Pro Broker Only)
- Create organization with employee seats
- Share invite link for employees to join
- Manage team members

## Setup Instructions

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be created (~2 minutes)
3. Get your credentials from **Project Settings > API**:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - anon/public key (starts with `eyJ...`)

### 2. Set up Database

1. Go to **SQL Editor** in Supabase dashboard
2. Copy the contents of `supabase_schema_2026_02_04_0310.sql`
3. Run the SQL to create all tables, triggers, and policies

### 3. Configure Phone Auth (Twilio)

1. In Supabase, go to **Authentication > Providers > Phone**
2. Enable Phone provider
3. Configure Twilio credentials:
   - Account SID
   - Auth Token
   - Messaging Service SID (or Phone Number)

### 4. Configure Frontend Environment

Edit `/app/frontend/.env`:

```env
# Keep existing variables, add Supabase credentials:
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-anon-key-here
```

### 5. Restart the App

```bash
sudo supervisorctl restart expo
```

## App Structure

```
frontend/
├── app/                      # Expo Router screens
│   ├── (tabs)/              # Tab navigator
│   │   ├── add.tsx          # Add property form
│   │   ├── search.tsx       # Search & filter
│   │   ├── map.tsx          # Map view
│   │   └── profile.tsx      # User profile
│   ├── login.tsx            # Phone OTP login
│   ├── property-details.tsx # Property detail view
│   └── subscription.tsx     # Subscription plans
├── components/              # Reusable components
├── contexts/
│   └── AuthContext.tsx      # Auth state management
├── lib/
│   ├── supabase.ts         # Supabase client & types
│   └── supabaseService.ts  # Database services
└── types/
    └── property.ts         # TypeScript types
```

## Database Schema

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (broker, pro_broker, employee) |
| `organizations` | Pro broker organizations |
| `organization_members` | Org membership junction table |
| `subscriptions` | Razorpay subscription records |
| `properties` | Property listings |
| `devices` | Multi-device login tracking |
| `app_config` | Backend-controlled settings |
| `pricing` | Subscription pricing |

## Configuration (app_config)

Settings stored in `app_config` table:

- **limits**: `{ free_property_limit: 3, frozen_org_property_view_limit: 3 }`
- **max_devices**: `{ broker: 2, pro_broker: 4, employee: 1 }`
- **messages**: Platform-specific messages for iOS/Android
- **feature_flags**: Feature toggles per platform

## Pricing

Default pricing (from `pricing` table):

- Pro Broker Monthly: ₹3,599
- Pro Broker Annual: ₹35,990 (₹2,999/month)
- Employee Seats:
  - 1-7 employees: ₹399/user/month
  - 8-14 employees: ₹759/user/month
  - 15+ employees: ₹1,299/user/month

## Manual Pro Upgrade (Admin)

To manually upgrade a user to pro_broker via Supabase Dashboard:

```sql
UPDATE profiles SET role = 'pro_broker' WHERE id = 'user-uuid';
```

## Development Commands

```bash
# Restart Expo
sudo supervisorctl restart expo

# View Expo logs
tail -f /var/log/supervisor/expo.out.log
tail -f /var/log/supervisor/expo.err.log

# Check services
sudo supervisorctl status
```

## Important Notes

### Platform Differences

**iOS:**
- No payment/subscription UI shown
- Organizations: "Coming soon" message
- Property limit: Beta message

**Android:**
- Full Razorpay payment integration
- Organizations: Full feature
- Property limit: Upgrade prompt

### Row Level Security (RLS)

All tables have RLS enabled. Users can only:
- View/update their own profile
- View/manage their own properties
- View their organization (if member)

### Triggers

- **on_auth_user_created**: Auto-creates profile on signup
- **sync_subscription_to_profile**: Updates role when subscription changes
- **enforce_property_limit**: Blocks property creation when limit reached

## Troubleshooting

### Can't Login
- Verify Twilio is configured in Supabase Auth
- Check phone number format (+91XXXXXXXXXX)

### Properties Not Showing
- Check RLS policies are correctly applied
- Verify user_id matches authenticated user

### Location Not Working
- Grant location permissions on device
- Check Google Maps API key is configured

---

Last updated: February 2026
