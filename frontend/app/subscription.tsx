import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { router } from 'expo-router';
import api from '../lib/api';

interface Pricing {
  city: string;
  pro_owner: {
    monthly: number;
    annual: number;
    annual_monthly: number;
    discount_percent: number;
  };
  employee_seats: {
    tier_1: { range: string; price_per_user: number };
    tier_2: { range: string; price_per_user: number };
    tier_3: { range: string; price_per_user: number };
  };
}

interface Subscription {
  id: string;
  plan_type: string;
  status: string;
  employee_seats: number;
  amount: number;
  start_date: string;
  end_date: string;
}

export default function SubscriptionScreen() {
  const { user, refreshUser } = useAuth();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [employeeSeats, setEmployeeSeats] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [pricingRes, subRes] = await Promise.all([
        api.get('/pricing'),
        api.get('/subscription'),
      ]);
      setPricing(pricingRes.data);
      setSubscription(subRes.data.subscription);
      if (subRes.data.subscription) {
        setEmployeeSeats(subRes.data.subscription.employee_seats || 0);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateEmployeePrice = () => {
    if (!pricing || employeeSeats === 0) return 0;
    
    if (employeeSeats <= 7) {
      return employeeSeats * pricing.employee_seats.tier_1.price_per_user;
    } else if (employeeSeats <= 14) {
      return employeeSeats * pricing.employee_seats.tier_2.price_per_user;
    } else {
      return employeeSeats * pricing.employee_seats.tier_3.price_per_user;
    }
  };

  const calculateTotal = () => {
    if (!pricing) return 0;
    const planPrice = selectedPlan === 'annual' 
      ? pricing.pro_owner.annual / 12 
      : pricing.pro_owner.monthly;
    return planPrice + calculateEmployeePrice();
  };

  const handleSubscribe = async () => {
    if (!pricing) return;

    const planType = selectedPlan === 'annual' ? 'pro_owner_annual' : 'pro_owner_monthly';
    const total = selectedPlan === 'annual' 
      ? pricing.pro_owner.annual + calculateEmployeePrice() * 12
      : pricing.pro_owner.monthly + calculateEmployeePrice();

    Alert.alert(
      'Confirm Subscription',
      `You will be charged \u20B9${total.toLocaleString()} for ${selectedPlan === 'annual' ? '12 months' : '1 month'}.\n\nThis is a mock payment for testing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Subscribe',
          onPress: async () => {
            setSubscribing(true);
            try {
              await api.post('/subscription/create', {
                plan_type: planType,
                employee_seats: employeeSeats,
              });
              
              Alert.alert('Success', 'Subscription activated successfully!');
              await refreshUser();
              await fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Subscription failed');
            } finally {
              setSubscribing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  // Already subscribed
  if (subscription && subscription.status === 'active') {
    const endDate = new Date(subscription.end_date);
    const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Current Plan */}
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanHeader}>
              <Ionicons name="star" size={32} color="#FFD700" />
              <Text style={styles.currentPlanTitle}>Pro Plan Active</Text>
            </View>
            
            <View style={styles.planDetails}>
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>Plan Type</Text>
                <Text style={styles.planDetailValue}>
                  {subscription.plan_type.includes('annual') ? 'Annual' : 'Monthly'}
                </Text>
              </View>
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>Employee Seats</Text>
                <Text style={styles.planDetailValue}>{subscription.employee_seats}</Text>
              </View>
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>Amount Paid</Text>
                <Text style={styles.planDetailValue}>\u20B9{subscription.amount.toLocaleString()}</Text>
              </View>
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>Expires On</Text>
                <Text style={styles.planDetailValue}>
                  {endDate.toLocaleDateString('en-IN', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: 'numeric' 
                  })}
                </Text>
              </View>
              <View style={styles.planDetailRow}>
                <Text style={styles.planDetailLabel}>Days Remaining</Text>
                <Text style={[styles.planDetailValue, { color: daysLeft < 7 ? '#ff4444' : '#4CAF50' }]}>
                  {daysLeft} days
                </Text>
              </View>
            </View>
          </View>

          {/* Add More Seats */}
          <View style={styles.addSeatsSection}>
            <Text style={styles.sectionTitle}>Need More Employee Seats?</Text>
            <Text style={styles.sectionSubtitle}>
              Add more seats to invite additional team members.
            </Text>
            
            <TouchableOpacity 
              style={styles.addSeatsButton}
              onPress={() => router.push('/subscription')}
            >
              <Ionicons name="add-circle" size={24} color="#000" />
              <Text style={styles.addSeatsButtonText}>Add Employee Seats</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Not subscribed - show plans
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="diamond" size={48} color="#FFD700" />
          <Text style={styles.headerTitle}>Go Pro</Text>
          <Text style={styles.headerSubtitle}>
            Unlock organization features and team collaboration
          </Text>
        </View>

        {/* Plan Selection */}
        <View style={styles.planSelection}>
          <TouchableOpacity
            style={[
              styles.planOption,
              selectedPlan === 'monthly' && styles.planOptionSelected,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <View style={styles.planOptionHeader}>
              <Text style={styles.planOptionTitle}>Monthly</Text>
            </View>
            <Text style={styles.planPrice}>
              \u20B9{pricing?.pro_owner.monthly.toLocaleString()}
            </Text>
            <Text style={styles.planPeriod}>per month</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.planOption,
              selectedPlan === 'annual' && styles.planOptionSelected,
            ]}
            onPress={() => setSelectedPlan('annual')}
          >
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>
                Save {pricing?.pro_owner.discount_percent}%
              </Text>
            </View>
            <View style={styles.planOptionHeader}>
              <Text style={styles.planOptionTitle}>Annual</Text>
              <Text style={styles.popularBadge}>Popular</Text>
            </View>
            <Text style={styles.planPrice}>
              \u20B9{pricing?.pro_owner.annual_monthly.toLocaleString()}
            </Text>
            <Text style={styles.planPeriod}>per month</Text>
            <Text style={styles.billedAnnually}>
              Billed \u20B9{pricing?.pro_owner.annual.toLocaleString()} annually
            </Text>
          </TouchableOpacity>
        </View>

        {/* Employee Seats */}
        <View style={styles.employeeSeatsSection}>
          <Text style={styles.sectionTitle}>Employee Seats (Optional)</Text>
          <Text style={styles.sectionSubtitle}>
            Add seats to invite team members to your organization
          </Text>

          <View style={styles.seatsControl}>
            <TouchableOpacity
              style={styles.seatsButton}
              onPress={() => setEmployeeSeats(Math.max(0, employeeSeats - 1))}
            >
              <Ionicons name="remove" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.seatsValue}>
              <Text style={styles.seatsNumber}>{employeeSeats}</Text>
              <Text style={styles.seatsLabel}>seats</Text>
            </View>
            <TouchableOpacity
              style={styles.seatsButton}
              onPress={() => setEmployeeSeats(employeeSeats + 1)}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Pricing Tiers */}
          <View style={styles.pricingTiers}>
            <View style={[
              styles.tierItem,
              employeeSeats >= 1 && employeeSeats <= 7 && styles.tierItemActive
            ]}>
              <Text style={styles.tierRange}>1-7 employees</Text>
              <Text style={styles.tierPrice}>
                \u20B9{pricing?.employee_seats.tier_1.price_per_user}/user
              </Text>
            </View>
            <View style={[
              styles.tierItem,
              employeeSeats >= 8 && employeeSeats <= 14 && styles.tierItemActive
            ]}>
              <Text style={styles.tierRange}>8-14 employees</Text>
              <Text style={styles.tierPrice}>
                \u20B9{pricing?.employee_seats.tier_2.price_per_user}/user
              </Text>
            </View>
            <View style={[
              styles.tierItem,
              employeeSeats >= 15 && styles.tierItemActive
            ]}>
              <Text style={styles.tierRange}>15+ employees</Text>
              <Text style={styles.tierPrice}>
                \u20B9{pricing?.employee_seats.tier_3.price_per_user}/user
              </Text>
            </View>
          </View>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What's Included</Text>
          {[
            'Create and manage organizations',
            'Invite unlimited team members',
            'Share properties across team',
            'Real-time collaboration',
            'Priority support',
            'Advanced analytics',
          ].map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Pro Plan ({selectedPlan})</Text>
            <Text style={styles.totalValue}>
              \u20B9{selectedPlan === 'annual' 
                ? pricing?.pro_owner.annual_monthly.toLocaleString()
                : pricing?.pro_owner.monthly.toLocaleString()}
            </Text>
          </View>
          {employeeSeats > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Employee Seats ({employeeSeats})</Text>
              <Text style={styles.totalValue}>\u20B9{calculateEmployeePrice().toLocaleString()}</Text>
            </View>
          )}
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total/month</Text>
            <Text style={styles.grandTotalValue}>\u20B9{calculateTotal().toLocaleString()}</Text>
          </View>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, subscribing && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={subscribing}
        >
          {subscribing ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="card" size={24} color="#000" />
              <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.mockNotice}>
          This is a mock payment for testing. Real Razorpay integration coming soon.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  planSelection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  planOption: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planOptionSelected: {
    borderColor: '#FFD700',
  },
  planOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  planOptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  popularBadge: {
    backgroundColor: '#FFD700',
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  planPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  planPeriod: {
    fontSize: 14,
    color: '#999',
  },
  billedAnnually: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  employeeSeatsSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 20,
  },
  seatsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
  },
  seatsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seatsValue: {
    alignItems: 'center',
  },
  seatsNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  seatsLabel: {
    fontSize: 14,
    color: '#999',
  },
  pricingTiers: {
    gap: 8,
  },
  tierItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#0c0c0c',
    borderRadius: 8,
  },
  tierItemActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  tierRange: {
    color: '#999',
    fontSize: 14,
  },
  tierPrice: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  featuresSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  featureText: {
    color: '#fff',
    fontSize: 15,
  },
  totalSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  totalLabel: {
    color: '#999',
    fontSize: 15,
  },
  totalValue: {
    color: '#fff',
    fontSize: 15,
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
  },
  grandTotalLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  grandTotalValue: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    borderRadius: 16,
    padding: 18,
    gap: 8,
    marginBottom: 16,
  },
  subscribeButtonDisabled: {
    opacity: 0.7,
  },
  subscribeButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  mockNotice: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  currentPlanCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  currentPlanTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  planDetails: {
    gap: 12,
  },
  planDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planDetailLabel: {
    color: '#999',
    fontSize: 15,
  },
  planDetailValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  addSeatsSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
  },
  addSeatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 16,
  },
  addSeatsButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
