import React, { useState } from 'react';
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
}

export default function MediaGalleryScreen() {
  const params = useLocalSearchParams();
  
  // Parse photos and videos from params
  const photosParam = params.photos as string;
  const videosParam = params.videos as string;
  const title = (params.title as string) || 'Media Gallery';
  
  const photos: string[] = photosParam ? JSON.parse(photosParam) : [];
  const videos: string[] = videosParam ? JSON.parse(videosParam) : [];
  
  const [photosExpanded, setPhotosExpanded] = useState(true);
  const [videosExpanded, setVideosExpanded] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  const hasVideos = videos.length > 0;
  const hasPhotos = photos.length > 0;

  const openFullscreen = (uri: string, type: 'photo' | 'video') => {
    setSelectedMedia({ uri, type });
    setFullscreenVisible(true);
  };

  const closeFullscreen = () => {
    setFullscreenVisible(false);
    setSelectedMedia(null);
  };

  const renderPhotoItem = ({ item }: { item: string }) => (
    <TouchableOpacity 
      style={styles.mediaItem}
      onPress={() => openFullscreen(item, 'photo')}
      activeOpacity={0.8}
    >
      <Image source={{ uri: item }} style={styles.mediaImage} resizeMode="cover" />
    </TouchableOpacity>
  );

  const renderVideoItem = ({ item }: { item: string }) => (
    <TouchableOpacity 
      style={styles.mediaItem}
      onPress={() => openFullscreen(item, 'video')}
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
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

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
                    <Ionicons name="videocam" size={22} color="#2196F3" />
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
                    renderItem={renderVideoItem}
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
                    renderItem={renderPhotoItem}
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
          <TouchableOpacity 
            style={styles.fullscreenClose}
            onPress={closeFullscreen}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          
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
    paddingHorizontal: 4,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
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
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  fullscreenVideo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
});
