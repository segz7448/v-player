import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from '@/navigation/RootNavigator';
import { DataSaverProvider } from '@/utils/dataSaverContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Placeholder for any async init (fonts, cached settings, etc.)
    setReady(true);
  }, []);

  const onLayout = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <StatusBar style="light" />
      <DataSaverProvider>
        <RootNavigator />
      </DataSaverProvider>
    </View>
  );
}
