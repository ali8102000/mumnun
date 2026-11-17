import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth-context';

type Ticket = { id: string; subject: string; description: string; category: string; status: string; needs_staff?: boolean; created_at: string };
type TicketMessage = { id: string; ticket_id: string; sender_id: string; message: string; is_staff: boolean; is_ai?: boolean; created_at: string };
export default function SupportScreen() {
  const { user } = useAuth();
  const db = supabase as unknown as SupabaseClient;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');
  const [category, setCategory] = useState('general');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db.from('support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) Alert.alert('الدعم', 'تعذر تحميل تذاكر الدعم');
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }, [db, user?.id]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let active = true;
    const load = async () => {
      const { data, error } = await db.from('support_ticket_messages').select('*').eq('ticket_id', selected.id).order('created_at');
      if (error) Alert.alert('الدعم', 'تعذر تحميل رسائل التذكرة');
      if (active) setMessages((data ?? []) as TicketMessage[]);
    };
    void load();
    const channel = db.channel('support-ticket-' + selected.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: 'ticket_id=eq.' + selected.id }, (payload: { new: TicketMessage }) => {
        setMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new]);
        void loadTickets();
      }).subscribe();
    return () => { active = false; void db.removeChannel(channel); };
  }, [db, selected?.id, loadTickets]);

  async function askAssistant(messageId: string) {
    const { error } = await db.functions.invoke('support-assistant', { body: { message_id: messageId } });
    if (error) Alert.alert('مساعد ممنون', 'وصلت رسالتك، لكن الرد الآلي غير متاح حالياً. تبقى التذكرة محفوظة للدعم.');
  }

  async function createTicket() {
    if (!user || !subject.trim() || !description.trim() || busy) return;
    setBusy(true);
    try {
      const { data, error } = await db.from('support_tickets').insert({ user_id: user.id, subject: subject.trim(), description: description.trim(), category }).select().maybeSingle();
      if (error || !data) throw error ?? new Error('تعذر إنشاء التذكرة');
      const { data: first, error: firstError } = await db.from('support_ticket_messages').insert({ ticket_id: data.id, sender_id: user.id, message: description.trim(), is_staff: false }).select().maybeSingle();
      if (!firstError && first) await askAssistant(first.id);
      setSubject(''); setDescription(''); setCreating(false);
      await loadTickets(); setSelected(data as Ticket);
    } catch (error) {
      Alert.alert('الدعم', error instanceof Error ? error.message : 'تعذر إنشاء التذكرة');
    } finally { setBusy(false); }
  }

  async function sendReply() {
    if (!user || !selected || !reply.trim() || busy) return;
    setBusy(true);
    try {
      const { data, error } = await db.from('support_ticket_messages').insert({ ticket_id: selected.id, sender_id: user.id, message: reply.trim(), is_staff: false }).select().maybeSingle();
      if (error) throw error;
      setReply('');
      if (data) await askAssistant(data.id);
    } catch (error) {
      Alert.alert('الدعم', error instanceof Error ? error.message : 'تعذر إرسال الرسالة');
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => selected ? setSelected(null) : router.back()}><Text style={styles.back}>← رجوع</Text></TouchableOpacity>
        <Text style={styles.title}>{selected ? selected.subject : 'مركز الدعم'}</Text>
        <Text style={styles.subtitle}>مساعد ممنون يرد على استفساراتك، وإذا تحتاج تدخل موظف يحوّلها لفريق الدعم.</Text>
      </View>
      {selected ? (
        <>
          <View style={styles.status}><Text style={styles.statusText}>{selected.status === 'waiting_staff' || selected.needs_staff ? 'بانتظار فريق الدعم' : 'التذكرة مفتوحة'}</Text></View>
          <ScrollView style={styles.messages} contentContainerStyle={{ paddingBottom: 18 }}>
            <View style={styles.description}><Text style={styles.body}>{selected.description}</Text></View>
            {messages.map((m) => {
              const fromSupport = Boolean(m.is_ai || m.is_staff);
              return <View key={m.id} style={[styles.bubble, fromSupport ? styles.supportBubble : styles.userBubble]}>
                <Text style={[styles.body, !fromSupport && styles.userText]}>{m.message}</Text>
                {m.is_ai ? <Text style={styles.sender}>مساعد ممنون الذكي</Text> : m.is_staff ? <Text style={styles.sender}>فريق الدعم</Text> : null}
              </View>;
            })}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput value={reply} onChangeText={setReply} placeholder="اكتب رسالتك..." multiline style={styles.input} />
            <TouchableOpacity disabled={busy || !reply.trim()} onPress={() => void sendReply()} style={styles.send}><Text style={styles.sendText}>{busy ? '...' : 'إرسال'}</Text></TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.newButton} onPress={() => setCreating(!creating)}><Text style={styles.newText}>＋ تذكرة دعم جديدة</Text></TouchableOpacity>
          {creating && <View style={styles.form}>
            <TextInput value={subject} onChangeText={setSubject} placeholder="عنوان المشكلة" style={styles.input} />
            <TextInput value={description} onChangeText={setDescription} placeholder="اشرح المشكلة بالتفصيل..." multiline style={[styles.input, { minHeight: 90 }]} />
            <View style={styles.categories}>
              {['general','technical','billing','complaint'].map((value) => <TouchableOpacity key={value} onPress={() => setCategory(value)} style={[styles.category, category === value && styles.categoryActive]}><Text style={styles.categoryText}>{value === 'general' ? 'عام' : value === 'technical' ? 'تقني' : value === 'billing' ? 'فواتير' : 'شكوى'}</Text></TouchableOpacity>)}
            </View>
            <TouchableOpacity disabled={busy || !subject.trim() || !description.trim()} onPress={() => void createTicket()} style={styles.send}><Text style={styles.sendText}>{busy ? 'جاري الإرسال...' : 'إرسال للدعم'}</Text></TouchableOpacity>
          </View>}
          <ScrollView contentContainerStyle={{ paddingBottom: 35 }}>
            {loading ? <ActivityIndicator style={{ marginTop: 35 }} /> : tickets.length === 0 ? <Text style={styles.empty}>ما عندك تذاكر دعم حالياً</Text> : tickets.map((ticket) => <TouchableOpacity key={ticket.id} onPress={() => setSelected(ticket)} style={styles.ticket}>
              <Text style={styles.ticketTitle}>{ticket.subject}</Text>
              <Text style={styles.ticketMeta}>{ticket.needs_staff || ticket.status === 'waiting_staff' ? 'بانتظار فريق الدعم' : ticket.status === 'open' ? 'مفتوحة · مساعد ممنون متاح' : 'مغلقة'}</Text>
            </TouchableOpacity>)}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 52, paddingHorizontal: 18 },
  header: { marginBottom: 16 }, back: { color: '#64748b', fontWeight: '700', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '900', color: '#0f172a', textAlign: 'right' },
  subtitle: { fontSize: 12, color: '#64748b', textAlign: 'right', lineHeight: 20, marginTop: 5 },
  status: { alignSelf: 'flex-end', backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginBottom: 8 },
  statusText: { color: '#92400e', fontWeight: '800', fontSize: 11 },
  messages: { flex: 1 }, description: { backgroundColor: '#e2e8f0', padding: 12, borderRadius: 14, marginBottom: 8 },
  bubble: { maxWidth: '88%', borderRadius: 16, padding: 12, marginBottom: 9 },
  supportBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  body: { color: '#0f172a', textAlign: 'right', lineHeight: 22 }, userText: { color: '#fff' },
  sender: { color: '#2563eb', fontSize: 10, fontWeight: '800', textAlign: 'right', marginTop: 5 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, textAlign: 'right', color: '#0f172a' },
  send: { backgroundColor: '#2563eb', borderRadius: 13, paddingHorizontal: 15, paddingVertical: 13, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '800' }, newButton: { backgroundColor: '#eff6ff', padding: 14, borderRadius: 15, marginBottom: 12 },
  newText: { color: '#1d4ed8', fontWeight: '900', textAlign: 'center' }, form: { backgroundColor: '#fff', padding: 13, borderRadius: 16, gap: 9, marginBottom: 12 },
  categories: { flexDirection: 'row', justifyContent: 'space-between' }, category: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f1f5f9' },
  categoryActive: { backgroundColor: '#dbeafe' }, categoryText: { color: '#334155', fontWeight: '700', fontSize: 11 },
  ticket: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 9 }, ticketTitle: { textAlign: 'right', fontWeight: '800', color: '#0f172a' },
  ticketMeta: { textAlign: 'right', color: '#64748b', fontSize: 11, marginTop: 5 }, empty: { textAlign: 'center', color: '#94a3b8', marginTop: 45 },
});
