/**
 * useEqualizer.ts
 *
 * JS-side bridge to the native `AudioEqualizerModule` (Android only — see
 * android-native/equalizer/AudioEqualizerModule.kt for the native
 * implementation and its documented constraints, namely that it attaches
 * to Android's global output session rather than a session scoped to just
 * this app's video player, since react-native-video doesn't expose one).
 *
 * On iOS, or if the native module isn't linked (e.g. running in Expo Go
 * rather than a dev build), all calls resolve to safe no-ops and
 * `isSupported` is false so the UI can hide or disable equalizer controls
 * instead of throwing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

export interface EqBand {
  index: number;
  centerFreqHz: number;
  levelMillibel: number;
  minMillibel: number;
  maxMillibel: number;
}

export interface EqState {
  bands: EqBand[];
  boost: number;
  maxBoost: number;
}

export type EqPreset = 'flat' | 'bass_boost' | 'vocal_boost' | 'treble_boost';

const EMPTY_STATE: EqState = { bands: [], boost: 0, maxBoost: 2000 };

const NativeEq = NativeModules.AudioEqualizerModule as
  | {
      attach(): Promise<EqState>;
      getState(): Promise<EqState>;
      setBandLevel(bandIndex: number, levelMillibel: number): Promise<boolean>;
      setEnabled(enabled: boolean): Promise<boolean>;
      applyPreset(presetName: EqPreset): Promise<EqState>;
      setBoost(millibel: number): Promise<boolean>;
      release(): Promise<boolean>;
    }
  | undefined;

/** True only on Android with the native module actually linked in this build. */
export const isEqualizerSupported = Platform.OS === 'android' && NativeEq != null;

export function useEqualizer() {
  const [state, setState] = useState<EqState>(EMPTY_STATE);
  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const attachedRef = useRef(false);

  const attach = useCallback(async () => {
    if (!isEqualizerSupported || !NativeEq) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await NativeEq.attach();
      setState(result);
      attachedRef.current = true;
    } catch (e) {
      setError('Equalizer is unavailable on this device.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    attach();
    return () => {
      if (isEqualizerSupported && NativeEq && attachedRef.current) {
        NativeEq.release().catch(() => {});
        attachedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBandLevel = useCallback(async (bandIndex: number, levelMillibel: number) => {
    if (!isEqualizerSupported || !NativeEq) return;
    // Optimistic local update so the slider feels responsive even though
    // the native call is async.
    setState((prev) => ({
      ...prev,
      bands: prev.bands.map((b) =>
        b.index === bandIndex ? { ...b, levelMillibel } : b
      ),
    }));
    try {
      await NativeEq.setBandLevel(bandIndex, levelMillibel);
    } catch (e) {
      setError('Could not update equalizer band.');
    }
  }, []);

  const setBoost = useCallback(async (millibel: number) => {
    if (!isEqualizerSupported || !NativeEq) return;
    setState((prev) => ({ ...prev, boost: millibel }));
    try {
      await NativeEq.setBoost(millibel);
    } catch (e) {
      setError('Could not update audio boost.');
    }
  }, []);

  const toggleEnabled = useCallback(
    async (next: boolean) => {
      if (!isEqualizerSupported || !NativeEq) return;
      setEnabledState(next);
      try {
        await NativeEq.setEnabled(next);
      } catch (e) {
        setError('Could not toggle equalizer.');
      }
    },
    []
  );

  const applyPreset = useCallback(async (preset: EqPreset) => {
    if (!isEqualizerSupported || !NativeEq) return;
    try {
      const result = await NativeEq.applyPreset(preset);
      setState(result);
      if (!enabled) {
        await toggleEnabled(true);
      }
    } catch (e) {
      setError('Could not apply preset.');
    }
  }, [enabled, toggleEnabled]);

  return useMemo(
    () => ({
      isSupported: isEqualizerSupported,
      state,
      enabled,
      loading,
      error,
      setBandLevel,
      setBoost,
      toggleEnabled,
      applyPreset,
    }),
    [state, enabled, loading, error, setBandLevel, setBoost, toggleEnabled, applyPreset]
  );
}
