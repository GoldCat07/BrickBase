// This file provides map components that work on native only
// For web, we return null components
import { Platform } from 'react-native';

let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

// Only import on native platforms
if (Platform.OS !== 'web') {
  try {
    const RNMaps = require('react-native-maps');
    MapView = RNMaps.default;
    Marker = RNMaps.Marker;
    PROVIDER_GOOGLE = RNMaps.PROVIDER_GOOGLE;
  } catch (e) {
    console.warn('react-native-maps not available');
  }
}

export { MapView, Marker, PROVIDER_GOOGLE };
