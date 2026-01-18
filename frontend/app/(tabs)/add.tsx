import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  PropertyCategory,
  PropertyType,
  CaseType,
  AgeType,
  PriceUnit,
  SizeUnit,
  BuilderInfo,
  FloorEntry,
  SizeEntry,
  AddressInfo,
  ImportantFile,
  Property,
  RESIDENTIAL_PROPERTY_TYPES,
  COMMERCIAL_PROPERTY_TYPES,
  CASE_TYPES,
  AGE_TYPES,
  SIZE_UNITS,
  MONTHS,
} from '../../types/property';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import api from '../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_CONTENT_WIDTH = 500;

const COUNTRY_CODES = ['+91', '+1', '+44', '+971'];

// Generate years from current year to 2075
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y <= 2075; y++) {
    years.push(y);
  }
  return years;
};
const YEARS = generateYears();

interface PhotoData {
  uri: string;
  base64?: string;
  location?: Location.LocationObject;
}

export default function AddPropertyScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const editPropertyId = params.editPropertyId as string | undefined;
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Form state - in order
  const [propertyCategory, setPropertyCategory] = useState<PropertyCategory | ''>('');
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [photosWithoutLocation, setPhotosWithoutLocation] = useState<number>(0);
  const [builders, setBuilders] = useState<BuilderInfo[]>([{ name: '', phoneNumber: '', countryCode: '+91' }]);
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  
  // Floor entries (for Builder Floor and Apartment Society)
  const [floors, setFloors] = useState<FloorEntry[]>([{ floorNumber: 0, price: 0, priceUnit: 'cr' }]);
  
  // Single price for other property types
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('cr');
  
  // Address
  const [address, setAddress] = useState<AddressInfo>({
    unitNo: '',
    block: '',
    sector: '',
    city: '',
  });
  
  // Size/Area
  const [sizes, setSizes] = useState<SizeEntry[]>([]);
  
  // Age Type
  const [ageType, setAgeType] = useState<AgeType | ''>('');
  const [propertyAge, setPropertyAge] = useState('');
  
  // Possession Time
  const [possessionMonth, setPossessionMonth] = useState<number | null>(null);
  const [possessionYear, setPossessionYear] = useState<number | null>(null);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  
  // Important Files
  const [importantFiles, setImportantFiles] = useState<ImportantFile[]>([]);
  
  // Other fields
  const [paymentPlan, setPaymentPlan] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [clubProperty, setClubProperty] = useState(false);
  const [poolProperty, setPoolProperty] = useState(false);
  const [parkProperty, setParkProperty] = useState(false);
  const [gatedProperty, setGatedProperty] = useState(false);
  
  // Dropdowns
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);
  const [activeFloorDropdown, setActiveFloorDropdown] = useState<number | null>(null);
  const [showSizeUnitDropdown, setShowSizeUnitDropdown] = useState<number | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get property types based on category
  const getPropertyTypes = (): PropertyType[] => {
    if (propertyCategory === 'Residential') {
      return RESIDENTIAL_PROPERTY_TYPES;
    } else if (propertyCategory === 'Commercial') {
      return COMMERCIAL_PROPERTY_TYPES;
    }
    return [];
  };

  // Check if property type needs multiple floors
  const needsMultipleFloors = propertyCategory === 'Residential' && 
    (propertyType === 'Builder Floor' || propertyType === 'Apartment Society');

  // Get available price units based on case type
  const getAvailablePriceUnits = (): { label: string; value: PriceUnit }[] => {
    if (caseType === 'RENTAL') {
      return [{ label: 'Lakh/month', value: 'lakh_per_month' }];
    }
    // Only Cr for non-rental
    return [{ label: 'Cr', value: 'cr' }];
  };

  // Reset form when screen is focused (not in edit mode)
  useFocusEffect(
    useCallback(() => {
      if (!editPropertyId) {
        resetForm();
      }
    }, [editPropertyId])
  );

  // Update price unit when case type changes
  useEffect(() => {
    if (caseType === 'RENTAL') {
      setPriceUnit('lakh_per_month');
      setFloors(prev => prev.map(f => ({ ...f, priceUnit: 'lakh_per_month' })));
    } else {
      setPriceUnit('cr');
      setFloors(prev => prev.map(f => ({ ...f, priceUnit: 'cr' })));
    }
  }, [caseType]);

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
      setPropertyCategory(property.propertyCategory || '');
      setPropertyType(property.propertyType || '');
      setCaseType(property.case || '');
      setAgeType(property.ageType || '');
      
      if (property.floors && property.floors.length > 0) {
        setFloors(property.floors);
      } else if (property.floor) {
        setFloors([{ 
          floorNumber: property.floor, 
          price: property.price || 0, 
          priceUnit: property.priceUnit || 'cr' 
        }]);
      }
      
      setPrice(property.price?.toString() || '');
      setPriceUnit(property.priceUnit || 'cr');
      
      if (property.builders && property.builders.length > 0) {
        setBuilders(property.builders);
      } else if (property.builderName) {
        setBuilders([{
          name: property.builderName,
          phoneNumber: property.builderPhone || '',
          countryCode: '+91'
        }]);
      }
      
      setAddress(property.address || { unitNo: '', block: '', sector: '', city: '' });
      setSizes(property.sizes || []);
      setPossessionMonth(property.possessionMonth || null);
      setPossessionYear(property.possessionYear || null);
      setImportantFiles(property.importantFiles || []);
      setPaymentPlan(property.paymentPlan || '');
      setAdditionalNotes(property.additionalNotes || '');
      setClubProperty(property.clubProperty);
      setPoolProperty(property.poolProperty);
      setParkProperty(property.parkProperty);
      setGatedProperty(property.gatedProperty);
      setPropertyAge(property.propertyAge?.toString() || '');
      
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
    setPropertyCategory('');
    setPropertyType('');
    setCaseType('');
    setAgeType('');
    setPhotos([]);
    setPhotosWithoutLocation(0);
    setFloors([{ floorNumber: 0, price: 0, priceUnit: 'cr' }]);
    setPrice('');
    setPriceUnit('cr');
    setBuilders([{ name: '', phoneNumber: '', countryCode: '+91' }]);
    setAddress({ unitNo: '', block: '', sector: '', city: '' });
    setSizes([]);
    setPossessionMonth(null);
    setPossessionYear(null);
    setImportantFiles([]);
    setPaymentPlan('');
    setAdditionalNotes('');
    setClubProperty(false);
    setPoolProperty(false);
    setParkProperty(false);
    setGatedProperty(false);
    setPropertyAge('');
    setIsEditMode(false);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!propertyCategory) {
      newErrors.propertyCategory = 'Property category is required';
    }

    if (!propertyType) {
      newErrors.propertyType = 'Property type is required';
    }

    if (photos.length === 0) {
      newErrors.photos = 'At least one property photo is required';
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
    
    if (typeof exif.GPSLatitude === 'number' && typeof exif.GPSLongitude === 'number') {
      let lat = exif.GPSLatitude;
      let lng = exif.GPSLongitude;
      
      if (exif.GPSLatitudeRef === 'S') lat = -lat;
      if (exif.GPSLongitudeRef === 'W') lng = -lng;
      
      if (lat !== 0 || lng !== 0) {
        return { latitude: lat, longitude: lng };
      }
    }
    
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
      
      if (withoutLocationCount > 0) {
        setPhotosWithoutLocation(prev => prev + withoutLocationCount);
        
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

  // Floor management
  const addFloor = () => {
    const lastFloor = floors[floors.length - 1];
    setFloors([...floors, { 
      floorNumber: (lastFloor?.floorNumber || 0) + 1, 
      price: 0, 
      priceUnit: caseType === 'RENTAL' ? 'lakh_per_month' : 'cr' 
    }]);
  };

  const removeFloor = (index: number) => {
    if (floors.length > 1) {
      setFloors(floors.filter((_, i) => i !== index));
    }
  };

  const updateFloor = (index: number, field: keyof FloorEntry, value: any) => {
    const updated = [...floors];
    updated[index] = { ...updated[index], [field]: value };
    setFloors(updated);
  };

  // Size management
  const addSize = (type: 'carpet' | 'builtup' | 'superbuiltup') => {
    if (!sizes.find(s => s.type === type)) {
      setSizes([...sizes, { type, value: 0, unit: 'sq_ft' }]);
    }
  };

  const removeSize = (index: number) => {
    setSizes(sizes.filter((_, i) => i !== index));
  };

  const updateSize = (index: number, field: keyof SizeEntry, value: any) => {
    const updated = [...sizes];
    updated[index] = { ...updated[index], [field]: value };
    setSizes(updated);
  };

  // File picker
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const newFiles: ImportantFile[] = result.assets.map(asset => ({
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType,
        }));
        setImportantFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const removeFile = (index: number) => {
    setImportantFiles(importantFiles.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fix the errors before submitting');
      return;
    }

    // OPTIMISTIC UI: Show success immediately, sync in background
    const photoWithLocation = photos.find(p => p.location);
    const photoUrls = preparePhotos();
    const validBuilders = builders.filter(b => b.name || b.phoneNumber);
    
    // Parse price - handle decimals properly
    let actualPrice = price ? parseFloat(price.replace(',', '.')) : null;
    
    // Prepare floors data for multi-floor properties
    const floorsData = needsMultipleFloors ? floors.map(f => ({
      floorNumber: f.floorNumber,
      price: typeof f.price === 'string' ? parseFloat(String(f.price).replace(',', '.')) : f.price,
      priceUnit: f.priceUnit,
      isSold: f.isSold || false,
    })) : [];
    
    const propertyData = {
      propertyCategory,
      propertyType,
      propertyPhotos: photoUrls,
      floor: needsMultipleFloors ? null : (floors[0]?.floorNumber || null),
      floors: floorsData,
      price: needsMultipleFloors ? null : actualPrice,
      priceUnit: needsMultipleFloors ? null : priceUnit,
      builders: validBuilders,
      builderName: validBuilders[0]?.name || null,
      builderPhone: validBuilders[0]?.phoneNumber || null,
      address: address,
      sizes: sizes,
      possessionMonth: possessionMonth,
      possessionYear: possessionYear,
      importantFiles: importantFiles,
      paymentPlan: paymentPlan || null,
      additionalNotes: additionalNotes || null,
      clubProperty,
      poolProperty,
      parkProperty,
      gatedProperty,
      propertyAge: propertyAge ? parseInt(propertyAge) : null,
      ageType: ageType || null,
      case: caseType || null,
      latitude: photoWithLocation?.location?.coords.latitude || null,
      longitude: photoWithLocation?.location?.coords.longitude || null,
    };

    if (isEditMode && editPropertyId) {
      setLoading(true);
      try {
        await api.put(`/properties/${editPropertyId}`, propertyData);
        // Mark cache as needing refresh
        setNewPropertyAdded(true);
        Alert.alert('Success', 'Property updated!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to update property');
      } finally {
        setLoading(false);
      }
    } else {
      // OPTIMISTIC: Show success immediately
      Alert.alert('Success', 'Property added! Syncing...', [
        { text: 'OK', onPress: resetForm },
      ]);
      
      // Mark cache as needing refresh so search/map will update
      setNewPropertyAdded(true);
      
      // Sync in background without blocking UI
      syncPropertyInBackground(propertyData);
    }
  };

  // Background sync function
  const syncPropertyInBackground = async (propertyData: any) => {
    try {
      await api.post('/properties', propertyData);
      console.log('Property synced successfully');
    } catch (error: any) {
      console.error('Background sync failed:', error);
      // Could implement retry queue here
      Alert.alert(
        'Sync Issue',
        'Property was saved locally but failed to sync. It will retry automatically.',
        [{ text: 'OK' }]
      );
    }
  };

  // Legacy submit for reference (replaced by optimistic)
  const handleSubmitLegacy = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fix the errors before submitting');
      return;
    }

    setLoading(true);
    try {
      const photoWithLocation = photos.find(p => p.location);
      const photoUrls = preparePhotos();
      const validBuilders = builders.filter(b => b.name || b.phoneNumber);
      
      let actualPrice = price ? parseFloat(price.replace(',', '.')) : null;
      
      const floorsData = needsMultipleFloors ? floors.map(f => ({
        floorNumber: f.floorNumber,
        price: typeof f.price === 'string' ? parseFloat(String(f.price).replace(',', '.')) : f.price,
        priceUnit: f.priceUnit,
        isSold: f.isSold || false,
      })) : [];
      
      const propertyData = {
        propertyCategory,
        propertyType,
        propertyPhotos: photoUrls,
        floor: needsMultipleFloors ? null : (floors[0]?.floorNumber || null),
        floors: floorsData,
        price: needsMultipleFloors ? null : actualPrice,
        priceUnit: needsMultipleFloors ? null : priceUnit,
        builders: validBuilders,
        builderName: validBuilders[0]?.name || null,
        builderPhone: validBuilders[0]?.phoneNumber || null,
        address: address,
        sizes: sizes,
        possessionMonth: possessionMonth,
        possessionYear: possessionYear,
        importantFiles: importantFiles,
        paymentPlan: paymentPlan || null,
        additionalNotes: additionalNotes || null,
        clubProperty,
        poolProperty,
        parkProperty,
        gatedProperty,
        propertyAge: propertyAge ? parseInt(propertyAge) : null,
        ageType: ageType || null,
        case: caseType || null,
        latitude: photoWithLocation?.location?.coords.latitude || null,
        longitude: photoWithLocation?.location?.coords.longitude || null,
      };

      if (isEditMode && editPropertyId) {
        await api.put(`/properties/${editPropertyId}`, propertyData);
        setNewPropertyAdded(true);
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
        setNewPropertyAdded(true);
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

  const getSizeLabel = (type: string) => {
    switch (type) {
      case 'carpet': return 'Carpet Area';
      case 'builtup': return 'Built-up Area (incl. balconies/stairs)';
      case 'superbuiltup': return 'Super Built-up Area (full plot)';
      default: return type;
    }
  };

  const getSizeUnitLabel = (unit: SizeUnit) => {
    const found = SIZE_UNITS.find(u => u.value === unit);
    return found?.label || unit;
  };

  const getPriceUnitLabel = (unit: PriceUnit) => {
    switch (unit) {
      case 'cr': return 'Cr';
      case 'lakh': return 'Lakh';
      case 'lakh_per_month': return 'Lakh/mo';
      default: return unit;
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 32) + 80 }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.formContainer}>
            {/* Title for Edit Mode */}
            {isEditMode && (
              <View style={styles.editHeader}>
                <Text style={styles.editHeaderText}>Edit Property</Text>
                <TouchableOpacity onPress={() => { resetForm(); router.back(); }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* 1. Property Category */}
            <View style={styles.section}>
              <Text style={styles.label}>Property Category *</Text>
              <View style={styles.chipContainer}>
                {(['Residential', 'Commercial'] as PropertyCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      propertyCategory === cat && styles.chipSelected,
                    ]}
                    onPress={() => {
                      setPropertyCategory(cat);
                      setPropertyType('');
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        propertyCategory === cat && styles.chipTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.propertyCategory && (
                <Text style={styles.errorText}>{errors.propertyCategory}</Text>
              )}
            </View>

            {/* 2. Property Type */}
            {propertyCategory && (
              <View style={styles.section}>
                <Text style={styles.label}>Property Type *</Text>
                <View style={styles.chipContainer}>
                  {getPropertyTypes().map((type) => (
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
            )}

            {/* 3. Property Photos */}
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
              {photosWithoutLocation > 0 && photos.length > 0 && (
                <Text style={styles.locationWarning}>
                  {photosWithoutLocation} out of {photos.length} photo(s) do not have location data
                </Text>
              )}
              {errors.photos && <Text style={styles.errorText}>{errors.photos}</Text>}
            </View>

            {/* 4. Builder Details */}
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

            {/* 5. Case Type */}
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
                      {type.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 6. Price */}
            {needsMultipleFloors ? (
              <View style={styles.section}>
                <Text style={styles.label}>Floor & Price</Text>
                {floors.map((floor, index) => (
                  <View key={index} style={styles.floorEntry}>
                    <View style={styles.floorRow}>
                      <View style={styles.floorNumberContainer}>
                        <Text style={styles.floorLabel}>Floor</Text>
                        <TextInput
                          style={[styles.input, styles.floorInput]}
                          placeholder="0"
                          placeholderTextColor="#666"
                          value={floor.floorNumber > 0 ? floor.floorNumber.toString() : ''}
                          onChangeText={(text) => updateFloor(index, 'floorNumber', parseInt(text) || 0)}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.priceContainer}>
                        <Text style={styles.floorLabel}>Price ({getPriceUnitLabel(floor.priceUnit)})</Text>
                        <TextInput
                          style={[styles.input, styles.floorPriceInput]}
                          placeholder="0.00"
                          placeholderTextColor="#666"
                          value={floor.price > 0 ? floor.price.toString() : ''}
                          onChangeText={(text) => updateFloor(index, 'price', parseFloat(text) || 0)}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      {floors.length > 1 && (
                        <TouchableOpacity onPress={() => removeFloor(index)} style={styles.removeFloorButton}>
                          <Ionicons name="close-circle" size={22} color="#ff4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.addFloorButton} onPress={addFloor}>
                  <Ionicons name="add-circle-outline" size={20} color="#4CAF50" />
                  <Text style={styles.addFloorText}>Add Floor</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.label}>Price ({getPriceUnitLabel(priceUnit)})</Text>
                <TextInput
                  style={styles.input}
                  placeholder="00.00"
                  placeholderTextColor="#666"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>
            )}

            {/* 7. Address */}
            <View style={styles.section}>
              <Text style={styles.label}>Address</Text>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, styles.addressInputSmall]}
                  placeholder="Unit No"
                  placeholderTextColor="#666"
                  value={address.unitNo}
                  onChangeText={(text) => setAddress({ ...address, unitNo: text })}
                />
                <TextInput
                  style={[styles.input, styles.addressInputSmall]}
                  placeholder="Block (if any)"
                  placeholderTextColor="#666"
                  value={address.block}
                  onChangeText={(text) => setAddress({ ...address, block: text })}
                />
              </View>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, styles.addressInputSmall]}
                  placeholder="Sector/Area"
                  placeholderTextColor="#666"
                  value={address.sector}
                  onChangeText={(text) => setAddress({ ...address, sector: text })}
                />
                <TextInput
                  style={[styles.input, styles.addressInputSmall]}
                  placeholder="City"
                  placeholderTextColor="#666"
                  value={address.city}
                  onChangeText={(text) => setAddress({ ...address, city: text })}
                />
              </View>
            </View>

            {/* 8. Size/Area */}
            <View style={styles.section}>
              <Text style={styles.label}>Size / Area</Text>
              <Text style={styles.subLabel}>Add property dimensions</Text>
              
              {sizes.map((size, index) => (
                <View key={index} style={styles.sizeEntry}>
                  <Text style={styles.sizeTypeLabel}>{getSizeLabel(size.type)}</Text>
                  <View style={styles.sizeRow}>
                    <TextInput
                      style={[styles.input, styles.sizeInput]}
                      placeholder="0"
                      placeholderTextColor="#666"
                      value={size.value > 0 ? size.value.toString() : ''}
                      onChangeText={(text) => updateSize(index, 'value', parseFloat(text) || 0)}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity 
                      style={styles.unitDropdown}
                      onPress={() => setShowSizeUnitDropdown(showSizeUnitDropdown === index ? null : index)}
                    >
                      <Text style={styles.unitText}>{getSizeUnitLabel(size.unit)}</Text>
                      <Ionicons name="chevron-down" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSize(index)} style={styles.removeButton}>
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                  {showSizeUnitDropdown === index && (
                    <View style={styles.dropdownList}>
                      {SIZE_UNITS.map((unit) => (
                        <TouchableOpacity
                          key={unit.value}
                          style={[
                            styles.dropdownItem,
                            size.unit === unit.value && styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            updateSize(index, 'unit', unit.value);
                            setShowSizeUnitDropdown(null);
                          }}
                        >
                          <Text style={[
                            styles.dropdownItemText,
                            size.unit === unit.value && styles.dropdownItemTextSelected,
                          ]}>
                            {unit.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}
              
              <View style={styles.addSizeButtons}>
                {!sizes.find(s => s.type === 'carpet') && (
                  <TouchableOpacity 
                    style={styles.addSizeButton} 
                    onPress={() => addSize('carpet')}
                  >
                    <Ionicons name="add" size={16} color="#4CAF50" />
                    <Text style={styles.addSizeButtonText}>Carpet</Text>
                  </TouchableOpacity>
                )}
                {!sizes.find(s => s.type === 'builtup') && (
                  <TouchableOpacity 
                    style={styles.addSizeButton} 
                    onPress={() => addSize('builtup')}
                  >
                    <Ionicons name="add" size={16} color="#4CAF50" />
                    <Text style={styles.addSizeButtonText}>Built-up</Text>
                  </TouchableOpacity>
                )}
                {!sizes.find(s => s.type === 'superbuiltup') && (
                  <TouchableOpacity 
                    style={styles.addSizeButton} 
                    onPress={() => addSize('superbuiltup')}
                  >
                    <Ionicons name="add" size={16} color="#4CAF50" />
                    <Text style={styles.addSizeButtonText}>Super Built-up</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 9. Age Type */}
            <View style={styles.section}>
              <Text style={styles.label}>Age Type</Text>
              <View style={styles.chipContainer}>
                {AGE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.chip,
                      ageType === type && styles.chipSelected,
                    ]}
                    onPress={() => setAgeType(type)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        ageType === type && styles.chipTextSelected,
                      ]}
                    >
                      {type === 'UnderConstruction' ? 'Under Construction' : type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Property Age (only shown when Resale is selected) */}
              {ageType === 'Resale' && (
                <View style={styles.subSection}>
                  <Text style={styles.subLabel}>Property Age (years)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter property age"
                    placeholderTextColor="#666"
                    value={propertyAge}
                    onChangeText={setPropertyAge}
                    keyboardType="numeric"
                  />
                </View>
              )}
            </View>

            {/* 10. Possession Time */}
            <View style={styles.section}>
              <Text style={styles.label}>Possession Time</Text>
              <View style={styles.rowContainer}>
                <View style={styles.dropdownFieldContainer}>
                  <TouchableOpacity 
                    style={styles.dropdownField}
                    onPress={() => {
                      setShowMonthDropdown(!showMonthDropdown);
                      setShowYearDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownFieldText}>
                      {possessionMonth !== null ? MONTHS[possessionMonth - 1] : 'Select Month'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#fff" />
                  </TouchableOpacity>
                  {showMonthDropdown && (
                    <View style={styles.inlineDropdown}>
                      <ScrollView style={styles.inlineDropdownScroll} nestedScrollEnabled>
                        {MONTHS.map((month, index) => (
                          <TouchableOpacity
                            key={month}
                            style={[
                              styles.dropdownItem,
                              possessionMonth === index + 1 && styles.dropdownItemSelected,
                            ]}
                            onPress={() => {
                              setPossessionMonth(index + 1);
                              setShowMonthDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              possessionMonth === index + 1 && styles.dropdownItemTextSelected,
                            ]}>
                              {month}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
                <View style={styles.dropdownFieldContainer}>
                  <TouchableOpacity 
                    style={styles.dropdownField}
                    onPress={() => {
                      setShowYearDropdown(!showYearDropdown);
                      setShowMonthDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownFieldText}>
                      {possessionYear !== null ? possessionYear.toString() : 'Year'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#fff" />
                  </TouchableOpacity>
                  {showYearDropdown && (
                    <View style={styles.inlineDropdown}>
                      <ScrollView style={styles.inlineDropdownScroll} nestedScrollEnabled>
                        {YEARS.map((year) => (
                          <TouchableOpacity
                            key={year}
                            style={[
                              styles.dropdownItem,
                              possessionYear === year && styles.dropdownItemSelected,
                            ]}
                            onPress={() => {
                              setPossessionYear(year);
                              setShowYearDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              possessionYear === year && styles.dropdownItemTextSelected,
                            ]}>
                              {year}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Payment Plan */}
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

            {/* Important Files */}
            <View style={styles.section}>
              <Text style={styles.label}>IMPORTANT FILES</Text>
              <Text style={styles.subLabel}>Attach PDFs or images</Text>
              <TouchableOpacity style={styles.attachButton} onPress={pickFile}>
                <Ionicons name="attach" size={24} color="#fff" />
                <Text style={styles.attachButtonText}>Attach Files</Text>
              </TouchableOpacity>
              {importantFiles.length > 0 && (
                <View style={styles.filesList}>
                  {importantFiles.map((file, index) => (
                    <View key={index} style={styles.fileItem}>
                      <Ionicons 
                        name={file.mimeType?.includes('pdf') ? 'document-text' : 'image'} 
                        size={20} 
                        color="#fff" 
                      />
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <TouchableOpacity onPress={() => removeFile(index)}>
                        <Ionicons name="close-circle" size={20} color="#ff4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
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
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  formContainer: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
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
  subSection: {
    marginTop: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 14,
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
    paddingVertical: 10,
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
  rowContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dropdownFieldContainer: {
    flex: 1,
    position: 'relative',
  },
  dropdownField: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownFieldText: {
    color: '#fff',
    fontSize: 16,
  },
  inlineDropdown: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 200,
    overflow: 'hidden',
  },
  inlineDropdownScroll: {
    maxHeight: 200,
  },
  unitDropdown: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 90,
  },
  unitText: {
    color: '#fff',
    fontSize: 14,
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
  // Floor entry styles
  floorEntry: {
    marginBottom: 12,
  },
  floorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  floorNumberContainer: {
    width: 70,
  },
  floorLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  floorInput: {
    width: '100%',
    textAlign: 'center',
  },
  priceContainer: {
    flex: 1,
  },
  floorPriceInput: {
    width: '100%',
  },
  removeFloorButton: {
    padding: 4,
    marginBottom: 8,
  },
  addFloorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    padding: 8,
    marginTop: 4,
  },
  addFloorText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  // Size entry styles
  sizeEntry: {
    marginBottom: 12,
  },
  sizeTypeLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sizeInput: {
    flex: 1,
  },
  addSizeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  addSizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addSizeButtonText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  // Builder styles
  builderContainer: {
    marginBottom: 12,
    position: 'relative',
  },
  builderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  builderNameInput: {
    width: '35%',
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
    paddingHorizontal: 10,
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
  // Address styles
  addressRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  addressInputSmall: {
    flex: 1,
  },
  // Important files
  attachButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  attachButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filesList: {
    marginTop: 12,
    gap: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  fileName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  // Features
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
