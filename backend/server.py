from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import random
import string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Supabase config (for future full migration)
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')

# JWT Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production-' + str(uuid.uuid4()))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days

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

# Cities list
SUPPORTED_CITIES = [
    "faridabad", "gurugram", "noida", "delhi", "mumbai", 
    "pune", "bangalore", "hyderabad", "ahmedabad"
]

# Default pricing (will be controlled from admin dashboard)
DEFAULT_PRICING = {
    "pro_owner_monthly": 3599,
    "pro_owner_annual": 35990,
    "employee_tier_1": 399,  # 1-7 employees
    "employee_tier_2": 759,  # 8-14 employees
    "employee_tier_3": 1299,  # 15+ employees
}


# ================== Pydantic Models ==================

class OTPRequest(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)
    country_code: str = "+91"


class OTPVerify(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)
    otp: str = Field(..., min_length=6, max_length=6)


class UserSignUp(BaseModel):
    mobile: str
    name: str
    firm_name: str
    city: str
    email: EmailStr
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    invite_code: Optional[str] = None  # For employees joining via invite


class UserResponse(BaseModel):
    id: str
    mobile: str
    name: str
    firm_name: str
    city: str
    email: str
    role: str  # owner, employee
    is_pro: bool
    organization_id: Optional[str] = None
    profile_photo: Optional[str] = None
    subscription_status: Optional[str] = None
    created_at: str
    updated_at: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class OrganizationCreate(BaseModel):
    name: str
    employee_seats: int = 0


class OrganizationResponse(BaseModel):
    id: str
    name: str
    owner_id: str
    invite_code: str
    employee_seats: int
    created_at: str


class SubscriptionCreate(BaseModel):
    plan_type: str  # pro_owner_monthly, pro_owner_annual
    employee_seats: Optional[int] = 0


class SubscriptionResponse(BaseModel):
    id: str
    user_id: str
    plan_type: str
    status: str  # active, expired, pending_payment
    employee_seats: int
    amount: float
    start_date: str
    end_date: str
    created_at: str


class PricingUpdate(BaseModel):
    city: str
    pro_owner_monthly: float
    pro_owner_annual: float
    employee_tier_1: float
    employee_tier_2: float
    employee_tier_3: float


class MemberResponse(BaseModel):
    id: str
    name: str
    mobile: str
    profile_photo: Optional[str] = None
    role: str
    joined_at: str


# Legacy models for backward compatibility
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


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
    type: str
    value: float
    unit: str


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
    propertyCategory: Optional[str] = None
    propertyType: Optional[str] = None
    propertyPhotos: List[str] = []
    floor: Optional[int] = None
    floors: Optional[List[FloorEntry]] = []
    price: Optional[float] = None
    priceUnit: Optional[str] = "lakh"
    builderName: Optional[str] = None
    builderPhone: Optional[str] = None
    builders: List[BuilderInfo] = []
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
    organizationId: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sizes: Optional[List[dict]] = []
    address: Optional[dict] = None
    importantFiles: Optional[List[dict]] = []
    isSold: Optional[bool] = False
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ================== Helper Functions ==================

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


def generate_otp():
    """Generate 6-digit OTP - returns 000000 for testing"""
    return "000000"  # For testing purposes


def generate_invite_code():
    """Generate unique invite code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


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


async def get_pricing_for_city(city: str) -> dict:
    """Get pricing for a specific city"""
    city_lower = city.lower()
    
    # Check if it's international (outside India)
    pricing = await db.pricing.find_one({"city": city_lower})
    if pricing:
        return pricing
    
    # Check if city is in supported cities
    if city_lower not in SUPPORTED_CITIES:
        # Check for "other_cities" pricing
        other_pricing = await db.pricing.find_one({"city": "other_cities"})
        if other_pricing:
            return other_pricing
    
    # Return default pricing
    return {
        "city": city_lower,
        **DEFAULT_PRICING
    }


def calculate_employee_pricing(seats: int, base_tier_1: float, base_tier_2: float, base_tier_3: float) -> float:
    """Calculate total employee pricing based on tiers"""
    if seats <= 7:
        return seats * base_tier_1
    elif seats <= 14:
        return seats * base_tier_2
    else:
        return seats * base_tier_3


# ================== Initialize Default Data ==================

async def init_default_data():
    """Initialize default pricing for all cities"""
    # Check if pricing exists
    existing = await db.pricing.find_one({})
    if existing:
        return
    
    # Create default pricing for all cities
    all_cities = SUPPORTED_CITIES + ["other_cities", "international"]
    
    for city in all_cities:
        pricing_multiplier = 1.0
        if city == "international":
            pricing_multiplier = 2.0  # Max pricing for international
        elif city == "other_cities":
            pricing_multiplier = 1.0
        elif city in ["mumbai", "delhi", "bangalore"]:
            pricing_multiplier = 1.2  # Premium cities
        
        await db.pricing.insert_one({
            "id": str(uuid.uuid4()),
            "city": city,
            "pro_owner_monthly": DEFAULT_PRICING["pro_owner_monthly"] * pricing_multiplier,
            "pro_owner_annual": DEFAULT_PRICING["pro_owner_annual"] * pricing_multiplier,
            "employee_tier_1": DEFAULT_PRICING["employee_tier_1"] * pricing_multiplier,
            "employee_tier_2": DEFAULT_PRICING["employee_tier_2"] * pricing_multiplier,
            "employee_tier_3": DEFAULT_PRICING["employee_tier_3"] * pricing_multiplier,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        })
    
    logger.info("Default pricing initialized for all cities")


# ================== Mobile Auth Endpoints ==================

@api_router.post("/auth/send-otp")
async def send_otp(data: OTPRequest):
    """Send OTP to mobile number"""
    try:
        # Generate OTP (000000 for testing)
        otp = generate_otp()
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        # Store OTP in database
        await db.otp_verifications.update_one(
            {"mobile": data.mobile},
            {
                "$set": {
                    "mobile": data.mobile,
                    "country_code": data.country_code,
                    "otp": otp,
                    "expires_at": expires_at.isoformat(),
                    "verified": False,
                    "created_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        # In production, send SMS here
        logger.info(f"OTP sent to {data.mobile}: {otp}")
        
        return {"message": "OTP sent successfully", "expires_in": 600}
        
    except Exception as e:
        logger.error(f"Error sending OTP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/auth/verify-otp")
async def verify_otp(data: OTPVerify):
    """Verify OTP and return verification status"""
    try:
        # Find OTP record
        otp_record = await db.otp_verifications.find_one({"mobile": data.mobile})
        
        if not otp_record:
            raise HTTPException(status_code=400, detail="OTP not found. Please request a new one.")
        
        # Check if expired
        expires_at = datetime.fromisoformat(otp_record["expires_at"])
        if datetime.utcnow() > expires_at:
            raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
        
        # Verify OTP (000000 always works for testing)
        if data.otp != otp_record["otp"] and data.otp != "000000":
            raise HTTPException(status_code=400, detail="Invalid OTP")
        
        # Mark as verified
        await db.otp_verifications.update_one(
            {"mobile": data.mobile},
            {"$set": {"verified": True}}
        )
        
        # Check if user exists
        existing_user = await db.users.find_one({"mobile": data.mobile})
        
        if existing_user:
            # User exists - login
            access_token = create_access_token(data={"sub": existing_user["id"]})
            
            user_response = UserResponse(
                id=existing_user["id"],
                mobile=existing_user["mobile"],
                name=existing_user["name"],
                firm_name=existing_user["firm_name"],
                city=existing_user["city"],
                email=existing_user["email"],
                role=existing_user.get("role", "owner"),
                is_pro=existing_user.get("is_pro", False),
                organization_id=existing_user.get("organization_id"),
                profile_photo=existing_user.get("profile_photo"),
                subscription_status=existing_user.get("subscription_status"),
                created_at=existing_user["created_at"],
                updated_at=existing_user.get("updated_at", existing_user["created_at"])
            )
            
            return {
                "verified": True,
                "is_new_user": False,
                "access_token": access_token,
                "token_type": "bearer",
                "user": user_response.dict()
            }
        
        return {
            "verified": True,
            "is_new_user": True,
            "mobile": data.mobile
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying OTP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/auth/signup", response_model=Token)
async def signup(data: UserSignUp):
    """Complete signup after OTP verification"""
    try:
        # Check if OTP was verified
        otp_record = await db.otp_verifications.find_one({
            "mobile": data.mobile,
            "verified": True
        })
        
        if not otp_record:
            raise HTTPException(status_code=400, detail="Please verify your mobile number first")
        
        # Check if user already exists
        existing = await db.users.find_one({"mobile": data.mobile})
        if existing:
            raise HTTPException(status_code=400, detail="User already exists")
        
        # Check if email is taken
        email_exists = await db.users.find_one({"email": data.email})
        if email_exists:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        user_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        # Determine role based on invite code
        role = "owner"
        organization_id = None
        organization_name = None
        
        if data.invite_code:
            # Find organization by invite code
            org = await db.organizations.find_one({"invite_code": data.invite_code})
            if org:
                # Check if organization has available seats
                member_count = await db.organization_members.count_documents({"organization_id": org["id"]})
                if member_count >= org.get("employee_seats", 0):
                    raise HTTPException(status_code=400, detail="Organization has no available seats")
                
                role = "employee"
                organization_id = org["id"]
                organization_name = org["name"]
        
        user_dict = {
            "id": user_id,
            "mobile": data.mobile,
            "name": data.name,
            "firm_name": data.firm_name if role == "owner" else organization_name,
            "city": data.city,
            "email": data.email,
            "role": role,
            "is_pro": False,
            "organization_id": organization_id,
            "profile_photo": None,
            "subscription_status": None,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "created_at": now,
            "updated_at": now
        }
        
        await db.users.insert_one(user_dict)
        
        # If employee, add to organization members
        if organization_id:
            await db.organization_members.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "organization_id": organization_id,
                "role": "employee",
                "joined_at": now,
                "created_at": now,
                "updated_at": now
            })
        
        # Clear OTP record
        await db.otp_verifications.delete_one({"mobile": data.mobile})
        
        # Create access token
        access_token = create_access_token(data={"sub": user_id})
        
        user_response = UserResponse(
            id=user_id,
            mobile=data.mobile,
            name=data.name,
            firm_name=user_dict["firm_name"],
            city=data.city,
            email=data.email,
            role=role,
            is_pro=False,
            organization_id=organization_id,
            profile_photo=None,
            subscription_status=None,
            created_at=now,
            updated_at=now
        )
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error signing up: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/auth/check-invite/{invite_code}")
async def check_invite(invite_code: str):
    """Check if invite code is valid and return organization details"""
    try:
        org = await db.organizations.find_one({"invite_code": invite_code})
        if not org:
            raise HTTPException(status_code=404, detail="Invalid invite code")
        
        # Check available seats
        member_count = await db.organization_members.count_documents({"organization_id": org["id"]})
        available_seats = org.get("employee_seats", 0) - member_count
        
        if available_seats <= 0:
            raise HTTPException(status_code=400, detail="Organization has no available seats")
        
        # Get owner details
        owner = await db.users.find_one({"id": org["owner_id"]})
        
        return {
            "valid": True,
            "organization_name": org["name"],
            "owner_name": owner["name"] if owner else "Unknown",
            "available_seats": available_seats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking invite: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================== User Profile Endpoints ==================

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    # Check subscription status
    subscription = await db.subscriptions.find_one({
        "user_id": current_user["id"],
        "status": "active"
    })
    
    subscription_status = None
    if subscription:
        end_date = datetime.fromisoformat(subscription["end_date"])
        if datetime.utcnow() > end_date:
            subscription_status = "expired"
            # Update user and subscription
            await db.subscriptions.update_one(
                {"id": subscription["id"]},
                {"$set": {"status": "expired"}}
            )
            await db.users.update_one(
                {"id": current_user["id"]},
                {"$set": {"is_pro": False, "subscription_status": "expired"}}
            )
        else:
            subscription_status = "active"
    
    return UserResponse(
        id=current_user["id"],
        mobile=current_user["mobile"],
        name=current_user["name"],
        firm_name=current_user["firm_name"],
        city=current_user["city"],
        email=current_user["email"],
        role=current_user.get("role", "owner"),
        is_pro=current_user.get("is_pro", False),
        organization_id=current_user.get("organization_id"),
        profile_photo=current_user.get("profile_photo"),
        subscription_status=subscription_status or current_user.get("subscription_status"),
        created_at=current_user["created_at"],
        updated_at=current_user.get("updated_at", current_user["created_at"])
    )


@api_router.put("/auth/profile")
async def update_profile(
    name: Optional[str] = None,
    firm_name: Optional[str] = None,
    email: Optional[str] = None,
    profile_photo: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update user profile"""
    try:
        update_data = {"updated_at": datetime.utcnow().isoformat()}
        
        if name:
            update_data["name"] = name
        if firm_name and current_user.get("role") == "owner":
            update_data["firm_name"] = firm_name
        if email:
            # Check if email is taken
            existing = await db.users.find_one({"email": email, "id": {"$ne": current_user["id"]}})
            if existing:
                raise HTTPException(status_code=400, detail="Email already taken")
            update_data["email"] = email
        if profile_photo:
            update_data["profile_photo"] = profile_photo
        
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": update_data}
        )
        
        updated_user = await db.users.find_one({"id": current_user["id"]})
        
        return UserResponse(
            id=updated_user["id"],
            mobile=updated_user["mobile"],
            name=updated_user["name"],
            firm_name=updated_user["firm_name"],
            city=updated_user["city"],
            email=updated_user["email"],
            role=updated_user.get("role", "owner"),
            is_pro=updated_user.get("is_pro", False),
            organization_id=updated_user.get("organization_id"),
            profile_photo=updated_user.get("profile_photo"),
            subscription_status=updated_user.get("subscription_status"),
            created_at=updated_user["created_at"],
            updated_at=updated_user.get("updated_at", updated_user["created_at"])
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================== Organization Endpoints ==================

@api_router.post("/organization", response_model=OrganizationResponse)
async def create_organization(
    data: OrganizationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create organization (Pro owners only)"""
    try:
        if not current_user.get("is_pro"):
            raise HTTPException(
                status_code=403, 
                detail="Only Pro owners can create organizations"
            )
        
        if current_user.get("role") != "owner":
            raise HTTPException(
                status_code=403,
                detail="Only owners can create organizations"
            )
        
        # Check if user already has an organization
        existing_org = await db.organizations.find_one({"owner_id": current_user["id"]})
        if existing_org:
            raise HTTPException(status_code=400, detail="You already have an organization")
        
        org_id = str(uuid.uuid4())
        invite_code = generate_invite_code()
        now = datetime.utcnow().isoformat()
        
        org_dict = {
            "id": org_id,
            "name": data.name,
            "owner_id": current_user["id"],
            "invite_code": invite_code,
            "employee_seats": data.employee_seats,
            "created_at": now,
            "updated_at": now
        }
        
        await db.organizations.insert_one(org_dict)
        
        # Update user's organization_id
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"organization_id": org_id, "updated_at": now}}
        )
        
        # Add owner as organization member
        await db.organization_members.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "organization_id": org_id,
            "role": "owner",
            "joined_at": now,
            "created_at": now,
            "updated_at": now
        })
        
        return OrganizationResponse(
            id=org_id,
            name=data.name,
            owner_id=current_user["id"],
            invite_code=invite_code,
            employee_seats=data.employee_seats,
            created_at=now
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating organization: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/organization")
async def get_organization(current_user: dict = Depends(get_current_user)):
    """Get user's organization"""
    try:
        org_id = current_user.get("organization_id")
        
        if not org_id:
            # Check if owner has an org
            if current_user.get("role") == "owner":
                org = await db.organizations.find_one({"owner_id": current_user["id"]})
                if org:
                    org_id = org["id"]
        
        if not org_id:
            return {"organization": None}
        
        org = await db.organizations.find_one({"id": org_id})
        if not org:
            return {"organization": None}
        
        # Get member count
        member_count = await db.organization_members.count_documents({"organization_id": org_id})
        
        # Get owner details
        owner = await db.users.find_one({"id": org["owner_id"]})
        
        return {
            "organization": {
                "id": org["id"],
                "name": org["name"],
                "owner_id": org["owner_id"],
                "owner_name": owner["name"] if owner else "Unknown",
                "invite_code": org["invite_code"],
                "employee_seats": org.get("employee_seats", 0),
                "member_count": member_count,
                "created_at": org["created_at"]
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting organization: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/organization/members", response_model=List[MemberResponse])
async def get_organization_members(current_user: dict = Depends(get_current_user)):
    """Get organization members"""
    try:
        org_id = current_user.get("organization_id")
        
        if not org_id:
            if current_user.get("role") == "owner":
                org = await db.organizations.find_one({"owner_id": current_user["id"]})
                if org:
                    org_id = org["id"]
        
        if not org_id:
            return []
        
        # Get all members
        members_cursor = db.organization_members.find({"organization_id": org_id})
        members = await members_cursor.to_list(length=100)
        
        result = []
        for member in members:
            user = await db.users.find_one({"id": member["user_id"]})
            if user:
                result.append(MemberResponse(
                    id=user["id"],
                    name=user["name"],
                    mobile=user["mobile"],
                    profile_photo=user.get("profile_photo"),
                    role=member["role"],
                    joined_at=member["joined_at"]
                ))
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting members: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/organization/members/{user_id}")
async def remove_member(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove member from organization (Owner only)"""
    try:
        if current_user.get("role") != "owner":
            raise HTTPException(status_code=403, detail="Only owners can remove members")
        
        # Get owner's organization
        org = await db.organizations.find_one({"owner_id": current_user["id"]})
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Can't remove self
        if user_id == current_user["id"]:
            raise HTTPException(status_code=400, detail="Cannot remove yourself")
        
        # Remove member
        result = await db.organization_members.delete_one({
            "user_id": user_id,
            "organization_id": org["id"]
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Member not found")
        
        # Update user's organization_id
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"organization_id": None, "updated_at": datetime.utcnow().isoformat()}}
        )
        
        return {"message": "Member removed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/organization/seats")
async def update_employee_seats(
    seats: int,
    current_user: dict = Depends(get_current_user)
):
    """Update employee seats count"""
    try:
        if current_user.get("role") != "owner":
            raise HTTPException(status_code=403, detail="Only owners can update seats")
        
        org = await db.organizations.find_one({"owner_id": current_user["id"]})
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Get current member count (excluding owner)
        member_count = await db.organization_members.count_documents({
            "organization_id": org["id"],
            "role": "employee"
        })
        
        if seats < member_count:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot reduce seats below current employee count ({member_count})"
            )
        
        await db.organizations.update_one(
            {"id": org["id"]},
            {"$set": {"employee_seats": seats, "updated_at": datetime.utcnow().isoformat()}}
        )
        
        return {"message": "Employee seats updated", "seats": seats}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating seats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================== Subscription Endpoints ==================

@api_router.get("/pricing")
async def get_pricing(
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get pricing for user's city"""
    try:
        user_city = city or current_user.get("city", "other_cities")
        pricing = await get_pricing_for_city(user_city)
        
        # Calculate annual discount percentage
        monthly = pricing.get("pro_owner_monthly", DEFAULT_PRICING["pro_owner_monthly"])
        annual = pricing.get("pro_owner_annual", DEFAULT_PRICING["pro_owner_annual"])
        annual_monthly = annual / 12
        discount_percent = round((1 - annual_monthly / monthly) * 100)
        
        return {
            "city": user_city,
            "pro_owner": {
                "monthly": monthly,
                "annual": annual,
                "annual_monthly": round(annual_monthly, 2),
                "discount_percent": discount_percent
            },
            "employee_seats": {
                "tier_1": {
                    "range": "1-7",
                    "price_per_user": pricing.get("employee_tier_1", DEFAULT_PRICING["employee_tier_1"])
                },
                "tier_2": {
                    "range": "8-14",
                    "price_per_user": pricing.get("employee_tier_2", DEFAULT_PRICING["employee_tier_2"])
                },
                "tier_3": {
                    "range": "15+",
                    "price_per_user": pricing.get("employee_tier_3", DEFAULT_PRICING["employee_tier_3"])
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting pricing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/subscription/create")
async def create_subscription(
    data: SubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create subscription (Mock payment)"""
    try:
        if current_user.get("role") != "owner":
            raise HTTPException(status_code=403, detail="Only owners can subscribe")
        
        # Get pricing
        pricing = await get_pricing_for_city(current_user.get("city", "other_cities"))
        
        # Calculate amount
        if data.plan_type == "pro_owner_monthly":
            amount = pricing.get("pro_owner_monthly", DEFAULT_PRICING["pro_owner_monthly"])
            duration_days = 30
        elif data.plan_type == "pro_owner_annual":
            amount = pricing.get("pro_owner_annual", DEFAULT_PRICING["pro_owner_annual"])
            duration_days = 365
        else:
            raise HTTPException(status_code=400, detail="Invalid plan type")
        
        # Add employee seats cost
        if data.employee_seats > 0:
            employee_amount = calculate_employee_pricing(
                data.employee_seats,
                pricing.get("employee_tier_1", DEFAULT_PRICING["employee_tier_1"]),
                pricing.get("employee_tier_2", DEFAULT_PRICING["employee_tier_2"]),
                pricing.get("employee_tier_3", DEFAULT_PRICING["employee_tier_3"])
            )
            amount += employee_amount
        
        now = datetime.utcnow()
        end_date = now + timedelta(days=duration_days)
        
        subscription_id = str(uuid.uuid4())
        subscription_dict = {
            "id": subscription_id,
            "user_id": current_user["id"],
            "plan_type": data.plan_type,
            "status": "active",  # Mock - always active
            "employee_seats": data.employee_seats,
            "amount": amount,
            "start_date": now.isoformat(),
            "end_date": end_date.isoformat(),
            "payment_id": f"mock_{uuid.uuid4()}",  # Mock payment ID
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.subscriptions.insert_one(subscription_dict)
        
        # Update user to Pro
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {
                "is_pro": True,
                "subscription_status": "active",
                "updated_at": now.isoformat()
            }}
        )
        
        # Update organization seats if exists
        org = await db.organizations.find_one({"owner_id": current_user["id"]})
        if org and data.employee_seats > 0:
            await db.organizations.update_one(
                {"id": org["id"]},
                {"$set": {"employee_seats": data.employee_seats, "updated_at": now.isoformat()}}
            )
        
        return {
            "message": "Subscription created successfully (Mock)",
            "subscription": SubscriptionResponse(
                id=subscription_id,
                user_id=current_user["id"],
                plan_type=data.plan_type,
                status="active",
                employee_seats=data.employee_seats,
                amount=amount,
                start_date=now.isoformat(),
                end_date=end_date.isoformat(),
                created_at=now.isoformat()
            )
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/subscription")
async def get_subscription(current_user: dict = Depends(get_current_user)):
    """Get current subscription"""
    try:
        subscription = await db.subscriptions.find_one({
            "user_id": current_user["id"],
            "status": {"$in": ["active", "pending_payment"]}
        })
        
        if not subscription:
            return {"subscription": None}
        
        # Check if expired
        end_date = datetime.fromisoformat(subscription["end_date"])
        if datetime.utcnow() > end_date:
            await db.subscriptions.update_one(
                {"id": subscription["id"]},
                {"$set": {"status": "expired"}}
            )
            await db.users.update_one(
                {"id": current_user["id"]},
                {"$set": {"is_pro": False, "subscription_status": "expired"}}
            )
            return {"subscription": None, "expired": True}
        
        return {
            "subscription": SubscriptionResponse(
                id=subscription["id"],
                user_id=subscription["user_id"],
                plan_type=subscription["plan_type"],
                status=subscription["status"],
                employee_seats=subscription.get("employee_seats", 0),
                amount=subscription["amount"],
                start_date=subscription["start_date"],
                end_date=subscription["end_date"],
                created_at=subscription["created_at"]
            )
        }
        
    except Exception as e:
        logger.error(f"Error getting subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================== Property Endpoints ==================

@api_router.post("/properties", response_model=PropertyResponse)
async def create_property(
    property_data: PropertyCreate,
    current_user: dict = Depends(get_current_user)
):
    try:
        property_id = str(uuid.uuid4())
        
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
        
        builders_list = []
        if property_data.builders:
            builders_list = [b.dict() for b in property_data.builders]
        elif property_data.builderName:
            builders_list = [{
                "name": property_data.builderName,
                "phoneNumber": property_data.builderPhone,
                "countryCode": "+91"
            }]
        
        floors_list = []
        if property_data.floors:
            floors_list = [f.dict() for f in property_data.floors]
        
        sizes_list = []
        if property_data.sizes:
            sizes_list = [s.dict() for s in property_data.sizes]
        
        address_dict = None
        if property_data.address:
            address_dict = property_data.address.dict()
        
        files_list = []
        if property_data.importantFiles:
            files_list = [f.dict() for f in property_data.importantFiles]
        
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
            "userEmail": current_user.get("email"),
            "organizationId": current_user.get("organization_id"),
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
        # Get user's properties and organization properties
        org_id = current_user.get("organization_id")
        
        if org_id:
            # Show all properties from organization
            query = {"organizationId": org_id}
        else:
            # Show only user's properties
            query = {"userId": current_user["id"]}
        
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
        org_id = current_user.get("organization_id")
        
        if org_id:
            property_doc = await db.properties.find_one({
                "id": property_id,
                "organizationId": org_id
            })
        else:
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
        existing = await db.properties.find_one({
            "id": property_id,
            "userId": current_user["id"]
        })
        
        if not existing:
            raise HTTPException(status_code=404, detail="Property not found")
        
        builders_list = []
        if property_data.builders:
            builders_list = [b.dict() for b in property_data.builders]
        elif property_data.builderName:
            builders_list = [{
                "name": property_data.builderName,
                "phoneNumber": property_data.builderPhone,
                "countryCode": "+91"
            }]
        
        floors_list = []
        if property_data.floors:
            floors_list = [f.dict() for f in property_data.floors]
        
        sizes_list = []
        if property_data.sizes:
            sizes_list = [s.dict() for s in property_data.sizes]
        
        address_dict = None
        if property_data.address:
            address_dict = property_data.address.dict()
        
        files_list = []
        if property_data.importantFiles:
            files_list = [f.dict() for f in property_data.importantFiles]
        
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
    try:
        property_doc = await db.properties.find_one({
            "id": property_id,
            "userId": current_user["id"]
        })
        
        if not property_doc:
            raise HTTPException(status_code=404, detail="Property not found")
        
        if floor_number is not None:
            floors = property_doc.get("floors", [])
            for floor in floors:
                if floor.get("floorNumber") == floor_number:
                    floor["isSold"] = True
                    break
            
            all_sold = all(f.get("isSold", False) for f in floors) if floors else False
            
            await db.properties.update_one(
                {"id": property_id},
                {"$set": {"floors": floors, "isSold": all_sold, "updatedAt": datetime.utcnow().isoformat()}}
            )
        else:
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


# ================== Admin Endpoints ==================

@api_router.get("/admin/users")
async def get_all_users(
    city: Optional[str] = None,
    is_pro: Optional[bool] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    skip: int = 0,
    limit: int = 50
):
    """Get all users (Admin only - for admin dashboard)"""
    try:
        query = {"role": "owner"}  # Only show owners in admin
        
        if city:
            query["city"] = {"$regex": city, "$options": "i"}
        if is_pro is not None:
            query["is_pro"] = is_pro
        
        sort_direction = -1 if sort_order == "desc" else 1
        
        cursor = db.users.find(query).sort(sort_by, sort_direction).skip(skip).limit(limit)
        users = await cursor.to_list(length=limit)
        
        total = await db.users.count_documents(query)
        
        result = []
        for user in users:
            # Get subscription
            subscription = await db.subscriptions.find_one({
                "user_id": user["id"],
                "status": "active"
            })
            
            # Get organization
            org = await db.organizations.find_one({"owner_id": user["id"]})
            
            result.append({
                "id": user["id"],
                "name": user["name"],
                "mobile": user["mobile"],
                "firm_name": user["firm_name"],
                "city": user["city"],
                "email": user["email"],
                "is_pro": user.get("is_pro", False),
                "subscription_status": subscription["status"] if subscription else None,
                "subscription_end_date": subscription["end_date"] if subscription else None,
                "employee_seats": subscription.get("employee_seats", 0) if subscription else 0,
                "organization_id": org["id"] if org else None,
                "created_at": user["created_at"]
            })
        
        return {
            "users": result,
            "total": total,
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/admin/users/{user_id}")
async def get_user_details(user_id: str):
    """Get user details with subscription and organization info (Admin only)"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        subscription = await db.subscriptions.find_one({
            "user_id": user_id,
            "status": {"$in": ["active", "expired"]}
        })
        
        org = await db.organizations.find_one({"owner_id": user_id})
        
        members = []
        if org:
            members_cursor = db.organization_members.find({"organization_id": org["id"]})
            member_docs = await members_cursor.to_list(length=100)
            for m in member_docs:
                member_user = await db.users.find_one({"id": m["user_id"]})
                if member_user:
                    members.append({
                        "id": member_user["id"],
                        "name": member_user["name"],
                        "mobile": member_user["mobile"],
                        "role": m["role"],
                        "joined_at": m["joined_at"]
                    })
        
        # Get properties count
        properties_count = await db.properties.count_documents({"userId": user_id})
        
        return {
            "user": {
                "id": user["id"],
                "name": user["name"],
                "mobile": user["mobile"],
                "firm_name": user["firm_name"],
                "city": user["city"],
                "email": user["email"],
                "is_pro": user.get("is_pro", False),
                "created_at": user["created_at"]
            },
            "subscription": {
                "id": subscription["id"],
                "plan_type": subscription["plan_type"],
                "status": subscription["status"],
                "amount": subscription["amount"],
                "employee_seats": subscription.get("employee_seats", 0),
                "start_date": subscription["start_date"],
                "end_date": subscription["end_date"]
            } if subscription else None,
            "organization": {
                "id": org["id"],
                "name": org["name"],
                "invite_code": org["invite_code"],
                "employee_seats": org.get("employee_seats", 0),
                "members": members
            } if org else None,
            "properties_count": properties_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/admin/users/{user_id}/properties")
async def get_user_properties(user_id: str, skip: int = 0, limit: int = 50):
    """Get properties for a specific user (Admin only)"""
    try:
        cursor = db.properties.find({"userId": user_id}).sort("createdAt", -1).skip(skip).limit(limit)
        properties = await cursor.to_list(length=limit)
        
        total = await db.properties.count_documents({"userId": user_id})
        
        return {
            "properties": [PropertyResponse(**p) for p in properties],
            "total": total
        }
        
    except Exception as e:
        logger.error(f"Error getting user properties: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/admin/users/{user_id}/subscription")
async def admin_update_subscription(
    user_id: str,
    is_pro: bool,
    duration_months: Optional[int] = None,
    employee_seats: Optional[int] = None
):
    """Update user subscription (Admin only)"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        now = datetime.utcnow()
        
        if is_pro:
            # Create or update subscription
            end_date = now + timedelta(days=duration_months * 30) if duration_months else now + timedelta(days=30)
            
            subscription = await db.subscriptions.find_one({"user_id": user_id, "status": "active"})
            
            if subscription:
                # Update existing
                update_data = {
                    "status": "active",
                    "end_date": end_date.isoformat(),
                    "updated_at": now.isoformat()
                }
                if employee_seats is not None:
                    update_data["employee_seats"] = employee_seats
                
                await db.subscriptions.update_one(
                    {"id": subscription["id"]},
                    {"$set": update_data}
                )
            else:
                # Create new
                pricing = await get_pricing_for_city(user.get("city", "other_cities"))
                await db.subscriptions.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "plan_type": "admin_granted",
                    "status": "active",
                    "employee_seats": employee_seats or 0,
                    "amount": 0,
                    "start_date": now.isoformat(),
                    "end_date": end_date.isoformat(),
                    "payment_id": "admin_granted",
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat()
                })
            
            # Update organization seats if specified
            if employee_seats is not None:
                org = await db.organizations.find_one({"owner_id": user_id})
                if org:
                    await db.organizations.update_one(
                        {"id": org["id"]},
                        {"$set": {"employee_seats": employee_seats, "updated_at": now.isoformat()}}
                    )
        
        # Update user
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "is_pro": is_pro,
                "subscription_status": "active" if is_pro else None,
                "updated_at": now.isoformat()
            }}
        )
        
        return {"message": "Subscription updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/admin/pricing")
async def get_all_pricing():
    """Get pricing for all cities (Admin only)"""
    try:
        cursor = db.pricing.find({})
        pricing_list = await cursor.to_list(length=100)
        
        # Remove MongoDB _id and convert to serializable format
        result = []
        for p in pricing_list:
            result.append({
                "id": p.get("id", str(p.get("_id", ""))),
                "city": p.get("city"),
                "pro_owner_monthly": p.get("pro_owner_monthly"),
                "pro_owner_annual": p.get("pro_owner_annual"),
                "employee_tier_1": p.get("employee_tier_1"),
                "employee_tier_2": p.get("employee_tier_2"),
                "employee_tier_3": p.get("employee_tier_3"),
                "created_at": p.get("created_at"),
                "updated_at": p.get("updated_at"),
            })
        
        return {"pricing": result}
        
    except Exception as e:
        logger.error(f"Error getting pricing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/admin/pricing/{city}")
async def update_city_pricing(city: str, data: PricingUpdate):
    """Update pricing for a city (Admin only)"""
    try:
        now = datetime.utcnow().isoformat()
        
        result = await db.pricing.update_one(
            {"city": city.lower()},
            {"$set": {
                "pro_owner_monthly": data.pro_owner_monthly,
                "pro_owner_annual": data.pro_owner_annual,
                "employee_tier_1": data.employee_tier_1,
                "employee_tier_2": data.employee_tier_2,
                "employee_tier_3": data.employee_tier_3,
                "updated_at": now
            }},
            upsert=True
        )
        
        return {"message": f"Pricing updated for {city}"}
        
    except Exception as e:
        logger.error(f"Error updating pricing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================== Legacy Auth Endpoints (Backward Compatibility) ==================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    """Legacy register endpoint for backward compatibility"""
    try:
        existing_user = await db.users.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        user_id = str(uuid.uuid4())
        hashed_password = get_password_hash(user_data.password)
        now = datetime.utcnow().isoformat()
        
        user_dict = {
            "id": user_id,
            "email": user_data.email,
            "password": hashed_password,
            "mobile": "",
            "name": user_data.email.split("@")[0],
            "firm_name": "My Firm",
            "city": "other_cities",
            "role": "owner",
            "is_pro": False,
            "organization_id": None,
            "profile_photo": None,
            "subscription_status": None,
            "created_at": now,
            "updated_at": now
        }
        
        await db.users.insert_one(user_dict)
        
        access_token = create_access_token(data={"sub": user_id})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": user_data.email,
                "createdAt": now
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/auth/login")
async def login(user_data: UserLogin):
    """Legacy login endpoint for backward compatibility"""
    try:
        user = await db.users.find_one({"email": user_data.email})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        if not user.get("password") or not verify_password(user_data.password, user["password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password"
            )
        
        access_token = create_access_token(data={"sub": user["id"]})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "createdAt": user["created_at"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error logging in: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================== Root Endpoint ==================

@api_router.get("/")
async def root():
    return {"message": "Real Estate Inventory API", "version": "3.0.0"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_default_data()
    logger.info("Application started")


@app.on_event("shutdown")
async def shutdown():
    client.close()
    logger.info("Shutting down application")
