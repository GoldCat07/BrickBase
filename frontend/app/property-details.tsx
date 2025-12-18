import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Property } from '../types/property';
import api from '../lib/api';

const { width } = Dimensions.get('window');

export default function PropertyDetailsScreen() {
  const { propertyId } = useLocalSearchParams();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (propertyId) {
      fetchPropertyDetails();
    }
  }, [propertyId]);

  const fetchPropertyDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/properties/${propertyId}`);
      setProperty(response.data);
    } catch (error) {
      console.error('Error fetching property:', error);
      Alert.alert('Error', 'Failed to load property details');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Property',
      'Are you sure you want to delete this property?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('Property')
                .delete()
                .eq('id', propertyId);

              if (error) throw error;

              Alert.alert('Success', 'Property deleted successfully');
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete property');
            }
          },
        },
      ]
    );
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'Not specified';
    return `₹${(price / 100000).toFixed(2)} Lakhs`;
  };

  const formatDate = (date?: string) => {
    if (!date) return 'Not specified';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Property not found</Text>
      </View>
    );
  }

  const features = [];
  if (property.clubProperty) features.push({ icon: 'fitness', text: 'Club' });
  if (property.poolProperty) features.push({ icon: 'water', text: 'Pool' });
  if (property.parkProperty) features.push({ icon: 'leaf', text: 'Park' });
  if (property.gatedProperty) features.push({ icon: 'lock-closed', text: 'Gated' });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Image Gallery */}
        {property.propertyPhotos && property.propertyPhotos.length > 0 && (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(event) => {
                const index = Math.round(
                  event.nativeEvent.contentOffset.x / width
                );
                setCurrentImageIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {property.propertyPhotos.map((photo, index) => (
                <Image
                  key={index}
                  source={{ uri: photo }}
                  style={styles.image}
                />
              ))}
            </ScrollView>
            {property.propertyPhotos.length > 1 && (
              <View style={styles.pagination}>
                {property.propertyPhotos.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      currentImageIndex === index && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Property Details */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.propertyType}>
                {property.propertyType || 'Property'}
              </Text>
              <Text style={styles.price}>{formatPrice(property.price)}</Text>
            </View>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={24} color="#ff4444" />
            </TouchableOpacity>
          </View>

          {/* Features */}
          {features.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Features</Text>
              <View style={styles.featuresGrid}>
                {features.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Ionicons name={feature.icon as any} size={24} color="#fff" />
                    <Text style={styles.featureText}>{feature.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Details Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailsGrid}>
              {property.floor && (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Floor</Text>
                  <Text style={styles.detailValue}>{property.floor}</Text>
                </View>
              )}
              {property.propertyAge && (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Property Age</Text>
                  <Text style={styles.detailValue}>{property.propertyAge} years</Text>
                </View>
              )}
              {property.case && (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Case Type</Text>
                  <Text style={styles.detailValue}>
                    {property.case.replace('_', ' ')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Payment Details */}
          {(property.black || property.white) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Details</Text>
              <View style={styles.paymentGrid}>
                {property.black && (
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>Black Amount</Text>
                    <Text style={styles.paymentValue}>
                      {formatPrice(property.black)}
                    </Text>
                    {property.blackPercentage && (
                      <Text style={styles.paymentPercentage}>
                        {property.blackPercentage.toFixed(1)}%
                      </Text>
                    )}
                  </View>
                )}
                {property.white && (
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>White Amount</Text>
                    <Text style={styles.paymentValue}>
                      {formatPrice(property.white)}
                    </Text>
                    {property.whitePercentage && (
                      <Text style={styles.paymentPercentage}>
                        {property.whitePercentage.toFixed(1)}%
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Dates */}
          {(property.possessionDate || property.handoverDate) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Important Dates</Text>
              {property.possessionDate && (
                <View style={styles.dateItem}>
                  <Ionicons name="calendar-outline" size={20} color="#999" />
                  <View>
                    <Text style={styles.dateLabel}>Possession Date</Text>
                    <Text style={styles.dateValue}>
                      {formatDate(property.possessionDate)}
                    </Text>
                  </View>
                </View>
              )}
              {property.handoverDate && (
                <View style={styles.dateItem}>
                  <Ionicons name="calendar-outline" size={20} color="#999" />
                  <View>
                    <Text style={styles.dateLabel}>Handover Date</Text>
                    <Text style={styles.dateValue}>
                      {formatDate(property.handoverDate)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Location */}
          {property.latitude && property.longitude && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>
              <View style={styles.locationItem}>
                <Ionicons name="location" size={20} color="#4CAF50" />
                <Text style={styles.locationText}>
                  {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                </Text>
              </View>
            </View>
          )}
        </View>
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
    backgroundColor: '#0c0c0c',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  image: {
    width: width,
    height: 300,
    backgroundColor: '#333',
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  propertyType: {
    color: '#999',
    fontSize: 16,
    marginBottom: 4,
  },
  price: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  deleteButton: {
    padding: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  featureText: {
    color: '#fff',
    fontSize: 16,
  },
  detailsGrid: {
    gap: 12,
  },
  detailItem: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: '#999',
    fontSize: 14,
  },
  detailValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  paymentGrid: {
    gap: 12,
  },
  paymentItem: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
  },
  paymentLabel: {
    color: '#999',
    fontSize: 14,
    marginBottom: 4,
  },
  paymentValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  paymentPercentage: {
    color: '#4CAF50',
    fontSize: 14,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateLabel: {
    color: '#999',
    fontSize: 14,
  },
  dateValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
  },
  locationText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});
