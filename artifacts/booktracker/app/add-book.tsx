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
  const [permission, requestPermission] = useCameraPermissions();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('want_to_read');
  const [genre, setGenre] = useState('');
  const [pages, setPages] = useState('');

  // ISBN state
  const [isbn, setIsbn] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<'success' | 'error' | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannedRef = useRef(false);

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
          {/* ISBN Lookup */}
          <View
            style={[
              styles.isbnCard,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              ISBN LOOKUP
            </Text>
            <View style={styles.isbnRow}>
              <TextInput
                value={isbn}
                onChangeText={(v) => { setIsbn(v); setLookupResult(null); }}
                placeholder="9780140449136"
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
                ✓ Book details filled in — review and save.
              </Text>
            )}
            {lookupResult === 'error' && (
              <Text style={[styles.lookupMsg, { color: '#E55A4E' }]}>
                Book not found for this ISBN. Enter details manually.
              </Text>
            )}
            {!lookupResult && (
              <Text style={[styles.lookupHint, { color: colors.mutedForeground }]}>
                Tap the camera icon to scan the barcode, or type an ISBN and tap search.
              </Text>
            )}
          </View>

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

      {/* Camera Scanner Modal */}
      <Modal
        visible={scanning}
        animationType="slide"
        onRequestClose={() => setScanning(false)}
      >
        <View style={[styles.scannerContainer, { backgroundColor: '#000' }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_e'] }}
            onBarcodeScanned={handleBarcodeScan}
          />

          {/* Viewfinder overlay */}
          <View style={styles.scannerOverlay} pointerEvents="none">
            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.cornerTL, { borderColor: colors.primary }]} />
              <View style={[styles.corner, styles.cornerTR, { borderColor: colors.primary }]} />
              <View style={[styles.corner, styles.cornerBL, { borderColor: colors.primary }]} />
              <View style={[styles.corner, styles.cornerBR, { borderColor: colors.primary }]} />
            </View>
          </View>

          {/* Top bar */}
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => setScanning(false)} style={styles.scannerClose}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.scannerTitle}>Scan ISBN Barcode</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Bottom hint */}
          <View style={[styles.scannerFooter, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.scannerHint}>
              Point at the barcode on the back cover
            </Text>
          </View>
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
  // ISBN card
  isbnCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  isbnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  isbnInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  isbnBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupMsg: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  lookupHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  // Scanner
  scannerContainer: { flex: 1 },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width: 260,
    height: 120,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scannerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerClose: { width: 40, alignItems: 'flex-start' },
  scannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  scannerFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: 16,
  },
  scannerHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
  },
});
