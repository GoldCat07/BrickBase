import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Property } from '../types/property';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NativeMapProps {
  properties: Property[];
  userLocation: { latitude: number; longitude: number } | null;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onPropertySelect: (property: Property | null) => void;
  formatPrice: (property: Property) => string;
}

export default function NativeMap({
  properties,
  userLocation,
  initialRegion,
  onPropertySelect,
  formatPrice,
}: NativeMapProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        mapType="standard"
      >
        {properties.map((property) => (
          <Marker
            key={property.id}
            coordinate={{
              latitude: property.latitude!,
              longitude: property.longitude!,
            }}
            onPress={() => onPropertySelect(property)}
          >
            <View style={[styles.markerContainer, property.isSold && styles.markerSold]}>
              <Text style={[styles.markerPrice, property.isSold && styles.markerPriceSold]}>
                {formatPrice(property)}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* My Location Button */}
      <TouchableOpacity 
        style={[styles.myLocationButton, { bottom: insets.bottom + 180 }]}
        onPress={goToUserLocation}
      >
        <Ionicons name="locate" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
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
  markerPriceSold: {
    color: '#fff',
  },
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
    elevation: 5,
  },
});
