import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '@/screens/HomeScreen';
import PlayerScreen from '@/screens/PlayerScreen';
import LibraryScreen from '@/screens/LibraryScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0B0B0F',
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{ animation: 'fade', orientation: 'default' }}
        />
        <Stack.Screen
          name="Library"
          component={LibraryScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
