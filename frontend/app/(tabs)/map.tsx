import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import { useAuth } from '../../contexts/AuthContext';
import { Property } from '../../types/property';
import api from '../../lib/api';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [region, setRegion] = useState<Region>({
    latitude: 28.6139, // Delhi default
    longitude: 77.209,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });

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

      // Center map on first property or stay at Delhi
      if (propertiesWithLocation.length > 0) {
        const firstProp = propertiesWithLocation[0];
        setRegion({
          latitude: firstProp.latitude!,
          longitude: firstProp.longitude!,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkerPress = (property: Property) => {
    setSelectedProperty(property);
  };

  const handleViewDetails = () => {
    if (selectedProperty) {
      router.push({
        pathname: '/property-details',
        params: { propertyId: selectedProperty.id },
      });
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'Price not set';
    return `₹${(price / 100000).toFixed(2)}L`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (properties.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="map-outline" size={64} color="#666" />
          <Text style={styles.emptyText}>No properties with location data</Text>
          <Text style={styles.emptySubtext}>
            Add properties with location-tagged photos to see them on the map
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {properties.map((property) => (
          <Marker
            key={property.id}
            coordinate={{
              latitude: property.latitude!,
              longitude: property.longitude!,
            }}
            onPress={() => handleMarkerPress(property)}
          >
            <View style={styles.markerContainer}>
              <View style={styles.marker}>
                {property.propertyPhotos?.[0] ? (
                  <Image
                    source={{ uri: property.propertyPhotos[0] }}
                    style={styles.markerImage}
                  />
                ) : (
                  <Ionicons name="home" size={20} color="#fff" />
                )}
              </View>
              <View style={styles.priceTag}>
                <Text style={styles.priceTagText}>{formatPrice(property.price)}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Property Preview Card */}
      {selectedProperty && (
        <View style={styles.previewCard}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedProperty(null)}
          >
            <Ionicons name="close" size={24} color="#999" />
          </TouchableOpacity>
          
          {selectedProperty.propertyPhotos?.[0] && (
            <Image
              source={{ uri: selectedProperty.propertyPhotos[0] }}
              style={styles.previewImage}
            />
          )}
          
          <View style={styles.previewContent}>
            <Text style={styles.previewType}>
              {selectedProperty.propertyType || 'Property'}
            </Text>
            <Text style={styles.previewPrice}>
              {formatPrice(selectedProperty.price)}
            </Text>
            
            {selectedProperty.floor && (
              <Text style={styles.previewDetail}>Floor {selectedProperty.floor}</Text>
            )}
            
            <TouchableOpacity
              style={styles.viewDetailsButton}
              onPress={handleViewDetails}
            >
              <Text style={styles.viewDetailsText}>View Details</Text>
              <Ionicons name="arrow-forward" size={16} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
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
  map: {
    width: width,
    height: height,
  },
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  priceTag: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  priceTagText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  previewCard: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    padding: 4,
  },
  previewImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#333',
  },
  previewContent: {
    padding: 16,
  },
  previewType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewPrice: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewDetail: {
    color: '#999',
    fontSize: 14,
    marginBottom: 12,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  viewDetailsText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
