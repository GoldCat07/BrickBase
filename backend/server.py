from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production-' + str(uuid.uuid4()))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Pydantic Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    createdAt: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class BuilderInfo(BaseModel):
    name: Optional[str] = None
    phoneNumber: Optional[str] = None
    countryCode: Optional[str] = "+91"


class FloorEntry(BaseModel):
    floorNumber: int
    price: float
    priceUnit: Optional[str] = "lakh"
    isSold: Optional[bool] = False


class SizeEntry(BaseModel):
    type: str  # carpet, builtup, superbuiltup
    value: float
    unit: str  # sq_ft, sq_yards, sq_mts


class AddressInfo(BaseModel):
    unitNo: Optional[str] = None
    block: Optional[str] = None
    sector: Optional[str] = None
    city: Optional[str] = None


class ImportantFile(BaseModel):
    name: str
    uri: str
    base64: Optional[str] = None
    mimeType: Optional[str] = None


class PropertyCreate(BaseModel):
    propertyCategory: Optional[str] = None  # Residential, Commercial
    propertyType: Optional[str] = None
    propertyPhotos: List[str] = []  # Base64 encoded images
    floor: Optional[int] = None  # Legacy single floor
    floors: Optional[List[FloorEntry]] = []  # New multiple floors
    price: Optional[float] = None
    priceUnit: Optional[str] = "lakh"  # "cr", "lakh", "lakh_per_month"
    builderName: Optional[str] = None
    builderPhone: Optional[str] = None
    builders: List[BuilderInfo] = []
    paymentPlan: Optional[str] = None
    additionalNotes: Optional[str] = None
    black: Optional[float] = None  # Legacy
    white: Optional[float] = None  # Legacy
    blackPercentage: Optional[float] = None
    whitePercentage: Optional[float] = None
    possessionMonth: Optional[int] = None
    possessionYear: Optional[int] = None
    possessionDate: Optional[str] = None  # Legacy
    clubProperty: bool = False
    poolProperty: bool = False
    parkProperty: bool = False
    gatedProperty: bool = False
    propertyAge: Optional[int] = None
    ageType: Optional[str] = None  # Fresh, Resale, UnderConstruction
    handoverDate: Optional[str] = None  # Legacy
    case: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sizes: Optional[List[SizeEntry]] = []
    address: Optional[AddressInfo] = None
    importantFiles: Optional[List[ImportantFile]] = []
    isSold: Optional[bool] = False


class PropertyResponse(BaseModel):
    id: str
    propertyCategory: Optional[str] = None
    propertyType: Optional[str] = None
    propertyPhotos: List[str] = []
    floor: Optional[int] = None
    floors: Optional[List[dict]] = []
    price: Optional[float] = None
    priceUnit: Optional[str] = "lakh"
    builderId: Optional[str] = None
    builderName: Optional[str] = None
    builderPhone: Optional[str] = None
    builders: List[dict] = []
    paymentPlan: Optional[str] = None
    additionalNotes: Optional[str] = None
    black: Optional[float] = None
    white: Optional[float] = None
    blackPercentage: Optional[float] = None
    whitePercentage: Optional[float] = None
    possessionMonth: Optional[int] = None
    possessionYear: Optional[int] = None
    possessionDate: Optional[str] = None
    clubProperty: bool = False
    poolProperty: bool = False
    parkProperty: bool = False
    gatedProperty: bool = False
    propertyAge: Optional[int] = None
    ageType: Optional[str] = None
    handoverDate: Optional[str] = None
    case: Optional[str] = None
    userId: Optional[str] = None
    userEmail: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sizes: Optional[List[dict]] = []
    address: Optional[dict] = None
    importantFiles: Optional[List[dict]] = []
    isSold: Optional[bool] = False
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# Helper Functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise credentials_exception
    return user


# Authentication Endpoints
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    try:
        # Check if user exists
        existing_user = await db.users.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Create user
        user_id = str(uuid.uuid4())
        hashed_password = get_password_hash(user_data.password)
        
        user_dict = {
            "id": user_id,
            "email": user_data.email,
            "password": hashed_password,
            "createdAt": datetime.utcnow().isoformat(),
        }
        
        await db.users.insert_one(user_dict)
        
        # Create access token
        access_token = create_access_token(data={"sub": user_id})
        
        user_response = UserResponse(
            id=user_id,
            email=user_data.email,
            createdAt=user_dict["createdAt"]
        )
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    try:
        # Find user
        user = await db.users.find_one({"email": user_data.email})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        # Verify password
        if not verify_password(user_data.password, user["password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        # Create access token
        access_token = create_access_token(data={"sub": user["id"]})
        
        user_response = UserResponse(
            id=user["id"],
            email=user["email"],
            createdAt=user["createdAt"]
        )
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error logging in: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        createdAt=current_user["createdAt"]
    )


# Property Endpoints
@api_router.post("/properties", response_model=PropertyResponse)
async def create_property(
    property_data: PropertyCreate,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Generate property ID
        property_id = str(uuid.uuid4())
        
        # Handle builder creation if name provided
        builder_id = None
        if property_data.builderName:
            builder_id = str(uuid.uuid4())
            builder_dict = {
                "id": builder_id,
                "name": property_data.builderName,
                "phoneNumber": property_data.builderPhone,
                "createdAt": datetime.utcnow().isoformat(),
            }
            await db.builders.insert_one(builder_dict)
        
        # Prepare builders list
        builders_list = []
        if property_data.builders:
            builders_list = [b.dict() for b in property_data.builders]
        elif property_data.builderName:
            builders_list = [{
                "name": property_data.builderName,
                "phoneNumber": property_data.builderPhone,
                "countryCode": "+91"
            }]
        
        # Prepare floors list
        floors_list = []
        if property_data.floors:
            floors_list = [f.dict() for f in property_data.floors]
        
        # Prepare sizes list
        sizes_list = []
        if property_data.sizes:
            sizes_list = [s.dict() for s in property_data.sizes]
        
        # Prepare address
        address_dict = None
        if property_data.address:
            address_dict = property_data.address.dict()
        
        # Prepare important files
        files_list = []
        if property_data.importantFiles:
            files_list = [f.dict() for f in property_data.importantFiles]
        
        # Prepare property data
        property_dict = {
            "id": property_id,
            "propertyCategory": property_data.propertyCategory,
            "propertyType": property_data.propertyType,
            "propertyPhotos": property_data.propertyPhotos,
            "floor": property_data.floor,
            "floors": floors_list,
            "price": property_data.price,
            "priceUnit": property_data.priceUnit or "lakh",
            "builderId": builder_id,
            "builderName": property_data.builderName,
            "builderPhone": property_data.builderPhone,
            "builders": builders_list,
            "paymentPlan": property_data.paymentPlan,
            "additionalNotes": property_data.additionalNotes,
            "black": property_data.black,
            "white": property_data.white,
            "blackPercentage": property_data.blackPercentage,
            "whitePercentage": property_data.whitePercentage,
            "possessionMonth": property_data.possessionMonth,
            "possessionYear": property_data.possessionYear,
            "possessionDate": property_data.possessionDate,
            "clubProperty": property_data.clubProperty,
            "poolProperty": property_data.poolProperty,
            "parkProperty": property_data.parkProperty,
            "gatedProperty": property_data.gatedProperty,
            "propertyAge": property_data.propertyAge,
            "ageType": property_data.ageType,
            "handoverDate": property_data.handoverDate,
            "case": property_data.case,
            "userId": current_user["id"],
            "userEmail": current_user["email"],
            "latitude": property_data.latitude,
            "longitude": property_data.longitude,
            "sizes": sizes_list,
            "address": address_dict,
            "importantFiles": files_list,
            "isSold": property_data.isSold or False,
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat(),
        }
        
        await db.properties.insert_one(property_dict)
        
        return PropertyResponse(**property_dict)
            
    except Exception as e:
        logger.error(f"Error creating property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/properties", response_model=List[PropertyResponse])
async def get_properties(
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    property_type: Optional[str] = None,
    property_category: Optional[str] = None,
    case_type: Optional[str] = None,
    age_type: Optional[str] = None,
    include_sold: Optional[bool] = False,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Build query
        query = {"userId": current_user["id"]}
        
        # Exclude sold properties by default
        if not include_sold:
            query["$or"] = [{"isSold": False}, {"isSold": {"$exists": False}}]
        
        if property_type:
            query["propertyType"] = property_type
        
        if property_category:
            query["propertyCategory"] = property_category
        
        if case_type:
            query["case"] = case_type
        
        if age_type:
            query["ageType"] = age_type
        
        if min_price is not None or max_price is not None:
            query["price"] = {}
            if min_price is not None:
                query["price"]["$gte"] = min_price
            if max_price is not None:
                query["price"]["$lte"] = max_price
        
        # Fetch properties
        cursor = db.properties.find(query).sort("createdAt", -1)
        properties = await cursor.to_list(length=1000)
        
        return [PropertyResponse(**prop) for prop in properties]
        
    except Exception as e:
        logger.error(f"Error fetching properties: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/properties/{property_id}", response_model=PropertyResponse)
async def get_property(
    property_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        property_doc = await db.properties.find_one({
            "id": property_id,
            "userId": current_user["id"]
        })
        
        if not property_doc:
            raise HTTPException(status_code=404, detail="Property not found")
        
        return PropertyResponse(**property_doc)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/properties/{property_id}")
async def delete_property(
    property_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        result = await db.properties.delete_one({
            "id": property_id,
            "userId": current_user["id"]
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Property not found")
        
        return {"message": "Property deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/properties/{property_id}", response_model=PropertyResponse)
async def update_property(
    property_id: str,
    property_data: PropertyCreate,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Check if property exists
        existing = await db.properties.find_one({
            "id": property_id,
            "userId": current_user["id"]
        })
        
        if not existing:
            raise HTTPException(status_code=404, detail="Property not found")
        
        # Prepare builders list
        builders_list = []
        if property_data.builders:
            builders_list = [b.dict() for b in property_data.builders]
        elif property_data.builderName:
            builders_list = [{
                "name": property_data.builderName,
                "phoneNumber": property_data.builderPhone,
                "countryCode": "+91"
            }]
        
        # Prepare floors list
        floors_list = []
        if property_data.floors:
            floors_list = [f.dict() for f in property_data.floors]
        
        # Prepare sizes list
        sizes_list = []
        if property_data.sizes:
            sizes_list = [s.dict() for s in property_data.sizes]
        
        # Prepare address
        address_dict = None
        if property_data.address:
            address_dict = property_data.address.dict()
        
        # Prepare important files
        files_list = []
        if property_data.importantFiles:
            files_list = [f.dict() for f in property_data.importantFiles]
        
        # Update property data
        update_dict = {
            "propertyCategory": property_data.propertyCategory,
            "propertyType": property_data.propertyType,
            "propertyPhotos": property_data.propertyPhotos,
            "floor": property_data.floor,
            "floors": floors_list,
            "price": property_data.price,
            "priceUnit": property_data.priceUnit or "lakh",
            "builderName": property_data.builderName,
            "builderPhone": property_data.builderPhone,
            "builders": builders_list,
            "paymentPlan": property_data.paymentPlan,
            "additionalNotes": property_data.additionalNotes,
            "black": property_data.black,
            "white": property_data.white,
            "blackPercentage": property_data.blackPercentage,
            "whitePercentage": property_data.whitePercentage,
            "possessionMonth": property_data.possessionMonth,
            "possessionYear": property_data.possessionYear,
            "possessionDate": property_data.possessionDate,
            "clubProperty": property_data.clubProperty,
            "poolProperty": property_data.poolProperty,
            "parkProperty": property_data.parkProperty,
            "gatedProperty": property_data.gatedProperty,
            "propertyAge": property_data.propertyAge,
            "ageType": property_data.ageType,
            "handoverDate": property_data.handoverDate,
            "case": property_data.case,
            "latitude": property_data.latitude,
            "longitude": property_data.longitude,
            "sizes": sizes_list,
            "address": address_dict,
            "importantFiles": files_list,
            "isSold": property_data.isSold or False,
            "updatedAt": datetime.utcnow().isoformat(),
        }
        
        await db.properties.update_one(
            {"id": property_id, "userId": current_user["id"]},
            {"$set": update_dict}
        )
        
        # Fetch updated property
        updated = await db.properties.find_one({"id": property_id})
        return PropertyResponse(**updated)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating property: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/properties/{property_id}/sold")
async def mark_property_sold(
    property_id: str,
    floor_number: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark a property or specific floor as sold"""
    try:
        property_doc = await db.properties.find_one({
            "id": property_id,
            "userId": current_user["id"]
        })
        
        if not property_doc:
            raise HTTPException(status_code=404, detail="Property not found")
        
        if floor_number is not None:
            # Mark specific floor as sold
            floors = property_doc.get("floors", [])
            for floor in floors:
                if floor.get("floorNumber") == floor_number:
                    floor["isSold"] = True
                    break
            
            # Check if all floors are sold
            all_sold = all(f.get("isSold", False) for f in floors) if floors else False
            
            await db.properties.update_one(
                {"id": property_id},
                {"$set": {"floors": floors, "isSold": all_sold, "updatedAt": datetime.utcnow().isoformat()}}
            )
        else:
            # Mark entire property as sold
            await db.properties.update_one(
                {"id": property_id},
                {"$set": {"isSold": True, "updatedAt": datetime.utcnow().isoformat()}}
            )
        
        return {"message": "Property marked as sold successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking property as sold: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Real Estate Inventory API", "version": "2.0.0"}


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
    client.close()
    logger.info("Shutting down application")
