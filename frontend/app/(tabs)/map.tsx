import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Property } from '../../types/property';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const response = await api.get('/properties');
      
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

  const formatPrice = (price?: number) => {
    if (!price) return 'Price not set';
    return `₹${(price / 100000).toFixed(2)}L`;
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

  // Web/Mobile fallback - show list view instead
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="map-outline" size={32} color="#fff" />
          <Text style={styles.headerTitle}>Properties with Location</Text>
          <Text style={styles.headerSubtitle}>
            Map view is available on mobile devices
          </Text>
        </View>

        {properties.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>No properties with location data</Text>
            <Text style={styles.emptySubtext}>
              Add properties with location-tagged photos
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {properties.map((property) => (
              <TouchableOpacity
                key={property.id}
                style={styles.propertyCard}
                onPress={() => handlePropertyPress(property)}
              >
                {property.propertyPhotos?.[0] && (
                  <Image
                    source={{ uri: property.propertyPhotos[0] }}
                    style={styles.propertyImage}
                  />
                )}
                <View style={styles.propertyInfo}>
                  <View style={styles.propertyHeader}>
                    <Text style={styles.propertyType}>
                      {property.propertyType || 'Property'}
                    </Text>
                    <Text style={styles.propertyPrice}>
                      {formatPrice(property.price)}
                    </Text>
                  </View>
                  <View style={styles.locationInfo}>
                    <Ionicons name="location" size={16} color="#4CAF50" />
                    <Text style={styles.locationText}>
                      {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)}
                    </Text>
                  </View>
                  {property.floor && (
                    <Text style={styles.propertyDetail}>Floor {property.floor}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Mobile view - will use actual map when opened in Expo Go
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="map" size={32} color="#fff" />
        <Text style={styles.headerTitle}>Map View Coming Soon</Text>
        <Text style={styles.headerSubtitle}>
          Interactive map will be available in the next update
        </Text>
      </View>

      {properties.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#666" />
          <Text style={styles.emptyText}>No properties with location data</Text>
          <Text style={styles.emptySubtext}>
            Add properties with location-tagged photos
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {properties.map((property) => (
            <TouchableOpacity
              key={property.id}
              style={styles.propertyCard}
              onPress={() => handlePropertyPress(property)}
            >
              {property.propertyPhotos?.[0] && (
                <Image
                  source={{ uri: property.propertyPhotos[0] }}
                  style={styles.propertyImage}
                />
              )}
              <View style={styles.propertyInfo}>
                <View style={styles.propertyHeader}>
                  <Text style={styles.propertyType}>
                    {property.propertyType || 'Property'}
                  </Text>
                  <Text style={styles.propertyPrice}>
                    {formatPrice(property.price)}
                  </Text>
                </View>
                <View style={styles.locationInfo}>
                  <Ionicons name="location" size={16} color="#4CAF50" />
                  <Text style={styles.locationText}>
                    {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)}
                  </Text>
                </View>
                {property.floor && (
                  <Text style={styles.propertyDetail}>Floor {property.floor}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
  header: {
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
  },
  headerSubtitle: {
    color: '#999',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
    gap: 16,
  },
  propertyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  propertyImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#333',
  },
  propertyInfo: {
    padding: 16,
  },
  propertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  propertyPrice: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  locationText: {
    color: '#4CAF50',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  propertyDetail: {
    color: '#999',
    fontSize: 14,
  },
});
