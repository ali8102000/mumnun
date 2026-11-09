import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    ...config,
    name: config.name ?? 'ممنون',
    slug: config.slug ?? 'mamnoon',
    ios: {
      ...config.ios,
      ...(mapsKey ? {
        config: {
          ...config.ios?.config,
          googleMapsApiKey: mapsKey,
        },
      } : {}),
    },
    android: {
      ...config.android,
      ...(mapsKey ? {
        config: {
          ...config.android?.config,
          googleMaps: { apiKey: mapsKey },
        },
      } : {}),
    },
    extra: {
      ...config.extra,
      ...(supabaseUrl ? { supabaseUrl } : {}),
      ...(supabasePublishableKey ? { supabasePublishableKey } : {}),
    },
  };
};
