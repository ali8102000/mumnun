import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type ServiceResult = { id: string; slug: string; name_ar: string; name_en: string; icon: string; similarity: number };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

export default function AiSearchScreen() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ServiceResult[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const value = query.trim();
    if (!user || value.length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'search') {
        const { data, error: invokeError } = await supabase.functions.invoke('semantic-search', { body: { query: value } });
        if (invokeError) throw invokeError;
        setResults((data?.results ?? []) as ServiceResult[]);
      } else {
        setMessages((current) => [...current, { role: 'user', content: value }]);
        setQuery('');
        const { data, error: invokeError } = await supabase.functions.invoke('mamnoon-assistant', { body: { question: value } });
        if (invokeError) throw invokeError;
        setMessages((current) => [...current, { role: 'assistant', content: data?.answer ?? 'ما حصلت إجابة حالياً.' }]);
        setResults((data?.sources ?? []) as ServiceResult[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الطلب حالياً');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>رجوع ←</Text></Pressable>
        <Text style={styles.eyebrow}>✦ ممنون الذكي</Text>
        <Text style={styles.title}>شنو تحتاج اليوم؟</Text>
        <Text style={styles.subtitle}>اكتب المشكلة بطريقتك ونبحث لك عن الخدمة الأقرب للمعنى.</Text>
      </View>
      <View style={styles.tabs}>
        <Pressable onPress={() => setMode('search')} style={[styles.tab, mode === 'search' && styles.activeTab]}><Text style={styles.tabText}>بحث ذكي</Text></Pressable>
        <Pressable onPress={() => setMode('chat')} style={[styles.tab, mode === 'chat' && styles.activeTab]}><Text style={styles.tabText}>اسأل ممنون</Text></Pressable>
      </View>
      <ScrollView style={styles.messages} contentContainerStyle={{ paddingBottom: 20 }}>
        {messages.map((message, index) => <View key={index} style={[styles.message, message.role === 'user' ? styles.userMessage : styles.assistantMessage]}><Text style={message.role === 'user' ? styles.userText : styles.assistantText}>{message.content}</Text></View>)}
        {results.map((item) => (
          <Pressable key={item.id} onPress={() => router.push({ pathname: '/request/new', params: { type: item.slug } })} style={styles.result}>
            <Text style={styles.resultIcon}>🛠️</Text>
            <View style={{ flex: 1 }}><Text style={styles.resultTitle}>{item.name_ar}</Text><Text style={styles.resultSub}>{item.name_en}</Text></View>
            <Text style={styles.order}>اطلب</Text>
          </Pressable>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator style={{ marginTop: 18 }} /> : null}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput value={query} onChangeText={setQuery} placeholder={mode === 'search' ? 'مثلاً: الكهرباء تفصل بالبيت...' : 'اسأل عن الخدمات المتوفرة...'} maxLength={mode === 'search' ? 180 : 500} style={styles.input} multiline />
        <Pressable disabled={busy || query.trim().length < 2} onPress={() => void submit()} style={[styles.send, (busy || query.trim().length < 2) && { opacity: 0.5 }]}><Text style={styles.sendText}>إرسال</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 54 },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  back: { color: '#64748b', fontWeight: '700', marginBottom: 16 },
  eyebrow: { color: '#2563eb', fontWeight: '800', fontSize: 12 },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '900', marginTop: 6, textAlign: 'right' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 5, textAlign: 'right', lineHeight: 21 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 14, backgroundColor: '#e2e8f0', gap: 4 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center' },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: '#334155', fontWeight: '800' },
  messages: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  message: { maxWidth: '90%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userMessage: { alignSelf: 'flex-start', backgroundColor: '#2563eb' },
  assistantMessage: { alignSelf: 'flex-end', backgroundColor: '#e2e8f0' },
  userText: { color: '#fff', textAlign: 'right', lineHeight: 22 },
  assistantText: { color: '#0f172a', textAlign: 'right', lineHeight: 22 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10 },
  resultIcon: { fontSize: 24 },
  resultTitle: { color: '#0f172a', fontWeight: '800', textAlign: 'right' },
  resultSub: { color: '#64748b', fontSize: 11, textAlign: 'right', marginTop: 2 },
  order: { color: '#2563eb', fontWeight: '800' },
  error: { color: '#dc2626', textAlign: 'right', marginTop: 10 },
  composer: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  input: { flex: 1, minHeight: 48, maxHeight: 100, textAlign: 'right', backgroundColor: '#f1f5f9', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  send: { backgroundColor: '#2563eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  sendText: { color: '#fff', fontWeight: '800' },
});
