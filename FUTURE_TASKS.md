# Real Estate Inventory App - Future Tasks & Roadmap

## Overview
This document contains tasks and context for future development sessions. Read this file at the start of each new chat session.

---

## 🔴 COMPLETED - Mobile Auth & Organization System

### ✅ Mobile OTP Authentication
- Sign-up flow with mobile number
- OTP verification (000000 for testing)
- Location permission for city auto-fill
- Sign-up form: Name, Firm Name, City, Email

### ✅ Organization System
- Pro subscription for owners (₹3599/month or ₹35990/year)
- Employee seat pricing tiers (1-7, 8-14, 15+)
- Organization creation flow
- Invite code generation
- Employee joining with congratulations animation
- Member list with remove functionality (owner only)

### ✅ Subscription System (Mock Payment)
- Mock payment flow UI ready
- Monthly and annual plans
- Employee seats selection
- Pricing displayed per city

### ✅ City-based Pricing
Cities configured:
1. Faridabad
2. Gurugram
3. Noida
4. Delhi (Premium: 1.2x)
5. Mumbai (Premium: 1.2x)
6. Pune
7. Bangalore (Premium: 1.2x)
8. Hyderabad
9. Ahmedabad
10. Other cities (default pricing)
11. International (2x pricing for outside India)

---

## 🔴 HIGH PRIORITY - Pending Tasks

### 1. Razorpay Integration
**Current State:** Mock payments
**Target:** Real Razorpay subscription payments

**Tasks:**
- [ ] Get Razorpay API keys (Key ID & Key Secret)
- [ ] Install Razorpay SDK
- [ ] Create subscription plans in Razorpay dashboard
- [ ] Set up webhooks for payment notifications
- [ ] Handle subscription renewal
- [ ] Handle payment failures with blocking popup

**Webhook Events to Handle:**
- `subscription.activated`
- `subscription.charged`
- `subscription.pending`
- `subscription.cancelled`
- `payment.failed`

### 2. Deep Linking for Invite Links
**Current State:** Basic deep linking setup
**Target:** Production-ready deep linking

**Tasks:**
- [ ] Configure app scheme in app.json
- [ ] Set up Universal Links (iOS) / App Links (Android)
- [ ] Configure domain for deep linking
- [ ] Handle link when app not installed → redirect to store
- [ ] Test on both platforms

**Deep Link Format:**
- Custom scheme: `yourapp://invite/CODE`
- Universal link: `https://yourdomain.com/invite/CODE`

### 3. Push Notifications
**Current State:** expo-notifications installed
**Target:** Working push notifications

**Tasks:**
- [ ] Register for push notifications
- [ ] Store push tokens in database
- [ ] Send notification when employee joins organization
- [ ] Handle notification taps

**Notification Types:**
- Employee joined organization
- Subscription expiring soon
- Payment failed

### 4. Admin Dashboard (Web)
**Current State:** Backend API endpoints ready
**Target:** Web admin dashboard

**Features:**
- Spreadsheet-like user list with filters
- City-wise pricing controls
- User subscription management
- Organization management
- Property viewer per firm

**UI Design:**
- Shiny black marble background for spreadsheet
- Blue watery background with bubbles for page
- Columns: Name, Mobile, Firm Name, Subscription Status
- Click row to see details

**Admin Endpoints Ready:**
- GET `/api/admin/users` - List all owners
- GET `/api/admin/users/{id}` - User details
- GET `/api/admin/users/{id}/properties` - User's properties
- PUT `/api/admin/users/{id}/subscription` - Update subscription
- GET `/api/admin/pricing` - All city pricing
- PUT `/api/admin/pricing/{city}` - Update city pricing

---

## 🟡 MEDIUM PRIORITY

### 5. Supabase Full Migration
**Current State:** MongoDB + custom auth
**Target:** Supabase PostgreSQL + Auth + Storage

**Tasks:**
- [ ] Migrate database to Supabase PostgreSQL
- [ ] Set up Row Level Security (RLS)
- [ ] Migrate file storage to Supabase Storage
- [ ] Update frontend to use Supabase client

### 6. Single Device Login
**Current State:** No device restrictions
**Target:** One mobile per account

**Tasks:**
- [ ] Store device ID on login
- [ ] Check device ID on auth
- [ ] Force logout on other devices
- [ ] Show "logged in on another device" message

---

## 🟢 LOW PRIORITY

### 7. Offline Support
- [ ] Cache properties locally
- [ ] Sync when online

### 8. Analytics
- [ ] Track user behavior
- [ ] Track feature usage

---

## 📱 App Configuration

### Android Configuration (app.json)
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

### iOS Configuration (app.json)
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

## 🔧 Environment Variables

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
SUPABASE_URL=https://zolmdmbalbieltuhzbjb.supabase.co
SUPABASE_KEY=sb_publishable_...

# Add when ready:
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
```

### Frontend (.env)
```
EXPO_PUBLIC_BACKEND_URL=https://yourapp.com
EXPO_PUBLIC_SUPABASE_URL=https://zolmdmbalbieltuhzbjb.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_...
```

---

## 📋 API Endpoints Summary

### Authentication
- POST `/api/auth/send-otp` - Send OTP to mobile
- POST `/api/auth/verify-otp` - Verify OTP
- POST `/api/auth/signup` - Complete registration
- GET `/api/auth/me` - Get current user
- PUT `/api/auth/profile` - Update profile
- GET `/api/auth/check-invite/{code}` - Check invite code validity

### Organization
- POST `/api/organization` - Create organization
- GET `/api/organization` - Get user's organization
- GET `/api/organization/members` - Get members
- DELETE `/api/organization/members/{id}` - Remove member
- PUT `/api/organization/seats` - Update seat count

### Subscription
- GET `/api/pricing` - Get pricing for user's city
- POST `/api/subscription/create` - Create subscription (mock)
- GET `/api/subscription` - Get current subscription

### Properties
- POST `/api/properties` - Create property
- GET `/api/properties` - List properties
- GET `/api/properties/{id}` - Get property
- PUT `/api/properties/{id}` - Update property
- DELETE `/api/properties/{id}` - Delete property
- PATCH `/api/properties/{id}/sold` - Mark as sold

---

Last updated: January 2025
