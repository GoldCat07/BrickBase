// Supabase Database Services
// Direct database operations - no backend server needed!
// Uses Supabase Auth for authentication

import { supabase, Profile, Organization, OrganizationMember, Pricing, Subscription, Property, InAppMessage, AppConfig } from './supabase';

// ============================================================================
// AUTH SERVICES (Using Supabase Auth with Twilio)
// ============================================================================

export const authService = {
  /**
   * Send OTP to mobile number using Supabase Auth (Twilio)
   */
  async sendOTP(mobile: string, countryCode: string = '+91'): Promise<void> {
    const cleanMobile = mobile.replace(/\D/g, '');
    const fullPhone = `${countryCode}${cleanMobile}`;
    
    // Use Supabase Auth phone OTP (sends via Twilio)
    const { error } = await supabase.auth.signInWithOtp({
      phone: fullPhone,
    });
    
    if (error) {
      console.error('OTP send error:', error.message);
      throw new Error(error.message);
    }
    
    console.log(`OTP sent to ${fullPhone}`);
  },

  /**
   * Verify OTP and check if user exists
   * Returns: { verified, isNewUser, profile?, mobile, userId? }
   */
  async verifyOTP(mobile: string, otp: string, countryCode: string = '+91'): Promise<{
    verified: boolean;
    isNewUser: boolean;
    profile?: Profile;
    mobile: string;
    userId?: string;
  }> {
    const cleanMobile = mobile.replace(/\D/g, '');
    const fullPhone = `${countryCode}${cleanMobile}`;
    
    // Verify OTP with Supabase Auth
    const { data, error } = await supabase.auth.verifyOtp({
      phone: fullPhone,
      token: otp,
      type: 'sms',
    });
    
    if (error) {
      throw new Error(error.message || 'Invalid OTP');
    }
    
    const userId = data.user?.id;
    
    if (!userId) {
      throw new Error('Authentication failed');
    }
    
    // Check if profile exists for this user
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profile) {
      return {
        verified: true,
        isNewUser: false,
        profile: profile as Profile,
        mobile: cleanMobile,
        userId: profile.id,
      };
    }
    
    // New user - no profile yet
    return {
      verified: true,
      isNewUser: true,
      mobile: cleanMobile,
      userId,
    };
  },

  /**
   * Complete user profile after OTP verification
   * Creates a new profile record with user details
   */
  async signUp(data: {
    mobile: string;
    name: string;
    firm_name: string;
    city: string;
    email: string;
    invite_code?: string;
  }): Promise<Profile> {
    // Get the current authenticated user from Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authData.user) {
      throw new Error('You must be authenticated to create a profile. Please verify your OTP first.');
    }
    
    const userId = authData.user.id;
    const phone = authData.user.phone || '';
    
    // Normalize city: lowercase, no spaces
    const normalizedCity = data.city.toLowerCase().replace(/\s+/g, '');
    
    // Insert new profile (no auto-trigger anymore)
    // Email uniqueness is enforced by the database constraint
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        mobile: phone,
        name: data.name,
        firm_name: data.firm_name,
        city: normalizedCity,
        email: data.email,
        role: 'broker',
      })
      .select()
      .single();
    
    if (profileError) {
      // Handle duplicate email error gracefully
      if (profileError.code === '23505' && profileError.message.includes('email')) {
        throw new Error('Email already registered');
      }
      // Handle duplicate profile (user already signed up)
      if (profileError.code === '23505' && profileError.message.includes('profiles_pkey')) {
        throw new Error('Profile already exists. Please sign in instead.');
      }
      throw new Error(profileError.message);
    }
    
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
   * Get profile by mobile
   */
  async getProfileByMobile(mobile: string): Promise<Profile | null> {
    const cleanMobile = mobile.replace(/\D/g, '');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('mobile', cleanMobile)
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

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },
};

// ============================================================================
// ORGANIZATION SERVICES
// ============================================================================

export const organizationService = {
  /**
   * Create organization (Pro brokers only)
   */
  async create(userId: string, name: string, maxEmployeeSeats: number = 0): Promise<Organization> {
    // Check if user is pro_broker
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (profile?.role !== 'pro_broker') {
      throw new Error('Only Pro Brokers can create organizations');
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
    
    const { data: org, error } = await supabase
      .from('organizations')
      .insert({
        name,
        owner_id: userId,
        max_employee_seats: maxEmployeeSeats,
      })
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    
    // Add owner as member
    await supabase.from('organization_members').insert({
      user_id: userId,
      organization_id: org.id,
      role: 'owner',
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
    planType: 'pro_broker_monthly' | 'pro_broker_annual',
    employeeSeats: number = 0
  ): Promise<Subscription> {
    // Get user's city
    const { data: profile } = await supabase
      .from('profiles')
      .select('city, role')
      .eq('id', userId)
      .single();
    
    if (profile?.role !== 'broker') {
      throw new Error('Only brokers can subscribe');
    }
    
    // Get pricing
    const pricing = await pricingService.getForCity(profile?.city || 'other_cities');
    
    // Calculate amount
    let amount = planType === 'pro_broker_monthly' 
      ? pricing.pro_broker_monthly 
      : pricing.pro_broker_annual;
    
    const durationDays = planType === 'pro_broker_monthly' ? 30 : 365;
    
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
    
    // Update user to Pro Broker
    await supabase
      .from('profiles')
      .update({
        is_pro_broker: true,
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
        .update({ is_pro_broker: false, subscription_status: 'expired' })
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
   * Get user's property count (not including sold ones)
   */
  async getUserPropertyCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_sold', false);
    
    if (error) throw new Error(error.message);
    return count || 0;
  },

  /**
   * Check if user can add more properties
   * Returns: { canAdd: boolean, currentCount: number, limit: number }
   */
  async checkPropertyLimit(userId: string): Promise<{
    canAdd: boolean;
    currentCount: number;
    limit: number;
    isProBroker: boolean;
  }> {
    // Get user's pro status
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro_broker')
      .eq('id', userId)
      .single();
    
    const isProBroker = profile?.is_pro_broker || false;
    
    // Pro brokers have unlimited properties
    if (isProBroker) {
      return { canAdd: true, currentCount: 0, limit: -1, isProBroker: true };
    }
    
    // Get free property limit from app_config
    const { data: config } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'free_broker_property_limit')
      .eq('is_active', true)
      .single();
    
    // Default to 3 if not configured
    const limit = config?.value?.limit ?? 3;
    
    // Get current property count
    const currentCount = await this.getUserPropertyCount(userId);
    
    return {
      canAdd: currentCount < limit,
      currentCount,
      limit,
      isProBroker: false,
    };
  },

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
        const floors = (property.floors as any[]).map((f: any) => 
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
   * Upload property video
   */
  async uploadPropertyVideo(userId: string, uri: string, propertyId?: string): Promise<string> {
    const fileName = `${userId}/${propertyId || 'temp'}/${Date.now()}.mp4`;
    
    const response = await fetch(uri);
    const blob = await response.blob();
    
    const { error } = await supabase.storage
      .from('property-videos')
      .upload(fileName, blob, {
        contentType: 'video/mp4',
      });
    
    if (error) throw new Error(error.message);
    
    const { data } = supabase.storage
      .from('property-videos')
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
// IN-APP MESSAGING SERVICES
// ============================================================================

export const messagingService = {
  /**
   * Get active in-app messages for user
   */
  async getActiveMessages(userId: string, userCity?: string, isPro?: boolean): Promise<InAppMessage[]> {
    const now = new Date().toISOString();
    
    // Get messages user hasn't dismissed (if show_once)
    const { data: dismissedIds } = await supabase
      .from('user_message_status')
      .select('message_id')
      .eq('user_id', userId)
      .not('dismissed_at', 'is', null);
    
    const dismissedMessageIds = dismissedIds?.map(d => d.message_id) || [];
    
    let query = supabase
      .from('in_app_messages')
      .select('*')
      .eq('is_active', true)
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('priority', { ascending: false });
    
    const { data: messages, error } = await query;
    
    if (error) throw new Error(error.message);
    
    // Filter messages based on targeting and dismiss status
    return (messages as InAppMessage[]).filter(msg => {
      // Check if dismissed (for show_once messages)
      if (msg.show_once && dismissedMessageIds.includes(msg.id)) {
        return false;
      }
      
      // Check targeting
      switch (msg.target_type) {
        case 'all':
          return true;
        case 'pro_only':
          return isPro === true;
        case 'non_pro':
          return isPro === false;
        case 'region':
          return msg.target_value?.cities?.includes(userCity?.toLowerCase());
        case 'user_ids':
          return msg.target_value?.user_ids?.includes(userId);
        case 'role':
          // Would need to pass role as param
          return true;
        default:
          return true;
      }
    });
  },

  /**
   * Mark message as seen
   */
  async markSeen(userId: string, messageId: string): Promise<void> {
    await supabase
      .from('user_message_status')
      .upsert({
        user_id: userId,
        message_id: messageId,
        seen_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,message_id',
      });
  },

  /**
   * Dismiss message
   */
  async dismiss(userId: string, messageId: string): Promise<void> {
    await supabase
      .from('user_message_status')
      .upsert({
        user_id: userId,
        message_id: messageId,
        dismissed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,message_id',
      });
  },

  /**
   * Track action click
   */
  async trackAction(userId: string, messageId: string): Promise<void> {
    await supabase
      .from('user_message_status')
      .upsert({
        user_id: userId,
        message_id: messageId,
        clicked_action: true,
      }, {
        onConflict: 'user_id,message_id',
      });
  },
};

// ============================================================================
// APP CONFIG SERVICES
// ============================================================================

export const configService = {
  /**
   * Get all active config
   */
  async getAll(): Promise<Record<string, any>> {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .eq('is_active', true);
    
    if (error) throw new Error(error.message);
    
    const config: Record<string, any> = {};
    data?.forEach(item => {
      config[item.key] = item.value;
    });
    
    return config;
  },

  /**
   * Get specific config
   */
  async get(key: string): Promise<any> {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .eq('is_active', true)
      .single();
    
    if (error) return null;
    return data?.value;
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
  messaging: messagingService,
  config: configService,
};
