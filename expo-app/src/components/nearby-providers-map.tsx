import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { Map3DModelOverlay, type ProjectedMapModelPin } from '@/components/map-3d-model-overlay';

type ModelType = 'taxi' | 'cargo_van' | 'passenger_van' | 'bus' | 'worker';
type Pin = { pin_id: string; lat: number; lng: number; heading: number | null; model_type: ModelType };
type ModelUrls = Record<ModelType, string>;

const DEFAULT_MODEL_URLS: ModelUrls = {
  taxi: 'https://tevy.dev/models/city-taxi/v1/lod2.glb',
  cargo_van: 'https://tevy.dev/models/delivery-van/v1/lod2.glb',
  passenger_van: 'https://tevy.dev/models/kei-van/v1/lod2.glb',
  bus: 'https://tevy.dev/models/city-bus/v1/lod2.glb',
  worker: 'https://tevy.dev/models/road-worker/v1/lod2.glb',
};

function normalizeModelType(value: string): ModelType {
  return value === 'cargo_van' || value === 'passenger_van' || value === 'bus' || value === 'worker' ? value : 'taxi';
}

function titleForModel(type: ModelType) {
  return type === 'worker' ? 'فني متاح'
    : type === 'cargo_van' ? 'كيّة حمل متاحة'
    : type === 'passenger_van' ? 'كيّة ركاب متاحة'
    : type === 'bus' ? 'باص متاح'
    : 'تكسي متاح';
}

const DEFAULT_REGION: Region = { latitude: 32.0, longitude: 44.0, latitudeDelta: 3.5, longitudeDelta: 3.5 };

export function NearbyProvidersMap() {
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [pins, setPins] = useState<Pin[]>([]);
  const [projectedPins, setProjectedPins] = useState<ProjectedMapModelPin[]>([]);
  const [loadedModelIds, setLoadedModelIds] = useState<Set<string>>(() => new Set());
  const [modelUrls, setModelUrls] = useState<ModelUrls>(DEFAULT_MODEL_URLS);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('جاري تحديد موقعك لعرض المزوّدين القريبين');

  const handleModelStateChange = useCallback((id: string, loaded: boolean) => {
    setLoadedModelIds((current) => {
      const next = new Set(current);
      if (loaded) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from('app_editor_settings').select('settings').eq('id', 'global').maybeSingle();
      if (!active || error || !data?.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) return;
      const mapModels = (data.settings as { mapModels?: Record<string, { url?: string }> }).mapModels;
      if (!mapModels) return;
      setModelUrls({
        taxi: mapModels.taxi?.url || DEFAULT_MODEL_URLS.taxi,
        cargo_van: mapModels.cargo_van?.url || DEFAULT_MODEL_URLS.cargo_van,
        passenger_van: mapModels.passenger_van?.url || DEFAULT_MODEL_URLS.passenger_van,
        bus: mapModels.bus?.url || DEFAULT_MODEL_URLS.bus,
        worker: mapModels.worker?.url || DEFAULT_MODEL_URLS.worker,
      });
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;
    let center: { latitude: number; longitude: number } | null = null;

    const refresh = async () => {
      if (!center || busy) return;
      busy = true;
      try {
        const [taxiResult, largeResult, workerResult] = await Promise.all([
          supabase.rpc('find_nearby_provider_map_pins', {
            _lat: center.latitude, _lng: center.longitude, _type: 'taxi',
            _category: null, _service_id: null, _radius_km: 5, _limit: 30,
          }),
          supabase.rpc('find_nearby_provider_map_pins', {
            _lat: center.latitude, _lng: center.longitude, _type: 'taxi',
            _category: 'large', _service_id: null, _radius_km: 5, _limit: 30,
          }),
          supabase.rpc('find_nearby_provider_map_pins', {
            _lat: center.latitude, _lng: center.longitude, _type: 'service',
            _category: null, _service_id: null, _radius_km: 5, _limit: 30,
          }),
        ]);
        if (taxiResult.error || largeResult.error || workerResult.error) throw taxiResult.error || largeResult.error || workerResult.error;
        if (!active) return;
        const rows = [...(taxiResult.data ?? []), ...(largeResult.data ?? []), ...(workerResult.data ?? [])];
        setPins(rows.map((pin) => ({
          pin_id: String(pin.pin_id), lat: Number(pin.lat), lng: Number(pin.lng),
          heading: pin.heading == null ? null : Number(pin.heading), model_type: normalizeModelType(String(pin.model_type)),
        })).filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)));
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

  useEffect(() => {
    let cancelled = false;
    const map = mapRef.current;
    if (!map || pins.length === 0) {
      setProjectedPins([]);
      setLoadedModelIds(new Set());
      return;
    }

    void Promise.all(pins.map(async (pin) => {
      try {
        const point = await map.pointForCoordinate({ latitude: pin.lat, longitude: pin.lng });
        return {
          id: pin.pin_id,
          x: point.x,
          y: point.y,
          heading: pin.heading ?? 0,
          url: modelUrls[pin.model_type] || modelUrls.taxi,
          label: titleForModel(pin.model_type),
        } satisfies ProjectedMapModelPin;
      } catch {
        return null;
      }
    })).then((results) => {
      if (!cancelled) setProjectedPins(results.filter((item): item is ProjectedMapModelPin => item !== null));
    });

    return () => { cancelled = true; };
  }, [pins, region, modelUrls]);

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>المزوّدون القريبون</Text>
        {loading ? <ActivityIndicator size="small" color="#2563eb" /> : <View style={styles.liveDot} />}
      </View>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          region={region}
          onRegionChangeComplete={setRegion}
          showsUserLocation
          showsMyLocationButton
          loadingEnabled
        >
          {pins.map((pin) => !loadedModelIds.has(pin.pin_id) ? (
            <Marker
              key={pin.pin_id}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              title={titleForModel(pin.model_type)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={[styles.marker, pin.model_type === 'worker' && styles.workerMarker, { transform: [{ rotate: `${pin.heading ?? 0}deg` }] }]}>
                <Text style={styles.markerEmoji}>{pin.model_type === 'worker' ? '🧰' : pin.model_type === 'cargo_van' ? '🚚' : pin.model_type === 'passenger_van' ? '🚐' : pin.model_type === 'bus' ? '🚌' : '🚕'}</Text>
              </View>
            </Marker>
          ) : null)}
        </MapView>
        <Map3DModelOverlay pins={projectedPins} onModelStateChange={handleModelStateChange} />
      </View>
      <Text style={styles.caption}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginTop: 18, marginBottom: 8, padding: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  mapContainer: { height: 210, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  caption: { marginTop: 8, color: '#64748b', fontSize: 12, textAlign: 'center' },
  marker: { minWidth: 42, height: 42, paddingHorizontal: 5, borderRadius: 21, backgroundColor: '#fff', borderWidth: 2, borderColor: '#2563eb', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  workerMarker: { borderColor: '#059669' },
  markerEmoji: { fontSize: 23 },
});
