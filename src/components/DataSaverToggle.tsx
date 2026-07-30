import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { QualityCap, useDataSaver } from '@/utils/dataSaverContext';

const OPTIONS: { label: string; value: QualityCap }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Low data', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];

export default function DataSaverToggle() {
  const { qualityCap, setQualityCap } = useDataSaver();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Quality</Text>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const active = opt.value === qualityCap;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setQualityCap(opt.value)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    color: '#9A9AA5',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1C1C24',
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  pillActive: {
    backgroundColor: '#4C6FFF',
    borderColor: '#4C6FFF',
  },
  pillText: {
    color: '#B8B8C2',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});
