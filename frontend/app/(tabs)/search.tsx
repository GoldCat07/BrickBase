import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import PropertyCard from '../../components/PropertyCard';
import WhatsAppShareModal from '../../components/WhatsAppShareModal';
import api from '../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_CONTENT_WIDTH = 600;

export default function SearchScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareProperty, setShareProperty] = useState<Property | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyCategory, setPropertyCategory] = useState<PropertyCategory | ''>('');
  const [selectedType, setSelectedType] = useState<PropertyType | ''>('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  const [ageType, setAgeType] = useState<AgeType | ''>('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [includeSold, setIncludeSold] = useState(false);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchProperties();
    }, [includeSold])
  );

  useEffect(() => {
    applyFilters();
  }, [minPrice, maxPrice, selectedType, searchQuery, properties, propertyCategory, caseType, ageType]);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (includeSold) params.append('include_sold', 'true');
      const response = await api.get(`/properties?${params.toString()}`);
      setProperties(response.data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProperties();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...properties];

    // Filter by property category
    if (propertyCategory) {
      filtered = filtered.filter(p => p.propertyCategory === propertyCategory);
    }

    // Filter by property type
    if (selectedType) {
      filtered = filtered.filter(p => p.propertyType === selectedType);
    }

    // Filter by case type
    if (caseType) {
      filtered = filtered.filter(p => p.case === caseType);
    }

    // Filter by age type
    if (ageType) {
      filtered = filtered.filter(p => p.ageType === ageType);
    }

    // Filter by price range
    if (minPrice) {
      filtered = filtered.filter(p => {
        // Check floors prices for multi-floor properties
        if (p.floors && p.floors.length > 0) {
          return p.floors.some(f => f.price >= parseFloat(minPrice));
        }
        return p.price && p.price >= parseFloat(minPrice);
      });
    }
    if (maxPrice) {
      filtered = filtered.filter(p => {
        if (p.floors && p.floors.length > 0) {
          return p.floors.some(f => f.price <= parseFloat(maxPrice));
        }
        return p.price && p.price <= parseFloat(maxPrice);
      });
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.propertyType?.toLowerCase().includes(query) ||
        p.propertyCategory?.toLowerCase().includes(query) ||
        p.price?.toString().includes(query) ||
        p.address?.city?.toLowerCase().includes(query) ||
        p.address?.sector?.toLowerCase().includes(query) ||
        p.builderName?.toLowerCase().includes(query)
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
    setMinPrice('');
    setMaxPrice('');
    setIncludeSold(false);
  };

  const hasActiveFilters = !!(searchQuery || propertyCategory || selectedType || caseType || ageType || minPrice || maxPrice || includeSold);

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
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 60 }
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
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

          {/* Clear Filters Button */}
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

            {/* Age Type */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Age Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipContainer}>
                  <TouchableOpacity
                    style={[styles.chip, !ageType && styles.chipSelected]}
                    onPress={() => setAgeType('')}
                  >
                    <Text style={[styles.chipText, !ageType && styles.chipTextSelected]}>All</Text>
                  </TouchableOpacity>
                  {AGE_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, ageType === type && styles.chipSelected]}
                      onPress={() => setAgeType(type)}
                    >
                      <Text style={[styles.chipText, ageType === type && styles.chipTextSelected]}>
                        {type === 'UnderConstruction' ? 'Under Construction' : type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Price Range */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Price Range (Lakhs)</Text>
              <View style={styles.priceContainer}>
                <View style={styles.priceInput}>
                  <TextInput
                    style={styles.input}
                    placeholder="Min"
                    placeholderTextColor="#666"
                    value={minPrice}
                    onChangeText={setMinPrice}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.priceSeparator}>-</Text>
                <View style={styles.priceInput}>
                  <TextInput
                    style={styles.input}
                    placeholder="Max"
                    placeholderTextColor="#666"
                    value={maxPrice}
                    onChangeText={setMaxPrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>
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

        {/* Results Count */}
        <Text style={styles.resultsCount}>
          {filteredProperties.length} {filteredProperties.length === 1 ? 'property' : 'properties'} found
        </Text>

        {/* Properties List */}
        {filteredProperties.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>No properties found</Text>
            <Text style={styles.emptySubtext}>
              Try adjusting your filters
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onPress={() => handlePropertyPress(property)}
                onShare={() => setShareProperty(property)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* WhatsApp Share Modal */}
      {shareProperty && (
        <WhatsAppShareModal
          visible={!!shareProperty}
          property={shareProperty}
          onClose={() => setShareProperty(null)}
        />
      )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
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
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceInput: {
    flex: 1,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
  },
  priceSeparator: {
    color: '#666',
    fontSize: 20,
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
  resultsCount: {
    color: '#999',
    fontSize: 14,
    padding: 16,
    paddingBottom: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    gap: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
});
