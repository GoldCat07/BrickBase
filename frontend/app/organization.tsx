import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { router } from 'expo-router';
import api from '../lib/api';
import * as Clipboard from 'expo-clipboard';

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  invite_code: string;
  employee_seats: number;
  member_count: number;
  created_at: string;
}

interface Member {
  id: string;
  name: string;
  mobile: string;
  profile_photo: string | null;
  role: string;
  joined_at: string;
}

export default function OrganizationScreen() {
  const { user, refreshUser } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await api.get('/organization');
      setOrganization(response.data.organization);
      
      if (response.data.organization) {
        const membersResponse = await api.get('/organization/members');
        setMembers(membersResponse.data);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!user?.is_pro) {
      Alert.alert(
        'Pro Required',
        'Only Pro owners can create organizations and add employees.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go Pro', onPress: () => router.push('/subscription') },
        ]
      );
      return;
    }

    Alert.prompt(
      'Create Organization',
      'Enter your organization name:',
      async (name) => {
        if (name && name.trim()) {
          setCreating(true);
          try {
            await api.post('/organization', { name: name.trim(), employee_seats: 0 });
            await fetchOrganization();
            await refreshUser();
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to create organization');
          } finally {
            setCreating(false);
          }
        }
      },
      'plain-text',
      user?.firm_name || ''
    );
  };

  const handleShareInvite = async () => {
    if (!organization) return;
    
    const inviteLink = `https://yourapp.com/invite/${organization.invite_code}`;
    const message = `You're invited to join ${organization.name} on our Real Estate app!\n\nJoin using this link:\n${inviteLink}\n\nOr use invite code: ${organization.invite_code}`;
    
    try {
      await Share.share({
        message,
        title: `Join ${organization.name}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleCopyCode = async () => {
    if (!organization) return;
    await Clipboard.setStringAsync(organization.invite_code);
    Alert.alert('Copied!', 'Invite code copied to clipboard');
  };

  const handleRemoveMember = (member: Member) => {
    if (member.role === 'owner') {
      Alert.alert('Cannot Remove', 'You cannot remove the organization owner.');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.name} from the organization?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/organization/members/${member.id}`);
              setMembers(members.filter(m => m.id !== member.id));
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleAddSeats = () => {
    router.push('/subscription');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  // No organization - show setup
  if (!organization && user?.role === 'owner') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="business" size={80} color="#333" />
          </View>
          <Text style={styles.emptyTitle}>Set Up Your Organization</Text>
          <Text style={styles.emptySubtitle}>
            Create an organization to invite team members and collaborate on properties.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={styles.featureText}>Invite employees to your team</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={styles.featureText}>Share property listings</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={styles.featureText}>Collaborate in real-time</Text>
            </View>
          </View>

          {!user?.is_pro && (
            <View style={styles.proNotice}>
              <Ionicons name="lock-closed" size={24} color="#FFD700" />
              <View style={styles.proNoticeText}>
                <Text style={styles.proNoticeTitle}>Pro Feature</Text>
                <Text style={styles.proNoticeSubtitle}>Only Pro owners can create organizations</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.createButton,
              !user?.is_pro && styles.createButtonDisabled
            ]}
            onPress={user?.is_pro ? handleCreateOrganization : () => router.push('/subscription')}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name={user?.is_pro ? "add-circle" : "star"} size={24} color="#000" />
                <Text style={styles.createButtonText}>
                  {user?.is_pro ? 'Create Organization' : 'Go Pro - Just \u20B92,999/month'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!user?.is_pro && (
            <TouchableOpacity
              style={styles.browsePlansButton}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.browsePlansText}>Browse Plans</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Employee view or no org
  if (!organization) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="business" size={80} color="#333" />
          <Text style={styles.emptyTitle}>No Organization</Text>
          <Text style={styles.emptySubtitle}>
            You're not part of any organization yet. Ask your team owner for an invite link.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Organization exists - show details
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Organization Header */}
        <View style={styles.orgHeader}>
          <View style={styles.orgIconContainer}>
            <Ionicons name="business" size={40} color="#4CAF50" />
          </View>
          <Text style={styles.orgName}>{organization.name}</Text>
          <Text style={styles.orgOwner}>Owner: {organization.owner_name}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{organization.member_count}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{organization.employee_seats}</Text>
            <Text style={styles.statLabel}>Seats</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {Math.max(0, organization.employee_seats - organization.member_count + 1)}
            </Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
        </View>

        {/* Invite Section - Owner only */}
        {user?.role === 'owner' && (
          <View style={styles.inviteSection}>
            <Text style={styles.sectionTitle}>Invite Employees</Text>
            
            <View style={styles.inviteCodeContainer}>
              <Text style={styles.inviteCodeLabel}>Invite Code</Text>
              <View style={styles.inviteCodeRow}>
                <Text style={styles.inviteCode}>{organization.invite_code}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
                  <Ionicons name="copy" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.shareButton} onPress={handleShareInvite}>
              <Ionicons name="share-social" size={20} color="#fff" />
              <Text style={styles.shareButtonText}>Share Invite Link</Text>
            </TouchableOpacity>

            {organization.member_count > organization.employee_seats && (
              <TouchableOpacity style={styles.addSeatsButton} onPress={handleAddSeats}>
                <Ionicons name="add-circle" size={20} color="#FFD700" />
                <Text style={styles.addSeatsText}>Add More Employee Seats</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Members List */}
        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>Team Members ({members.length})</Text>
          
          {members.map((member) => (
            <View key={member.id} style={styles.memberItem}>
              <View style={styles.memberAvatarContainer}>
                {member.profile_photo ? (
                  <Image source={{ uri: member.profile_photo }} style={styles.memberAvatar} />
                ) : (
                  <View style={styles.memberAvatarPlaceholder}>
                    <Ionicons name="person" size={24} color="#666" />
                  </View>
                )}
              </View>
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  {member.role === 'owner' && (
                    <View style={styles.ownerBadge}>
                      <Text style={styles.ownerBadgeText}>Owner</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.memberMobile}>+91 {member.mobile}</Text>
              </View>
              {user?.role === 'owner' && member.role !== 'owner' && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveMember(member)}
                >
                  <Ionicons name="close-circle" size={24} color="#ff4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  featureList: {
    gap: 16,
    marginBottom: 32,
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    color: '#fff',
    fontSize: 16,
  },
  proNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
    width: '100%',
  },
  proNoticeText: {
    flex: 1,
  },
  proNoticeTitle: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 16,
  },
  proNoticeSubtitle: {
    color: '#999',
    fontSize: 14,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    width: '100%',
  },
  createButtonDisabled: {
    backgroundColor: '#FFD700',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  browsePlansButton: {
    padding: 16,
  },
  browsePlansText: {
    color: '#fff',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  orgHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 24,
  },
  orgIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  orgName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  orgOwner: {
    fontSize: 14,
    color: '#999',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  inviteSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  inviteCodeContainer: {
    backgroundColor: '#0c0c0c',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  inviteCodeLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    letterSpacing: 2,
  },
  copyButton: {
    padding: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  addSeatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 12,
  },
  addSeatsText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 16,
  },
  membersSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  memberAvatarContainer: {
    marginRight: 16,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  memberAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0c0c0c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  ownerBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ownerBadgeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: 'bold',
  },
  memberMobile: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
});
