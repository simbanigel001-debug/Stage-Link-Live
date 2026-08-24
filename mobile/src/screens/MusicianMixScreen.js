import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchabelOpacity, Dimensions } from 'react-native';
import io from 'socket.io-client';

const SERVER_URL = 'http://192.168.1.100:3000'; // Server IP

export default function MusicianMixScreen({ musicianId = 1 }) {
  const [musician, setMusician] = useState(null);
  const [socket, setSocket] = useState(null);
  const [talkbackActive, setTalkbackActive] = useState(false);

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('initial_state', (data) => {
      const current = data.musicians.find((m) => m.id === musicianId);
      if (current) setMusician(current);
    });

    newSocket.on('mix_updated', (data) => {
      if (data.musicianId === musicianId) {
        setMusician((prev) => ({ ...prev, mix: data.mix }));
      }
    });

    newSocket.on('STAGE_INTELLIGENCE_UPDATE', (data) => {
      if (data.musicianId === musicianId) {
        setMusician((prev) => ({
          ...prev,
          stagePosition: data.stagePosition
        }));
      }
    });

    return () => newSocket.disconnect();
  }, [musicianId]);

  const toggleTalkback = () => {
    const nextState = !talkbackActive;
    setTalkbackActive(nextState);
    if (socket) {
      socket.emit('talkback_status_change', { musicianId, active: nextState });
    }
  };

  if (!musician) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Connecting to StageLink Live Server...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{musician.name} - IEM Dashboard</Text>
      <Text style={styles.subHeader}>Instrument: {musician.instrument.toUpperCase()}</Text>

      {/* Spatial Position Visualizer */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spatial Monitoring Position</Text>
        <Text style={styles.infoText}>Zone: {musician.stagePosition?.zone || 'N/A'}</Text>
        <Text style={styles.infoText}>
          Pan Offset: {musician.mix?.pan ? `${Math.round(musician.mix.pan * 100)}%` : 'Center'}
        </Text>
        <View style={styles.panBarBackground}>
          <View
            style={[
              styles.panIndicator,
              { left: `${((musician.mix?.pan || 0) + 1) * 50}%` }
            ]}
          />
        </View>
      </View>

      {/* Talkback Button */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Intercom / Talkback</Text>
        <TouchableOpacity
          style={[styles.talkbackBtn, talkbackActive && styles.talkbackBtnActive]}
          onPress={toggleTalkback}
        >
          <Text style={styles.talkbackBtnText}>
            {talkbackActive ? 'TRANSMITTING TALKBACK' : 'HOLD TO TALKBACK'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, justifyContent: 'center' },
  loadingText: { color: '#888', textAlign: 'center', fontSize: 16 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#FFF', textAlign: 'center' },
  subHeader: { fontSize: 14, color: '#00E676', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 8, marginBottom: 16 },
  cardTitle: { color: '#AAA', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  infoText: { color: '#FFF', fontSize: 16, marginVertical: 2 },
  panBarBackground: { height: 10, backgroundColor: '#333', borderRadius: 5, marginTop: 10, position: 'relative' },
  panIndicator: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#00E676', position: 'absolute', top: -2, marginLeft: -7 },
  talkbackBtn: { backgroundColor: '#333', paddingVertical: 18, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  talkbackBtnActive: { backgroundColor: '#FF3D00' },
  talkbackBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
