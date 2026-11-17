import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type TeamRole = 'developer';
type TeamMember = {
  user_id: string;
  rank: string;
  department: string;
  display_title: string | null;
  active: boolean;
  is_owner?: boolean;
  profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
};

async function invokeTeam(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('team-management', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

const ROLES: { value: TeamRole; label: string }[] = [
  { value: 'developer', label: 'Developer — مطور' },
];

export default function AdminTeamScreen() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('developer');
  const [drafts, setDrafts] = useState<Record<string, TeamRole>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (user.email?.toLowerCase() !== 'a7md0555666@gmail.com') {
      setAuthorized(false); setLoading(false); return;
    }
    const { data: ownerCheck, error: ownerError } = await supabase.rpc('is_super_admin', { p_user_id: user.id });
    if (ownerError || !ownerCheck) { setAuthorized(false); setLoading(false); return; }
    setAuthorized(true);
    try {
      const data = await invokeTeam({ action: 'list' });
      setMembers((data?.members ?? []) as TeamMember[]);
    } catch (error) {
      Alert.alert('تعذر التحميل', error instanceof Error ? error.message : 'حاول مرة أخرى');
    } finally { setLoading(false); }
  }, [user?.id, user?.email]);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    if (!email.trim()) { Alert.alert('تنبيه', 'اكتب البريد الإلكتروني أولاً'); return; }
    setBusy(true);
    try {
      const data = await invokeTeam({ action: 'invite', email: email.trim(), role });
      Alert.alert('تم', data?.invitation_sent ? 'تم إرسال الدعوة وإضافة العضو للفريق' : 'تمت إضافة الحساب الموجود للفريق');
      setEmail('');
      await load();
    } catch (error) {
      Alert.alert('تعذر الإضافة', error instanceof Error ? error.message : 'حاول مرة أخرى');
    } finally { setBusy(false); }
  }

  async function saveRole(member: TeamMember) {
    const nextRole = drafts[member.user_id];
    if (!nextRole) return;
    setBusy(true);
    try {
      await invokeTeam({ action: 'update', user_id: member.user_id, role: nextRole });
      Alert.alert('تم', 'تم تحديث صلاحية العضو');
      await load();
    } catch (error) {
      Alert.alert('تعذر التحديث', error instanceof Error ? error.message : 'حاول مرة أخرى');
    } finally { setBusy(false); }
  }

  function confirmDeactivate(member: TeamMember) {
    Alert.alert('إيقاف العضو', 'سيتم إيقاف صلاحية العضو دون حذف حسابه أو بياناته.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إيقاف', style: 'destructive', onPress: () => { void (async () => {
        setBusy(true);
        try { await invokeTeam({ action: 'deactivate', user_id: member.user_id }); await load(); }
        catch (error) { Alert.alert('تعذر الإيقاف', error instanceof Error ? error.message : 'حاول مرة أخرى'); }
        finally { setBusy(false); }
      })(); } },
    ]);
  }

  const roleFor = (_member: TeamMember): TeamRole => 'developer';

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (!authorized) return <View style={styles.center}><Text style={styles.denied}>هذه الصفحة لصاحب المشروع فقط</Text><Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>رجوع</Text></Pressable></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backCircle}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>فريق العمل</Text><Text style={styles.subtitle}>إدارة الدعوات والصلاحيات</Text></View>
        <Text style={styles.count}>{members.filter((m) => m.active && !m.is_owner).length}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>دعوة عضو جديد</Text>
        <TextInput value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" style={styles.input} />
        <Text style={styles.label}>الصلاحية</Text>
        <View style={styles.roleRow}>{ROLES.map((item) => <Pressable key={item.value} onPress={() => setRole(item.value)} style={[styles.roleChip, role === item.value && styles.roleChipActive]}><Text style={[styles.roleText, role === item.value && styles.roleTextActive]}>{item.label}</Text></Pressable>)}</View>
        <Pressable disabled={busy || !email.trim()} onPress={invite} style={[styles.primaryButton, (busy || !email.trim()) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'جارٍ التنفيذ...' : 'إرسال الدعوة'}</Text></Pressable>
        <Text style={styles.note}>المطور لا يستطيع الاطلاع على بيانات المستخدمين أو لوحة الإدارة. هذه الدعوة لا تمنحه صلاحية مستودع GitHub أو إعدادات الدفع الخارجية.</Text>
      </View>

      <Text style={styles.sectionTitle}>الأعضاء الحاليون</Text>
      {members.map((member) => (
        <View key={member.user_id} style={styles.memberCard}>
          <View style={styles.memberTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{member.profile?.full_name || member.display_title || 'عضو فريق'}</Text>
              <Text style={styles.memberEmail}>{member.profile?.email || member.profile?.phone || member.user_id.slice(0, 8)}</Text>
            </View>
            <Text style={[styles.status, member.is_owner ? styles.ownerStatus : member.active ? styles.activeStatus : styles.inactiveStatus]}>{member.is_owner ? 'المالك' : member.active ? 'نشط' : 'موقوف'}</Text>
          </View>
          {!member.is_owner && (
            <>
              <View style={styles.roleRow}>{ROLES.map((item) => <Pressable key={item.value} onPress={() => setDrafts((prev) => ({ ...prev, [member.user_id]: item.value }))} style={[styles.roleChip, (drafts[member.user_id] ?? roleFor(member)) === item.value && styles.roleChipActive]}><Text style={[styles.roleText, (drafts[member.user_id] ?? roleFor(member)) === item.value && styles.roleTextActive]}>{item.label}</Text></Pressable>)}</View>
              <View style={styles.actions}>
                <Pressable disabled={busy || !member.active} onPress={() => saveRole(member)} style={[styles.smallPrimary, (busy || !member.active) && styles.disabled]}><Text style={styles.primaryText}>حفظ الصلاحية</Text></Pressable>
                {member.active && <Pressable disabled={busy} onPress={() => confirmDeactivate(member)} style={styles.dangerButton}><Text style={styles.dangerText}>إيقاف العضو</Text></Pressable>}
              </View>
            </>
          )}
        </View>
      ))}
      <Pressable onPress={() => void load()} style={styles.refreshButton}><Text style={styles.refreshText}>تحديث القائمة</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 18, paddingTop: 42 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  backCircle: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  backButton: { marginTop: 16, backgroundColor: '#dbeafe', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  backText: { color: '#1e293b', fontSize: 22, fontWeight: '800' },
  title: { color: '#0f172a', fontSize: 25, fontWeight: '900', textAlign: 'right' },
  subtitle: { color: '#64748b', fontSize: 12, textAlign: 'right', marginTop: 3 },
  count: { color: '#1d4ed8', backgroundColor: '#dbeafe', overflow: 'hidden', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontWeight: '900' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900', marginBottom: 12, textAlign: 'right' },
  input: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: '#0f172a', textAlign: 'right', marginBottom: 12 },
  label: { color: '#475569', fontSize: 12, fontWeight: '800', textAlign: 'right', marginBottom: 8 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  roleChip: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  roleChipActive: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  roleText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  roleTextActive: { color: '#1d4ed8' },
  primaryButton: { backgroundColor: '#1d4ed8', borderRadius: 12, padding: 14, alignItems: 'center' },
  smallPrimary: { backgroundColor: '#1d4ed8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  note: { color: '#64748b', fontSize: 11, textAlign: 'right', lineHeight: 18, marginTop: 10 },
  sectionTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900', textAlign: 'right', marginBottom: 12 },
  memberCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  memberName: { color: '#0f172a', fontWeight: '900', textAlign: 'right', fontSize: 14 },
  memberEmail: { color: '#64748b', fontSize: 11, textAlign: 'right', marginTop: 3 },
  status: { overflow: 'hidden', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  ownerStatus: { color: '#92400e', backgroundColor: '#fef3c7' },
  activeStatus: { color: '#166534', backgroundColor: '#dcfce7' },
  inactiveStatus: { color: '#64748b', backgroundColor: '#e2e8f0' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dangerButton: { backgroundColor: '#fee2e2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dangerText: { color: '#b91c1c', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  refreshButton: { alignItems: 'center', padding: 14, marginTop: 6 },
  refreshText: { color: '#1d4ed8', fontWeight: '800' },
  denied: { color: '#b91c1c', fontWeight: '900', fontSize: 16 },
});
