import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Property } from '../types/property';

interface PropertyCardProps {
  property: Property;
  onPress: () => void;
}

export default function PropertyCard({ property, onPress }: PropertyCardProps) {
  const formatPrice = (price?: number) => {
    if (!price) return 'Price not set';
    return `₹${(price / 100000).toFixed(2)}L`;
  };

  const coverPhoto = property.propertyPhotos?.[0];
  const features = [];
  if (property.clubProperty) features.push('Club');
  if (property.poolProperty) features.push('Pool');
  if (property.parkProperty) features.push('Park');
  if (property.gatedProperty) features.push('Gated');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {coverPhoto && (
        <Image source={{ uri: coverPhoto }} style={styles.image} />
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.type}>{property.propertyType || 'Property'}</Text>
          {property.floor && (
            <Text style={styles.floor}>Floor {property.floor}</Text>
          )}
        </View>
        
        <Text style={styles.price}>{formatPrice(property.price)}</Text>
        
        {features.length > 0 && (
          <View style={styles.features}>
            {features.map((feature, index) => (
              <View key={index} style={styles.feature}>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        )}
        
        {property.latitude && property.longitude && (
          <View style={styles.locationBadge}>
            <Ionicons name="location" size={12} color="#4CAF50" />
            <Text style={styles.locationText}>Has location</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#333',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  type: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  floor: {
    color: '#999',
    fontSize: 14,
  },
  price: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  feature: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  featureText: {
    color: '#fff',
    fontSize: 12,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    color: '#4CAF50',
    fontSize: 12,
  },
});
