import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type ImageSetting = { url: string; scale: number; x: number; y: number };
type EditorSettings = { version: number; images: Record<string, ImageSetting> };
const ITEMS = [
  { key: 'storeCategory', title: 'فئة المتاجر', group: 'فئات المتاجر والمطاعم' },
  { key: 'restaurantCategory', title: 'فئة المطاعم', group: 'فئات المتاجر والمطاعم' },
  { key: 'vehicleEconomy', title: 'اقتصادي', group: 'تصنيفات المركبات' },
  { key: 'vehiclePremium', title: 'متميز', group: 'تصنيفات المركبات' },
  { key: 'vehicleLuxury', title: 'فاخر', group: 'تصنيفات المركبات' },
  { key: 'providerBanner', title: 'بانوراما الفنيين', group: 'بانوراما الفنيين' },
];
const EMPTY: EditorSettings = { version: 1, images: Object.fromEntries(ITEMS.map((i) => [i.key, { url: '', scale: 1, x: 50, y: 50 }])) };

export default function AppEditorScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<EditorSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: allowed, error: permissionError } = await supabase.rpc('is_super_admin', { p_user_id: user?.id });
    if (permissionError || !allowed) {
      Alert.alert('غير مصرّح', 'محرر التطبيقات متاح للمدير الأعلى فقط');
      router.back();
      return;
    }
    const { data, error } = await supabase.from('app_editor_settings').select('settings').eq('id', 'global').maybeSingle();
    if (error) Alert.alert('خطأ', 'تعذّر تحميل إعدادات محرر التطبيقات');
    else if (data?.settings && typeof data.settings === 'object') setSettings({ ...EMPTY, ...(data.settings as EditorSettings), images: { ...EMPTY.images, ...((data.settings as EditorSettings).images || {}) } });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const patch = (key: string, value: Partial<ImageSetting>) => {
    setSettings((current) => ({ ...current, images: { ...current.images, [key]: { ...current.images[key], ...value } } }));
  };
  const adjust = (key: string, field: 'scale' | 'x' | 'y', delta: number) => {
    const current = settings.images[key];
    const min = field === 'scale' ? 1 : 0;
    const max = field === 'scale' ? 3 : 100;
    const step = field === 'scale' ? 0.1 : 5;
    patch(key, { [field]: Math.min(max, Math.max(min, Math.round((current[field] + delta * step) * 10) / 10)) });
  };
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('app_editor_settings').upsert({ id: 'global', settings, updated_at: new Date().toISOString(), updated_by: user?.id });
    setSaving(false);
    if (error) Alert.alert('فشل الحفظ', 'تأكد من تطبيق ترحيل قاعدة البيانات وصلاحية المدير الأعلى');
    else Alert.alert('تم الحفظ', 'تم نشر إعدادات الصور المشتركة');
  };

  if (loading) return <View style={styles.center}><Text>جاري التحميل...</Text></View>;
  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 18, paddingBottom: 48 }}>
      <Text style={styles.title}>محرر التطبيقات</Text>
      <Text style={styles.sub}>تعديل روابط الصور وضبط التكبير والموضع. الإعدادات مشتركة مع نسخة الويب.</Text>
      {ITEMS.map((item) => {
        const image = settings.images[item.key] || { url: '', scale: 1, x: 50, y: 50 };
        return (
          <View key={item.key} style={styles.card}>
            <Text style={styles.group}>{item.group}</Text>
            <Text style={styles.name}>{item.title}</Text>
            {image.url ? <View style={styles.preview}><Image source={{ uri: image.url }} style={{ width: '100%', height: '100%', transform: [{ scale: image.scale }, { translateX: (50 - image.x) * 0.4 }, { translateY: (50 - image.y) * 0.4 }] }} resizeMode="cover" /></View> : <View style={styles.empty}><Text style={styles.muted}>أدخل رابط الصورة لمعاينتها</Text></View>}
            <TextInput value={image.url} onChangeText={(url) => patch(item.key, { url })} placeholder="رابط الصورة https://" autoCapitalize="none" keyboardType="url" style={styles.input} />
            {(['scale', 'x', 'y'] as const).map((field) => (
              <View key={field} style={styles.control}>
                <Text style={styles.controlLabel}>{field === 'scale' ? `التكبير ${image.scale.toFixed(1)}×` : field === 'x' ? `الموضع الأفقي ${image.x}%` : `الموضع العمودي ${image.y}%`}</Text>
                <View style={styles.buttons}>
                  <Pressable style={styles.step} onPress={() => adjust(item.key, field, -1)}><Text style={styles.stepText}>−</Text></Pressable>
                  <Pressable style={styles.step} onPress={() => adjust(item.key, field, 1)}><Text style={styles.stepText}>+</Text></Pressable>
                </View>
              </View>
            ))}
          </View>
        );
      })}
      <Pressable onPress={() => void save()} disabled={saving} style={[styles.save, saving && { opacity: 0.6 }]}><Text style={styles.saveText}>{saving ? 'جاري الحفظ...' : 'حفظ ونشر الإعدادات'}</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '900', color: '#0f172a', textAlign: 'right' }, sub: { color: '#64748b', textAlign: 'right', marginTop: 8, marginBottom: 18, lineHeight: 22 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 15, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  group: { color: '#2563eb', fontSize: 11, fontWeight: '800', textAlign: 'right' }, name: { color: '#0f172a', fontSize: 17, fontWeight: '900', textAlign: 'right', marginTop: 4, marginBottom: 10 },
  preview: { height: 145, overflow: 'hidden', borderRadius: 12, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }, empty: { height: 90, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }, muted: { color: '#64748b' },
  input: { marginTop: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 11, color: '#0f172a', textAlign: 'left' },
  control: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }, controlLabel: { color: '#334155', fontWeight: '700', fontSize: 12 }, buttons: { flexDirection: 'row', gap: 8 }, step: { width: 34, height: 32, borderRadius: 9, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }, stepText: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  save: { backgroundColor: '#2563eb', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 }, saveText: { color: '#fff', fontWeight: '900' },
});
