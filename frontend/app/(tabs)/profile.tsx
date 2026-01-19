import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '../../lib/api';

export default function ProfileScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    refreshUser();
  }, []);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setUploading(true);
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        
        await api.put('/auth/profile', null, {
          params: { profile_photo: base64Image }
        });
        
        await refreshUser();
        setUploading(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to update profile photo');
      setUploading(false);
    }
  };

  const handleOrganization = () => {
    router.push('/organization');
  };

  const handleSubscription = () => {
    router.push('/subscription');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.avatar} />
            ) : (
              <Ionicons name="person" size={48} color="#fff" />
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.firmName}>{user?.firm_name}</Text>
          
          {/* Pro Badge */}
          {user?.is_pro && (
            <View style={styles.proBadge}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.proText}>Pro</Text>
            </View>
          )}
        </View>

        {/* User Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoItem}>
            <Ionicons name="call" size={20} color="#666" />
            <Text style={styles.infoText}>+91 {user?.mobile}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="mail" size={20} color="#666" />
            <Text style={styles.infoText}>{user?.email}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="location" size={20} color="#666" />
            <Text style={styles.infoText}>{user?.city}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="person" size={20} color="#666" />
            <Text style={styles.infoText}>{user?.role === 'owner' ? 'Owner' : 'Employee'}</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {user?.role === 'owner' && (
            <TouchableOpacity style={styles.menuItem} onPress={handleSubscription}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(255, 215, 0, 0.1)' }]}>
                  <Ionicons name="diamond" size={22} color="#FFD700" />
                </View>
                <View>
                  <Text style={styles.menuItemText}>Subscription</Text>
                  <Text style={styles.menuItemSubtext}>
                    {user?.is_pro ? 'Pro Plan Active' : 'Upgrade to Pro'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#666" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={handleOrganization}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]}>
                <Ionicons name="business" size={22} color="#4CAF50" />
              </View>
              <View>
                <Text style={styles.menuItemText}>Organization</Text>
                <Text style={styles.menuItemSubtext}>
                  {user?.organization_id ? 'View team members' : 'Set up your team'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: 'rgba(33, 150, 243, 0.1)' }]}>
                <Ionicons name="settings-outline" size={22} color="#2196F3" />
              </View>
              <Text style={styles.menuItemText}>Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: 'rgba(156, 39, 176, 0.1)' }]}>
                <Ionicons name="help-circle-outline" size={22} color="#9C27B0" />
              </View>
              <Text style={styles.menuItemText}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: 'rgba(255, 152, 0, 0.1)' }]}>
                <Ionicons name="information-circle-outline" size={22} color="#FF9800" />
              </View>
              <Text style={styles.menuItemText}>About</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#ff4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.version}>Version 2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 24,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#333',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 6,
  },
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  firmName: {
    color: '#999',
    fontSize: 16,
    marginBottom: 12,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  proText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
  },
  infoSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    color: '#fff',
    fontSize: 15,
  },
  menuSection: {
    gap: 8,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  menuItemSubtext: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  signOutText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
