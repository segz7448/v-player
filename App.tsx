import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from '@/navigation/RootNavigator';
import { DataSaverProvider } from '@/utils/dataSaverContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Backstop: onLayout only fires once the root View has actually painted.
// If anything above throws during mount (a native module mismatch, a bad
// import, etc.) onLayout never fires and the splash hangs forever with no
// visible error in a release build. This timeout guarantees the splash is
// dismissed either way, so a broken screen is at least visible and
// debuggable instead of an infinite splash.
const SPLASH_TIMEOUT_MS = 5000;

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[App] Render error caught by boundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#0B0B0F',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, marginBottom: 12 }}>
            Something went wrong on startup.
          </Text>
          <Text style={{ color: '#999', fontSize: 12 }}>{String(this.state.error.message)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    // Placeholder for any async init (fonts, cached settings, etc.)
    setReady(true);
  }, []);

  const hideSplash = useCallback(async () => {
    if (splashHidden) return;
    setSplashHidden(true);
    await SplashScreen.hideAsync().catch(() => {});
  }, [splashHidden]);

  const onLayout = useCallback(() => {
    if (ready) {
      hideSplash();
    }
  }, [ready, hideSplash]);

  useEffect(() => {
    // Backstop in case onLayout never fires (see comment above).
    const timer = setTimeout(hideSplash, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  if (!ready) {
    return null;
  }

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        <StatusBar style="light" />
        <DataSaverProvider>
          <RootNavigator />
        </DataSaverProvider>
      </View>
    </ErrorBoundary>
  );
}
