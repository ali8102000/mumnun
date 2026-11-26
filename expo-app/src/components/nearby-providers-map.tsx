import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';

type Pin = { pin_id: string; lat: number; lng: number; heading: number | null; kind: 'taxi' | 'worker' };
const DEFAULT_REGION: Region = { latitude: 32.0, longitude: 44.0, latitudeDelta: 3.5, longitudeDelta: 3.5 };

export function NearbyProvidersMap() {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('جاري تحديد موقعك لعرض المزوّدين القريبين');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;
    let center: { latitude: number; longitude: number } | null = null;

    const refresh = async () => {
      if (!center || busy) return;
      busy = true;
      try {
        const [taxiResult, workerResult] = await Promise.all([
          supabase.rpc('find_nearby_provider_pins', {
            _lat: center.latitude, _lng: center.longitude, _type: 'taxi',
            _category: null, _service_id: null, _radius_km: 5, _limit: 30,
          }),
          supabase.rpc('find_nearby_provider_pins', {
            _lat: center.latitude, _lng: center.longitude, _type: 'service',
            _category: null, _service_id: null, _radius_km: 5, _limit: 30,
          }),
        ]);
        if (taxiResult.error || workerResult.error) throw taxiResult.error || workerResult.error;
        if (!active) return;
        const rows = [
          ...(taxiResult.data ?? []).map((pin: { pin_id: string; lat: number; lng: number; heading: number | null }) => ({ ...pin, kind: 'taxi' as const })),
          ...(workerResult.data ?? []).map((pin: { pin_id: string; lat: number; lng: number; heading: number | null }) => ({ ...pin, kind: 'worker' as const })),
        ];
        setPins(rows.map((pin) => ({ pin_id: String(pin.pin_id), lat: Number(pin.lat), lng: Number(pin.lng), heading: pin.heading == null ? null : Number(pin.heading), kind: pin.kind }))
          .filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)));
        setMessage(rows.length ? 'المزوّدون المتاحون حولك' : 'ماكو مزوّدين متاحين قريباً حالياً');
      } catch {
        if (active) setMessage('تعذّر تحميل المزوّدين القريبين حالياً');
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    };

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          if (active) setMessage('اسمح للموقع حتى نعرض المزوّدين القريبين');
          return;
        }
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        center = { latitude: current.coords.latitude, longitude: current.coords.longitude };
        setRegion({ ...center, latitudeDelta: 0.045, longitudeDelta: 0.045 });
        await refresh();
        timer = setInterval(() => void refresh(), 20000);
      } catch {
        if (active) setMessage('تعذّر تحديد موقعك. تأكد من تشغيل GPS');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>المزوّدون القريبون</Text>
        {loading ? <ActivityIndicator size="small" color="#2563eb" /> : <View style={styles.liveDot} />}
      </View>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton
        loadingEnabled
      >
        {pins.map((pin) => (
          <Marker
            key={pin.pin_id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            title={pin.kind === 'taxi' ? 'تكسي متاح' : 'فني متاح'}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.marker, pin.kind === 'worker' && styles.workerMarker]}>
              <Text style={styles.markerEmoji}>{pin.kind === 'taxi' ? '🚕' : '🧰'}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <Text style={styles.caption}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginTop: 18, marginBottom: 8, padding: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  map: { height: 210, borderRadius: 14 },
  caption: { marginTop: 8, color: '#64748b', fontSize: 12, textAlign: 'center' },
  marker: { minWidth: 42, height: 42, paddingHorizontal: 5, borderRadius: 21, backgroundColor: '#fff', borderWidth: 2, borderColor: '#2563eb', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  workerMarker: { borderColor: '#059669' },
  markerEmoji: { fontSize: 23 },
});
