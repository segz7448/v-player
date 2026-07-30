import type { ResolvedSource } from '@/utils/linkResolver';

export type RootStackParamList = {
  Home: undefined;
  Player: { source: ResolvedSource; resumeAtSec?: number };
  Library: undefined;
};
