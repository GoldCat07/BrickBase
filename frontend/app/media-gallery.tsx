import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
  Modal,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_WIDTH - 48) / 2; // 2 columns with padding

interface MediaItem {
  uri: string;
  type: 'photo' | 'video';
  index: number;
}

export default function MediaGalleryScreen() {
  const params = useLocalSearchParams();
  
  // Parse photos and videos from params
  const photosParam = params.photos as string;
  const videosParam = params.videos as string;
  const title = (params.title as string) || 'Media Gallery';
  const initialCoverIndex = params.coverIndex ? parseInt(params.coverIndex as string) : 0;
  const editMode = params.editMode === 'true';
  
  const [photos, setPhotos] = useState<string[]>(photosParam ? JSON.parse(photosParam) : []);
  const [videos, setVideos] = useState<string[]>(videosParam ? JSON.parse(videosParam) : []);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState(initialCoverIndex);
  
  const [photosExpanded, setPhotosExpanded] = useState(true);
  const [videosExpanded, setVideosExpanded] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const hasVideos = videos.length > 0;
  const hasPhotos = photos.length > 0;

  const openFullscreen = (uri: string, type: 'photo' | 'video', index: number) => {
    setSelectedMedia({ uri, type, index });
    setFullscreenVisible(true);
  };

  const closeFullscreen = () => {
    setFullscreenVisible(false);
    setSelectedMedia(null);
  };

  // Delete a photo
  const deletePhoto = useCallback((index: number) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPhotos(prev => prev.filter((_, i) => i !== index));
            // Adjust cover photo index if needed
            if (index === coverPhotoIndex) {
              setCoverPhotoIndex(0);
            } else if (index < coverPhotoIndex) {
              setCoverPhotoIndex(prev => prev - 1);
            }
            setHasChanges(true);
          },
        },
      ]
    );
  }, [coverPhotoIndex]);

  // Delete a video
  const deleteVideo = useCallback((index: number) => {
    Alert.alert(
      'Delete Video',
      'Are you sure you want to delete this video?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setVideos(prev => prev.filter((_, i) => i !== index));
            setHasChanges(true);
          },
        },
      ]
    );
  }, []);

  // Set cover photo
  const setCoverPhoto = useCallback((index: number) => {
    setCoverPhotoIndex(index);
    setHasChanges(true);
    Alert.alert('Cover Photo Set', 'This photo will be shown on the map.');
  }, []);

  // Handle going back - pass changes back if needed
  const handleBack = () => {
    if (hasChanges && editMode) {
      // Pass updated data back to previous screen
      router.back();
      // Note: In a real implementation, you'd use a state management solution
      // or callback to pass the updated photos/videos back
      router.setParams({
        updatedPhotos: JSON.stringify(photos),
        updatedVideos: JSON.stringify(videos),
        updatedCoverIndex: coverPhotoIndex.toString(),
      });
    } else {
      router.back();
    }
  };

  const renderPhotoItem = ({ item, index }: { item: string; index: number }) => {
    const isCover = index === coverPhotoIndex;
    
    return (
      <TouchableOpacity 
        style={styles.mediaItem}
        onPress={() => openFullscreen(item, 'photo', index)}
        onLongPress={() => {
          Alert.alert(
            'Photo Options',
            'What would you like to do?',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: isCover ? 'Already Cover Photo' : 'Set as Cover Photo', 
                onPress: () => !isCover && setCoverPhoto(index),
                style: isCover ? 'default' : 'default'
              },
              { 
                text: 'Delete', 
                onPress: () => deletePhoto(index),
                style: 'destructive'
              },
            ]
          );
        }}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item }} style={styles.mediaImage} resizeMode="cover" />
        
        {/* Cover photo badge */}
        {isCover && (
          <View style={styles.coverBadge}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.coverBadgeText}>Cover</Text>
          </View>
        )}
        
        {/* Delete button (always visible in edit mode) */}
        {editMode && (
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={() => deletePhoto(index)}
          >
            <Ionicons name="close-circle" size={24} color="#ff4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderVideoItem = ({ item, index }: { item: string; index: number }) => (
    <TouchableOpacity 
      style={styles.mediaItem}
      onPress={() => openFullscreen(item, 'video', index)}
      onLongPress={() => {
        Alert.alert(
          'Delete Video',
          'Do you want to delete this video?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Delete', 
              onPress: () => deleteVideo(index),
              style: 'destructive'
            },
          ]
        );
      }}
      activeOpacity={0.8}
    >
      <Video
        source={{ uri: item }}
        style={styles.mediaImage}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted={true}
      />
      <View style={styles.playOverlay}>
        <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
      </View>
      
      {/* Delete button (always visible in edit mode) */}
      {editMode && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => deleteVideo(index)}
        >
          <Ionicons name="close-circle" size={24} color="#ff4444" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerRight}>
          {hasChanges && (
            <View style={styles.unsavedBadge}>
              <Text style={styles.unsavedText}>Edited</Text>
            </View>
          )}
        </View>
      </View>

      {/* Tips banner */}
      {editMode && (hasPhotos || hasVideos) && (
        <View style={styles.tipsBanner}>
          <Ionicons name="information-circle" size={18} color="#2196F3" />
          <Text style={styles.tipsText}>
            Long-press on a photo to set as cover or delete. Tap to preview.
          </Text>
        </View>
      )}

      <FlatList
        data={[1]} // Single item to render sections
        renderItem={() => (
          <View style={styles.content}>
            {/* Videos Section */}
            {hasVideos && (
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => setVideosExpanded(!videosExpanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Ionicons name="videocam" size={22} color="#6B21A8" />
                    <Text style={styles.sectionTitle}>Videos</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{videos.length}</Text>
                    </View>
                  </View>
                  <Ionicons 
                    name={videosExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color="#888" 
                  />
                </TouchableOpacity>
                
                {videosExpanded && (
                  <FlatList
                    data={videos}
                    renderItem={({ item, index }) => renderVideoItem({ item, index })}
                    keyExtractor={(item, index) => `video-${index}`}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    scrollEnabled={false}
                    contentContainerStyle={styles.mediaGrid}
                  />
                )}
              </View>
            )}

            {/* Photos Section */}
            {hasPhotos && (
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => setPhotosExpanded(!photosExpanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Ionicons name="images" size={22} color="#4CAF50" />
                    <Text style={styles.sectionTitle}>Photos</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{photos.length}</Text>
                    </View>
                  </View>
                  <Ionicons 
                    name={photosExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color="#888" 
                  />
                </TouchableOpacity>
                
                {photosExpanded && (
                  <FlatList
                    data={photos}
                    renderItem={({ item, index }) => renderPhotoItem({ item, index })}
                    keyExtractor={(item, index) => `photo-${index}`}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    scrollEnabled={false}
                    contentContainerStyle={styles.mediaGrid}
                  />
                )}
              </View>
            )}

            {/* Empty State */}
            {!hasPhotos && !hasVideos && (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={64} color="#444" />
                <Text style={styles.emptyText}>No media available</Text>
                <Text style={styles.emptySubtext}>Add photos or videos from the property form</Text>
              </View>
            )}
          </View>
        )}
        keyExtractor={() => 'main'}
        showsVerticalScrollIndicator={false}
      />

      {/* Fullscreen Modal */}
      <Modal
        visible={fullscreenVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeFullscreen}
      >
        <View style={styles.fullscreenContainer}>
          {/* Close button */}
          <TouchableOpacity 
            style={styles.fullscreenClose}
            onPress={closeFullscreen}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          
          {/* Action buttons for photos */}
          {selectedMedia?.type === 'photo' && (
            <View style={styles.fullscreenActions}>
              {selectedMedia.index !== coverPhotoIndex && (
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => {
                    setCoverPhoto(selectedMedia.index);
                    closeFullscreen();
                  }}
                >
                  <Ionicons name="star" size={24} color="#FFD700" />
                  <Text style={styles.actionButtonText}>Set as Cover</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteActionButton]}
                onPress={() => {
                  closeFullscreen();
                  deletePhoto(selectedMedia.index);
                }}
              >
                <Ionicons name="trash" size={24} color="#ff4444" />
                <Text style={[styles.actionButtonText, { color: '#ff4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Action buttons for videos */}
          {selectedMedia?.type === 'video' && (
            <View style={styles.fullscreenActions}>
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteActionButton]}
                onPress={() => {
                  closeFullscreen();
                  deleteVideo(selectedMedia.index);
                }}
              >
                <Ionicons name="trash" size={24} color="#ff4444" />
                <Text style={[styles.actionButtonText, { color: '#ff4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Cover badge indicator */}
          {selectedMedia?.type === 'photo' && selectedMedia.index === coverPhotoIndex && (
            <View style={styles.fullscreenCoverBadge}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.fullscreenCoverText}>Cover Photo</Text>
            </View>
          )}
          
          {selectedMedia?.type === 'photo' ? (
            <Image 
              source={{ uri: selectedMedia.uri }} 
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : selectedMedia?.type === 'video' ? (
            <Video
              source={{ uri: selectedMedia.uri }}
              style={styles.fullscreenVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
              useNativeControls={true}
              isLooping={true}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    width: 60,
    alignItems: 'flex-end',
  },
  unsavedBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unsavedText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '600',
  },
  tipsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tipsText: {
    color: '#2196F3',
    fontSize: 12,
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 10,
  },
  countBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 10,
  },
  countText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  mediaGrid: {
    paddingBottom: 8,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  coverBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  coverBadgeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#444',
    fontSize: 13,
    marginTop: 4,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenActions: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    gap: 20,
    zIndex: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
  },
  deleteActionButton: {
    backgroundColor: 'rgba(255,68,68,0.15)',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fullscreenCoverBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    zIndex: 10,
  },
  fullscreenCoverText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  fullscreenVideo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
  },
});
