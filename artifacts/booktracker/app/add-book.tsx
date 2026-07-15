import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBooks, BookStatus } from '@/context/BooksContext';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

const GENRES = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Fantasy', 'Sci-Fi',
  'Biography', 'History', 'Self-Help', 'Romance', 'Thriller', 'Other',
];

const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
  { value: 'want_to_read', label: 'Want to Read', icon: 'bookmark' },
  { value: 'reading', label: 'Reading', icon: 'book-open' },
  { value: 'read', label: 'Read', icon: 'check-circle' },
];

export default function AddBookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addBook } = useBooks();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('want_to_read');
  const [genre, setGenre] = useState('');
  const [pages, setPages] = useState('');

  const canSubmit = title.trim().length > 0 && author.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addBook({
      title: title.trim(),
      author: author.trim(),
      status,
      genre: genre || undefined,
      pages: pages ? parseInt(pages, 10) : undefined,
    });
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add Book</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.saveBtn,
            { backgroundColor: canSubmit ? colors.primary : colors.secondary },
          ]}
        >
          <Text
            style={[
              styles.saveBtnText,
              { color: canSubmit ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            Save
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TITLE *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Book title"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
              autoFocus
              autoCorrect={false}
            />
          </View>

          {/* Author */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AUTHOR *</Text>
            <TextInput
              value={author}
              onChangeText={setAuthor}
              placeholder="Author name"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
              autoCorrect={false}
            />
          </View>

          {/* Pages */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PAGES</Text>
            <TextInput
              value={pages}
              onChangeText={setPages}
              placeholder="Total pages"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            />
          </View>

          {/* Status */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STATUS</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setStatus(opt.value)}
                    style={[
                      styles.statusBtn,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '18' : colors.secondary,
                      },
                    ]}
                  >
                    <Feather
                      name={opt.icon as any}
                      size={14}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: active ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Genre */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GENRE</Text>
            <View style={styles.genreGrid}>
              {GENRES.map((g) => {
                const active = genre === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setGenre(active ? '' : g)}
                    style={[
                      styles.genreChip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '18' : colors.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.genreChipText,
                        { color: active ? colors.primary : colors.foreground },
                      ]}
                    >
                      {g}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  form: { paddingHorizontal: 16, paddingTop: 8, gap: 20 },
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreChipText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
