import React, { useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PropertyType, CaseType } from '../../types/property';

const PROPERTY_TYPES: PropertyType[] = ['Plot', 'Builder Floor', 'Villa/House', 'Apartment Society'];
const CASE_TYPES: CaseType[] = ['REGISTRY_CASE', 'TRANSFER_CASE', 'OTHER'];

export default function AddPropertyScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [photos, setPhotos] = useState<Array<{ uri: string; base64?: string; location?: Location.LocationObject }>>([]);
  const [floor, setFloor] = useState('');
  const [price, setPrice] = useState('');
  const [builderName, setBuilderName] = useState('');
  const [builderPhone, setBuilderPhone] = useState('');
  const [black, setBlack] = useState('');
  const [white, setWhite] = useState('');
  const [possessionDate, setPossessionDate] = useState('');
  const [clubProperty, setClubProperty] = useState(false);
  const [poolProperty, setPoolProperty] = useState(false);
  const [parkProperty, setParkProperty] = useState(false);
  const [gatedProperty, setGatedProperty] = useState(false);
  const [propertyAge, setPropertyAge] = useState('');
  const [handoverDate, setHandoverDate] = useState('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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

    if (builderPhone && builderPhone.length < 10) {
      newErrors.builderPhone = 'Phone number should be at least 10 digits';
    }

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

      setPhotos([...photos, {
        uri: result.assets[0].uri,
        base64: result.assets[0].base64,
        location,
      }]);
    }
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
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map(asset => {
        const hasLocation = asset.exif?.GPSLatitude && asset.exif?.GPSLongitude;
        
        if (!hasLocation) {
          Alert.alert(
            'No Location Data',
            'This photo does not contain location data. It will not be visible on the map.',
            [{ text: 'OK' }]
          );
        }

        return {
          uri: asset.uri,
          base64: asset.base64,
          location: hasLocation ? {
            coords: {
              latitude: asset.exif.GPSLatitude,
              longitude: asset.exif.GPSLongitude,
              altitude: null,
              accuracy: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as Location.LocationObject : undefined,
        };
      });

      setPhotos([...photos, ...newPhotos]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const uploadImagesToStorage = async (propertyId: string) => {
    const uploadedUrls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      if (!photo.base64) continue;

      try {
        const fileName = `${propertyId}/photo_${i}_${Date.now()}.jpg`;
        const { data, error } = await supabase.storage
          .from('property-images')
          .upload(fileName, Buffer.from(photo.base64, 'base64'), {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('property-images')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      } catch (error) {
        console.error('Error uploading image:', error);
        // Fallback to base64
        uploadedUrls.push(`data:image/jpeg;base64,${photo.base64}`);
      }
    }

    return uploadedUrls;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fix the errors before submitting');
      return;
    }

    setLoading(true);
    try {
      // Create builder if name provided
      let builderId = null;
      if (builderName) {
        const { data: builderData, error: builderError } = await supabase
          .from('Builder')
          .insert({
            name: builderName,
            phoneNumber: builderPhone,
          })
          .select()
          .single();

        if (builderError) throw builderError;
        builderId = builderData?.id;
      }

      // Generate property ID
      const propertyId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Upload images
      const photoUrls = await uploadImagesToStorage(propertyId);

      // Get location from first photo with location
      const photoWithLocation = photos.find(p => p.location);
      
      // Create property
      const propertyData = {
        id: propertyId,
        propertyType,
        propertyPhotos: photoUrls,
        floor: floor ? parseInt(floor) : null,
        price: price ? parseFloat(price) : null,
        builderId,
        black: black ? parseFloat(black) : null,
        white: white ? parseFloat(white) : null,
        blackPercentage: black && price ? (parseFloat(black) / parseFloat(price)) * 100 : null,
        whitePercentage: white && price ? (parseFloat(white) / parseFloat(price)) * 100 : null,
        possessionDate: possessionDate || null,
        clubProperty,
        poolProperty,
        parkProperty,
        gatedProperty,
        propertyAge: propertyAge ? parseInt(propertyAge) : null,
        handoverDate: handoverDate || null,
        case: caseType || null,
        userId: user?.id,
        latitude: photoWithLocation?.location?.coords.latitude,
        longitude: photoWithLocation?.location?.coords.longitude,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('Property')
        .insert(propertyData);

      if (error) throw error;

      Alert.alert('Success', 'Property added successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Reset form
            setPropertyType('');
            setPhotos([]);
            setFloor('');
            setPrice('');
            setBuilderName('');
            setBuilderPhone('');
            setBlack('');
            setWhite('');
            setPossessionDate('');
            setClubProperty(false);
            setPoolProperty(false);
            setParkProperty(false);
            setGatedProperty(false);
            setPropertyAge('');
            setHandoverDate('');
            setCaseType('');
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add property');
    } finally {
      setLoading(false);
    }
  };

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
              <ScrollView horizontal style={styles.photoPreviewContainer}>
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
            {errors.photos && <Text style={styles.errorText}>{errors.photos}</Text>}
          </View>

          {/* Price */}
          <View style={styles.section}>
            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter price"
              placeholderTextColor="#666"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />
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

          {/* Builder Details */}
          <View style={styles.section}>
            <Text style={styles.label}>Builder Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter builder name"
              placeholderTextColor="#666"
              value={builderName}
              onChangeText={setBuilderName}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Builder Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter builder phone number"
              placeholderTextColor="#666"
              value={builderPhone}
              onChangeText={setBuilderPhone}
              keyboardType="phone-pad"
            />
            {errors.builderPhone && (
              <Text style={styles.errorText}>{errors.builderPhone}</Text>
            )}
          </View>

          {/* Payment Details */}
          <View style={styles.section}>
            <Text style={styles.label}>Black Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter black amount"
              placeholderTextColor="#666"
              value={black}
              onChangeText={setBlack}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>White Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter white amount"
              placeholderTextColor="#666"
              value={white}
              onChangeText={setWhite}
              keyboardType="numeric"
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

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitButtonText}>Add Property</Text>
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
