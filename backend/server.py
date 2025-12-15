from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from supabase import create_client, Client
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Supabase connection
supabase_url = os.environ.get('SUPABASE_URL', 'your-supabase-url')
supabase_key = os.environ.get('SUPABASE_KEY', 'your-supabase-service-key')

# Only initialize Supabase if valid credentials are provided
supabase: Client = None
if supabase_url and supabase_url != 'your-supabase-url' and supabase_key and supabase_key != 'your-supabase-service-key':
    try:
        supabase = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.warning(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("Supabase credentials not configured. Please update .env file with your Supabase URL and key.")

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Pydantic Models
class PropertyCreate(BaseModel):
    propertyType: Optional[str] = None
    propertyPhotos: List[str] = []  # Base64 encoded images
    floor: Optional[int] = None
    price: Optional[float] = None
    builderId: Optional[str] = None
    builderName: Optional[str] = None
    builderPhone: Optional[str] = None
    black: Optional[float] = None
    white: Optional[float] = None
    blackPercentage: Optional[float] = None
    whitePercentage: Optional[float] = None
    possessionDate: Optional[str] = None
    clubProperty: bool = False
    poolProperty: bool = False
    parkProperty: bool = False
    gatedProperty: bool = False
    propertyAge: Optional[int] = None
    handoverDate: Optional[str] = None
    case: Optional[str] = None
    userId: Optional[str] = None
    location: Optional[dict] = None  # {latitude, longitude}


class PropertyResponse(BaseModel):
    id: str
    propertyType: Optional[str] = None
    propertyPhotos: List[str] = []
    floor: Optional[int] = None
    price: Optional[float] = None
    builderId: Optional[str] = None
    black: Optional[float] = None
    white: Optional[float] = None
    blackPercentage: Optional[float] = None
    whitePercentage: Optional[float] = None
    possessionDate: Optional[str] = None
    clubProperty: bool = False
    poolProperty: bool = False
    parkProperty: bool = False
    gatedProperty: bool = False
    propertyAge: Optional[int] = None
    handoverDate: Optional[str] = None
    case: Optional[str] = None
    userId: Optional[str] = None
    location: Optional[dict] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# Helper function to upload image to Supabase Storage
async def upload_image_to_storage(image_base64: str, property_id: str, index: int) -> str:
    try:
        # Remove data URL prefix if present
        if 'base64,' in image_base64:
            image_base64 = image_base64.split('base64,')[1]
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)
        
        # Create unique filename
        filename = f"{property_id}/photo_{index}_{uuid.uuid4().hex[:8]}.jpg"
        
        # Upload to Supabase Storage
        result = supabase.storage.from_('property-images').upload(
            filename,
            image_bytes,
            file_options={"content-type": "image/jpeg"}
        )
        
        # Get public URL
        public_url = supabase.storage.from_('property-images').get_public_url(filename)
        return public_url
    except Exception as e:
        logger.error(f"Error uploading image: {str(e)}")
        # Return the base64 string as fallback
        return image_base64


# API Routes
@api_router.get("/")
async def root():
    return {"message": "Real Estate Inventory API"}


@api_router.post("/properties", response_model=PropertyResponse)
async def create_property(property_data: PropertyCreate):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Please add credentials to .env file")
    try:
        # Generate property ID
        property_id = str(uuid.uuid4())
        
        # Handle builder creation if name provided
        builder_id = None
        if property_data.builderName:
            builder_data = {
                "name": property_data.builderName,
                "phoneNumber": property_data.builderPhone
            }
            builder_result = supabase.table('Builder').insert(builder_data).execute()
            if builder_result.data:
                builder_id = builder_result.data[0]['id']
        
        # Upload images to Supabase Storage and get URLs
        photo_urls = []
        for idx, photo in enumerate(property_data.propertyPhotos):
            url = await upload_image_to_storage(photo, property_id, idx)
            photo_urls.append(url)
        
        # Prepare property data
        property_dict = {
            "id": property_id,
            "propertyType": property_data.propertyType,
            "propertyPhotos": photo_urls,
            "floor": property_data.floor,
            "price": property_data.price,
            "builderId": builder_id,
            "black": property_data.black,
            "white": property_data.white,
            "blackPercentage": property_data.blackPercentage,
            "whitePercentage": property_data.whitePercentage,
            "possessionDate": property_data.possessionDate,
            "clubProperty": property_data.clubProperty,
            "poolProperty": property_data.poolProperty,
            "parkProperty": property_data.parkProperty,
            "gatedProperty": property_data.gatedProperty,
            "propertyAge": property_data.propertyAge,
            "handoverDate": property_data.handoverDate,
            "case": property_data.case,
            "userId": property_data.userId,
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
        }
        
        # Add location if provided
        if property_data.location:
            property_dict['latitude'] = property_data.location.get('latitude')
            property_dict['longitude'] = property_data.location.get('longitude')
        
        # Insert into Supabase
        result = supabase.table('Property').insert(property_dict).execute()
        
        if result.data:
            return PropertyResponse(**result.data[0], location=property_data.location)
        else:
            raise HTTPException(status_code=500, detail="Failed to create property")
            
    except Exception as e:
        logger.error(f"Error creating property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/properties", response_model=List[PropertyResponse])
async def get_properties(
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    property_type: Optional[str] = None,
    user_id: Optional[str] = None
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Please add credentials to .env file")
    try:
        query = supabase.table('Property').select('*')
        
        # Apply filters
        if user_id:
            query = query.eq('userId', user_id)
        if property_type:
            query = query.eq('propertyType', property_type)
        if min_price is not None:
            query = query.gte('price', min_price)
        if max_price is not None:
            query = query.lte('price', max_price)
        
        result = query.execute()
        
        # Convert to PropertyResponse format
        properties = []
        for prop in result.data:
            location = None
            if prop.get('latitude') and prop.get('longitude'):
                location = {
                    'latitude': prop['latitude'],
                    'longitude': prop['longitude']
                }
            properties.append(PropertyResponse(**prop, location=location))
        
        return properties
        
    except Exception as e:
        logger.error(f"Error fetching properties: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/properties/{property_id}", response_model=PropertyResponse)
async def get_property(property_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Please add credentials to .env file")
    try:
        result = supabase.table('Property').select('*').eq('id', property_id).execute()
        
        if result.data:
            prop = result.data[0]
            location = None
            if prop.get('latitude') and prop.get('longitude'):
                location = {
                    'latitude': prop['latitude'],
                    'longitude': prop['longitude']
                }
            return PropertyResponse(**prop, location=location)
        else:
            raise HTTPException(status_code=404, detail="Property not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/properties/{property_id}")
async def delete_property(property_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Please add credentials to .env file")
    try:
        result = supabase.table('Property').delete().eq('id', property_id).execute()
        return {"message": "Property deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down application")
