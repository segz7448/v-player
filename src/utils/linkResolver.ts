/**
 * linkResolver.ts
 *
 * Given a pasted URL, determine what kind of media source it is so the
 * player can be configured correctly (react-native-video / ExoPlayer
 * needs to know the source type for HLS and DASH; direct files it can
 * usually infer, but being explicit avoids edge-case failures).
 */
import { Platform } from 'react-native';

export type SourceType =
  | 'hls'
  | 'dash'
  | 'smoothstreaming'
  | 'file'
  | 'rtsp'
  | 'rtmp'
  | 'smb'
  | 'ftp'
  | 'udp'
  | 'unknown';

/**
 * How confident we are the player can actually play this protocol:
 * - 'native'      : ExoPlayer/AVPlayer handles it directly (http/https progressive, HLS, DASH)
 * - 'extension'    : requires the bundled ExoPlayer RTSP extension (Android only, wired in via
 *                     the config plugin) — plays on Android, unsupported on iOS
 * - 'passthrough'  : we hand the URI to ExoPlayer's generic data source and it *may* work
 *                     depending on server/auth, but there's no dedicated extension backing it
 *                     (FTP, SMB without credentials handling)
 * - 'unsupported'  : known protocol, but there is no working playback path (e.g. RTMP is
 *                     deprecated/removed from modern ExoPlayer) — we surface this clearly
 *                     instead of letting playback fail silently
 */
export type SupportLevel = 'native' | 'extension' | 'passthrough' | 'unsupported';

export interface SubtitleTrack {
  uri: string;
  /** react-native-video subtitle type */
  type: 'srt' | 'vtt' | 'ttml';
  language: string;
  title: string;
}

export interface ResolvedSource {
  uri: string;
  type: SourceType;
  /** value to pass to react-native-video's `type` prop, when needed */
  rnVideoType?: 'm3u8' | 'mpd' | 'ism';
  isValid: boolean;
  error?: string;
  /** optional externally supplied subtitle track (picked by the user) */
  subtitle?: SubtitleTrack;
  /** playback confidence for the detected protocol; see SupportLevel */
  supportLevel: SupportLevel;
  /** short user-facing note surfaced in the UI (e.g. platform limitations) */
  supportNote?: string;
}

export function detectSubtitleType(path: string): 'srt' | 'vtt' | 'ttml' | undefined {
  const lower = path.toLowerCase().split('?')[0];
  if (lower.endsWith('.srt')) return 'srt';
  if (lower.endsWith('.vtt')) return 'vtt';
  if (lower.endsWith('.ttml') || lower.endsWith('.xml')) return 'ttml';
  return undefined;
}

const HLS_EXTENSIONS = ['.m3u8'];
const DASH_EXTENSIONS = ['.mpd'];
const SMOOTH_EXTENSIONS = ['.ism', '.ism/manifest'];
const DIRECT_FILE_EXTENSIONS = [
  '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi',
  '.3gp', '.ts', '.flv', '.wmv',
];

function stripQueryAndFragment(url: string): string {
  return url.split('?')[0].split('#')[0];
}

function getExtension(path: string): string {
  const lower = path.toLowerCase();
  const lastDot = lower.lastIndexOf('.');
  if (lastDot === -1) return '';
  return lower.slice(lastDot);
}

/**
 * Recognized URI schemes beyond http/https, each mapped to the SourceType
 * we'll classify it as. Order doesn't matter; matched by scheme prefix.
 */
const SCHEME_MAP: Array<{ scheme: string; type: SourceType }> = [
  { scheme: 'rtsp://', type: 'rtsp' },
  { scheme: 'rtsps://', type: 'rtsp' },
  { scheme: 'rtmp://', type: 'rtmp' },
  { scheme: 'rtmps://', type: 'rtmp' },
  { scheme: 'rtmpt://', type: 'rtmp' },
  { scheme: 'smb://', type: 'smb' },
  { scheme: 'cifs://', type: 'smb' },
  { scheme: 'ftp://', type: 'ftp' },
  { scheme: 'ftps://', type: 'ftp' },
  { scheme: 'udp://', type: 'udp' },
  { scheme: 'rtp://', type: 'udp' },
];

const VALID_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/[^\s]+$/i;

/**
 * Broad scheme validity check (no DOM URL API dependency, so behavior is
 * identical on device and in tests). Accepts any scheme in SCHEME_MAP plus
 * plain http/https; used before we classify further.
 */
function isLikelyValidUrl(input: string): boolean {
  const trimmed = input.trim();
  return VALID_SCHEME_PATTERN.test(trimmed);
}

function detectScheme(uri: string): SourceType | undefined {
  const lower = uri.toLowerCase();
  const match = SCHEME_MAP.find((s) => lower.startsWith(s.scheme));
  return match?.type;
}

/**
 * Classify how confident we are that playback will actually work for a
 * given SourceType. Kept centralized so the player screen and home screen
 * both surface consistent messaging.
 */
export function getSupportInfo(type: SourceType): { level: SupportLevel; note?: string } {
  switch (type) {
    case 'hls':
    case 'dash':
    case 'smoothstreaming':
    case 'file':
      return { level: 'native' };
    case 'rtsp':
      return {
        level: 'extension',
        note:
          Platform.OS === 'android'
            ? 'RTSP streams use the ExoPlayer RTSP extension on Android.'
            : 'RTSP is not supported on iOS in this build.',
      };
    case 'smb':
      return {
        level: 'passthrough',
        note: 'SMB shares play only if the server allows unauthenticated guest access. Private shares need credentials this app does not yet collect.',
      };
    case 'ftp':
      return {
        level: 'passthrough',
        note: 'FTP is attempted directly. Servers requiring login credentials are not yet supported.',
      };
    case 'udp':
      return {
        level: 'extension',
        note:
          Platform.OS === 'android'
            ? 'UDP/RTP multicast streams are handled by ExoPlayer on Android.'
            : 'UDP/RTP multicast is not supported on iOS in this build.',
      };
    case 'rtmp':
      return {
        level: 'unsupported',
        note: 'RTMP has no maintained playback path in this app (the ExoPlayer RTMP extension was discontinued). Use an RTMP-to-HLS restream if you need to play this source.',
      };
    default:
      return { level: 'passthrough' };
  }
}

export function resolveLink(rawInput: string): ResolvedSource {
  const uri = rawInput.trim();

  if (!uri) {
    return {
      uri,
      type: 'unknown',
      isValid: false,
      error: 'Link is empty.',
      supportLevel: 'unsupported',
    };
  }

  if (!isLikelyValidUrl(uri)) {
    return {
      uri,
      type: 'unknown',
      isValid: false,
      error: 'Enter a valid link, e.g. https://, rtsp://, rtmp://, smb://, or ftp://',
      supportLevel: 'unsupported',
    };
  }

  // Non-http(s) schemes: classify by scheme first, since these never carry
  // the file-extension-based signals below.
  const schemeType = detectScheme(uri);
  if (schemeType) {
    const { level, note } = getSupportInfo(schemeType);
    if (level === 'unsupported') {
      return {
        uri,
        type: schemeType,
        isValid: false,
        error: note,
        supportLevel: level,
        supportNote: note,
      };
    }
    return { uri, type: schemeType, isValid: true, supportLevel: level, supportNote: note };
  }

  const cleanPath = stripQueryAndFragment(uri);
  const ext = getExtension(cleanPath);

  if (HLS_EXTENSIONS.includes(ext)) {
    return { uri, type: 'hls', rnVideoType: 'm3u8', isValid: true, supportLevel: 'native' };
  }

  if (DASH_EXTENSIONS.includes(ext)) {
    return { uri, type: 'dash', rnVideoType: 'mpd', isValid: true, supportLevel: 'native' };
  }

  if (SMOOTH_EXTENSIONS.some((s) => cleanPath.toLowerCase().endsWith(s))) {
    return { uri, type: 'smoothstreaming', rnVideoType: 'ism', isValid: true, supportLevel: 'native' };
  }

  if (DIRECT_FILE_EXTENSIONS.includes(ext)) {
    return { uri, type: 'file', isValid: true, supportLevel: 'native' };
  }

  // No recognizable extension (e.g. a link that serves video via a
  // dynamic endpoint without a file extension). Let ExoPlayer attempt
  // to sniff it rather than rejecting outright.
  return { uri, type: 'unknown', isValid: true, supportLevel: 'native' };
}
