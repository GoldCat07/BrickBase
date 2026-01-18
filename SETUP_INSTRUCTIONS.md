# Real Estate Inventory Mobile App - Setup Instructions

## Overview
A mobile application for real estate agents to manage their property inventory, built with **React Native (TypeScript)** and **Supabase**.

### Tech Stack
- **Frontend**: React Native with Expo (TypeScript)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Maps**: React Native Maps with OpenStreetMap
- **State Management**: React Context API
- **Navigation**: Expo Router (file-based routing)

## Features
✅ Email/Password authentication with Supabase Auth
✅ Add properties with multiple photos (camera + gallery)
✅ Location tagging from photo EXIF data or GPS
✅ Property details: type, price, floor, builder info, payment splits
✅ Search and filter properties by price, type, location
✅ Map view showing all properties with location data
✅ Property detail view with image gallery
✅ Offline-first architecture with AsyncStorage
✅ Real-time validations on all input fields

## Setup Steps

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be created (takes ~2 minutes)
3. Get your credentials from Project Settings > API:
   - Project URL (something like: `https://xxxxx.supabase.co`)
   - anon/public key (starts with `eyJ...`)

### 2. Set up Database Tables

Run the following SQL in your Supabase SQL Editor:

```sql
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'WORKER');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('REGISTRY_CASE', 'TRANSFER_CASE', 'OTHER');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "propertyType" TEXT,
    "propertyPhotos" TEXT[],
    "floor" INTEGER,
    "price" DECIMAL(12,2),
    "builderId" TEXT,
    "black" DECIMAL(12,2),
    "white" DECIMAL(12,2),
    "blackPercentage" DOUBLE PRECISION,
    "whitePercentage" DOUBLE PRECISION,
    "possessionDate" TIMESTAMP(3),
    "userId" TEXT,
    "clubProperty" BOOLEAN DEFAULT false,
    "poolProperty" BOOLEAN DEFAULT false,
    "parkProperty" BOOLEAN DEFAULT false,
    "gatedProperty" BOOLEAN DEFAULT false,
    "propertyAge" INTEGER,
    "handoverDate" TIMESTAMP(3),
    "case" "CaseType",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Builder" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Builder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "role" "Role",
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "numberOfUsers" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "Builder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### 3. Create Storage Bucket

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named: `property-images`
3. Make it **PUBLIC** (so images are accessible)

### 4. Enable Row Level Security (RLS)

Run these policies in the SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Builder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Property policies: Users can only see/edit their own properties
CREATE POLICY "Users can view their own properties"
  ON "Property" FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can insert their own properties"
  ON "Property" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can update their own properties"
  ON "Property" FOR UPDATE
  USING (auth.uid()::text = "userId");

CREATE POLICY "Users can delete their own properties"
  ON "Property" FOR DELETE
  USING (auth.uid()::text = "userId");

-- Builder policies: Users can create and view all builders
CREATE POLICY "Users can view all builders"
  ON "Builder" FOR SELECT
  USING (true);

CREATE POLICY "Users can create builders"
  ON "Builder" FOR INSERT
  WITH CHECK (true);

-- User policies: Users can view their own data
CREATE POLICY "Users can view their own data"
  ON "User" FOR SELECT
  USING (auth.uid()::text = id);

CREATE POLICY "Users can insert their own data"
  ON "User" FOR INSERT
  WITH CHECK (auth.uid()::text = id);
```

### 5. Configure App Environment Variables

Edit `/app/frontend/.env` and add your Supabase credentials:

```env
# Existing variables (DO NOT MODIFY)
EXPO_TUNNEL_SUBDOMAIN=realtor-enhance
EXPO_PACKAGER_HOSTNAME=https://realtor-enhance.preview.emergentagent.com
EXPO_PUBLIC_BACKEND_URL=https://realtor-enhance.preview.emergentagent.com
EXPO_USE_FAST_RESOLVER="1"
METRO_CACHE_ROOT=/app/frontend/.metro-cache

# Add your Supabase credentials here
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 6. Create Test User in Supabase

1. Go to Authentication > Users in Supabase dashboard
2. Click "Add user" > "Create new user"
3. Enter email and password (e.g., `test@example.com` / `password123`)
4. This is the account you'll use to login to the app

### 7. Restart the App

```bash
sudo supervisorctl restart expo
```

## Usage

### Login
- Use the email and password you created in Supabase
- The app will automatically redirect to the Add Property screen

### Adding Properties
1. Select property type (required)
2. Add photos:
   - **Take Photo**: Uses camera with live location tagging
   - **From Gallery**: Extracts location from photo EXIF data (if available)
3. Fill in property details (price, floor, builder info, etc.)
4. Properties without location won't appear on the map

### Viewing Properties
- **Search Tab**: Filter by price range, property type, or search text
- **Map Tab**: See all properties with location data on an OpenStreetMap
- Click any property card or map marker to view full details

### Property Details
- Swipe through photo gallery
- View all property information
- Delete property

## App Structure

```
frontend/
├── app/
│   ├── (tabs)/           # Tab navigator screens
│   │   ├── add.tsx       # Add property form
│   │   ├── search.tsx    # Search & filter
│   │   ├── map.tsx       # Map view
│   │   └── profile.tsx   # User profile
│   ├── property-details.tsx  # Property detail view (modal)
│   ├── login.tsx         # Login screen
│   ├── _layout.tsx       # Root layout with auth
│   └── index.tsx         # Redirect to login
├── components/
│   └── PropertyCard.tsx  # Reusable property card
├── contexts/
│   └── AuthContext.tsx   # Auth state management
├── lib/
│   └── supabase.ts       # Supabase client config
└── types/
    └── property.ts       # TypeScript types
```

## Important Notes

### Location Data
- Photos taken with in-app camera automatically get GPS coordinates
- Gallery photos need EXIF location data
- Properties without location data won't show on the map
- Alert message shows when uploading photos without location

### Validations
- Property type and at least one photo are required
- Real-time validation on all input fields
- Error messages appear below invalid fields
- Form won't submit until all validations pass

### Image Storage
- Images are stored in Supabase Storage
- Public URLs are saved in the database
- Fallback to base64 if upload fails

### Authentication
- Session persists using AsyncStorage
- Auto-redirects to login if not authenticated
- Sign out from Profile tab

## Troubleshooting

### App won't load
- Check that Supabase credentials are correct in .env
- Restart expo: `sudo supervisorctl restart expo`

### Can't login
- Verify user exists in Supabase Auth dashboard
- Check Supabase project is active
- Ensure email/password are correct

### Images not showing
- Check `property-images` bucket is public in Supabase
- Verify storage bucket exists

### Map not working
- Ensure properties have latitude/longitude in database
- Check location permissions are granted on device

### Location not tagging
- Grant location permissions when prompted
- For gallery photos, ensure they have EXIF location data

## Development

This app is fully built in TypeScript with no Python backend needed. Everything connects directly to Supabase!

### Key Libraries
- `@supabase/supabase-js` - Supabase client
- `expo-router` - File-based routing
- `expo-image-picker` - Camera & gallery
- `expo-location` - GPS coordinates
- `react-native-maps` - Map component
- `@react-native-async-storage/async-storage` - Local storage

### Need Help?
- Supabase Docs: https://supabase.com/docs
- Expo Docs: https://docs.expo.dev
- React Native Maps: https://github.com/react-native-maps/react-native-maps
