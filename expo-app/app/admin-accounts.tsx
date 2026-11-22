import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { authProxy } from '@/lib/supabase';

type AccountUser = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
};

export default function AdminAccountsScreen() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [selected, setSelected] = useState<AccountUser | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const loadUsers = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const result = await authProxy<{ users: AccountUser[] }>('/admin-list-users', { search: term });
      setUsers(result.users ?? []);
      setSelected((current) => current ? (result.users ?? []).find((item) => item.id === current.id) ?? null : null);
    } catch (error) {
      Alert.alert('تعذر تحميل الحسابات', error instanceof Error ? error.message : 'حاول مرة ثانية');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(''); }, [loadUsers]);

  const chooseUser = (account: AccountUser) => {
    setSelected(account);
    setEditEmail(account.email ?? '');
    setEditPhone(account.phone ?? '');
  };

  const invite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      Alert.alert('بيانات ناقصة', 'أدخل اسم المستخدم والبريد الإلكتروني');
      return;
    }
    setBusy(true);
    try {
      await authProxy('/admin-invite-user', {
        full_name: inviteName.trim(),
        email: inviteEmail.trim(),
        phone: invitePhone.trim() || undefined,
      });
      Alert.alert('تم إرسال الدعوة', 'أُرسلت دعوة البريد، وسيُطلب من المستخدم تعيين كلمة مرور عند الدخول');
      setInviteEmail(''); setInviteName(''); setInvitePhone('');
      await loadUsers('');
    } catch (error) {
      Alert.alert('تعذر إرسال الدعوة', error instanceof Error ? error.message : 'حاول مرة ثانية');
    } finally {
      setBusy(false);
    }
  };

  const saveContact = () => {
    if (!selected) return;
    if (!editEmail.trim() && !editPhone.trim()) {
      Alert.alert('بيانات ناقصة', 'يجب إدخال البريد أو رقم الهاتف');
      return;
    }
    Alert.alert(
      'تأكيد تحديث الحساب',
      'راح تتحدث بيانات تسجيل الدخول والملف الشخصي لهذا المستخدم. هل تريد المتابعة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد التحديث',
          onPress: async () => {
            setBusy(true);
            try {
              await authProxy('/admin-update-user-contact', {
                user_id: selected.id,
                ...(editEmail.trim() ? { email: editEmail.trim() } : {}),
                ...(editPhone.trim() ? { phone: editPhone.trim() } : {}),
              });
              Alert.alert('تم التحديث', 'تم تحديث بيانات الحساب');
              await loadUsers();
            } catch (error) {
              Alert.alert('تعذر التحديث', error instanceof Error ? error.message : 'حاول مرة ثانية');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const setPasswordRequirement = (required: boolean) => {
    if (!selected) return;
    Alert.alert(
      required ? 'فرض تغيير كلمة المرور' : 'إلغاء طلب تغيير كلمة المرور',
      required
        ? 'سيُطلب من المستخدم تغيير كلمة المرور قبل استخدام التطبيق مجدداً.'
        : 'سيُلغى طلب تغيير كلمة المرور لهذا الحساب.',
      [
        { text: 'رجوع', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            setBusy(true);
            try {
              await authProxy('/admin-require-password-change', { user_id: selected.id, required });
              Alert.alert('تم', required ? 'تم فرض تغيير كلمة المرور' : 'تم إلغاء طلب تغيير كلمة المرور');
            } catch (error) {
              Alert.alert('تعذر تنفيذ العملية', error instanceof Error ? error.message : 'حاول مرة ثانية');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>رجوع</Text></Pressable>
          <Text style={styles.title}>إدارة الحسابات</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>إنشاء حساب بدعوة</Text>
          <Text style={styles.hint}>تُرسل الدعوة إلى البريد الإلكتروني، ويُطلب من المستخدم تعيين كلمة مرور عند أول دخول</Text>
          <TextInput style={styles.input} value={inviteName} onChangeText={setInviteName} placeholder="اسم المستخدم الكامل" placeholderTextColor="#94a3b8" />
          <TextInput style={styles.input} value={inviteEmail} onChangeText={setInviteEmail} placeholder="البريد الإلكتروني" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={styles.input} value={invitePhone} onChangeText={setInvitePhone} placeholder="رقم الهاتف (اختياري)" placeholderTextColor="#94a3b8" keyboardType="phone-pad" />
          <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={invite}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>إرسال دعوة الحساب</Text>}
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>البحث عن حساب</Text>
          <View style={styles.searchRow}>
            <TextInput style={[styles.input, styles.searchInput]} value={search} onChangeText={setSearch} placeholder="الاسم أو الهاتف أو البريد" placeholderTextColor="#94a3b8" />
            <Pressable style={styles.searchButton} onPress={() => loadUsers()}><Text style={styles.primaryText}>بحث</Text></Pressable>
          </View>
          {loading ? <ActivityIndicator style={{ margin: 18 }} color="#2563eb" /> : users.length === 0 ? <Text style={styles.empty}>ماكو حسابات مطابقة ضمن النتائج</Text> : users.map((account) => (
            <Pressable key={account.id} onPress={() => chooseUser(account)} style={[styles.userRow, selected?.id === account.id && styles.userSelected]}>
              <View style={styles.userAvatar}><Text style={styles.avatarText}>{(account.full_name || 'م').trim().slice(0, 1)}</Text></View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{account.full_name || 'بدون اسم'}</Text>
                <Text style={styles.userDetail}>{account.email || 'بدون بريد'} · {account.phone || 'بدون هاتف'}</Text>
              </View>
              <Text style={styles.chooseText}>{selected?.id === account.id ? 'محدد' : 'اختيار'}</Text>
            </Pressable>
          ))}
          <Text style={styles.hint}>تظهر أول 100 نتيجة كحد أقصى. استخدم البحث لتحديد الحساب المطلوب.</Text>
        </View>

        {selected && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>تعديل بيانات: {selected.full_name || 'المستخدم'}</Text>
            <TextInput style={styles.input} value={editEmail} onChangeText={setEditEmail} placeholder="البريد الإلكتروني" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone} placeholder="رقم الهاتف" placeholderTextColor="#94a3b8" keyboardType="phone-pad" />
            <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={saveContact}>
              <Text style={styles.primaryText}>حفظ بيانات الحساب</Text>
            </Pressable>
            <Pressable disabled={busy} style={styles.warningButton} onPress={() => setPasswordRequirement(true)}>
              <Text style={styles.warningText}>إجبار المستخدم على تغيير كلمة المرور</Text>
            </Pressable>
            <Pressable disabled={busy} style={styles.secondaryButton} onPress={() => setPasswordRequirement(false)}>
              <Text style={styles.secondaryText}>إلغاء إجبار تغيير كلمة المرور</Text>
            </Pressable>
            <Text style={styles.hint}>لا يمكن تعديل حسابك أو حسابات الإدارة والإشراف من هذه الشاشة.</Text>
          </View>
        )}
      </ScrollView>
      {busy && <View pointerEvents="none" style={styles.busyOverlay}><ActivityIndicator color="#fff" size="large" /></View>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 18, paddingTop: 52, paddingBottom: 48, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 25, fontWeight: '900', color: '#0f172a' },
  back: { backgroundColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  backText: { color: '#334155', fontWeight: '800' },
  panel: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#1e293b', textAlign: 'right' },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: '#0f172a', textAlign: 'right', fontSize: 14 },
  primaryButton: { backgroundColor: '#1d4ed8', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.55 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1 },
  searchButton: { backgroundColor: '#1d4ed8', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14 },
  empty: { color: '#64748b', textAlign: 'center', padding: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 12 },
  userSelected: { backgroundColor: '#eff6ff', borderRadius: 12, paddingHorizontal: 8 },
  userAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1d4ed8', fontSize: 16, fontWeight: '900' },
  userInfo: { flex: 1, gap: 3 },
  userName: { color: '#0f172a', fontWeight: '800', textAlign: 'right' },
  userDetail: { color: '#64748b', fontSize: 11, textAlign: 'right' },
  chooseText: { color: '#2563eb', fontWeight: '800', fontSize: 12 },
  warningButton: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 12, padding: 13, alignItems: 'center' },
  warningText: { color: '#c2410c', fontWeight: '800', fontSize: 13 },
  secondaryButton: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 13, alignItems: 'center' },
  secondaryText: { color: '#334155', fontWeight: '800', fontSize: 13 },
  busyOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.12)', alignItems: 'center', justifyContent: 'center' },
});
