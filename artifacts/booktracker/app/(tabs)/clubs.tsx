import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/expo';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

interface ClubSummary {
  id: string; name: string; description: string | null;
  inviteCode: string; hasPassword: boolean; memberCount: number;
  bookCount: number; latestBook: { title: string; author: string; coverColor: string } | null;
  myRole: 'owner' | 'member';
}

function useClubs() {
  return useQuery<ClubSummary[]>({
    queryKey: ['clubs'],
    queryFn: () => customFetch('/api/clubs'),
  });
}

function CreateModal({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ReturnType<typeof useColors> }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const displayName = user?.firstName || user?.username || user?.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Reader';

  const mutation = useMutation({
    mutationFn: (data: { name: string; description: string; displayName: string; password: string }) =>
      customFetch('/api/clubs', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clubs'] }); setName(''); setDescription(''); setPassword(''); onClose(); },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('clubs.createTitle')}</Text>

          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{t('clubs.clubName')}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
            placeholder={t('clubs.clubNamePlaceholder')} placeholderTextColor={colors.mutedForeground}
            value={name} onChangeText={setName} />

          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{t('clubs.description')}</Text>
          <TextInput style={[styles.input, styles.multilineInput, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
            placeholder={t('clubs.descriptionPlaceholder')} placeholderTextColor={colors.mutedForeground}
            value={description} onChangeText={setDescription} multiline numberOfLines={3} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 }}>
            <Feather name="lock" size={13} color={colors.mutedForeground} />
            <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginBottom: 0, marginTop: 0 }]}>{t('clubs.clubPassword')}</Text>
          </View>
          <View style={{ position: 'relative' }}>
            <TextInput style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 60 }]}
              placeholder={t('clubs.clubPasswordPlaceholder')} placeholderTextColor={colors.mutedForeground}
              value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4, marginBottom: 4 }}>
            {t('clubs.passwordHint')}
          </Text>

          {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{t('clubs.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => { setError(''); mutation.mutate({ name, description, displayName, password }); }}
              disabled={!name.trim() || !password.trim() || mutation.isPending}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !name.trim() || !password.trim() || mutation.isPending ? 0.6 : 1 }]}
            >
              {mutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} size="small" />
                : <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>{t('clubs.create')}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function JoinModal({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ReturnType<typeof useColors> }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const displayName = user?.firstName || user?.username || user?.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Reader';

  const mutation = useMutation({
    mutationFn: (data: { inviteCode: string; displayName: string; password?: string }) =>
      customFetch('/api/clubs/join', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clubs'] }); setCode(''); setPassword(''); onClose(); },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('clubs.joinTitle')}</Text>
          <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>{t('clubs.joinSubtitle')}</Text>

          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{t('clubs.inviteCode')}</Text>
          <TextInput style={[styles.input, styles.codeInput, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
            placeholder={t('clubs.inviteCodePlaceholder')} placeholderTextColor={colors.mutedForeground}
            value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 4 }}>
            <Feather name="lock" size={13} color={colors.mutedForeground} />
            <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
              {t('clubs.password')} <Text style={{ fontFamily: 'Inter_400Regular' }}>{t('clubs.passwordOptional')}</Text>
            </Text>
          </View>
          <View style={{ position: 'relative' }}>
            <TextInput style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 60 }]}
              placeholder={t('clubs.passwordPlaceholder')} placeholderTextColor={colors.mutedForeground}
              value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{t('clubs.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => { setError(''); mutation.mutate({ inviteCode: code, displayName, password: password || undefined }); }}
              disabled={!code.trim() || mutation.isPending}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !code.trim() || mutation.isPending ? 0.6 : 1 }]}
            >
              {mutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} size="small" />
                : <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>{t('clubs.join')}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ClubCard({ club, colors }: { club: ClubSummary; colors: ReturnType<typeof useColors> }) {
  const { t } = useTranslation();
  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/club/${club.id}`);
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.clubIcon, { backgroundColor: colors.primary + '22' }]}>
          <Feather name="users" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{club.name}</Text>
            {club.myRole === 'owner' && (
              <View style={[styles.roleBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.roleBadgeText, { color: colors.mutedForeground }]}>{t('clubs.owner')}</Text>
              </View>
            )}
          </View>
          {club.description && <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{club.description}</Text>}
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>

      {club.latestBook && (
        <View style={[styles.latestBook, { backgroundColor: colors.background }]}>
          <View style={[styles.miniCover, { backgroundColor: club.latestBook.coverColor }]}>
            <Text style={styles.miniCoverText}>{club.latestBook.title.charAt(0)}</Text>
          </View>
          <Text style={[styles.latestBookTitle, { color: colors.foreground }]} numberOfLines={1}>{club.latestBook.title}</Text>
        </View>
      )}

      <View style={styles.cardStats}>
        <Text style={[styles.statText, { color: colors.mutedForeground }]}>
          <Feather name="users" size={11} /> {club.memberCount} {t('clubs.member', { count: club.memberCount })}
        </Text>
        <Text style={[styles.statText, { color: colors.mutedForeground }]}>
          <Feather name="book" size={11} /> {club.bookCount} {t('clubs.book', { count: club.bookCount })}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ClubsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: clubs, isLoading, refetch } = useClubs();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('clubs.title')}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{t('clubs.subtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setJoinOpen(true)} style={[styles.headerActionBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="log-in" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={() => setCreateOpen(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={20} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
      ) : clubs && clubs.length > 0 ? (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ClubCard club={item} colors={colors} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 }]}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={styles.centered}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '22' }]}>
            <Feather name="users" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('clubs.emptyTitle')}</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{t('clubs.emptySub')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable onPress={() => setCreateOpen(true)} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>{t('clubs.createClub')}</Text>
            </Pressable>
            <Pressable onPress={() => setJoinOpen(true)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>{t('clubs.joinClub')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <CreateModal visible={createOpen} onClose={() => setCreateOpen(false)} colors={colors} />
      <JoinModal visible={joinOpen} onClose={() => setJoinOpen(false)} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34 },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerActionBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', flex: 1 },
  cardSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  roleBadgeText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  latestBook: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 8 },
  miniCover: { width: 22, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  miniCoverText: { color: 'white', fontSize: 10, fontFamily: 'Inter_700Bold' },
  latestBookTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  cardStats: { flexDirection: 'row', gap: 16 },
  statText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6, marginTop: 14 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: 'Inter_400Regular' },
  multilineInput: { minHeight: 72, textAlignVertical: 'top' },
  codeInput: { letterSpacing: 4, fontFamily: 'Inter_600SemiBold', fontSize: 18, textAlign: 'center' },
  errorText: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: '#aaa', alignItems: 'center', justifyContent: 'center' },
});
