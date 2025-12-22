import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Property } from '../types/property';

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
    return `₹${price.toFixed(2)} L`;
  };

  const handleCall = () => {
    const phoneNumber = property.builders?.[0]?.phoneNumber || property.builderPhone;
    if (phoneNumber) {
      const countryCode = property.builders?.[0]?.countryCode || '+91';
      Linking.openURL(`tel:${countryCode}${phoneNumber}`);
    } else {
      Alert.alert('No Phone Number', 'Builder phone number not available');
    }
  };

  const handleWhatsApp = () => {
    const phoneNumber = property.builders?.[0]?.phoneNumber || property.builderPhone;
    if (phoneNumber) {
      const countryCode = (property.builders?.[0]?.countryCode || '+91').replace('+', '');
      Linking.openURL(`https://wa.me/${countryCode}${phoneNumber}`);
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
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.type}>{property.propertyType || 'Property'}</Text>
            {property.floor && (
              <Text style={styles.floor}>Floor {property.floor}</Text>
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
        
        <Text style={styles.price}>{formatPrice(property.price, property.priceUnit)}</Text>
        
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
