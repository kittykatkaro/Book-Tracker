import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBookByIsbn } from '@workspace/api-client-react';
import { useTranslation } from 'react-i18next';

const GENRES = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Fantasy', 'Sci-Fi',
  'Biography', 'History', 'Self-Help', 'Romance', 'Thriller', 'Other',
];

export default function AddBookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addBook } = useBooks();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('want_to_read');
  const [genre, setGenre] = useState('');
  const [pages, setPages] = useState('');

  const [isbn, setIsbn] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<'success' | 'error' | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannedRef = useRef(false);

  const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
    { value: 'want_to_read', label: t('addBook.statusWantToRead'), icon: 'bookmark' },
    { value: 'reading', label: t('addBook.statusReading'), icon: 'book-open' },
    { value: 'read', label: t('addBook.statusRead'), icon: 'check-circle' },
  ];

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

  const handleLookup = async (isbnStr: string) => {
    const clean = isbnStr.replace(/[^0-9Xx]/g, '');
    if (!clean || clean.length < 10) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const result = await lookupBookByIsbn({ isbn: clean });
      if (result.title) setTitle(result.title);
      if (result.author) setAuthor(result.author);
      if (result.pages) setPages(String(result.pages));
      if (result.genre) {
        const matched = GENRES.find(
          (g) => g.toLowerCase() === result.genre?.toLowerCase(),
        );
        setGenre(matched ?? '');
      }
      setLookupResult('success');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLookupResult('error');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleScanPress = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    scannedRef.current = false;
    setScanning(true);
  };

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    const isValidIsbn =
      /^97[89]\d{10}$/.test(data) || /^\d{9}[\dXx]$/.test(data);
    if (!isValidIsbn) return;
    scannedRef.current = true;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScanning(false);
    setIsbn(data);
    handleLookup(data);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('addBook.title')}</Text>
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
            {t('addBook.save')}
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
          {/* ISBN Lookup */}
          <View style={[styles.isbnCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {t('addBook.isbnLabel')}
            </Text>
            <View style={styles.isbnRow}>
              <TextInput
                value={isbn}
                onChangeText={(v) => { setIsbn(v); setLookupResult(null); }}
                placeholder={t('addBook.isbnPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[
                  styles.isbnInput,
                  { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
                ]}
              />
              <Pressable
                onPress={() => handleLookup(isbn)}
                disabled={lookupLoading || isbn.replace(/[^0-9Xx]/g, '').length < 10}
                style={[
                  styles.isbnBtn,
                  {
                    backgroundColor:
                      isbn.replace(/[^0-9Xx]/g, '').length >= 10
                        ? colors.primary
                        : colors.muted,
                  },
                ]}
              >
                {lookupLoading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="search" size={16} color={colors.primaryForeground} />
                )}
              </Pressable>
              <Pressable
                onPress={handleScanPress}
                style={[styles.isbnBtn, { backgroundColor: colors.accent }]}
              >
                <Feather name="camera" size={16} color="#fff" />
              </Pressable>
            </View>
            {lookupResult === 'success' && (
              <Text style={[styles.lookupMsg, { color: colors.primary }]}>
                {t('addBook.isbnSuccess')}
              </Text>
            )}
            {lookupResult === 'error' && (
              <Text style={[styles.lookupMsg, { color: '#E55A4E' }]}>
                {t('addBook.isbnError')}
              </Text>
            )}
            {!lookupResult && (
              <Text style={[styles.lookupHint, { color: colors.mutedForeground }]}>
                {t('addBook.isbnHint')}
              </Text>
            )}
          </View>

          {/* Title */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t('addBook.titleLabel')}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('addBook.titlePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
              autoCorrect={false}
            />
          </View>

          {/* Author */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t('addBook.authorLabel')}</Text>
            <TextInput
              value={author}
              onChangeText={setAuthor}
              placeholder={t('addBook.authorPlaceholder')}
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t('addBook.pagesLabel')}</Text>
            <TextInput
              value={pages}
              onChangeText={setPages}
              placeholder={t('addBook.pagesPlaceholder')}
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t('addBook.statusLabel')}</Text>
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t('addBook.genreLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
              {GENRES.map((g) => {
                const active = genre === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setGenre(active ? '' : g)}
                    style={[
                      styles.genreBtn,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '15' : colors.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.genreText,
                        { color: active ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {g}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Barcode scanner modal */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={[styles.scanContainer, { backgroundColor: colors.background }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={handleBarcodeScan}
          />
          <View style={styles.scanOverlay}>
            <View style={[styles.scanFrame, { borderColor: colors.primary }]} />
          </View>
          <Pressable
            onPress={() => setScanning(false)}
            style={[styles.scanClose, { backgroundColor: colors.background }]}
          >
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  closeBtn: { padding: 4 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  form: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },
  isbnCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  isbnRow: { flexDirection: 'row', gap: 8 },
  isbnInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  isbnBtn: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lookupMsg: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  lookupHint: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  field: { gap: 8 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7 },
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
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  genreBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  scanContainer: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 150, borderWidth: 2, borderRadius: 12 },
  scanClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
