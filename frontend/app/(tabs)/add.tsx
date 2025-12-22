import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { PropertyType, CaseType, PriceUnit, BuilderInfo, Property } from '../../types/property';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import api from '../../lib/api';

const PROPERTY_TYPES: PropertyType[] = ['Plot', 'Builder Floor', 'Villa/House', 'Apartment Society'];
const CASE_TYPES: CaseType[] = ['REGISTRY_CASE', 'TRANSFER_CASE', 'OTHER'];
const PRICE_UNITS: { label: string; value: PriceUnit }[] = [
  { label: 'Cr', value: 'cr' },
  { label: 'Lakh', value: 'lakh' },
];
const COUNTRY_CODES = ['+91', '+1', '+44', '+971'];

interface PhotoData {
  uri: string;
  base64?: string;
  location?: Location.LocationObject;
}

export default function AddPropertyScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const editPropertyId = params.editPropertyId as string | undefined;
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Form state
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [photosWithoutLocation, setPhotosWithoutLocation] = useState<number>(0);
  const [floor, setFloor] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('lakh');
  const [builders, setBuilders] = useState<BuilderInfo[]>([{ name: '', phoneNumber: '', countryCode: '+91' }]);
  const [paymentPlan, setPaymentPlan] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [possessionDate, setPossessionDate] = useState('');
  const [clubProperty, setClubProperty] = useState(false);
  const [poolProperty, setPoolProperty] = useState(false);
  const [parkProperty, setParkProperty] = useState(false);
  const [gatedProperty, setGatedProperty] = useState(false);
  const [propertyAge, setPropertyAge] = useState('');
  const [handoverDate, setHandoverDate] = useState('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load property for editing
  useEffect(() => {
    if (editPropertyId) {
      loadPropertyForEdit(editPropertyId);
    }
  }, [editPropertyId]);

  const loadPropertyForEdit = async (id: string) => {
    try {
      setLoading(true);
      const response = await api.get(`/properties/${id}`);
      const property: Property = response.data;
      
      setIsEditMode(true);
      setPropertyType(property.propertyType || '');
      setFloor(property.floor?.toString() || '');
      setPrice(property.price?.toString() || '');
      setPriceUnit(property.priceUnit || 'lakh');
      
      if (property.builders && property.builders.length > 0) {
        setBuilders(property.builders);
      } else if (property.builderName) {
        setBuilders([{
          name: property.builderName,
          phoneNumber: property.builderPhone || '',
          countryCode: '+91'
        }]);
      }
      
      setPaymentPlan(property.paymentPlan || '');
      setAdditionalNotes(property.additionalNotes || '');
      setPossessionDate(property.possessionDate || '');
      setClubProperty(property.clubProperty);
      setPoolProperty(property.poolProperty);
      setParkProperty(property.parkProperty);
      setGatedProperty(property.gatedProperty);
      setPropertyAge(property.propertyAge?.toString() || '');
      setHandoverDate(property.handoverDate || '');
      setCaseType(property.case || '');
      
      // Load photos
      if (property.propertyPhotos && property.propertyPhotos.length > 0) {
        const loadedPhotos: PhotoData[] = property.propertyPhotos.map(photo => ({
          uri: photo,
          base64: photo.startsWith('data:') ? photo.split(',')[1] : undefined,
          location: property.latitude && property.longitude ? {
            coords: {
              latitude: property.latitude,
              longitude: property.longitude,
              altitude: null,
              accuracy: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as Location.LocationObject : undefined,
        }));
        setPhotos(loadedPhotos);
      }
    } catch (error) {
      console.error('Error loading property:', error);
      Alert.alert('Error', 'Failed to load property for editing');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPropertyType('');
    setPhotos([]);
    setPhotosWithoutLocation(0);
    setFloor('');
    setPrice('');
    setPriceUnit('lakh');
    setBuilders([{ name: '', phoneNumber: '', countryCode: '+91' }]);
    setPaymentPlan('');
    setAdditionalNotes('');
    setPossessionDate('');
    setClubProperty(false);
    setPoolProperty(false);
    setParkProperty(false);
    setGatedProperty(false);
    setPropertyAge('');
    setHandoverDate('');
    setCaseType('');
    setIsEditMode(false);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!propertyType) {
      newErrors.propertyType = 'Property type is required';
    }

    if (photos.length === 0) {
      newErrors.photos = 'At least one property photo is required';
    }

    if (price && isNaN(Number(price))) {
      newErrors.price = 'Price must be a valid number';
    }

    if (floor && isNaN(Number(floor))) {
      newErrors.floor = 'Floor must be a valid number';
    }

    // Validate builder phone numbers
    builders.forEach((builder, index) => {
      if (builder.phoneNumber && builder.phoneNumber.length > 0 && builder.phoneNumber.length < 10) {
        newErrors[`builderPhone_${index}`] = 'Phone number should be at least 10 digits';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    
    return { cameraStatus, mediaStatus, locationStatus };
  };

  const takePicture = async () => {
    const permissions = await requestPermissions();
    
    if (permissions.cameraStatus !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to take photos');
      return;
    }

    if (permissions.locationStatus !== 'granted') {
      Alert.alert('Location Permission', 'Location permission is required to tag photos with GPS coordinates for map display');
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      let location = undefined;
      try {
        location = await Location.getCurrentPositionAsync({});
      } catch (error) {
        console.log('Could not get location');
      }

      const newPhoto: PhotoData = {
        uri: result.assets[0].uri,
        base64: result.assets[0].base64,
        location,
      };

      setPhotos(prev => [...prev, newPhoto]);
      
      if (!location) {
        setPhotosWithoutLocation(prev => prev + 1);
      }
    }
  };

  const extractGPSFromExif = (exif: any): { latitude: number; longitude: number } | null => {
    if (!exif) return null;
    
    // Try different EXIF formats
    // Format 1: Direct GPSLatitude/GPSLongitude (decimal)
    if (typeof exif.GPSLatitude === 'number' && typeof exif.GPSLongitude === 'number') {
      let lat = exif.GPSLatitude;
      let lng = exif.GPSLongitude;
      
      // Apply reference direction
      if (exif.GPSLatitudeRef === 'S') lat = -lat;
      if (exif.GPSLongitudeRef === 'W') lng = -lng;
      
      if (lat !== 0 || lng !== 0) {
        return { latitude: lat, longitude: lng };
      }
    }
    
    // Format 2: Array format [degrees, minutes, seconds]
    if (Array.isArray(exif.GPSLatitude) && Array.isArray(exif.GPSLongitude)) {
      const convertDMSToDecimal = (dms: number[], ref: string): number => {
        let decimal = dms[0] + (dms[1] / 60) + (dms[2] / 3600);
        if (ref === 'S' || ref === 'W') decimal = -decimal;
        return decimal;
      };
      
      const lat = convertDMSToDecimal(exif.GPSLatitude, exif.GPSLatitudeRef || 'N');
      const lng = convertDMSToDecimal(exif.GPSLongitude, exif.GPSLongitudeRef || 'E');
      
      if (lat !== 0 || lng !== 0) {
        return { latitude: lat, longitude: lng };
      }
    }
    
    // Format 3: Try GPS object
    if (exif.GPS) {
      if (exif.GPS.Latitude && exif.GPS.Longitude) {
        return { latitude: exif.GPS.Latitude, longitude: exif.GPS.Longitude };
      }
    }
    
    // Format 4: Try location object
    if (exif.location) {
      if (exif.location.latitude && exif.location.longitude) {
        return { latitude: exif.location.latitude, longitude: exif.location.longitude };
      }
    }
    
    return null;
  };

  const pickImage = async () => {
    const permissions = await requestPermissions();
    
    if (permissions.mediaStatus !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      allowsEditing: false,
      quality: 0.7,
      base64: true,
      exif: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      let withoutLocationCount = 0;
      
      const newPhotos: PhotoData[] = result.assets.map(asset => {
        // Try to extract GPS from EXIF
        const gpsData = extractGPSFromExif(asset.exif);
        
        let location: Location.LocationObject | undefined = undefined;
        
        if (gpsData) {
          location = {
            coords: {
              latitude: gpsData.latitude,
              longitude: gpsData.longitude,
              altitude: null,
              accuracy: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as Location.LocationObject;
        } else {
          withoutLocationCount++;
        }

        return {
          uri: asset.uri,
          base64: asset.base64,
          location,
        };
      });

      setPhotos(prev => [...prev, ...newPhotos]);
      
      // Update photos without location count
      if (withoutLocationCount > 0) {
        setPhotosWithoutLocation(prev => prev + withoutLocationCount);
        
        // Show single alert only if ALL photos don't have location
        if (withoutLocationCount === result.assets.length && photos.length === 0) {
          Alert.alert(
            'No Location Data',
            'None of the selected photos have location data. They will not be visible on the map.',
            [{ text: 'OK' }]
          );
        }
      }
    }
  };

  const removePhoto = (index: number) => {
    const photoToRemove = photos[index];
    if (!photoToRemove.location) {
      setPhotosWithoutLocation(prev => Math.max(0, prev - 1));
    }
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const preparePhotos = () => {
    return photos.map(photo => photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo.uri);
  };

  // Builder management
  const addBuilder = () => {
    setBuilders([...builders, { name: '', phoneNumber: '', countryCode: '+91' }]);
  };

  const removeBuilder = (index: number) => {
    if (builders.length > 1) {
      setBuilders(builders.filter((_, i) => i !== index));
    }
  };

  const updateBuilder = (index: number, field: keyof BuilderInfo, value: string) => {
    const updated = [...builders];
    updated[index] = { ...updated[index], [field]: value };
    setBuilders(updated);
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fix the errors before submitting');
      return;
    }

    setLoading(true);
    try {
      // Get location from first photo with location
      const photoWithLocation = photos.find(p => p.location);
      
      // Prepare photos (base64 strings)
      const photoUrls = preparePhotos();
      
      // Filter out empty builders
      const validBuilders = builders.filter(b => b.name || b.phoneNumber);
      
      // Calculate actual price value (store in lakhs for consistency)
      let actualPrice = price ? parseFloat(price) : null;
      if (actualPrice && priceUnit === 'cr') {
        actualPrice = actualPrice * 100; // Convert Cr to Lakhs
      }
      
      // Create/Update property
      const propertyData = {
        propertyType,
        propertyPhotos: photoUrls,
        floor: floor ? parseInt(floor) : null,
        price: actualPrice,
        priceUnit,
        builders: validBuilders,
        builderName: validBuilders[0]?.name || null,
        builderPhone: validBuilders[0]?.phoneNumber || null,
        paymentPlan: paymentPlan || null,
        additionalNotes: additionalNotes || null,
        possessionDate: possessionDate || null,
        clubProperty,
        poolProperty,
        parkProperty,
        gatedProperty,
        propertyAge: propertyAge ? parseInt(propertyAge) : null,
        handoverDate: handoverDate || null,
        case: caseType || null,
        latitude: photoWithLocation?.location?.coords.latitude || null,
        longitude: photoWithLocation?.location?.coords.longitude || null,
      };

      if (isEditMode && editPropertyId) {
        await api.put(`/properties/${editPropertyId}`, propertyData);
        Alert.alert('Success', 'Property updated successfully!', [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            },
          },
        ]);
      } else {
        await api.post('/properties', propertyData);
        Alert.alert('Success', 'Property added successfully!', [
          {
            text: 'OK',
            onPress: resetForm,
          },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save property');
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEditMode) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading property...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title for Edit Mode */}
          {isEditMode && (
            <View style={styles.editHeader}>
              <Text style={styles.editHeaderText}>Edit Property</Text>
              <TouchableOpacity onPress={() => { resetForm(); router.back(); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Property Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Property Type *</Text>
            <View style={styles.chipContainer}>
              {PROPERTY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.chip,
                    propertyType === type && styles.chipSelected,
                  ]}
                  onPress={() => setPropertyType(type)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      propertyType === type && styles.chipTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.propertyType && (
              <Text style={styles.errorText}>{errors.propertyType}</Text>
            )}
          </View>

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.label}>Property Photos *</Text>
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButton} onPress={takePicture}>
                <Ionicons name="camera" size={24} color="#fff" />
                <Text style={styles.photoButtonText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                <Ionicons name="images" size={24} color="#fff" />
                <Text style={styles.photoButtonText}>From Gallery</Text>
              </TouchableOpacity>
            </View>
            {photos.length > 0 && (
              <ScrollView horizontal style={styles.photoPreviewContainer} showsHorizontalScrollIndicator={false}>
                {photos.map((photo, index) => (
                  <View key={index} style={styles.photoPreview}>
                    <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                    <TouchableOpacity
                      style={styles.photoRemove}
                      onPress={() => removePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                    {!photo.location && (
                      <View style={styles.noLocationBadge}>
                        <Ionicons name="location-outline" size={12} color="#ff4444" />
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
            {/* Location warning message */}
            {photosWithoutLocation > 0 && photos.length > 0 && (
              <Text style={styles.locationWarning}>
                {photosWithoutLocation} out of {photos.length} photo(s) do not have location data
              </Text>
            )}
            {errors.photos && <Text style={styles.errorText}>{errors.photos}</Text>}
          </View>

          {/* Price with Unit Dropdown */}
          <View style={styles.section}>
            <Text style={styles.label}>Price</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={[styles.input, styles.priceInput]}
                placeholder="00.00"
                placeholderTextColor="#666"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity 
                style={styles.unitDropdown}
                onPress={() => setShowPriceDropdown(!showPriceDropdown)}
              >
                <Text style={styles.unitText}>{priceUnit === 'cr' ? 'Cr' : 'Lakh'}</Text>
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {showPriceDropdown && (
              <View style={styles.dropdownList}>
                {PRICE_UNITS.map((unit) => (
                  <TouchableOpacity
                    key={unit.value}
                    style={[
                      styles.dropdownItem,
                      priceUnit === unit.value && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      setPriceUnit(unit.value);
                      setShowPriceDropdown(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      priceUnit === unit.value && styles.dropdownItemTextSelected,
                    ]}>
                      {unit.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
          </View>

          {/* Floor */}
          <View style={styles.section}>
            <Text style={styles.label}>Floor</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter floor number"
              placeholderTextColor="#666"
              value={floor}
              onChangeText={setFloor}
              keyboardType="numeric"
            />
            {errors.floor && <Text style={styles.errorText}>{errors.floor}</Text>}
          </View>

          {/* Builder Details - Side by Side */}
          <View style={styles.section}>
            <Text style={styles.label}>Builder Details</Text>
            {builders.map((builder, index) => (
              <View key={index} style={styles.builderContainer}>
                <View style={styles.builderRow}>
                  <TextInput
                    style={[styles.input, styles.builderNameInput]}
                    placeholder="Builder name"
                    placeholderTextColor="#666"
                    value={builder.name}
                    onChangeText={(text) => updateBuilder(index, 'name', text)}
                  />
                  <View style={styles.phoneContainer}>
                    <TouchableOpacity 
                      style={styles.countryCodeDropdown}
                      onPress={() => {
                        const currentIndex = COUNTRY_CODES.indexOf(builder.countryCode || '+91');
                        const nextIndex = (currentIndex + 1) % COUNTRY_CODES.length;
                        updateBuilder(index, 'countryCode', COUNTRY_CODES[nextIndex]);
                      }}
                    >
                      <Text style={styles.countryCodeText}>{builder.countryCode || '+91'}</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.input, styles.builderPhoneInput]}
                      placeholder="Phone"
                      placeholderTextColor="#666"
                      value={builder.phoneNumber}
                      onChangeText={(text) => updateBuilder(index, 'phoneNumber', text)}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                {builders.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeBuilderButton}
                    onPress={() => removeBuilder(index)}
                  >
                    <Ionicons name="close-circle" size={20} color="#ff4444" />
                  </TouchableOpacity>
                )}
                {errors[`builderPhone_${index}`] && (
                  <Text style={styles.errorText}>{errors[`builderPhone_${index}`]}</Text>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addBuilderButton} onPress={addBuilder}>
              <Ionicons name="add-circle-outline" size={20} color="#4CAF50" />
              <Text style={styles.addBuilderText}>Add Builder</Text>
            </TouchableOpacity>
          </View>

          {/* Payment Plan (replaces Black/White) */}
          <View style={styles.section}>
            <Text style={styles.label}>Payment Plan</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Enter payment plan details..."
              placeholderTextColor="#666"
              value={paymentPlan}
              onChangeText={setPaymentPlan}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Dates */}
          <View style={styles.section}>
            <Text style={styles.label}>Possession Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#666"
              value={possessionDate}
              onChangeText={setPossessionDate}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Handover Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#666"
              value={handoverDate}
              onChangeText={setHandoverDate}
            />
          </View>

          {/* Property Age */}
          <View style={styles.section}>
            <Text style={styles.label}>Property Age (years)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter property age"
              placeholderTextColor="#666"
              value={propertyAge}
              onChangeText={setPropertyAge}
              keyboardType="numeric"
            />
          </View>

          {/* Case Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Case Type</Text>
            <View style={styles.chipContainer}>
              {CASE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.chip,
                    caseType === type && styles.chipSelected,
                  ]}
                  onPress={() => setCaseType(type)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      caseType === type && styles.chipTextSelected,
                    ]}
                  >
                    {type.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Property Features */}
          <View style={styles.section}>
            <Text style={styles.label}>Property Features</Text>
            <View style={styles.featureContainer}>
              <TouchableOpacity
                style={styles.featureItem}
                onPress={() => setClubProperty(!clubProperty)}
              >
                <Ionicons
                  name={clubProperty ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.featureText}>Club</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.featureItem}
                onPress={() => setPoolProperty(!poolProperty)}
              >
                <Ionicons
                  name={poolProperty ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.featureText}>Pool</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.featureItem}
                onPress={() => setParkProperty(!parkProperty)}
              >
                <Ionicons
                  name={parkProperty ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.featureText}>Park</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.featureItem}
                onPress={() => setGatedProperty(!gatedProperty)}
              >
                <Ionicons
                  name={gatedProperty ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.featureText}>Gated</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Additional Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Additional Features / Notes</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Enter any additional features or notes..."
              placeholderTextColor="#666"
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isEditMode ? 'Update Property' : 'Add Property'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  editHeaderText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoPreviewContainer: {
    marginTop: 12,
  },
  photoPreview: {
    width: 100,
    height: 100,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  noLocationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 4,
  },
  locationWarning: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 8,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceInput: {
    flex: 1,
  },
  unitDropdown: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 90,
  },
  unitText: {
    color: '#fff',
    fontSize: 16,
  },
  dropdownList: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  dropdownItemSelected: {
    backgroundColor: '#333',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 16,
  },
  dropdownItemTextSelected: {
    fontWeight: '600',
  },
  builderContainer: {
    marginBottom: 12,
    position: 'relative',
  },
  builderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  builderNameInput: {
    flex: 1,
  },
  phoneContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  countryCodeDropdown: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  countryCodeText: {
    color: '#fff',
    fontSize: 14,
  },
  builderPhoneInput: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftWidth: 0,
  },
  removeBuilderButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#0c0c0c',
    borderRadius: 12,
  },
  addBuilderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-end',
    padding: 8,
  },
  addBuilderText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  featureContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: '#fff',
    fontSize: 16,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
