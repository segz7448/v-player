import React, { createContext, useContext, useMemo, useState } from 'react';

export type QualityCap = 'auto' | 'low' | 'medium' | 'high';

interface DataSaverState {
  qualityCap: QualityCap;
  setQualityCap: (cap: QualityCap) => void;
  /** approximate max bitrate in bits/sec for react-native-video's selectedVideoTrack */
  maxBitrateBps: number | undefined;
}

const QUALITY_TO_BITRATE: Record<QualityCap, number | undefined> = {
  auto: undefined,
  low: 400_000, // ~400 kbps, safe on 2G/weak 3G
  medium: 1_200_000, // ~1.2 Mbps, standard definition
  high: 4_000_000, // ~4 Mbps, allows up to ~1080p on decent sources
};

const DataSaverContext = createContext<DataSaverState | undefined>(undefined);

export function DataSaverProvider({ children }: { children: React.ReactNode }) {
  const [qualityCap, setQualityCap] = useState<QualityCap>('auto');

  const value = useMemo<DataSaverState>(
    () => ({
      qualityCap,
      setQualityCap,
      maxBitrateBps: QUALITY_TO_BITRATE[qualityCap],
    }),
    [qualityCap]
  );

  return <DataSaverContext.Provider value={value}>{children}</DataSaverContext.Provider>;
}

export function useDataSaver(): DataSaverState {
  const ctx = useContext(DataSaverContext);
  if (!ctx) {
    throw new Error('useDataSaver must be used within a DataSaverProvider');
  }
  return ctx;
}
