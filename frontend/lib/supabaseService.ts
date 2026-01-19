// Supabase Database Services
// Direct database operations - no backend server needed!

import { supabase, Profile, Organization, OrganizationMember, Pricing, Subscription, Property, OTPVerification } from './supabase';

// ============================================================================
// OTP & AUTH SERVICES (using custom OTP for development)
// ============================================================================

const TEST_OTP = '000000'; // Static OTP for testing

export const authService = {
  /**
   * Send OTP to mobile number
   * During development: stores OTP in database (always 000000)
   * In production: will use Supabase Phone Auth with Twilio
   */
  async sendOTP(mobile: string, countryCode: string = '+91'): Promise<void> {
    // Clean mobile number
    const cleanMobile = mobile.replace(/\D/g, '');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    
    // Upsert OTP record
    const { error } = await supabase
      .from('otp_verifications')
      .upsert({
        mobile: cleanMobile,
        country_code: countryCode,
        otp: TEST_OTP,
        verified: false,
        expires_at: expiresAt,
      }, {
        onConflict: 'mobile'
      });
    
    if (error) throw new Error(error.message);
    
    console.log(`OTP sent to ${mobile}: ${TEST_OTP}`);
  },

  /**
   * Verify OTP and check if user exists
   * Returns: { verified, isNewUser, profile?, mobile }
   */
  async verifyOTP(mobile: string, otp: string): Promise<{
    verified: boolean;
    isNewUser: boolean;
    profile?: Profile;
    mobile: string;
  }> {
    const cleanMobile = mobile.replace(/\D/g, '');
    
    // Get OTP record
    const { data: otpRecord, error: otpError } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('mobile', cleanMobile)
      .single();
    
    if (otpError || !otpRecord) {
      throw new Error('OTP not found. Please request a new one.');
    }
    
    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      throw new Error('OTP expired. Please request a new one.');
    }
    
    // Verify OTP (000000 always works for testing)
    if (otp !== otpRecord.otp && otp !== TEST_OTP) {
      throw new Error('Invalid OTP');
    }
    
    // Mark as verified
    await supabase
      .from('otp_verifications')
      .update({ verified: true })
      .eq('mobile', cleanMobile);
    
    // Check if user exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('mobile', cleanMobile)
      .single();
    
    if (profile) {
      return {
        verified: true,
        isNewUser: false,
        profile: profile as Profile,
        mobile: cleanMobile,
      };
    }
    
    return {
      verified: true,
      isNewUser: true,
      mobile: cleanMobile,
    };
  },

  /**
   * Sign up new user
   */
  async signUp(data: {
    mobile: string;
    name: string;
    firm_name: string;
    city: string;
    email: string;
    latitude?: number;
    longitude?: number;
    invite_code?: string;
  }): Promise<Profile> {
    const cleanMobile = data.mobile.replace(/\D/g, '');
    
    // Check OTP was verified
    const { data: otpRecord } = await supabase
      .from('otp_verifications')
      .select('verified')
      .eq('mobile', cleanMobile)
      .single();
    
    if (!otpRecord?.verified) {
      throw new Error('Please verify your mobile number first');
    }
    
    // Check if user already exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('mobile', cleanMobile)
      .single();
    
    if (existing) {
      throw new Error('User already exists');
    }
    
    // Check if email is taken
    const { data: emailExists } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', data.email)
      .single();
    
    if (emailExists) {
      throw new Error('Email already registered');
    }
    
    // Determine role based on invite code
    let role: 'owner' | 'employee' = 'owner';
    let organizationId: string | null = null;
    let firmName = data.firm_name;
    
    if (data.invite_code) {
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('invite_code', data.invite_code)
        .single();
      
      if (org) {
        // Check available seats
        const { count } = await supabase
          .from('organization_members')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id);
        
        if ((count || 0) >= org.employee_seats) {
          throw new Error('Organization has no available seats');
        }
        
        role = 'employee';
        organizationId = org.id;
        firmName = org.name;
      }
    }
    
    // Create profile using Supabase auth
    // For now, create directly in profiles table (will switch to Supabase Auth later)
    const profileId = crypto.randomUUID();
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: profileId,
        mobile: cleanMobile,
        name: data.name,
        firm_name: firmName,
        city: data.city,
        email: data.email,
        role,
        is_pro: false,
        organization_id: organizationId,
        latitude: data.latitude,
        longitude: data.longitude,
      })
      .select()
      .single();
    
    if (profileError) throw new Error(profileError.message);
    
    // If employee, add to organization members
    if (organizationId) {
      await supabase.from('organization_members').insert({
        user_id: profileId,
        organization_id: organizationId,
        role: 'employee',
        joined_at: new Date().toISOString(),
      });
    }
    
    // Clean up OTP record
    await supabase
      .from('otp_verifications')
      .delete()
      .eq('mobile', cleanMobile);
    
    return profile as Profile;
  },

  /**
   * Get profile by ID
   */
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) return null;
    return data as Profile;
  },

  /**
   * Update profile
   */
  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data as Profile;
  },
};

// ============================================================================
// ORGANIZATION SERVICES
// ============================================================================

export const organizationService = {
  /**
   * Create organization (Pro owners only)
   */
  async create(userId: string, name: string, employeeSeats: number = 0): Promise<Organization> {
    // Check if user is pro
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, role')
      .eq('id', userId)
      .single();
    
    if (!profile?.is_pro) {
      throw new Error('Only Pro owners can create organizations');
    }
    
    if (profile.role !== 'owner') {
      throw new Error('Only owners can create organizations');
    }
    
    // Check if user already has an organization
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', userId)
      .single();
    
    if (existingOrg) {
      throw new Error('You already have an organization');
    }
    
    // Generate invite code
    const inviteCode = generateInviteCode();
    
    const { data: org, error } = await supabase
      .from('organizations')
      .insert({
        name,
        owner_id: userId,
        invite_code: inviteCode,
        employee_seats: employeeSeats,
      })
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    
    // Update user's organization_id
    await supabase
      .from('profiles')
      .update({ organization_id: org.id })
      .eq('id', userId);
    
    // Add owner as member
    await supabase.from('organization_members').insert({
      user_id: userId,
      organization_id: org.id,
      role: 'owner',
      joined_at: new Date().toISOString(),
    });
    
    return org as Organization;
  },

  /**
   * Get organization by ID or user's organization
   */
  async get(orgIdOrUserId: string): Promise<Organization | null> {
    // Try by org ID first
    let { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgIdOrUserId)
      .single();
    
    if (!org) {
      // Try by owner ID
      const result = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', orgIdOrUserId)
        .single();
      org = result.data;
    }
    
    return org as Organization | null;
  },

  /**
   * Get organization members
   */
  async getMembers(organizationId: string): Promise<(OrganizationMember & { profile: Profile })[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        *,
        profile:profiles(*)
      `)
      .eq('organization_id', organizationId);
    
    if (error) throw new Error(error.message);
    return data as any[];
  },

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string, requesterId: string): Promise<void> {
    // Check if requester is owner
    const { data: org } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', organizationId)
      .single();
    
    if (org?.owner_id !== requesterId) {
      throw new Error('Only owners can remove members');
    }
    
    if (userId === requesterId) {
      throw new Error('Cannot remove yourself');
    }
    
    await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId);
    
    // Clear user's organization_id
    await supabase
      .from('profiles')
      .update({ organization_id: null })
      .eq('id', userId);
  },

  /**
   * Update employee seats
   */
  async updateSeats(organizationId: string, seats: number, userId: string): Promise<void> {
    // Verify ownership
    const { data: org } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', organizationId)
      .single();
    
    if (org?.owner_id !== userId) {
      throw new Error('Only owners can update seats');
    }
    
    // Check current member count
    const { count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('role', 'employee');
    
    if (seats < (count || 0)) {
      throw new Error(`Cannot reduce seats below current employee count (${count})`);
    }
    
    await supabase
      .from('organizations')
      .update({ employee_seats: seats })
      .eq('id', organizationId);
  },

  /**
   * Check invite code validity
   */
  async checkInvite(inviteCode: string): Promise<{
    valid: boolean;
    organizationName?: string;
    ownerName?: string;
    availableSeats?: number;
  }> {
    const { data: org } = await supabase
      .from('organizations')
      .select('*, owner:profiles!owner_id(name)')
      .eq('invite_code', inviteCode)
      .single();
    
    if (!org) {
      return { valid: false };
    }
    
    // Check available seats
    const { count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);
    
    const availableSeats = org.employee_seats - (count || 0);
    
    if (availableSeats <= 0) {
      return { valid: false };
    }
    
    return {
      valid: true,
      organizationName: org.name,
      ownerName: (org as any).owner?.name,
      availableSeats,
    };
  },
};

// ============================================================================
// PRICING SERVICES
// ============================================================================

export const pricingService = {
  /**
   * Get pricing for a city
   */
  async getForCity(city: string): Promise<Pricing> {
    const cityLower = city.toLowerCase();
    
    // Try exact city match
    let { data: pricing } = await supabase
      .from('pricing')
      .select('*')
      .eq('city', cityLower)
      .single();
    
    if (!pricing) {
      // Fall back to other_cities
      const result = await supabase
        .from('pricing')
        .select('*')
        .eq('city', 'other_cities')
        .single();
      pricing = result.data;
    }
    
    return pricing as Pricing;
  },

  /**
   * Get all pricing (for admin)
   */
  async getAll(): Promise<Pricing[]> {
    const { data, error } = await supabase
      .from('pricing')
      .select('*')
      .order('city');
    
    if (error) throw new Error(error.message);
    return data as Pricing[];
  },

  /**
   * Calculate employee pricing based on tiers
   */
  calculateEmployeeCost(seats: number, pricing: Pricing): number {
    if (seats <= 7) {
      return seats * pricing.employee_tier_1;
    } else if (seats <= 14) {
      return seats * pricing.employee_tier_2;
    } else {
      return seats * pricing.employee_tier_3;
    }
  },
};

// ============================================================================
// SUBSCRIPTION SERVICES
// ============================================================================

export const subscriptionService = {
  /**
   * Create subscription (mock payment for now)
   */
  async create(
    userId: string,
    planType: 'pro_owner_monthly' | 'pro_owner_annual',
    employeeSeats: number = 0
  ): Promise<Subscription> {
    // Get user's city
    const { data: profile } = await supabase
      .from('profiles')
      .select('city, role')
      .eq('id', userId)
      .single();
    
    if (profile?.role !== 'owner') {
      throw new Error('Only owners can subscribe');
    }
    
    // Get pricing
    const pricing = await pricingService.getForCity(profile?.city || 'other_cities');
    
    // Calculate amount
    let amount = planType === 'pro_owner_monthly' 
      ? pricing.pro_owner_monthly 
      : pricing.pro_owner_annual;
    
    const durationDays = planType === 'pro_owner_monthly' ? 30 : 365;
    
    // Add employee seats cost
    if (employeeSeats > 0) {
      amount += pricingService.calculateEmployeeCost(employeeSeats, pricing);
    }
    
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_type: planType,
        status: 'active',
        employee_seats: employeeSeats,
        amount,
        payment_id: `mock_${Date.now()}`,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      })
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    
    // Update user to Pro
    await supabase
      .from('profiles')
      .update({
        is_pro: true,
        subscription_status: 'active',
      })
      .eq('id', userId);
    
    // Update organization seats if exists
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', userId)
      .single();
    
    if (org && employeeSeats > 0) {
      await supabase
        .from('organizations')
        .update({ employee_seats: employeeSeats })
        .eq('id', org.id);
    }
    
    return subscription as Subscription;
  },

  /**
   * Get user's active subscription
   */
  async get(userId: string): Promise<Subscription | null> {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'pending_payment'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!data) return null;
    
    // Check if expired
    if (new Date(data.end_date) < new Date()) {
      await supabase
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('id', data.id);
      
      await supabase
        .from('profiles')
        .update({ is_pro: false, subscription_status: 'expired' })
        .eq('id', userId);
      
      return null;
    }
    
    return data as Subscription;
  },
};

// ============================================================================
// PROPERTY SERVICES
// ============================================================================

export const propertyService = {
  /**
   * Create property
   */
  async create(userId: string, propertyData: Partial<Property>): Promise<Property> {
    // Get user's organization_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
    
    const { data, error } = await supabase
      .from('properties')
      .insert({
        ...propertyData,
        user_id: userId,
        organization_id: profile?.organization_id,
      })
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data as Property;
  },

  /**
   * Get properties for user/organization
   */
  async getAll(userId: string, filters?: {
    propertyType?: string;
    propertyCategory?: string;
    caseType?: string;
    includeSold?: boolean;
  }): Promise<Property[]> {
    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
    
    let query = supabase.from('properties').select('*');
    
    if (profile?.organization_id) {
      // Show all org properties
      query = query.eq('organization_id', profile.organization_id);
    } else {
      // Show only user's properties
      query = query.eq('user_id', userId);
    }
    
    if (filters?.propertyType) {
      query = query.eq('property_type', filters.propertyType);
    }
    if (filters?.propertyCategory) {
      query = query.eq('property_category', filters.propertyCategory);
    }
    if (filters?.caseType) {
      query = query.eq('case_type', filters.caseType);
    }
    if (!filters?.includeSold) {
      query = query.eq('is_sold', false);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    return data as Property[];
  },

  /**
   * Get single property
   */
  async get(propertyId: string): Promise<Property | null> {
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .single();
    
    return data as Property | null;
  },

  /**
   * Update property
   */
  async update(propertyId: string, userId: string, updates: Partial<Property>): Promise<Property> {
    const { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', propertyId)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data as Property;
  },

  /**
   * Delete property
   */
  async delete(propertyId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyId)
      .eq('user_id', userId);
    
    if (error) throw new Error(error.message);
  },

  /**
   * Mark property as sold
   */
  async markSold(propertyId: string, userId: string, floorNumber?: number): Promise<void> {
    if (floorNumber !== undefined) {
      // Mark specific floor as sold
      const { data: property } = await supabase
        .from('properties')
        .select('floors')
        .eq('id', propertyId)
        .single();
      
      if (property?.floors) {
        const floors = property.floors.map((f: any) => 
          f.floorNumber === floorNumber ? { ...f, isSold: true } : f
        );
        const allSold = floors.every((f: any) => f.isSold);
        
        await supabase
          .from('properties')
          .update({ floors, is_sold: allSold })
          .eq('id', propertyId)
          .eq('user_id', userId);
      }
    } else {
      await supabase
        .from('properties')
        .update({ is_sold: true })
        .eq('id', propertyId)
        .eq('user_id', userId);
    }
  },
};

// ============================================================================
// STORAGE SERVICES
// ============================================================================

export const storageService = {
  /**
   * Upload profile photo
   */
  async uploadProfilePhoto(userId: string, base64: string): Promise<string> {
    const fileName = `${userId}/${Date.now()}.jpg`;
    
    // Convert base64 to blob
    const response = await fetch(`data:image/jpeg;base64,${base64}`);
    const blob = await response.blob();
    
    const { error } = await supabase.storage
      .from('profile-photos')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    
    if (error) throw new Error(error.message);
    
    const { data } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  },

  /**
   * Upload property photo
   */
  async uploadPropertyPhoto(userId: string, base64: string, propertyId?: string): Promise<string> {
    const fileName = `${userId}/${propertyId || 'temp'}/${Date.now()}.jpg`;
    
    const response = await fetch(`data:image/jpeg;base64,${base64}`);
    const blob = await response.blob();
    
    const { error } = await supabase.storage
      .from('property-photos')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
      });
    
    if (error) throw new Error(error.message);
    
    const { data } = supabase.storage
      .from('property-photos')
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  },

  /**
   * Upload property file (PDF, etc.)
   */
  async uploadPropertyFile(userId: string, uri: string, fileName: string, mimeType: string): Promise<string> {
    const filePath = `${userId}/${Date.now()}-${fileName}`;
    
    const response = await fetch(uri);
    const blob = await response.blob();
    
    const { error } = await supabase.storage
      .from('property-files')
      .upload(filePath, blob, {
        contentType: mimeType,
      });
    
    if (error) throw new Error(error.message);
    
    const { data } = supabase.storage
      .from('property-files')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default {
  auth: authService,
  organization: organizationService,
  pricing: pricingService,
  subscription: subscriptionService,
  property: propertyService,
  storage: storageService,
};
