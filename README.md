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

**Web Preview:** https://realestateinv.preview.emergentagent.com

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
EXPO_PUBLIC_BACKEND_URL=https://realestateinv.preview.emergentagent.com
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
