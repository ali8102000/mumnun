import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';

export default function Index() {
  const { session, loading, roles, authError, refresh } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (authError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>تعذّر تحميل بيانات الحساب</Text>
        <Text style={styles.errorText}>{authError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => { void refresh(); }}>
          <Text style={styles.retryText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!session) return <Redirect href="/auth" />;
  if (roles.length === 0) return <Redirect href="/select-role" />;
  return <Redirect href="/home" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f9fafb' },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', textAlign: 'center', marginBottom: 10 },
  errorText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 18 },
  retryButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '800' },
});
