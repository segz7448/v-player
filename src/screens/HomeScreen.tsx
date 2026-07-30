import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { detectSubtitleType, resolveLink } from '@/utils/linkResolver';
import DataSaverToggle from '@/components/DataSaverToggle';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [subtitleUri, setSubtitleUri] = useState<string | undefined>(undefined);
  const [subtitleName, setSubtitleName] = useState<string | undefined>(undefined);

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setLink(text.trim());
      setError(undefined);
    } else {
      Alert.alert('Clipboard empty', 'Copy a link first, then tap Paste.');
    }
  }

  async function handlePickSubtitle() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const subType = detectSubtitleType(asset.name ?? asset.uri);
    if (!subType) {
      Alert.alert('Unsupported file', 'Pick a .srt, .vtt, or .ttml subtitle file.');
      return;
    }
    setSubtitleUri(asset.uri);
    setSubtitleName(asset.name ?? 'Subtitle file');
  }

  function handlePlay() {
    const resolved = resolveLink(link);
    if (!resolved.isValid) {
      setError(resolved.error ?? 'That link doesn\u2019t look right.');
      return;
    }
    setError(undefined);

    if (subtitleUri) {
      const subType = detectSubtitleType(subtitleUri) ?? 'srt';
      resolved.subtitle = {
        uri: subtitleUri,
        type: subType,
        language: 'und',
        title: subtitleName ?? 'Subtitle',
      };
    }

    navigation.navigate('Player', { source: resolved });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Play a video</Text>
              <Text style={styles.subtitle}>
                Paste a video link or stream: http(s), HLS/DASH, rtsp://, smb://, ftp://
              </Text>
            </View>
            <TouchableOpacity
              style={styles.libraryButton}
              onPress={() => navigation.navigate('Library')}
            >
              <Text style={styles.libraryButtonText}>Library</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="https://... or rtsp:// smb:// ftp://"
              placeholderTextColor="#6B6B76"
              value={link}
              onChangeText={(t) => {
                setLink(t);
                if (error) setError(undefined);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
              <Text style={styles.pasteButtonText}>Paste</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.subtitleButton} onPress={handlePickSubtitle}>
            <Text style={styles.subtitleButtonText}>
              {subtitleName ? `Subtitle: ${subtitleName}` : 'Add subtitle file (optional)'}
            </Text>
          </TouchableOpacity>
          {subtitleUri ? (
            <TouchableOpacity
              onPress={() => {
                setSubtitleUri(undefined);
                setSubtitleName(undefined);
              }}
            >
              <Text style={styles.clearSubtitleText}>Remove subtitle</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.playButton, !link && styles.playButtonDisabled]}
            onPress={handlePlay}
            disabled={!link}
          >
            <Text style={styles.playButtonText}>Play</Text>
          </TouchableOpacity>

          <DataSaverToggle />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  libraryButton: {
    backgroundColor: '#1C1C24',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  libraryButtonText: {
    color: '#B8B8C2',
    fontWeight: '600',
    fontSize: 13,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9A9AA5',
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  subtitleButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#1C1C24',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  subtitleButtonText: {
    color: '#B8B8C2',
    fontSize: 13,
    fontWeight: '600',
  },
  clearSubtitleText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  pasteButton: {
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  pasteButtonText: {
    color: '#B8B8C2',
    fontWeight: '600',
  },
  errorText: {
    color: '#FF6B6B',
    marginTop: 10,
    fontSize: 13,
  },
  playButton: {
    backgroundColor: '#4C6FFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  playButtonDisabled: {
    opacity: 0.4,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
