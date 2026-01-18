import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Property, SIZE_UNITS } from '../types/property';

const { width, height } = Dimensions.get('window');
const PHOTO_HEIGHT = height * 0.28;

interface WhatsAppShareModalProps {
  visible: boolean;
  property: Property;
  onClose: () => void;
}

interface FieldOption {
  key: string;
  label: string;
  value: string;
  selected: boolean;
}

export default function WhatsAppShareModal({ visible, property, onClose }: WhatsAppShareModalProps) {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  
  const getSizeUnitLabel = (unit: string) => {
    const found = SIZE_UNITS.find(u => u.value === unit);
    return found?.label || unit;
  };

  const getSizeTypeLabel = (type: string) => {
    switch (type) {
      case 'carpet': return 'Carpet Area';
      case 'builtup': return 'Built-up Area';
      case 'superbuiltup': return 'Super Built-up Area';
      default: return type;
    }
  };
  
  const buildFieldOptions = useCallback((): FieldOption[] => {
    const fields: FieldOption[] = [];
    
    if (property.propertyCategory) {
      fields.push({ key: 'propertyCategory', label: 'Category', value: property.propertyCategory, selected: true });
    }
    
    if (property.propertyType) {
      fields.push({ key: 'propertyType', label: 'Property Type', value: property.propertyType, selected: true });
    }
    
    if (property.floors && property.floors.length > 0) {
      const floorPrices = property.floors.map(f => {
        const unit = f.priceUnit === 'cr' ? 'Cr' : f.priceUnit === 'lakh_per_month' ? 'L/mo' : 'L';
        return `Floor ${f.floorNumber}: ₹${f.price} ${unit}`;
      }).join('\n');
      fields.push({ key: 'floors', label: 'Floor Prices', value: floorPrices, selected: true });
    } else if (property.price) {
      const priceStr = property.priceUnit === 'cr' 
        ? `₹${property.price} Cr` 
        : property.priceUnit === 'lakh_per_month'
        ? `₹${property.price} Lakhs/month`
        : `₹${property.price} Lakhs`;
      fields.push({ key: 'price', label: 'Price', value: priceStr, selected: true });
    }
    
    if (property.floor && (!property.floors || property.floors.length === 0)) {
      fields.push({ key: 'floor', label: 'Floor', value: String(property.floor), selected: true });
    }

    if (property.sizes && property.sizes.length > 0) {
      const sizesStr = property.sizes.map(s => 
        `${getSizeTypeLabel(s.type)}: ${s.value} ${getSizeUnitLabel(s.unit)}`
      ).join('\n');
      fields.push({ key: 'sizes', label: 'Size', value: sizesStr, selected: true });
    }
    
    if (property.address && (property.address.sector || property.address.city)) {
      let addressStr = '';
      if (property.address.unitNo) addressStr += `Unit ${property.address.unitNo}, `;
      if (property.address.block) addressStr += `Block ${property.address.block}, `;
      if (property.address.sector) addressStr += property.address.sector;
      if (property.address.city) addressStr += `, ${property.address.city}`;
      fields.push({ key: 'address', label: 'Address', value: addressStr.trim(), selected: true });
    }
    
    if (property.propertyAge) {
      fields.push({ key: 'propertyAge', label: 'Property Age', value: `${property.propertyAge} years`, selected: true });
    }

    if (property.ageType) {
      const ageTypeDisplay = property.ageType === 'UnderConstruction' ? 'Under Construction' : property.ageType;
      fields.push({ key: 'ageType', label: 'Age Type', value: ageTypeDisplay, selected: true });
    }
    
    if (property.case) {
      fields.push({ key: 'case', label: 'Case Type', value: property.case.replace(/_/g, ' '), selected: true });
    }
    
    if (property.paymentPlan) {
      fields.push({ key: 'paymentPlan', label: 'Payment Plan', value: property.paymentPlan, selected: true });
    }
    
    if (property.possessionMonth || property.possessionYear) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      let possessionStr = '';
      if (property.possessionMonth) possessionStr += months[property.possessionMonth - 1];
      if (property.possessionMonth && property.possessionYear) possessionStr += ' ';
      if (property.possessionYear) possessionStr += property.possessionYear.toString();
      fields.push({ key: 'possession', label: 'Possession', value: possessionStr, selected: true });
    }
    
    const features: string[] = [];
    if (property.clubProperty) features.push('Club');
    if (property.poolProperty) features.push('Pool');
    if (property.parkProperty) features.push('Park');
    if (property.gatedProperty) features.push('Gated Community');
    
    if (features.length > 0) {
      fields.push({ key: 'features', label: 'Features', value: features.join(', '), selected: true });
    }
    
    if (property.additionalNotes) {
      fields.push({ key: 'additionalNotes', label: 'Additional Notes', value: property.additionalNotes, selected: true });
    }
    
    return fields;
  }, [property]);
  
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>(buildFieldOptions());
  
  useEffect(() => {
    if (visible) {
      setFieldOptions(buildFieldOptions());
    }
  }, [visible, property, buildFieldOptions]);
  
  const toggleField = (key: string) => {
    setFieldOptions(prev => 
      prev.map(field => 
        field.key === key ? { ...field, selected: !field.selected } : field
      )
    );
  };
  
  const handlePhotoLongPress = (photo: string) => {
    setPreviewPhoto(photo);
  };
  
  const generateShareText = () => {
    const selectedFields = fieldOptions.filter(f => f.selected);
    let text = '🏠 *Property Details*\n\n';
    
    selectedFields.forEach(field => {
      text += `*${field.label}:* ${field.value}\n`;
    });
    
    return text;
  };

  // Simple and reliable - just open WhatsApp with text
  const shareToWhatsApp = async () => {
    try {
      setSharing(true);
      const shareText = generateShareText();
      const encodedText = encodeURIComponent(shareText);
      
      // Try WhatsApp URL scheme
      const whatsappUrl = `whatsapp://send?text=${encodedText}`;
      
      await Linking.openURL(whatsappUrl);
      onClose();
    } catch (error) {
      console.error('WhatsApp error:', error);
      Alert.alert('Error', 'Could not open WhatsApp. Please make sure WhatsApp is installed.');
    } finally {
      setSharing(false);
    }
  };
  
  const selectedFieldsCount = fieldOptions.filter(f => f.selected).length;
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Share to WhatsApp</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {selectedFieldsCount} field(s) selected
          </Text>
        </View>
        
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Photos Preview (read-only, for reference) */}
          {property.propertyPhotos && property.propertyPhotos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <Text style={styles.sectionSubtitle}>Long press to preview. Photos shared separately.</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.photoScroll}
              >
                {property.propertyPhotos.map((photo, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.photoContainer}
                    onLongPress={() => handlePhotoLongPress(photo)}
                    delayLongPress={500}
                  >
                    <Image source={{ uri: photo }} style={styles.photo} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          
          {/* Property Details Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Property Details</Text>
            <Text style={styles.sectionSubtitle}>Tap to include/exclude from message</Text>
            {fieldOptions.map((field) => (
              <TouchableOpacity
                key={field.key}
                style={[
                  styles.fieldItem,
                  field.selected && styles.fieldItemSelected,
                ]}
                onPress={() => toggleField(field.key)}
              >
                <View style={styles.fieldInfo}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <Text style={styles.fieldValue} numberOfLines={3}>{field.value}</Text>
                </View>
                <Ionicons 
                  name={field.selected ? 'checkbox' : 'square-outline'} 
                  size={24} 
                  color={field.selected ? '#4CAF50' : '#666'} 
                />
              </TouchableOpacity>
            ))}
          </View>
          
          <View style={{ height: 100 }} />
        </ScrollView>
        
        {/* Share Button */}
        <TouchableOpacity 
          style={[styles.shareButton, sharing && styles.shareButtonDisabled]} 
          onPress={shareToWhatsApp}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="logo-whatsapp" size={28} color="#fff" />
          )}
        </TouchableOpacity>
        
        {/* Photo Preview Modal */}
        <Modal
          visible={!!previewPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewPhoto(null)}
        >
          <TouchableOpacity 
            style={styles.previewOverlay} 
            activeOpacity={1}
            onPress={() => setPreviewPhoto(null)}
          >
            {previewPhoto && (
              <Image 
                source={{ uri: previewPhoto }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity 
              style={styles.previewClose}
              onPress={() => setPreviewPhoto(null)}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
  },
  summaryText: {
    color: '#999',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 12,
    marginBottom: 12,
  },
  photoScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  photoContainer: {
    width: width * 0.5,
    height: PHOTO_HEIGHT,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
  },
  photo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
  },
  fieldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  fieldItemSelected: {
    borderColor: '#4CAF50',
  },
  fieldInfo: {
    flex: 1,
    marginRight: 12,
  },
  fieldLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  fieldValue: {
    color: '#fff',
    fontSize: 14,
  },
  shareButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  shareButtonDisabled: {
    backgroundColor: '#666',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: width * 0.9,
    height: height * 0.7,
  },
  previewClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 8,
  },
});
