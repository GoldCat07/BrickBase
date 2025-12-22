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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { Property, PropertyType } from '../../types/property';
import { router, useFocusEffect } from 'expo-router';
import PropertyCard from '../../components/PropertyCard';
import WhatsAppShareModal from '../../components/WhatsAppShareModal';
import api from '../../lib/api';

const PROPERTY_TYPES: PropertyType[] = ['Plot', 'Builder Floor', 'Villa/House', 'Apartment Society'];

export default function SearchScreen() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareProperty, setShareProperty] = useState<Property | null>(null);
  
  // Filters
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedType, setSelectedType] = useState<PropertyType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Refresh on screen focus (handles refresh after delete)
  useFocusEffect(
    useCallback(() => {
      fetchProperties();
    }, [])
  );

  useEffect(() => {
    applyFilters();
  }, [minPrice, maxPrice, selectedType, searchQuery, properties]);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const response = await api.get('/properties');
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

    // Filter by price range
    if (minPrice) {
      filtered = filtered.filter(p => p.price && p.price >= parseFloat(minPrice));
    }
    if (maxPrice) {
      filtered = filtered.filter(p => p.price && p.price <= parseFloat(maxPrice));
    }

    // Filter by property type
    if (selectedType) {
      filtered = filtered.filter(p => p.propertyType === selectedType);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(p => 
        p.propertyType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.price?.toString().includes(searchQuery)
      );
    }

    setFilteredProperties(filtered);
  };

  const clearFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setSelectedType('');
    setSearchQuery('');
  };

  const handlePropertyPress = (property: Property) => {
    router.push({
      pathname: '/property-details',
      params: { propertyId: property.id },
    });
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
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        {/* Filters Section */}
        <View style={styles.filterSection}>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search properties..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Property Type Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipContainer}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  !selectedType && styles.chipSelected,
                ]}
                onPress={() => setSelectedType('')}
              >
                <Text
                  style={[
                    styles.chipText,
                    !selectedType && styles.chipTextSelected,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {PROPERTY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.chip,
                    selectedType === type && styles.chipSelected,
                  ]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedType === type && styles.chipTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Price Range - with bottom margin */}
          <View style={styles.priceContainer}>
            <View style={styles.priceInput}>
              <Text style={styles.priceLabel}>Min Price</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#666"
                value={minPrice}
                onChangeText={setMinPrice}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.priceSeparator}>-</Text>
            <View style={styles.priceInput}>
              <Text style={styles.priceLabel}>Max Price</Text>
              <TextInput
                style={styles.input}
                placeholder="Any"
                placeholderTextColor="#666"
                value={maxPrice}
                onChangeText={setMaxPrice}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Clear Filters */}
          {(minPrice || maxPrice || selectedType || searchQuery) && (
            <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>

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
  filterSection: {
    backgroundColor: '#0c0c0c',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  priceInput: {
    flex: 1,
  },
  priceLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
  },
  priceSeparator: {
    color: '#666',
    fontSize: 20,
    marginBottom: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  chipText: {
    color: '#fff',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#000',
    fontWeight: '600',
  },
  clearButton: {
    alignSelf: 'flex-start',
    padding: 8,
  },
  clearButtonText: {
    color: '#ff4444',
    fontSize: 14,
  },
  resultsCount: {
    color: '#999',
    fontSize: 14,
    padding: 16,
    paddingBottom: 8,
  },
  listContainer: {
    padding: 16,
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
