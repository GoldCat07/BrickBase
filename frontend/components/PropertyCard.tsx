import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Property, FloorEntry } from '../types/property';

interface PropertyCardProps {
  property: Property;
  onPress: () => void;
  onShare?: () => void;
}

export default function PropertyCard({ property, onPress, onShare }: PropertyCardProps) {
  const formatPrice = (price?: number, unit?: string) => {
    if (!price) return 'Price not set';
    if (unit === 'cr') {
      return `₹${price.toFixed(2)} Cr`;
    }
    if (unit === 'lakh_per_month') {
      return `₹${price.toFixed(1)} L/mo`;
    }
    return `₹${price.toFixed(2)} L`;
  };

  const getDisplayPrice = () => {
    // Handle multi-floor properties
    if (property.floors && property.floors.length > 0) {
      const prices = property.floors.map(f => f.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const unit = property.floors[0].priceUnit;
      
      if (minPrice === maxPrice) {
        return formatPrice(minPrice, unit);
      }
      
      // Show range
      const unitLabel = unit === 'cr' ? 'Cr' : unit === 'lakh_per_month' ? 'L/mo' : 'L';
      return `₹${minPrice.toFixed(0)}-${maxPrice.toFixed(0)} ${unitLabel}`;
    }
    
    return formatPrice(property.price, property.priceUnit);
  };

  // Use immediate linking for faster call experience
  const handleCall = () => {
    const phoneNumber = property.builders?.[0]?.phoneNumber || property.builderPhone;
    if (phoneNumber) {
      const countryCode = property.builders?.[0]?.countryCode || '+91';
      const fullNumber = `${countryCode}${phoneNumber}`;
      
      // Use tel: scheme directly for instant dialing
      Linking.openURL(`tel:${fullNumber}`).catch(() => {
        Alert.alert('Error', 'Could not open phone app');
      });
    } else {
      Alert.alert('No Phone Number', 'Builder phone number not available');
    }
  };

  const handleWhatsApp = () => {
    const phoneNumber = property.builders?.[0]?.phoneNumber || property.builderPhone;
    if (phoneNumber) {
      const countryCode = (property.builders?.[0]?.countryCode || '+91').replace('+', '');
      Linking.openURL(`https://wa.me/${countryCode}${phoneNumber}`).catch(() => {
        Alert.alert('Error', 'Could not open WhatsApp');
      });
    } else {
      Alert.alert('No Phone Number', 'Builder phone number not available');
    }
  };

  const coverPhoto = property.propertyPhotos?.[0];
  const features = [];
  if (property.clubProperty) features.push('Club');
  if (property.poolProperty) features.push('Pool');
  if (property.parkProperty) features.push('Park');
  if (property.gatedProperty) features.push('Gated');

  const builderName = property.builders?.[0]?.name || property.builderName;
  const hasBuilder = builderName || property.builders?.[0]?.phoneNumber || property.builderPhone;

  // Get initials for avatar
  const getInitials = (email?: string) => {
    if (!email) return '?';
    return email.charAt(0).toUpperCase();
  };

  // Display floor count for multi-floor properties
  const getFloorInfo = () => {
    if (property.floors && property.floors.length > 0) {
      const soldCount = property.floors.filter(f => f.isSold).length;
      if (soldCount > 0) {
        return `${property.floors.length} floors (${soldCount} sold)`;
      }
      return `${property.floors.length} floors`;
    }
    if (property.floor) {
      return `Floor ${property.floor}`;
    }
    return null;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {coverPhoto && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: coverPhoto }} style={styles.image} />
          {/* Share button on image */}
          {onShare && (
            <TouchableOpacity style={styles.shareButton} onPress={onShare}>
              <Ionicons name="share-social-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {/* Sold badge */}
          {property.isSold && (
            <View style={styles.soldBadge}>
              <Text style={styles.soldBadgeText}>SOLD</Text>
            </View>
          )}
          {/* Category badge */}
          {property.propertyCategory && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{property.propertyCategory}</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.type}>{property.propertyType || 'Property'}</Text>
            {getFloorInfo() && (
              <Text style={styles.floor}>{getFloorInfo()}</Text>
            )}
          </View>
          {/* Posted By */}
          {property.userEmail && (
            <View style={styles.postedBy}>
              <Text style={styles.postedByLabel}>Posted by</Text>
              <View style={styles.userInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(property.userEmail)}</Text>
                </View>
                <Text style={styles.userName} numberOfLines={1}>
                  {property.userEmail.split('@')[0]}
                </Text>
              </View>
            </View>
          )}
        </View>
        
        <Text style={styles.price}>{getDisplayPrice()}</Text>
        
        {/* Address */}
        {property.address && (property.address.sector || property.address.city) && (
          <Text style={styles.address} numberOfLines={1}>
            {property.address.sector}
            {property.address.sector && property.address.city && ', '}
            {property.address.city}
          </Text>
        )}
        
        {features.length > 0 && (
          <View style={styles.features}>
            {features.map((feature, index) => (
              <View key={index} style={styles.feature}>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        )}
        
        <View style={styles.bottomRow}>
          {property.latitude && property.longitude && (
            <View style={styles.locationBadge}>
              <Ionicons name="location" size={12} color="#4CAF50" />
              <Text style={styles.locationText}>Has location</Text>
            </View>
          )}
          
          {/* Call Builder Section */}
          {hasBuilder && (
            <View style={styles.callSection}>
              <Text style={styles.callLabel}>Call Builder</Text>
              <View style={styles.callButtons}>
                <TouchableOpacity style={styles.callButton} onPress={handleCall}>
                  <Ionicons name="call" size={18} color="#4CAF50" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.callButton, styles.whatsappButton]} onPress={handleWhatsApp}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
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
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#333',
  },
  shareButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 8,
  },
  soldBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#ff4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  soldBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
  },
  categoryBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    color: '#fff',
    fontSize: 11,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  type: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  floor: {
    color: '#999',
    fontSize: 14,
    marginTop: 2,
  },
  postedBy: {
    alignItems: 'flex-end',
  },
  postedByLabel: {
    color: '#666',
    fontSize: 10,
    marginBottom: 4,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  userName: {
    color: '#999',
    fontSize: 12,
    maxWidth: 80,
  },
  price: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  address: {
    color: '#666',
    fontSize: 13,
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
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  callSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callLabel: {
    color: '#999',
    fontSize: 12,
  },
  callButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  callButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 8,
  },
  whatsappButton: {
    backgroundColor: 'rgba(37, 211, 102, 0.1)',
  },
});
