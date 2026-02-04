# BrickBase - Future Tasks & Roadmap

## Overview
This document contains deferred features and tasks for future development.

---

## 🔴 HIGH PRIORITY - Pending Integration

### 1. Razorpay Payment Integration (Android Only)

**Current State:** Mock payments, role can be changed manually via Supabase dashboard

**Tasks:**
- [ ] Get Razorpay API keys (Key ID & Key Secret)
- [ ] Create Supabase Edge Function for webhook handling
- [ ] Create subscription plans in Razorpay dashboard
- [ ] Implement payment flow in Android app
- [ ] Handle webhook events:
  - `subscription.activated` → Set role to `pro_broker`
  - `subscription.charged` → Extend subscription
  - `payment.failed` → Set role back to `broker`
  - `subscription.cancelled` → Set role back to `broker`

**Webhook Flow:**
```
Razorpay Event → Supabase Edge Function → Insert/Update subscriptions table → Trigger updates profile role
```

### 2. Deep Linking for Invite Links

**Current State:** Basic setup, not production-ready

**Tasks:**
- [ ] Configure app scheme in app.json
- [ ] Set up Universal Links (iOS) / App Links (Android)
- [ ] Handle link when app not installed → redirect to store
- [ ] Implement AcceptInviteScreen flow:
  ```
  User taps link
       ↓
  If app installed → opens app → AcceptInviteScreen
  If not installed → Store → Install → AcceptInviteScreen
       ↓
  Token validated → invite accepted
  ```

**Deep Link Format:**
- Custom scheme: `brickbase://invite/CODE`
- Universal link: `https://yourdomain.com/invite/CODE`

### 3. Device Management (Multi-device Login Control)

**Current State:** Devices table ready, logic not implemented

**Tasks:**
- [ ] Create Supabase Edge Function for device management
- [ ] On login: Register device, check limit, auto-logout oldest if needed
- [ ] Use `supabase.auth.admin.signOut(session_id)` to revoke sessions
- [ ] Store device info on each login
- [ ] Max devices controlled by `app_config.max_devices`:
  - broker: 2
  - pro_broker: 4
  - employee: 1

---

## 🟡 MEDIUM PRIORITY

### 4. In-App Messaging System

**Purpose:** Show banners/popups to users from admin dashboard

**Tables to Add:**
```sql
CREATE TABLE in_app_messages (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  action_type TEXT, -- none, link, screen, deeplink
  action_value TEXT,
  style TEXT, -- popup, banner, fullscreen
  target_type TEXT, -- all, pro_only, free_users, etc.
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN
);

CREATE TABLE user_message_status (
  user_id UUID REFERENCES profiles(id),
  message_id UUID REFERENCES in_app_messages(id),
  seen_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);
```

### 5. Push Notifications

**Tasks:**
- [ ] Register for push notifications with `expo-notifications`
- [ ] Store push tokens in `devices.push_token`
- [ ] Send notifications via Supabase Edge Functions
- [ ] Notification types:
  - Employee joined organization
  - Subscription expiring
  - Payment failed

### 6. Admin Dashboard (Web)

**Features:**
- User management (list, search, filter)
- Manual role changes (broker ↔ pro_broker)
- Subscription management
- Organization management
- Property viewer per firm
- City-wise pricing controls

**Tech:** Separate web app (React/Next.js) with Supabase service_role key

---

## 🟢 LOW PRIORITY

### 7. Property Facing Field

Add facing direction to properties:
- Values: North, South, East, West, NE, NW, SE, SW
- Add dropdown in Add Property form
- Already in schema, just needs UI

### 8. City-wise Pricing

Currently uniform pricing. Future:
- Different pricing per city tier
- Metro cities premium pricing
- International pricing

### 9. Offline Support

- Cache properties locally with AsyncStorage
- Queue property additions when offline
- Sync when back online

### 10. Analytics

- Track user behavior
- Track feature usage
- Property view counts
- Search patterns

---

## 📱 App Configuration Reference

### Android app.json (Deep Links)
```json
{
  "expo": {
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "yourdomain.com",
              "pathPrefix": "/invite"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

### iOS app.json (Associated Domains)
```json
{
  "expo": {
    "ios": {
      "associatedDomains": [
        "applinks:yourdomain.com"
      ]
    }
  }
}
```

---

## 🔧 Environment Variables (When Ready)

### Supabase Edge Function (.env)
```
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 📋 Schema Files Reference

| File | Description |
|------|-------------|
| `supabase_schema_2026_02_04_0310.sql` | Current production schema v1.0 |

When adding new tables:
1. Create new SQL file with timestamp
2. Reference existing schema for patterns
3. Always include RLS policies
4. Add triggers for automated logic

---

Last updated: February 2026
