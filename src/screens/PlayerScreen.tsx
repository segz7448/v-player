import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Video, {
  OnAudioTracksData,
  OnBufferData,
  OnLoadData,
  OnPictureInPictureStatusChangedData,
  OnProgressData,
  SelectedTrackType,
  VideoRef,
} from 'react-native-video';
import Slider from '@react-native-community/slider';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import { VolumeManager } from 'react-native-volume-manager';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { useDataSaver } from '@/utils/dataSaverContext';
import { isFavorite, recordPlayed, toggleFavorite, updatePlaybackPosition } from '@/utils/library';
import { isEqualizerSupported } from '@/utils/useEqualizer';
import EqualizerModal from '@/components/EqualizerModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

const DOUBLE_TAP_WINDOW_MS = 350;
const SEEK_INCREMENT_SEC = 10;
const POSITION_SAVE_INTERVAL_SEC = 5;
// How many vertical pixels of swipe correspond to a full 0->1 volume/brightness sweep.
const SWIPE_FULL_RANGE_PX = 220;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

interface VideoTrackOption {
  index: number;
  label: string;
  bitrate?: number;
  height?: number;
}

interface AudioTrackOption {
  index: number;
  label: string;
  language?: string;
}

export default function PlayerScreen({ route, navigation }: Props) {
  const { source, resumeAtSec } = route.params;
  const { maxBitrateBps } = useDataSaver();

  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [fav, setFav] = useState(false);
  const [videoTracks, setVideoTracks] = useState<VideoTrackOption[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | undefined>(undefined);
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | undefined>(undefined);
  const [tracksModalTab, setTracksModalTab] = useState<'quality' | 'audio' | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [isPipActive, setIsPipActive] = useState(false);
  const [supportBannerVisible, setSupportBannerVisible] = useState(Boolean(source.supportNote));
  const [equalizerVisible, setEqualizerVisible] = useState(false);

  // Double-tap seek accumulation state
  const lastTapRef = useRef<{ side: 'left' | 'right'; time: number } | null>(null);
  const seekAccumRef = useRef(0);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ side: 'left' | 'right'; amount: number } | null>(
    null
  );

  // Volume / brightness swipe state
  const [volumeLevel, setVolumeLevel] = useState(0.5);
  const [brightnessLevel, setBrightnessLevel] = useState(0.5);
  const [swipeFeedback, setSwipeFeedback] = useState<
    { kind: 'volume' | 'brightness'; value: number } | null
  >(null);
  const swipeStartValueRef = useRef(0.5);
  const swipeFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessPermissionRef = useRef<boolean>(false);

  const lastSavedPositionRef = useRef(0);
  const hasResumedRef = useRef(false);

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    activateKeepAwakeAsync().catch(() => {});
    isFavorite(source.uri).then(setFav);

    VolumeManager.getVolume().then((res) => {
      const v = typeof res === 'number' ? res : res?.volume;
      if (typeof v === 'number') setVolumeLevel(v);
    }).catch(() => {});

    (async () => {
      try {
        const { status } = await Brightness.requestPermissionsAsync();
        brightnessPermissionRef.current = status === 'granted';
        if (status === 'granted') {
          const current = await Brightness.getBrightnessAsync();
          setBrightnessLevel(current);
        }
      } catch {
        brightnessPermissionRef.current = false;
      }
    })();

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      deactivateKeepAwake().catch(() => {});
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (swipeFeedbackTimeoutRef.current) clearTimeout(swipeFeedbackTimeoutRef.current);
    };
  }, [source.uri]);

  // Record into history once, on mount
  useEffect(() => {
    recordPlayed(source, resumeAtSec);
  }, [source, resumeAtSec]);

  const handleLoad = useCallback(
    (data: OnLoadData) => {
      setLoading(false);
      setDuration(data.duration);

      const tracks: VideoTrackOption[] = (data.videoTracks ?? []).map((t, idx) => ({
        index: t.trackId != null ? Number(t.trackId) : idx,
        label:
          t.height != null
            ? `${t.height}p${t.bitrate ? ` \u00b7 ${Math.round(t.bitrate / 1000)}kbps` : ''}`
            : `Track ${idx + 1}`,
        bitrate: t.bitrate ?? undefined,
        height: t.height ?? undefined,
      }));
      setVideoTracks(tracks);

      const aTracks: AudioTrackOption[] = (data.audioTracks ?? []).map((t, idx) => ({
        index: t.index != null ? Number(t.index) : idx,
        label: t.title || t.language || `Audio ${idx + 1}`,
        language: t.language ?? undefined,
      }));
      setAudioTracks(aTracks);

      if (resumeAtSec && resumeAtSec > 1 && !hasResumedRef.current) {
        hasResumedRef.current = true;
        videoRef.current?.seek(resumeAtSec);
      }
    },
    [resumeAtSec]
  );

  const handleAudioTracks = useCallback((data: OnAudioTracksData) => {
    if (!data?.audioTracks?.length) return;
    const aTracks: AudioTrackOption[] = data.audioTracks.map((t, idx) => ({
      index: t.index != null ? Number(t.index) : idx,
      label: t.title || t.language || `Audio ${idx + 1}`,
      language: t.language ?? undefined,
    }));
    setAudioTracks(aTracks);
  }, []);

  const handleProgress = useCallback(
    (data: OnProgressData) => {
      if (!isScrubbing) {
        setPosition(data.currentTime);
      }
      if (data.currentTime - lastSavedPositionRef.current > POSITION_SAVE_INTERVAL_SEC) {
        lastSavedPositionRef.current = data.currentTime;
        updatePlaybackPosition(source.uri, data.currentTime);
      }
      // playableDuration reflects how much has been buffered ahead of current
      // playback; use it against total duration for an honest fill percentage
      // (there is no separate native "download %" event to read here).
      if (duration > 0 && data.playableDuration != null) {
        const pct = Math.min(100, Math.round((data.playableDuration / duration) * 100));
        setBufferPercent(pct);
      }
    },
    [isScrubbing, source.uri, duration]
  );

  const handleBuffer = useCallback((data: OnBufferData) => {
    setLoading(data.isBuffering);
  }, []);

  const handleError = useCallback((err: unknown) => {
    setLoading(false);
    setErrorMsg('Playback failed. Check the link and your connection.');
    // eslint-disable-next-line no-console
    console.warn('Video playback error:', err);
  }, []);

  const handlePipStatusChanged = useCallback((data: OnPictureInPictureStatusChangedData) => {
    setIsPipActive(Boolean(data?.isActive));
  }, []);

  const clearSeekFeedbackSoon = useCallback(() => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      seekAccumRef.current = 0;
      lastTapRef.current = null;
      setSeekFeedback(null);
    }, DOUBLE_TAP_WINDOW_MS);
  }, []);

  const applySeek = useCallback(
    (side: 'left' | 'right') => {
      const now = Date.now();
      const last = lastTapRef.current;
      const isContinuation =
        last && last.side === side && now - last.time < DOUBLE_TAP_WINDOW_MS;

      seekAccumRef.current = isContinuation
        ? seekAccumRef.current + SEEK_INCREMENT_SEC
        : SEEK_INCREMENT_SEC;

      lastTapRef.current = { side, time: now };
      setSeekFeedback({ side, amount: seekAccumRef.current });

      const delta = side === 'left' ? -SEEK_INCREMENT_SEC : SEEK_INCREMENT_SEC;
      const target = Math.max(0, Math.min(duration || Infinity, position + delta));
      videoRef.current?.seek(target);
      setPosition(target);

      clearSeekFeedbackSoon();
    },
    [duration, position, clearSeekFeedbackSoon]
  );

  function handleSingleTapToggleControls() {
    setControlsVisible((v) => !v);
  }

  async function handleToggleFavorite() {
    const { isFav } = await toggleFavorite(source);
    setFav(isFav);
  }

  function handleSelectVideoTrack(trackIndex: number | undefined) {
    setSelectedTrackIndex(trackIndex);
    setTracksModalTab(null);
  }

  function handleSelectAudioTrack(trackIndex: number | undefined) {
    setSelectedAudioIndex(trackIndex);
    setTracksModalTab(null);
  }

  function handleEnterPip() {
    videoRef.current?.enterPictureInPicture?.();
  }

  const clearSwipeFeedbackSoon = useCallback(() => {
    if (swipeFeedbackTimeoutRef.current) clearTimeout(swipeFeedbackTimeoutRef.current);
    swipeFeedbackTimeoutRef.current = setTimeout(() => setSwipeFeedback(null), 600);
  }, []);

  // Left half of the screen (below the top bar) swipes brightness, right half swipes volume.
  // Standard convention matches most Android video players.
  const brightnessPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          swipeStartValueRef.current = brightnessLevel;
        },
        onPanResponderMove: (_evt, gesture) => {
          const delta = -gesture.dy / SWIPE_FULL_RANGE_PX;
          const next = clamp01(swipeStartValueRef.current + delta);
          setBrightnessLevel(next);
          setSwipeFeedback({ kind: 'brightness', value: next });
          if (brightnessPermissionRef.current) {
            Brightness.setBrightnessAsync(next).catch(() => {});
          }
        },
        onPanResponderRelease: () => {
          clearSwipeFeedbackSoon();
        },
        onPanResponderTerminate: () => {
          clearSwipeFeedbackSoon();
        },
      }),
    [brightnessLevel, clearSwipeFeedbackSoon]
  );

  const volumePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          swipeStartValueRef.current = volumeLevel;
        },
        onPanResponderMove: (_evt, gesture) => {
          const delta = -gesture.dy / SWIPE_FULL_RANGE_PX;
          const next = clamp01(swipeStartValueRef.current + delta);
          setVolumeLevel(next);
          setSwipeFeedback({ kind: 'volume', value: next });
          VolumeManager.setVolume(next).catch(() => {});
        },
        onPanResponderRelease: () => {
          clearSwipeFeedbackSoon();
        },
        onPanResponderTerminate: () => {
          clearSwipeFeedbackSoon();
        },
      }),
    [volumeLevel, clearSwipeFeedbackSoon]
  );

  const selectedVideoTrack = useMemo(() => {
    if (selectedTrackIndex != null) {
      return { type: SelectedTrackType.INDEX, value: selectedTrackIndex } as const;
    }
    if (maxBitrateBps) {
      return { type: SelectedTrackType.RESOLUTION, value: maxBitrateBps } as const;
    }
    return { type: SelectedTrackType.AUTO } as const;
  }, [selectedTrackIndex, maxBitrateBps]);

  const selectedAudioTrack = useMemo(() => {
    if (selectedAudioIndex != null) {
      return { type: SelectedTrackType.INDEX, value: selectedAudioIndex } as const;
    }
    return { type: SelectedTrackType.SYSTEM } as const;
  }, [selectedAudioIndex]);

  const sourceType =
    source.type === 'hls' || source.type === 'dash' || source.type === 'smoothstreaming'
      ? source.rnVideoType
      : undefined;

  // RTSP needs ExoPlayer's RTSP extension on Android; react-native-video
  // picks it up automatically for rtsp:// URIs once the extension is linked
  // (see the config plugin), so no extra `type` prop is required here.

  const textTracks = source.subtitle
    ? [
        {
          title: source.subtitle.title,
          language: source.subtitle.language,
          type: source.subtitle.type,
          uri: source.subtitle.uri,
        },
      ]
    : undefined;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <Video
        ref={videoRef}
        source={{ uri: source.uri, type: sourceType }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={paused}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onError={handleError}
        onBuffer={handleBuffer}
        onAudioTracks={handleAudioTracks}
        onPictureInPictureStatusChanged={handlePipStatusChanged}
        selectedVideoTrack={selectedVideoTrack}
        selectedAudioTrack={selectedAudioTrack}
        selectedTextTrack={
          subtitlesEnabled && textTracks
            ? { type: SelectedTrackType.INDEX, value: 0 }
            : { type: SelectedTrackType.DISABLED }
        }
        textTracks={textTracks}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
        progressUpdateInterval={500}
        playInBackground={false}
        playWhenInactive={false}
      />

      {/*
        Gesture layout (only active when not in PiP, and ignored while
        controls sit on top):
        - Left third: double-tap = seek back 10s, vertical swipe = brightness
        - Right third: double-tap = seek forward 10s, vertical swipe = volume
        - Middle third: single tap = toggle controls
      */}
      {!isPipActive && (
        <View style={styles.tapZoneRow} pointerEvents="box-none">
          <View style={styles.tapZoneSide} {...brightnessPanResponder.panHandlers}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => applySeek('left')} />
          </View>
          <Pressable style={styles.tapZoneCenter} onPress={handleSingleTapToggleControls} />
          <View style={styles.tapZoneSide} {...volumePanResponder.panHandlers}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => applySeek('right')} />
          </View>
        </View>
      )}

      {seekFeedback && (
        <View
          style={[
            styles.seekFeedback,
            seekFeedback.side === 'left' ? styles.seekFeedbackLeft : styles.seekFeedbackRight,
          ]}
          pointerEvents="none"
        >
          <Text style={styles.seekFeedbackText}>
            {seekFeedback.side === 'left' ? '\u00ab' : '\u00bb'} {seekFeedback.amount}s
          </Text>
        </View>
      )}

      {swipeFeedback && (
        <View style={styles.swipeFeedback} pointerEvents="none">
          <Text style={styles.swipeFeedbackLabel}>
            {swipeFeedback.kind === 'volume' ? 'Volume' : 'Brightness'}
          </Text>
          <View style={styles.swipeBarTrack}>
            <View
              style={[styles.swipeBarFill, { height: `${Math.round(swipeFeedback.value * 100)}%` }]}
            />
          </View>
          <Text style={styles.swipeFeedbackPct}>{Math.round(swipeFeedback.value * 100)}%</Text>
        </View>
      )}

      {loading && !errorMsg && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
          {bufferPercent > 0 && bufferPercent < 100 && (
            <Text style={styles.bufferText}>{bufferPercent}%</Text>
          )}
        </View>
      )}

      {errorMsg && (
        <View style={styles.centerOverlay}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      )}

      {supportBannerVisible && source.supportNote && !errorMsg && (
        <View style={styles.supportBanner} pointerEvents="box-none">
          <Text style={styles.supportBannerText}>{source.supportNote}</Text>
          <TouchableOpacity
            onPress={() => setSupportBannerVisible(false)}
            style={styles.supportBannerDismiss}
          >
            <Text style={styles.supportBannerDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {controlsVisible && !errorMsg && !isPipActive && (
        <>
          <View style={styles.topBar} pointerEvents="box-none">
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>Close</Text>
            </TouchableOpacity>
            <View style={styles.topBarRight}>
              {Platform.OS === 'android' && (
                <TouchableOpacity onPress={handleEnterPip} style={styles.iconButton}>
                  <Text style={styles.iconButtonText}>PiP</Text>
                </TouchableOpacity>
              )}
              {audioTracks.length > 1 && (
                <TouchableOpacity
                  onPress={() => setTracksModalTab('audio')}
                  style={styles.iconButton}
                >
                  <Text style={styles.iconButtonText}>Audio</Text>
                </TouchableOpacity>
              )}
              {isEqualizerSupported && (
                <TouchableOpacity
                  onPress={() => setEqualizerVisible(true)}
                  style={styles.iconButton}
                >
                  <Text style={styles.iconButtonText}>EQ</Text>
                </TouchableOpacity>
              )}
              {videoTracks.length > 0 && (
                <TouchableOpacity
                  onPress={() => setTracksModalTab('quality')}
                  style={styles.iconButton}
                >
                  <Text style={styles.iconButtonText}>Quality</Text>
                </TouchableOpacity>
              )}
              {source.subtitle && (
                <TouchableOpacity
                  onPress={() => setSubtitlesEnabled((s) => !s)}
                  style={styles.iconButton}
                >
                  <Text style={styles.iconButtonText}>
                    {subtitlesEnabled ? 'CC on' : 'CC off'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconButton}>
                <Text style={[styles.iconButtonText, fav && styles.favActiveText]}>
                  {fav ? '\u2605 Saved' : '\u2606 Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlsBar}>
            <TouchableOpacity onPress={() => setPaused((p) => !p)} style={styles.controlButton}>
              <Text style={styles.controlText}>{paused ? 'Play' : 'Pause'}</Text>
            </TouchableOpacity>

            <Text style={styles.timeText}>{formatTime(isScrubbing ? scrubValue : position)}</Text>

            <Slider
              style={styles.seekBar}
              minimumValue={0}
              maximumValue={duration || 1}
              value={isScrubbing ? scrubValue : position}
              minimumTrackTintColor="#4C6FFF"
              maximumTrackTintColor="#3A3A44"
              thumbTintColor="#FFFFFF"
              onSlidingStart={(v) => {
                setIsScrubbing(true);
                setScrubValue(v);
              }}
              onValueChange={(v) => setScrubValue(v)}
              onSlidingComplete={(v) => {
                videoRef.current?.seek(v);
                setPosition(v);
                setIsScrubbing(false);
              }}
            />

            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </>
      )}

      <Modal
        visible={tracksModalTab != null}
        transparent
        animationType="fade"
        onRequestClose={() => setTracksModalTab(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setTracksModalTab(null)}>
          <View style={styles.modalCard}>
            {tracksModalTab === 'quality' && (
              <>
                <Text style={styles.modalTitle}>Video quality</Text>
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => handleSelectVideoTrack(undefined)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      selectedTrackIndex == null && styles.modalOptionTextActive,
                    ]}
                  >
                    Auto
                  </Text>
                </TouchableOpacity>
                {videoTracks.map((t) => (
                  <TouchableOpacity
                    key={t.index}
                    style={styles.modalOption}
                    onPress={() => handleSelectVideoTrack(t.index)}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        selectedTrackIndex === t.index && styles.modalOptionTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {tracksModalTab === 'audio' && (
              <>
                <Text style={styles.modalTitle}>Audio language</Text>
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => handleSelectAudioTrack(undefined)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      selectedAudioIndex == null && styles.modalOptionTextActive,
                    ]}
                  >
                    Default
                  </Text>
                </TouchableOpacity>
                {audioTracks.map((t) => (
                  <TouchableOpacity
                    key={t.index}
                    style={styles.modalOption}
                    onPress={() => handleSelectAudioTrack(t.index)}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        selectedAudioIndex === t.index && styles.modalOptionTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <EqualizerModal visible={equalizerVisible} onClose={() => setEqualizerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tapZoneRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  tapZoneSide: {
    flex: 1,
  },
  tapZoneCenter: {
    flex: 1.2,
  },
  seekFeedback: {
    position: 'absolute',
    top: '45%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 30,
  },
  seekFeedbackLeft: {
    left: 40,
  },
  seekFeedbackRight: {
    right: 40,
  },
  seekFeedbackText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  swipeFeedback: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },
  swipeFeedbackLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  swipeBarTrack: {
    width: 8,
    height: 90,
    borderRadius: 4,
    backgroundColor: '#3A3A44',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  swipeBarFill: {
    width: '100%',
    backgroundColor: '#4C6FFF',
  },
  swipeFeedbackPct: {
    color: '#D0D0D8',
    fontSize: 11,
    marginTop: 8,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bufferText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  supportBanner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(76, 111, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(76, 111, 255, 0.5)',
    borderRadius: 12,
    padding: 12,
  },
  supportBannerText: {
    color: '#E8ECFF',
    fontSize: 12,
    lineHeight: 17,
  },
  supportBannerDismiss: {
    alignSelf: 'flex-end',
    marginTop: 6,
  },
  supportBannerDismissText: {
    color: '#9FB3FF',
    fontSize: 12,
    fontWeight: '700',
  },
  backButton: {
    backgroundColor: '#4C6FFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  iconButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  favActiveText: {
    color: '#FFD166',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 6,
  },
  controlButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  controlText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  timeText: {
    color: '#D0D0D8',
    fontSize: 12,
    minWidth: 40,
    textAlign: 'center',
  },
  seekBar: {
    flex: 1,
    height: 30,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    padding: 16,
    width: '75%',
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 10,
  },
  modalOptionText: {
    color: '#B8B8C2',
    fontSize: 14,
  },
  modalOptionTextActive: {
    color: '#4C6FFF',
    fontWeight: '700',
  },
});
