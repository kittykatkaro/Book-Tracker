import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBooks, BookStatus } from '@/context/BooksContext';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { customFetch } from '@workspace/api-client-react';

function StarRating({ rating, onChange, colors }: { rating: number; onChange: (r: number) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} hitSlop={8}>
          <Feather name="star" size={30} color={i <= rating ? colors.accent : colors.border} />
        </Pressable>
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BookDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getBook, updateBook, deleteBook } = useBooks();

  const book = getBook(id);
  const [notes, setNotes] = useState(book?.notes ?? '');
  const [currentPage, setCurrentPage] = useState(book?.currentPage?.toString() ?? '');
  const [dirty, setDirty] = useState(false);

  // Cover change state
  const [coverUrlModalOpen, setCoverUrlModalOpen] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverSaving, setCoverSaving] = useState(false);

  useEffect(() => { if (!book) router.back(); }, [book]);
  if (!book) return null;

  const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
    { value: 'want_to_read', label: t('bookDetail.statusWantToRead'), icon: 'bookmark' },
    { value: 'reading', label: t('bookDetail.statusReading'), icon: 'book-open' },
    { value: 'read', label: t('bookDetail.statusRead'), icon: 'check-circle' },
  ];

  const handleStatusChange = (newStatus: BookStatus) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateBook(id, { status: newStatus });
  };

  const handleRatingChange = (rating: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateBook(id, { rating });
  };

  const handleSave = () => {
    if (!dirty) return;
    const cp = currentPage ? parseInt(currentPage, 10) : undefined;
    updateBook(id, { notes: notes || undefined, currentPage: cp });
    setDirty(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-restricted-globals
      if (confirm(t('bookDetail.deleteMessage'))) { deleteBook(id); router.back(); }
    } else {
      Alert.alert(t('bookDetail.deleteTitle'), t('bookDetail.deleteMessage'), [
        { text: t('bookDetail.deleteCancel'), style: 'cancel' },
        {
          text: t('bookDetail.deleteConfirm'),
          style: 'destructive',
          onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteBook(id); router.back(); },
        },
      ]);
    }
  };

  // ── Cover handlers ─────────────────────────────────────────────────────────

  const handleChangeCover = () => {
    const options: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
      { text: t('bookDetail.coverOptionUrl'), onPress: () => setCoverUrlModalOpen(true) },
      { text: t('bookDetail.coverOptionLibrary'), onPress: handlePickFromLibrary },
    ];
    if (book.coverUrl) {
      options.push({ text: t('bookDetail.coverOptionRemove'), style: 'destructive', onPress: handleRemoveCover });
    }
    options.push({ text: t('bookDetail.cancel'), style: 'cancel' });

    if (Platform.OS === 'web') {
      setCoverUrlModalOpen(true);
    } else {
      Alert.alert(t('bookDetail.changeCover'), undefined, options);
    }
  };

  const handlePickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('bookDetail.coverPermissionDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setCoverSaving(true);
    try {
      const formData = new FormData();
      formData.append('cover', {
        uri: asset.uri,
        name: 'cover.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any);
      const data = await customFetch<{ coverUrl: string }>(`/api/books/${id}/cover`, {
        method: 'POST',
        body: formData as any,
      });
      updateBook(id, { coverUrl: data.coverUrl });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('bookDetail.coverUploadError'));
    } finally {
      setCoverSaving(false);
    }
  };

  const handleSaveCoverUrl = async () => {
    if (!coverUrlInput.trim()) return;
    setCoverSaving(true);
    try {
      updateBook(id, { coverUrl: coverUrlInput.trim() });
      setCoverUrlModalOpen(false);
      setCoverUrlInput('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setCoverSaving(false);
    }
  };

  const handleRemoveCover = () => {
    updateBook(id, { coverUrl: null });
  };

  const progress = book.pages && book.currentPage ? book.currentPage / book.pages : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navbar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.navBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleDelete} style={styles.navBtn}>
          <Feather name="trash-2" size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            {/* Cover with edit button overlay */}
            <Pressable onPress={handleChangeCover} style={styles.coverWrapper}>
              <View style={[styles.coverLarge, { backgroundColor: book.coverUrl ? undefined : book.coverColor, borderRadius: colors.radius + 2 }]}>
                {book.coverUrl ? (
                  <Image
                    source={{ uri: book.coverUrl }}
                    style={[StyleSheet.absoluteFill, { borderRadius: colors.radius + 2 }]}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Text style={styles.coverLetterLarge}>{book.title.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              {/* Edit overlay badge */}
              <View style={[styles.coverEditBadge, { backgroundColor: colors.primary }]}>
                {coverSaving ? (
                  <Feather name="loader" size={11} color="#fff" />
                ) : (
                  <Feather name="camera" size={11} color="#fff" />
                )}
              </View>
            </Pressable>

            <Text style={[styles.bookTitle, { color: colors.foreground }]}>{book.title}</Text>
            <Text style={[styles.bookAuthor, { color: colors.mutedForeground }]}>{book.author}</Text>
            {book.genre && (
              <View style={[styles.genrePill, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.genrePillText, { color: colors.mutedForeground }]}>{book.genre}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('bookDetail.statusLabel')}</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = book.status === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleStatusChange(opt.value)}
                    style={[styles.statusBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.secondary }]}
                  >
                    <Feather name={opt.icon as any} size={14} color={active ? colors.primaryForeground : colors.mutedForeground} />
                    <Text style={[styles.statusText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {book.status === 'reading' && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('bookDetail.progressLabel')}</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.pageRow}>
                  <TextInput
                    value={currentPage}
                    onChangeText={(v) => { setCurrentPage(v); setDirty(true); }}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    style={[styles.pageInput, { color: colors.foreground, borderBottomColor: colors.border }]}
                  />
                  {book.pages && (
                    <Text style={[styles.pageOf, { color: colors.mutedForeground }]}>
                      {t('bookDetail.ofPages', { count: book.pages })}
                    </Text>
                  )}
                </View>
                {progress !== null && (
                  <View style={{ marginTop: 14 }}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                      <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: colors.accent }]} />
                    </View>
                    <Text style={[styles.progressPct, { color: colors.mutedForeground }]}>
                      {Math.round(progress * 100)}{t('bookDetail.complete')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {book.status === 'read' && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('bookDetail.ratingLabel')}</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <StarRating rating={book.rating ?? 0} onChange={handleRatingChange} colors={colors} />
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('bookDetail.notesLabel')}</Text>
            <TextInput
              value={notes}
              onChangeText={(v) => { setNotes(v); setDirty(true); }}
              placeholder={t('bookDetail.notesPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              multiline numberOfLines={5}
              style={[styles.notesInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              textAlignVertical="top"
            />
          </View>

          {(book.dateStarted || book.dateFinished) && (
            <View style={[styles.datesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {book.dateStarted && (
                <View style={styles.dateItem}>
                  <Feather name="play" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{t('bookDetail.started')}</Text>
                  <Text style={[styles.dateValue, { color: colors.foreground }]}>{formatDate(book.dateStarted)}</Text>
                </View>
              )}
              {book.dateFinished && (
                <View style={styles.dateItem}>
                  <Feather name="check" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{t('bookDetail.finished')}</Text>
                  <Text style={[styles.dateValue, { color: colors.foreground }]}>{formatDate(book.dateFinished)}</Text>
                </View>
              )}
            </View>
          )}

          {dirty && (
            <Pressable onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('bookDetail.saveChanges')}</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Cover URL modal */}
      <Modal visible={coverUrlModalOpen} transparent animationType="slide" onRequestClose={() => setCoverUrlModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('bookDetail.coverUrlModalTitle')}</Text>
            <TextInput
              value={coverUrlInput}
              onChangeText={setCoverUrlInput}
              placeholder={t('bookDetail.coverUrlPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => { setCoverUrlModalOpen(false); setCoverUrlInput(''); }} style={[styles.modalBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>{t('bookDetail.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleSaveCoverUrl} disabled={!coverUrlInput.trim() || coverSaving} style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: !coverUrlInput.trim() ? 0.5 : 1 }]}>
                <Text style={[styles.modalBtnText, { color: colors.primaryForeground }]}>{t('bookDetail.coverSave')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  navBtn: { padding: 8 },
  scroll: { paddingHorizontal: 16 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  coverWrapper: { position: 'relative', marginBottom: 8 },
  coverLarge: { width: 110, height: 150, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  coverLetterLarge: { color: '#FFFFFF', fontSize: 48, fontFamily: 'Inter_700Bold' },
  coverEditBadge: { position: 'absolute', bottom: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  bookTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center', lineHeight: 28 },
  bookAuthor: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  genrePill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginTop: 2 },
  genrePillText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  section: { marginBottom: 20 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 8 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  statusText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  card: { borderRadius: 12, borderWidth: 1, padding: 16 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageInput: { fontSize: 24, fontFamily: 'Inter_700Bold', borderBottomWidth: 2, paddingBottom: 4, minWidth: 64, textAlign: 'center' },
  pageOf: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 6 },
  notesInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: 'Inter_400Regular', minHeight: 120, lineHeight: 22 },
  datesCard: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 16, gap: 16, marginBottom: 20 },
  dateItem: { flex: 1, alignItems: 'center', gap: 5 },
  dateLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  dateValue: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter_400Regular' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  modalBtnPrimary: { borderWidth: 0 },
  modalBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
