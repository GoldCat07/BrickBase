# Real Estate Inventory Mobile App

A full-stack mobile application for real estate agents to manage their property inventory.

## Tech Stack

**Frontend:**
- React Native with Expo (TypeScript)
- expo-router for navigation
- axios for API calls
- AsyncStorage for token storage
- react-native-maps for map functionality

**Backend:**
- FastAPI (Python)
- MongoDB for data storage
- JWT authentication
- Password hashing with bcrypt

## Features

✅ **Authentication**
- Email/password registration and login
- JWT token-based authentication
- Secure password hashing
- Auto-login with stored tokens

✅ **Property Management**
- Add properties with multiple photos
- Camera integration with GPS tagging
- Gallery photo picker with EXIF location extraction
- All property details (type, price, floor, payment split, etc.)
- Real-time form validations

✅ **Search & Filter**
- Filter by price range
- Filter by property type
- Text search
- Pull-to-refresh

✅ **Map View**
- OpenStreetMap integration
- Property markers with thumbnails
- Location-based filtering
- Property preview cards

✅ **Property Details**
- Image gallery with swipe
- Full property information
- Delete functionality

## Setup Instructions

### 1. Backend is Already Running

The FastAPI backend is running on `http://localhost:8001`.

**Test it:**
```bash
curl http://localhost:8001/api/
```

**API Endpoints:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/properties` - Create property
- `GET /api/properties` - List properties
- `GET /api/properties/{id}` - Get single property
- `DELETE /api/properties/{id}` - Delete property

### 2. Create Your First User

You can create a user via the app or using curl:

```bash
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "yourpassword"}'
```

### 3. Access the App

**Web Preview:** https://homelite.preview.emergentagent.com

**Mobile:** Use the Expo Go QR code from the preview

### 4. Using the App

1. **Sign Up/Login:**
   - Open the app
   - Create an account or sign in
   - Use at least 6 characters for password

2. **Add Property:**
   - Tap "Add Property" tab
   - Select property type (required)
   - Add photos using camera or gallery
   - Photos with location will appear on map
   - Fill in property details
   - Tap "Add Property"

3. **Search Properties:**
   - Tap "Search" tab
   - Filter by price, type, or search text
   - Tap any property to view details

4. **View on Map:**
   - Tap "Map" tab
   - See properties with location data
   - Tap markers for preview
   - Tap "View Details" for full info

5. **Profile:**
   - View your email
   - Sign out

## Data Storage

- **Users:** MongoDB `users` collection
- **Properties:** MongoDB `properties` collection
- **Builders:** MongoDB `builders` collection
- **Images:** Stored as base64 in MongoDB (for MVP)

## Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Protected API endpoints
- CORS enabled for mobile access
- 7-day token expiration

## Development

### Backend

```bash
# Restart backend
sudo supervisorctl restart backend

# View logs
tail -f /var/log/supervisor/backend.err.log
```

### Frontend

```bash
# Restart expo
sudo supervisorctl restart expo

# View logs
tail -f /var/log/supervisor/expo.out.log
```

## Environment Variables

**Backend (.env):**
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
SECRET_KEY=auto-generated
```

**Frontend (.env):**
```
EXPO_PUBLIC_BACKEND_URL=https://homelite.preview.emergentagent.com
```

## API Authentication

All property endpoints require authentication. Include the JWT token in requests:

```javascript
headers: {
  'Authorization': 'Bearer <your-token>'
}
```

The mobile app handles this automatically via the API client.

## Troubleshooting

**Can't login:**
- Check if backend is running: `sudo supervisorctl status backend`
- Create a test user using curl
- Check password is at least 6 characters

**Properties not showing:**
- Ensure you're logged in
- Check if properties belong to your user
- Pull to refresh

**Map not working:**
- Ensure properties have location data
- Grant location permissions

**Images not displaying:**
- Images are stored as base64
- Check property has propertyPhotos array

## Future Enhancements

- Image storage service (S3, Cloudinary)
- Push notifications
- Property sharing
- Advanced search filters
- Property analytics
- Export functionality
- Multi-user organizations

## Support

For issues or questions, check the logs:
- Backend: `/var/log/supervisor/backend.err.log`
- Frontend: `/var/log/supervisor/expo.out.log`

---

## Deep Full Understanding for the App for an AI Agent

This section provides comprehensive documentation for AI agents to understand the app architecture, file structure, data flow, and implementation details without needing to read through all code files.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Expo/React Native)                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│  │   Login     │ │  Add Prop   │ │   Search    │ │    Map      │    │
│  │   Screen    │ │   Screen    │ │   Screen    │ │   Screen    │    │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │
│         │               │               │               │           │
│         └───────────────┴───────────────┴───────────────┘           │
│                                 │                                    │
│                    ┌────────────▼────────────┐                       │
│                    │      AuthContext        │                       │
│                    │   (User State Mgmt)     │                       │
│                    └────────────┬────────────┘                       │
│                                 │                                    │
│                    ┌────────────▼────────────┐                       │
│                    │      API Client         │                       │
│                    │   (axios + JWT token)   │                       │
│                    └────────────┬────────────┘                       │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │ HTTP (JSON)
                    ┌─────────────▼─────────────┐
                    │      FastAPI Backend      │
                    │   /api/* endpoints        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │        MongoDB            │
                    │  users, properties,       │
                    │  builders collections     │
                    └───────────────────────────┘
```

### File Structure & Purpose

#### Frontend (`/app/frontend/`)

```
frontend/
├── app/                          # Expo Router - file-based routing
│   ├── _layout.tsx              # Root layout, AuthProvider wrapper, navigation setup
│   ├── index.tsx                # Entry redirect (to login or tabs)
│   ├── login.tsx                # Login/Register screen with form validation
│   ├── property-details.tsx     # Single property view with gallery, edit, delete, share
│   └── (tabs)/                  # Tab navigator screens
│       ├── _layout.tsx          # Tab bar configuration (Map, Add, Search, Profile)
│       ├── add.tsx              # Add/Edit property form with photo upload
│       ├── map.tsx              # OpenStreetMap with property markers
│       ├── profile.tsx          # User profile and logout
│       └── search.tsx           # Property list with filters
├── components/                   # Reusable UI components
│   ├── PropertyCard.tsx         # Property card for search results (with call builder, share)
│   └── WhatsAppShareModal.tsx   # Modal for selecting fields/photos to share via WhatsApp
├── contexts/
│   └── AuthContext.tsx          # React Context for authentication state
├── lib/
│   └── api.ts                   # Axios instance with JWT interceptor
├── types/
│   └── property.ts              # TypeScript interfaces (Property, Builder, etc.)
└── .env                         # Environment variables (EXPO_TUNNEL_SUBDOMAIN, etc.)
```

#### Backend (`/app/backend/`)

```
backend/
├── server.py                    # Single FastAPI file with all endpoints
└── .env                         # MongoDB URL, secret key
```

### Data Models

#### User
```typescript
{
  id: string;           // UUID
  email: string;        // Unique email
  hashed_password: string;
  createdAt: string;    // ISO date
}
```

#### Property
```typescript
{
  id: string;                    // UUID
  propertyType: 'Plot' | 'Builder Floor' | 'Villa/House' | 'Apartment Society';
  propertyPhotos: string[];      // Base64 encoded images (data:image/jpeg;base64,...)
  floor?: number;                // Only for Builder Floor, Apartment Society
  price?: number;                // Stored in Lakhs (converted from Cr if needed)
  priceUnit?: 'cr' | 'lakh';     // Display unit
  builders?: BuilderInfo[];      // Array of builder contacts
  builderName?: string;          // Legacy - first builder name
  builderPhone?: string;         // Legacy - first builder phone
  paymentPlan?: string;          // Free text for payment details
  additionalNotes?: string;      // Free text for extra info
  possessionDate?: string;
  handoverDate?: string;
  clubProperty: boolean;
  poolProperty: boolean;
  parkProperty: boolean;
  gatedProperty: boolean;
  propertyAge?: number;
  case?: 'REGISTRY_CASE' | 'TRANSFER_CASE' | 'OTHER';
  userId: string;                // Owner user ID
  userEmail: string;             // Owner email (for "Posted by")
  latitude?: number;             // GPS from photo EXIF
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}
```

#### BuilderInfo
```typescript
{
  name?: string;
  phoneNumber?: string;
  countryCode?: string;  // '+91', '+1', etc.
}
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Create new user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/auth/me` | Yes | Get current user |
| GET | `/api/properties` | Yes | List all properties |
| POST | `/api/properties` | Yes | Create property |
| GET | `/api/properties/{id}` | Yes | Get single property |
| PUT | `/api/properties/{id}` | Yes | Update property (owner only) |
| DELETE | `/api/properties/{id}` | Yes | Delete property (owner only) |

### Key Implementation Details

#### 1. Authentication Flow
- User registers/logs in → Backend returns JWT token
- Token stored in AsyncStorage
- API client (axios) automatically attaches token to all requests
- AuthContext provides `user`, `loading`, `login()`, `logout()` to all screens
- On app start, checks for stored token and validates with `/api/auth/me`

#### 2. Photo Upload with GPS
- Camera: Uses `expo-image-picker` camera, then `expo-location` for current GPS
- Gallery: Extracts EXIF data from photos using `exif: true` option
- GPS Extraction: Handles multiple EXIF formats (decimal, DMS array, GPS object)
- HEIF Support: iOS HEIF photos should have EXIF extracted automatically by expo-image-picker
- Photos without location: Shows inline warning instead of multiple alerts
- Storage: Photos converted to base64 and stored directly in MongoDB

#### 3. Price Handling
- User enters price with Cr/Lakh dropdown
- Stored internally in Lakhs (Cr * 100 = Lakhs)
- Display shows original unit

#### 4. Navigation Patterns
- Tab Navigator: Map, Add Property, Search, Profile
- Stack Navigation: Property Details stacked on top of tabs
- Edit Mode: Add screen with `editPropertyId` param loads existing property
- Delete: Returns to previous screen, search refreshes via `useFocusEffect`

#### 5. WhatsApp Share Feature
- Modal with horizontal scrolling photos (27-30% screen height)
- Tap to select/deselect photos and fields
- Long press for full-screen zoomable preview
- Generates formatted text with selected fields
- Uses native Share API to open WhatsApp

#### 6. Property Card Features
- "Call Builder" buttons: Direct phone call and WhatsApp
- "Posted By": Shows user avatar (first letter) and email username
- Share button: Opens WhatsApp share modal

#### 7. Conditional Form Fields
- Floor field: Hidden for 'Plot' and 'Villa/House' property types
- Form resets when Add tab is focused (not in edit mode)

### Common Modification Patterns

#### Adding a New Field to Property
1. Add to `PropertyCreate` and `PropertyResponse` in `server.py`
2. Add to `Property` interface in `types/property.ts`
3. Add state and input in `add.tsx`
4. Add to `propertyData` object in `handleSubmit()`
5. Display in `property-details.tsx`
6. Optionally add to `PropertyCard.tsx` and `WhatsAppShareModal.tsx`

#### Adding a New Screen
1. Create file in `app/` folder (file name = route)
2. For tab screen: Add to `app/(tabs)/` and update `_layout.tsx`
3. For stack screen: Create in `app/` root, navigate with `router.push()`

#### Modifying Tab Bar
- Edit `app/(tabs)/_layout.tsx`
- Tab bar height: `tabBarStyle.height`
- Bottom padding: `tabBarStyle.paddingBottom` (for iPhone home indicator)

### Environment & Services

- **Expo Tunnel**: Uses ngrok for external access (`EXPO_TUNNEL_SUBDOMAIN`)
- **MongoDB**: Local instance on default port
- **Backend Port**: 8001 (all `/api/*` routes proxied)
- **Frontend Port**: 3000 (Expo dev server)

### Debugging Tips

```bash
# Check services
sudo supervisorctl status

# Restart services
sudo supervisorctl restart expo
sudo supervisorctl restart backend

# View logs
tail -f /var/log/supervisor/expo.out.log
tail -f /var/log/supervisor/expo.err.log
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/backend.err.log

# Test backend
curl http://localhost:8001/api/

# Check MongoDB (if mongo shell available)
mongosh --eval "db.properties.find()"
```

### Known Limitations

1. **Image Storage**: Base64 in MongoDB (not scalable for production)
2. **HEIF Location**: May not extract GPS from all HEIF variants
3. **Single User**: Properties are user-scoped, no sharing between users
4. **Offline**: No offline support, requires network
5. **WhatsApp Share**: Cannot share images directly via URL scheme, only text
