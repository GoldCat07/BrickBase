import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

// Conditionally import react-native-maps only on native platforms
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}
import { useAuth } from '../../contexts/AuthContext';
import {
  Property,
  PropertyCategory,
  PropertyType,
  CaseType,
  AgeType,
  RESIDENTIAL_PROPERTY_TYPES,
  COMMERCIAL_PROPERTY_TYPES,
  CASE_TYPES,
  AGE_TYPES,
} from '../../types/property';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';

const { width, height } = Dimensions.get('window');

const GOOGLE_MAPS_API_KEY = 'AIzaSyC46BsGdP0YtuAuxdlgP8rTni1vwmy4oDA';

export default function MapScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyCategory, setPropertyCategory] = useState<PropertyCategory | ''>('');
  const [selectedType, setSelectedType] = useState<PropertyType | ''>('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  const [ageType, setAgeType] = useState<AgeType | ''>('');
  const [includeSold, setIncludeSold] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchProperties();
    }, [includeSold])
  );

  useEffect(() => {
    getCurrentLocation();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [properties, propertyCategory, selectedType, caseType, ageType, searchQuery]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
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

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (includeSold) params.append('include_sold', 'true');
      const response = await api.get(`/properties?${params.toString()}`);
      
      const propertiesWithLocation = (response.data || []).filter(
        (p: Property) => p.latitude && p.longitude
      );
      
      setProperties(propertiesWithLocation);
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
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

    if (caseType) {
      filtered = filtered.filter(p => p.case === caseType);
    }

    if (ageType) {
      filtered = filtered.filter(p => p.ageType === ageType);
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

  const clearFilters = () => {
    setSearchQuery('');
    setPropertyCategory('');
    setSelectedType('');
    setCaseType('');
    setAgeType('');
    setIncludeSold(false);
  };

  const hasActiveFilters = !!(searchQuery || propertyCategory || selectedType || caseType || ageType || includeSold);

  const formatPrice = (property: Property) => {
    if (property.floors && property.floors.length > 0) {
      const minPrice = Math.min(...property.floors.map(f => f.price));
      const maxPrice = Math.max(...property.floors.map(f => f.price));
      if (minPrice === maxPrice) {
        return `₹${minPrice.toFixed(1)}L`;
      }
      return `₹${minPrice.toFixed(0)}-${maxPrice.toFixed(0)}L`;
    }
    if (!property.price) return 'Price N/A';
    if (property.priceUnit === 'cr') {
      return `₹${property.price.toFixed(2)} Cr`;
    }
    if (property.priceUnit === 'lakh_per_month') {
      return `₹${property.price.toFixed(1)}L/mo`;
    }
    return `₹${property.price.toFixed(1)}L`;
  };

  const handlePropertyPress = (property: Property) => {
    router.push({
      pathname: '/property-details',
      params: { propertyId: property.id },
    });
  };

  const goToUserLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  const getPropertyTypes = (): PropertyType[] => {
    if (propertyCategory === 'Residential') {
      return RESIDENTIAL_PROPERTY_TYPES;
    } else if (propertyCategory === 'Commercial') {
      return COMMERCIAL_PROPERTY_TYPES;
    }
    return [...RESIDENTIAL_PROPERTY_TYPES, ...COMMERCIAL_PROPERTY_TYPES];
  };

  const getInitialRegion = () => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Default to India (Delhi area)
    return {
      latitude: 28.6139,
      longitude: 77.209,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  // Web fallback
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webFallback}>
          <Ionicons name="map" size={64} color="#666" />
          <Text style={styles.webFallbackTitle}>Map View</Text>
          <Text style={styles.webFallbackText}>
            Interactive map is available on mobile devices via Expo Go
          </Text>
          <Text style={styles.propertyCount}>
            {filteredProperties.length} properties with location data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={getInitialRegion()}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        mapType="standard"
      >
        {filteredProperties.map((property) => (
          <Marker
            key={property.id}
            coordinate={{
              latitude: property.latitude!,
              longitude: property.longitude!,
            }}
            onPress={() => setSelectedProperty(property)}
          >
            {/* Custom Marker View */}
            <View style={[
              styles.markerContainer,
              property.isSold && styles.markerSold
            ]}>
              <Text style={styles.markerPrice}>{formatPrice(property)}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating Search & Filters */}
      <View style={[styles.searchOverlay, { top: insets.top + 8 }]}>
        <TouchableOpacity 
          style={styles.searchBar}
          onPress={() => setShowFilters(!showFilters)}
          activeOpacity={0.8}
        >
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search on map..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setShowFilters(true)}
          />
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)}>
            <Ionicons 
              name={showFilters ? "chevron-up" : "options-outline"} 
              size={22} 
              color="#fff" 
            />
          </TouchableOpacity>
        </TouchableOpacity>

        {hasActiveFilters && (
          <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
            <Ionicons name="close-circle" size={14} color="#ff4444" />
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded Filters */}
      {showFilters && (
        <View style={[styles.filtersOverlay, { top: insets.top + 70 }]}>
          <ScrollView 
            style={styles.filtersScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Property Category */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipContainer}>
                  <TouchableOpacity
                    style={[styles.chip, !propertyCategory && styles.chipSelected]}
                    onPress={() => {
                      setPropertyCategory('');
                      setSelectedType('');
                    }}
                  >
                    <Text style={[styles.chipText, !propertyCategory && styles.chipTextSelected]}>All</Text>
                  </TouchableOpacity>
                  {(['Residential', 'Commercial'] as PropertyCategory[]).map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, propertyCategory === cat && styles.chipSelected]}
                      onPress={() => {
                        setPropertyCategory(cat);
                        setSelectedType('');
                      }}
                    >
                      <Text style={[styles.chipText, propertyCategory === cat && styles.chipTextSelected]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Property Type */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipContainer}>
                  <TouchableOpacity
                    style={[styles.chip, !selectedType && styles.chipSelected]}
                    onPress={() => setSelectedType('')}
                  >
                    <Text style={[styles.chipText, !selectedType && styles.chipTextSelected]}>All</Text>
                  </TouchableOpacity>
                  {getPropertyTypes().map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, selectedType === type && styles.chipSelected]}
                      onPress={() => setSelectedType(type)}
                    >
                      <Text style={[styles.chipText, selectedType === type && styles.chipTextSelected]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Case Type */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Case</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipContainer}>
                  <TouchableOpacity
                    style={[styles.chip, !caseType && styles.chipSelected]}
                    onPress={() => setCaseType('')}
                  >
                    <Text style={[styles.chipText, !caseType && styles.chipTextSelected]}>All</Text>
                  </TouchableOpacity>
                  {CASE_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, caseType === type && styles.chipSelected]}
                      onPress={() => setCaseType(type)}
                    >
                      <Text style={[styles.chipText, caseType === type && styles.chipTextSelected]}>
                        {type.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Include Sold */}
            <TouchableOpacity 
              style={styles.soldToggle}
              onPress={() => setIncludeSold(!includeSold)}
            >
              <Ionicons 
                name={includeSold ? 'checkbox' : 'square-outline'} 
                size={20} 
                color="#fff" 
              />
              <Text style={styles.soldToggleText}>Show Sold</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* My Location Button */}
      <TouchableOpacity 
        style={[styles.myLocationButton, { bottom: insets.bottom + 180 }]}
        onPress={goToUserLocation}
      >
        <Ionicons name="locate" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Property Count */}
      <View style={[styles.propertyCountBadge, { bottom: insets.bottom + 130 }]}>
        <Text style={styles.propertyCountText}>
          {filteredProperties.length} properties
        </Text>
      </View>

      {/* Selected Property Card */}
      {selectedProperty && (
        <TouchableOpacity 
          style={[styles.propertyCard, { bottom: insets.bottom + 20 }]}
          onPress={() => handlePropertyPress(selectedProperty)}
          activeOpacity={0.9}
        >
          <TouchableOpacity 
            style={styles.cardClose}
            onPress={() => setSelectedProperty(null)}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          
          {selectedProperty.propertyPhotos?.[0] && (
            <Image 
              source={{ uri: selectedProperty.propertyPhotos[0] }} 
              style={styles.cardImage}
            />
          )}
          
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardType}>{selectedProperty.propertyType}</Text>
              {selectedProperty.isSold && (
                <View style={styles.soldBadge}>
                  <Text style={styles.soldBadgeText}>SOLD</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardPrice}>{formatPrice(selectedProperty)}</Text>
            {selectedProperty.address?.sector && (
              <Text style={styles.cardAddress}>
                {selectedProperty.address.sector}
                {selectedProperty.address.city ? `, ${selectedProperty.address.city}` : ''}
              </Text>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.cardViewMore}>Tap to view details</Text>
              <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
            </View>
          </View>
        </TouchableOpacity>
      )}
    </View>
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
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  map: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  webFallbackTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  webFallbackText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  propertyCount: {
    color: '#4CAF50',
    fontSize: 14,
    marginTop: 16,
  },
  // Marker styles
  markerContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerSold: {
    backgroundColor: '#ff4444',
    borderColor: '#ff4444',
  },
  markerPrice: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Search overlay
  searchOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    padding: 6,
    marginTop: 4,
    backgroundColor: 'rgba(26, 26, 26, 0.9)',
    borderRadius: 12,
  },
  clearButtonText: {
    color: '#ff4444',
    fontSize: 12,
  },
  // Filters overlay
  filtersOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderRadius: 12,
    padding: 12,
    maxHeight: 250,
    zIndex: 1,
  },
  filtersScroll: {
    maxHeight: 230,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    color: '#999',
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '600',
  },
  chipContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
  },
  chipTextSelected: {
    color: '#000',
    fontWeight: '600',
  },
  soldToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  soldToggleText: {
    color: '#fff',
    fontSize: 12,
  },
  // My Location Button
  myLocationButton: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#1a1a1a',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  // Property count badge
  propertyCountBadge: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(26, 26, 26, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  propertyCountText: {
    color: '#fff',
    fontSize: 12,
  },
  // Property Card
  propertyCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 10,
  },
  cardClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 4,
    zIndex: 1,
  },
  cardImage: {
    width: 120,
    height: 110,
    backgroundColor: '#333',
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardType: {
    color: '#999',
    fontSize: 12,
  },
  soldBadge: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  soldBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardPrice: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  cardAddress: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  cardViewMore: {
    color: '#4CAF50',
    fontSize: 12,
  },
});
