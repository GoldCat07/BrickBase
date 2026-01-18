import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
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

export default function MapScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
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

  const getPropertyTypes = (): PropertyType[] => {
    if (propertyCategory === 'Residential') {
      return RESIDENTIAL_PROPERTY_TYPES;
    } else if (propertyCategory === 'Commercial') {
      return COMMERCIAL_PROPERTY_TYPES;
    }
    return [...RESIDENTIAL_PROPERTY_TYPES, ...COMMERCIAL_PROPERTY_TYPES];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  // Always show web fallback - Native maps only work on Expo Go
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 80 }}
      >
        {/* Search Bar */}
        <View style={styles.searchSection}>
          <TouchableOpacity 
            style={styles.searchBar}
            onPress={() => setShowFilters(!showFilters)}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search properties..."
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
              <Ionicons name="close-circle" size={16} color="#ff4444" />
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Expanded Filters */}
        {showFilters && (
          <View style={styles.filtersContainer}>
            {/* Property Category */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Property Category</Text>
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
              <Text style={styles.filterLabel}>Property Type</Text>
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
              <Text style={styles.filterLabel}>Case Type</Text>
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
                size={24} 
                color="#fff" 
              />
              <Text style={styles.soldToggleText}>Include Sold Properties</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map Info Section */}
        <View style={styles.mapInfoSection}>
          <View style={styles.mapIconContainer}>
            <Ionicons name="map" size={64} color="#4CAF50" />
          </View>
          <Text style={styles.mapTitle}>Map View</Text>
          <Text style={styles.mapDescription}>
            Interactive map with property markers is available on mobile devices via Expo Go app.
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{filteredProperties.length}</Text>
              <Text style={styles.statLabel}>Properties</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {filteredProperties.filter(p => p.latitude && p.longitude).length}
              </Text>
              <Text style={styles.statLabel}>With Location</Text>
            </View>
          </View>
        </View>

        {/* Property List View as Alternative */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Properties with Location Data</Text>
          {filteredProperties.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="location-outline" size={48} color="#666" />
              <Text style={styles.emptyText}>No properties found</Text>
            </View>
          ) : (
            filteredProperties.map((property) => (
              <TouchableOpacity
                key={property.id}
                style={styles.propertyItem}
                onPress={() => handlePropertyPress(property)}
              >
                {property.propertyPhotos?.[0] && (
                  <Image 
                    source={{ uri: property.propertyPhotos[0] }} 
                    style={styles.propertyImage}
                  />
                )}
                <View style={styles.propertyContent}>
                  <View style={styles.propertyHeader}>
                    <Text style={styles.propertyType}>{property.propertyType}</Text>
                    {property.isSold && (
                      <View style={styles.soldBadge}>
                        <Text style={styles.soldBadgeText}>SOLD</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.propertyPrice}>{formatPrice(property)}</Text>
                  {property.address?.sector && (
                    <Text style={styles.propertyAddress}>
                      {property.address.sector}
                      {property.address.city ? `, ${property.address.city}` : ''}
                    </Text>
                  )}
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color="#4CAF50" />
                    <Text style={styles.coordinates}>
                      {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </TouchableOpacity>
            ))
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
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  searchSection: {
    padding: 16,
    paddingBottom: 8,
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
    padding: 8,
    marginTop: 4,
  },
  clearButtonText: {
    color: '#ff4444',
    fontSize: 14,
  },
  filtersContainer: {
    backgroundColor: '#0c0c0c',
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  chipContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#000',
    fontWeight: '600',
  },
  soldToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  soldToggleText: {
    color: '#fff',
    fontSize: 14,
  },
  mapInfoSection: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#1a1a1a',
    margin: 16,
    borderRadius: 16,
  },
  mapIconContainer: {
    marginBottom: 16,
  },
  mapTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  mapDescription: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 48,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#4CAF50',
    fontSize: 32,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    fontSize: 12,
  },
  listSection: {
    padding: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#666',
    marginTop: 12,
  },
  propertyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  propertyImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  propertyContent: {
    flex: 1,
  },
  propertyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  propertyType: {
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
  propertyPrice: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  propertyAddress: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coordinates: {
    color: '#4CAF50',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
