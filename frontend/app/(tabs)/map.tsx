import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import {
  Property,
  PropertyCategory,
  PropertyType,
  RESIDENTIAL_PROPERTY_TYPES,
  COMMERCIAL_PROPERTY_TYPES,
} from '../../types/property';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';
import {
  getCachedProperties,
  cacheProperties,
  shouldRefreshCache,
  resetRefreshFlag,
} from '../../lib/cache';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyCategory, setPropertyCategory] = useState<PropertyCategory | ''>('');
  const [selectedType, setSelectedType] = useState<PropertyType | ''>('');
  const [includeSold, setIncludeSold] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPropertiesWithCache();
    }, [includeSold])
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      getCurrentLocation();
    }
  }, []);

  useEffect(() => {
    applyFilters();
  }, [properties, propertyCategory, selectedType, searchQuery]);

  const loadPropertiesWithCache = async () => {
    const cached = await getCachedProperties();
    if (cached && cached.length > 0) {
      const withLocation = cached.filter((p: Property) => p.latitude && p.longitude);
      setProperties(withLocation);
      setLoading(false);
      setInitialLoadDone(true);
      
      if (shouldRefreshCache()) {
        fetchPropertiesInBackground();
      }
    } else {
      await fetchProperties();
    }
  };

  const fetchPropertiesInBackground = async () => {
    try {
      const params = new URLSearchParams();
      if (includeSold) params.append('include_sold', 'true');
      const response = await api.get(`/properties?${params.toString()}`);
      
      const allProperties = response.data || [];
      const withLocation = allProperties.filter((p: Property) => p.latitude && p.longitude);
      
      await cacheProperties(allProperties);
      resetRefreshFlag();
      
      setProperties(withLocation);
    } catch (error) {
      console.error('Background fetch error:', error);
    }
  };

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (includeSold) params.append('include_sold', 'true');
      const response = await api.get(`/properties?${params.toString()}`);
      
      const allProperties = response.data || [];
      const withLocation = allProperties.filter((p: Property) => p.latitude && p.longitude);
      
      await cacheProperties(allProperties);
      resetRefreshFlag();
      
      setProperties(withLocation);
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...properties];
    if (propertyCategory) {
      filtered = filtered.filter(p => p.propertyCategory === propertyCategory);
    }
    if (selectedType) {
      filtered = filtered.filter(p => p.propertyType === selectedType);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.propertyType?.toLowerCase().includes(query) ||
        p.propertyCategory?.toLowerCase().includes(query) ||
        p.address?.city?.toLowerCase().includes(query) ||
        p.address?.sector?.toLowerCase().includes(query)
      );
    }
    setFilteredProperties(filtered);
  };

  const formatPrice = (property: Property) => {
    if (property.floors && property.floors.length > 0) {
      const minPrice = Math.min(...property.floors.map(f => f.price));
      const maxPrice = Math.max(...property.floors.map(f => f.price));
      const unit = property.floors[0].priceUnit === 'cr' ? 'Cr' : 
                   property.floors[0].priceUnit === 'lakh_per_month' ? 'L/mo' : 'L';
      if (minPrice === maxPrice) {
        return `₹${minPrice.toFixed(1)}${unit}`;
      }
      return `₹${minPrice.toFixed(0)}-${maxPrice.toFixed(0)}${unit}`;
    }
    if (!property.price) return 'N/A';
    if (property.priceUnit === 'cr') {
      return `₹${property.price}Cr`;
    }
    if (property.priceUnit === 'lakh_per_month') {
      return `₹${property.price}L/mo`;
    }
    return `₹${property.price}L`;
  };

  const handlePropertyPress = (property: Property) => {
    router.push({
      pathname: '/property-details',
      params: { propertyId: property.id },
    });
  };

  if (loading && !initialLoadDone) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Web and native share the same list view for now
  // Native map support requires development build
  return (
    <View style={styles.container}>
      <View style={[styles.searchOverlay, { top: insets.top + 8 }]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search properties..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <ScrollView 
        style={{ flex: 1, marginTop: insets.top + 60 }} 
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
      >
        <View style={styles.webFallback}>
          <Ionicons name="map" size={48} color="#4CAF50" />
          <Text style={styles.webFallbackTitle}>Location View</Text>
          <Text style={styles.webFallbackText}>
            {Platform.OS === 'web' 
              ? 'Open on Expo Go for interactive map'
              : 'Properties with location data'}
          </Text>
        </View>
        
        <Text style={styles.sectionTitle}>
          Properties ({filteredProperties.length})
        </Text>
        
        {filteredProperties.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color="#666" />
            <Text style={styles.emptyText}>No properties with location data</Text>
            <Text style={styles.emptySubtext}>Add location when creating properties</Text>
          </View>
        ) : (
          filteredProperties.map((property) => (
            <TouchableOpacity 
              key={property.id}
              style={styles.propertyCard}
              onPress={() => handlePropertyPress(property)}
            >
              {property.propertyPhotos?.[0] ? (
                <Image source={{ uri: property.propertyPhotos[0] }} style={styles.cardImage} />
              ) : (
                <View style={[styles.cardImage, styles.placeholderImage]}>
                  <Ionicons name="home" size={32} color="#666" />
                </View>
              )}
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardType}>{property.propertyType || 'Property'}</Text>
                  {property.isSold && (
                    <View style={styles.soldBadge}>
                      <Text style={styles.soldBadgeText}>SOLD</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardPrice}>{formatPrice(property)}</Text>
                {property.address?.sector && (
                  <Text style={styles.cardAddress}>
                    {property.address.sector}
                    {property.address.city ? `, ${property.address.city}` : ''}
                  </Text>
                )}
                <View style={styles.locationRow}>
                  <Ionicons name="location" size={12} color="#4CAF50" />
                  <Text style={styles.locationText}>
                    {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" style={{ alignSelf: 'center' }} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0c0c0c' 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#0c0c0c' 
  },
  loadingText: { 
    color: '#fff', 
    marginTop: 12, 
    fontSize: 16 
  },
  searchOverlay: { 
    position: 'absolute', 
    left: 16, 
    right: 16, 
    zIndex: 1 
  },
  searchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1a1a1a', 
    borderRadius: 12, 
    padding: 12, 
    gap: 10, 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  searchInput: { 
    flex: 1, 
    color: '#fff', 
    fontSize: 16 
  },
  webFallback: { 
    alignItems: 'center', 
    backgroundColor: '#1a1a1a', 
    borderRadius: 16, 
    padding: 24,
    marginBottom: 24,
  },
  webFallbackTitle: { 
    color: '#fff', 
    fontSize: 20, 
    fontWeight: 'bold', 
    marginTop: 12 
  },
  webFallbackText: { 
    color: '#999', 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  propertyCard: { 
    backgroundColor: '#1a1a1a', 
    borderRadius: 16, 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: '#333', 
    flexDirection: 'row', 
    marginBottom: 12,
    padding: 12,
  },
  cardImage: { 
    width: 80, 
    height: 80, 
    borderRadius: 12,
    backgroundColor: '#333' 
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: { 
    flex: 1, 
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  cardType: { 
    color: '#999', 
    fontSize: 12 
  },
  soldBadge: { 
    backgroundColor: '#ff4444', 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4 
  },
  soldBadgeText: { 
    color: '#fff', 
    fontSize: 10, 
    fontWeight: 'bold' 
  },
  cardPrice: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginTop: 4 
  },
  cardAddress: { 
    color: '#666', 
    fontSize: 12, 
    marginTop: 4 
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    color: '#4CAF50',
    fontSize: 11,
  },
});
