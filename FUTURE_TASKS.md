# Real Estate Inventory App - Future Tasks & Roadmap

## Overview
This document contains tasks and context for future development sessions. Read this file at the start of each new chat session.

---

## 🔴 HIGH PRIORITY - Migration to Supabase

### 1. Authentication Migration
**Current State:** JWT-based custom auth with MongoDB
**Target:** Supabase Authentication

**Tasks:**
- [ ] Set up Supabase project
- [ ] Configure Supabase Auth providers (email/password, Google OAuth if needed)
- [ ] Replace JWT authentication in backend with Supabase Auth
- [ ] Update AuthContext in frontend to use Supabase client
- [ ] Migrate existing users (if any) to Supabase Auth

**Files to modify:**
- `/app/backend/server.py` - Remove custom auth endpoints, use Supabase verification
- `/app/frontend/contexts/AuthContext.tsx` - Use Supabase client for auth
- `/app/frontend/app/login.tsx` - Update login/signup flow

### 2. Database Migration
**Current State:** MongoDB (Motor async client)
**Target:** Supabase PostgreSQL

**Tasks:**
- [ ] Design PostgreSQL schema based on current MongoDB collections:
  - `users` table
  - `properties` table (with JSONB for flexible fields like floors, sizes, address)
  - `builders` table
- [ ] Create Supabase tables with proper RLS (Row Level Security)
- [ ] Update backend API endpoints to use Supabase client instead of Motor
- [ ] Migrate existing data if needed

**Database Schema Notes:**
```sql
-- Properties table structure
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  property_category TEXT,
  property_type TEXT,
  property_photos TEXT[], -- Array of base64 strings
  floors JSONB, -- Array of floor entries
  price DECIMAL,
  price_unit TEXT,
  builders JSONB,
  address JSONB,
  sizes JSONB,
  possession_month INT,
  possession_year INT,
  important_files JSONB,
  payment_plan TEXT,
  additional_notes TEXT,
  club_property BOOLEAN DEFAULT FALSE,
  pool_property BOOLEAN DEFAULT FALSE,
  park_property BOOLEAN DEFAULT FALSE,
  gated_property BOOLEAN DEFAULT FALSE,
  property_age INT,
  age_type TEXT,
  case_type TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  is_sold BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. File Storage Migration
**Current State:** Important files stored as base64 in database
**Target:** Supabase Storage

**Tasks:**
- [ ] Create Supabase Storage buckets:
  - `property-photos` - for property images
  - `property-files` - for PDFs and documents
- [ ] Update photo upload to store in Supabase Storage, save URL in DB
- [ ] Update file upload to store in Supabase Storage
- [ ] Create signed URLs for private file access
- [ ] Migrate existing base64 images to Storage (optional)

**Notes:**
- Property photos are currently base64 encoded for mobile display
- For Supabase Storage, you can either:
  1. Continue storing base64 for offline support
  2. Store in Supabase Storage with URLs (reduces DB size but needs network)

---

## 🟡 MEDIUM PRIORITY - Feature Enhancements

### 4. Google Maps Integration (Mobile)
**Current State:** react-native-maps installed, native maps for Expo Go
**Status:** ✅ Implemented for native (shows list on web)

**Google Maps API Key:** `AIzaSyC46BsGdP0YtuAuxdlgP8rTni1vwmy4oDA`

**What's working:**
- Native: Full Google Maps with property markers
- Property card popup like Airbnb/MMT on marker tap
- User location tracking
- Filters overlay on map
- Web: List fallback with coordinates

### 5. Image Sharing Enhancement
**Current State:** Share text with photo count notation
**Target:** Share actual images with text

**Tasks:**
- [ ] Implement proper image sharing using expo-sharing
- [ ] Handle multiple image selection for WhatsApp
- [ ] Test on iOS and Android

---

## 🟢 LOW PRIORITY - Nice to Have

### 6. Offline Support
- [ ] Implement local data caching with MMKV or AsyncStorage
- [ ] Add sync mechanism for offline-created properties
- [ ] Handle offline photo storage

### 7. Push Notifications
- [ ] Set up expo-notifications
- [ ] Add notification for property updates
- [ ] Add notification for new properties in area

### 8. Analytics
- [ ] Add property view tracking
- [ ] Add search analytics
- [ ] Add user behavior tracking

---

## 📱 Deployment Notes

### Android Deployment
```json
// app.json additions for Google Maps
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "AIzaSyC46BsGdP0YtuAuxdlgP8rTni1vwmy4oDA"
        }
      }
    }
  }
}
```

### iOS Deployment
```json
// app.json additions for Google Maps
{
  "expo": {
    "ios": {
      "config": {
        "googleMapsApiKey": "AIzaSyC46BsGdP0YtuAuxdlgP8rTni1vwmy4oDA"
      }
    }
  }
}
```

---

## 🔧 Technical Debt

### Known Issues
1. **Shadow warnings on web:** "shadow*" style props deprecated, use "boxShadow"
2. **Base64 image size:** Large images increase DB size significantly

### Code Quality
- [ ] Add TypeScript strict mode
- [ ] Add unit tests for critical functions
- [ ] Add E2E tests with Detox

---

## 📋 Recent Changes Summary (Current Session)

### Add Property Screen
- ✅ Added property category (Residential/Commercial)
- ✅ Commercial property types: Land/Plot Parcel, SCO, Working Space
- ✅ Case types: Added RENTAL, LEASE_HOLD
- ✅ Rental case type shows "Lakh per month" price unit
- ✅ Age type: Fresh, Resale, UnderConstruction
- ✅ Resale shows property age field
- ✅ Possession changed to month/year dropdowns (years to 2075)
- ✅ Size/Area with Carpet, Built-up, Super Built-up options
- ✅ Size units: sq. ft., sq. yards(gaj), sq. mts.
- ✅ Multiple floors with floor+price pairs for Builder Floor/Apartment
- ✅ Builder name field narrower
- ✅ Address fields: Unit No, Block, Sector/Area, City
- ✅ IMPORTANT FILES field with attach button
- ✅ Removed handover date
- ✅ Payment plan moved before important files

### Property Details Screen
- ✅ Removed delete icon from header
- ✅ Added "Property Sold" and "Delete Property" buttons at bottom
- ✅ Multiple "Mark Sold" buttons for multi-floor properties

### Search Screen
- ✅ Expanded filters matching add property fields
- ✅ Filters: Category, Type, Case, Age Type, Price Range
- ✅ Include Sold toggle

### Map Screen
- ✅ Google Maps integration with API key
- ✅ Property markers with price labels
- ✅ Property card popup like Airbnb/MMT
- ✅ Same filters as search screen
- ✅ User location tracking

### WhatsApp Share
- ✅ Removed builder name, phone, location from share options
- ✅ Photos shared as group with details caption

### UI/UX Fixes
- ✅ Tab bar height adjusted for Android system buttons
- ✅ Safe area insets applied throughout
- ✅ Max content width for wide screens (Galaxy Fold)

---

## 🔑 Environment Variables Required for Supabase

When migrating to Supabase, you'll need:
```
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key (backend only)
```

---

Last updated: January 2025
