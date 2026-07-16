import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBooks, BookStatus } from '@/context/BooksContext';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

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
            <View style={[styles.coverLarge, { backgroundColor: book.coverColor, borderRadius: colors.radius + 2 }]}>
              <Text style={styles.coverLetterLarge}>{book.title.charAt(0).toUpperCase()}</Text>
            </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  navBtn: { padding: 8 },
  scroll: { paddingHorizontal: 16 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  coverLarge: { width: 110, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  coverLetterLarge: { color: '#FFFFFF', fontSize: 48, fontFamily: 'Inter_700Bold' },
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
});
