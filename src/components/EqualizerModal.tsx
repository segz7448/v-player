import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { EqPreset, useEqualizer } from '@/utils/useEqualizer';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PRESETS: { label: string; value: EqPreset }[] = [
  { label: 'Flat', value: 'flat' },
  { label: 'Bass boost', value: 'bass_boost' },
  { label: 'Vocal boost', value: 'vocal_boost' },
  { label: 'Treble boost', value: 'treble_boost' },
];

function formatFreq(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}kHz`;
  return `${hz}Hz`;
}

function formatDb(millibel: number): string {
  const db = millibel / 100;
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)}dB`;
}

export default function EqualizerModal({ visible, onClose }: Props) {
  const {
    isSupported,
    state,
    enabled,
    loading,
    error,
    setBandLevel,
    setBoost,
    toggleEnabled,
    applyPreset,
  } = useEqualizer();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Equalizer</Text>
            <Switch
              value={enabled}
              onValueChange={toggleEnabled}
              disabled={!isSupported}
              trackColor={{ false: '#3A3A44', true: '#4C6FFF' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {!isSupported && (
            <Text style={styles.unsupportedText}>
              The equalizer needs a native Android build (not available on iOS or in Expo Go).
            </Text>
          )}

          {isSupported && loading && (
            <Text style={styles.helperText}>Loading equalizer\u2026</Text>
          )}

          {isSupported && error && <Text style={styles.errorText}>{error}</Text>}

          {isSupported && !loading && state.bands.length > 0 && (
            <>
              <View style={styles.presetRow}>
                {PRESETS.map((p) => (
                  <Pressable
                    key={p.value}
                    onPress={() => applyPreset(p.value)}
                    style={styles.presetPill}
                  >
                    <Text style={styles.presetPillText}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView style={styles.bandsScroll} showsVerticalScrollIndicator={false}>
                {state.bands.map((band) => (
                  <View key={band.index} style={styles.bandRow}>
                    <Text style={styles.bandFreq}>{formatFreq(band.centerFreqHz)}</Text>
                    <Slider
                      style={styles.bandSlider}
                      minimumValue={band.minMillibel}
                      maximumValue={band.maxMillibel}
                      value={band.levelMillibel}
                      minimumTrackTintColor="#4C6FFF"
                      maximumTrackTintColor="#3A3A44"
                      thumbTintColor="#FFFFFF"
                      onSlidingComplete={(v) => setBandLevel(band.index, v)}
                    />
                    <Text style={styles.bandDb}>{formatDb(band.levelMillibel)}</Text>
                  </View>
                ))}

                <View style={styles.boostSection}>
                  <View style={styles.boostHeaderRow}>
                    <Text style={styles.boostLabel}>Boost</Text>
                    <Text style={styles.boostValue}>{formatDb(state.boost)}</Text>
                  </View>
                  <Text style={styles.boostHint}>
                    Amplifies beyond 100% volume. High values can distort audio.
                  </Text>
                  <Slider
                    style={styles.boostSlider}
                    minimumValue={0}
                    maximumValue={state.maxBoost}
                    value={state.boost}
                    minimumTrackTintColor="#FF9F4C"
                    maximumTrackTintColor="#3A3A44"
                    thumbTintColor="#FFFFFF"
                    onSlidingComplete={setBoost}
                  />
                </View>
              </ScrollView>
            </>
          )}

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 18,
    width: '88%',
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  unsupportedText: {
    color: '#9A9AA5',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 8,
  },
  helperText: {
    color: '#9A9AA5',
    fontSize: 13,
    marginBottom: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  presetPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#26262F',
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  presetPillText: {
    color: '#B8B8C2',
    fontSize: 12,
    fontWeight: '600',
  },
  bandsScroll: {
    maxHeight: 320,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bandFreq: {
    color: '#9A9AA5',
    fontSize: 11,
    width: 46,
  },
  bandSlider: {
    flex: 1,
    height: 34,
  },
  bandDb: {
    color: '#D0D0D8',
    fontSize: 11,
    width: 54,
    textAlign: 'right',
  },
  boostSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2A2A35',
  },
  boostHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boostLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  boostValue: {
    color: '#FF9F4C',
    fontWeight: '700',
    fontSize: 13,
  },
  boostHint: {
    color: '#75757F',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 6,
  },
  boostSlider: {
    height: 34,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: '#4C6FFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
