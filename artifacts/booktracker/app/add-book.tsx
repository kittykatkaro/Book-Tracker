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
import { lookupBookByIsbn, bulkLookupIsbn } from '@workspace/api-client-react';
import type { IsbnBulkEntry } from '@workspace/api-client-react';
import { useTranslation } from 'react-i18next';

const GENRES = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Fantasy', 'Sci-Fi',
  'Biography', 'History', 'Self-Help', 'Romance', 'Thriller', 'Other',
];

type Mode = 'single' | 'set';

interface BookEntry extends IsbnBulkEntry {
  selectedStatus: BookStatus;
  selected: boolean;
}

export default function AddBookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addBook } = useBooks();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('single');

  // ── Single-book state ─────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('want_to_read');
  const [genre, setGenre] = useState('');
  const [pages, setPages] = useState('');
  const [isbn, setIsbn] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<'success' | 'error' | null>(null);

  // ── Set-import state ──────────────────────────────────────────────────────
  const [isbnQueue, setIsbnQueue] = useState<string[]>([]);
  const [isbnInput, setIsbnInput] = useState('');
  const [setLooking, setSetLooking] = useState(false);
  const [bookEntries, setBookEntries] = useState<BookEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importCount, setImportCount] = useState(0);

  // ── Scanner state ─────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const scannedRef = useRef(false);

  const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
    { value: 'want_to_read', label: t('addBook.statusWantToRead'), icon: 'bookmark' },
    { value: 'reading', label: t('addBook.statusReading'), icon: 'book-open' },
    { value: 'read', label: t('addBook.statusRead'), icon: 'check-circle' },
  ];

  const canSubmitSingle = title.trim().length > 0 && author.trim().length > 0;

  // ── Single-book handlers ──────────────────────────────────────────────────
  const handleSubmitSingle = () => {
    if (!canSubmitSingle) return;
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

  const handleLookupSingle = async (isbnStr: string) => {
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
        const matched = GENRES.find((g) => g.toLowerCase() === result.genre?.toLowerCase());
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

  // ── Set-import handlers ───────────────────────────────────────────────────
  const addToQueue = (raw: string) => {
    const clean = raw.replace(/[^0-9Xx]/g, '');
    if (!clean || clean.length < 10 || isbnQueue.includes(clean)) return;
    if (isbnQueue.length >= 20) return;
    setIsbnQueue((prev) => [...prev, clean]);
    setIsbnInput('');
  };

  const removeFromQueue = (isbn: string) => {
    setIsbnQueue((prev) => prev.filter((x) => x !== isbn));
  };

  const handleLookupSet = async () => {
    if (!isbnQueue.length) return;
    setSetLooking(true);
    setBookEntries([]);
    setImportDone(false);
    try {
      const { results } = await bulkLookupIsbn(isbnQueue);
      setBookEntries(
        results.map((r) => ({
          ...r,
          selectedStatus: 'want_to_read',
          selected: r.status === 'found',
        })),
      );
    } catch {
      /* individual statuses will show error */
    } finally {
      setSetLooking(false);
    }
  };

  const applyStatusToAll = (s: BookStatus) => {
    setBookEntries((prev) =>
      prev.map((b) => (b.status === 'found' ? { ...b, selectedStatus: s } : b)),
    );
  };

  const setEntryStatus = (isbn: string, s: BookStatus) => {
    setBookEntries((prev) =>
      prev.map((b) => (b.isbn === isbn ? { ...b, selectedStatus: s } : b)),
    );
  };

  const toggleEntrySelect = (isbn: string) => {
    setBookEntries((prev) =>
      prev.map((b) => (b.isbn === isbn ? { ...b, selected: !b.selected } : b)),
    );
  };

  const selectedEntries = bookEntries.filter((b) => b.selected && b.status === 'found');

  const handleImportSet = async () => {
    if (!selectedEntries.length) return;
    setImporting(true);
    try {
      for (const b of selectedEntries) {
        addBook({
          title: b.title ?? '',
          author: b.author ?? '',
          status: b.selectedStatus,
          pages: b.pages ?? undefined,
          genre: b.genre ?? undefined,
        });
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setImportCount(selectedEntries.length);
      setImportDone(true);
    } finally {
      setImporting(false);
    }
  };

  const resetSet = () => {
    setIsbnQueue([]);
    setIsbnInput('');
    setBookEntries([]);
    setImportDone(false);
    setImportCount(0);
  };

  // ── Scanner handler ───────────────────────────────────────────────────────
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
    const isValidIsbn = /^97[89]\d{10}$/.test(data) || /^\d{9}[\dXx]$/.test(data);
    if (!isValidIsbn) return;
    scannedRef.current = true;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScanning(false);

    if (mode === 'set') {
      addToQueue(data);
    } else {
      setIsbn(data);
      handleLookupSingle(data);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('addBook.title')}
        </Text>
        {mode === 'single' ? (
          <Pressable
            onPress={handleSubmitSingle}
            disabled={!canSubmitSingle}
            style={[
              styles.saveBtn,
              { backgroundColor: canSubmitSingle ? colors.primary : colors.secondary },
            ]}
          >
            <Text
              style={[
                styles.saveBtnText,
                { color: canSubmitSingle ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {t('addBook.save')}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Mode toggle */}
      <View style={[styles.modeBar, { borderBottomColor: colors.border }]}>
        {(['single', 'set'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[
              styles.modeTab,
              {
                borderBottomColor: mode === m ? colors.primary : 'transparent',
                borderBottomWidth: 2,
              },
            ]}
          >
            {m === 'set' && (
              <Feather
                name="layers"
                size={13}
                color={mode === m ? colors.primary : colors.mutedForeground}
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[
                styles.modeTabText,
                { color: mode === m ? colors.primary : colors.mutedForeground },
              ]}
            >
              {m === 'single' ? t('addBook.modeSingle') : t('addBook.modeSet')}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {mode === 'single' ? (
          /* ── Single book ── */
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
                  onPress={() => handleLookupSingle(isbn)}
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
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
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
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
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
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
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
                      <Feather name={opt.icon as any} size={14} color={active ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.statusText, { color: active ? colors.primary : colors.mutedForeground }]}>
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
                      style={[styles.genreBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '15' : colors.secondary }]}
                    >
                      <Text style={[styles.genreText, { color: active ? colors.primary : colors.mutedForeground }]}>{g}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </ScrollView>
        ) : (
          /* ── Book set ── */
          <ScrollView
            contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {importDone ? (
              /* Success */
              <View style={styles.successBox}>
                <Feather name="check-circle" size={40} color={colors.primary} />
                <Text style={[styles.successText, { color: colors.foreground }]}>
                  {t('addBook.setImportSuccess', { count: importCount })}
                </Text>
                <Pressable
                  onPress={() => router.back()}
                  style={[styles.importBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.importBtnText, { color: colors.primaryForeground }]}>
                    {t('addBook.backToLibrary') ?? 'Back to Library'}
                  </Text>
                </Pressable>
              </View>
            ) : bookEntries.length === 0 ? (
              /* Queue builder */
              <>
                <Text style={[styles.setHint, { color: colors.mutedForeground }]}>
                  {t('addBook.setImportHint')}
                </Text>
                {/* ISBN input row */}
                <View style={[styles.isbnCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <View style={styles.isbnRow}>
                    <TextInput
                      value={isbnInput}
                      onChangeText={setIsbnInput}
                      placeholder={t('addBook.isbnPlaceholder')}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={() => addToQueue(isbnInput)}
                      style={[
                        styles.isbnInput,
                        { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    />
                    <Pressable
                      onPress={() => addToQueue(isbnInput)}
                      disabled={isbnInput.replace(/[^0-9Xx]/g, '').length < 10}
                      style={[
                        styles.isbnBtn,
                        {
                          backgroundColor:
                            isbnInput.replace(/[^0-9Xx]/g, '').length >= 10
                              ? colors.primary
                              : colors.muted,
                        },
                      ]}
                    >
                      <Feather name="plus" size={16} color={colors.primaryForeground} />
                    </Pressable>
                    <Pressable onPress={handleScanPress} style={[styles.isbnBtn, { backgroundColor: colors.accent }]}>
                      <Feather name="camera" size={16} color="#fff" />
                    </Pressable>
                  </View>
                </View>

                {/* Queue list */}
                {isbnQueue.length === 0 ? (
                  <Text style={[styles.queueEmpty, { color: colors.mutedForeground }]}>
                    {t('addBook.setQueueEmpty')}
                  </Text>
                ) : (
                  <View style={[styles.queueList, { borderColor: colors.border }]}>
                    {isbnQueue.map((q) => (
                      <View key={q} style={[styles.queueItem, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.queueIsbn, { color: colors.foreground }]}>{q}</Text>
                        <Pressable onPress={() => removeFromQueue(q)} style={styles.queueRemove}>
                          <Feather name="x" size={14} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {/* Look up all button */}
                {isbnQueue.length > 0 && (
                  <Pressable
                    onPress={handleLookupSet}
                    disabled={setLooking}
                    style={[styles.importBtn, { backgroundColor: colors.primary }]}
                  >
                    {setLooking ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Feather name="search" size={16} color={colors.primaryForeground} style={{ marginRight: 8 }} />
                    )}
                    <Text style={[styles.importBtnText, { color: colors.primaryForeground }]}>
                      {t('addBook.setLookupAll', { count: isbnQueue.length })}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              /* Review list */
              <>
                {/* Mark-all row */}
                <View style={[styles.markAllRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginRight: 8 }]}>
                    {t('addBook.setMarkAll')}
                  </Text>
                  {STATUS_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => applyStatusToAll(opt.value)}
                      style={[styles.markAllBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                    >
                      <Text style={[styles.markAllBtnText, { color: colors.foreground }]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Book entries */}
                {bookEntries.map((b) => (
                  <SetBookRow
                    key={b.isbn}
                    book={b}
                    colors={colors}
                    statusOptions={STATUS_OPTIONS}
                    onStatusChange={(s) => setEntryStatus(b.isbn, s)}
                    onToggleSelect={() => toggleEntrySelect(b.isbn)}
                    notFoundLabel={t('addBook.setImportNotFound')}
                    errorLabel={t('addBook.setImportFailed')}
                  />
                ))}

                {/* Footer */}
                <View style={styles.setFooter}>
                  <Pressable
                    onPress={resetSet}
                    style={[styles.resetBtn, { borderColor: colors.border }]}
                  >
                    <Feather name="refresh-ccw" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>
                      {t('addBook.setImportReset')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleImportSet}
                    disabled={importing || !selectedEntries.length}
                    style={[
                      styles.importBtn,
                      { flex: 1, backgroundColor: selectedEntries.length ? colors.primary : colors.muted },
                    ]}
                  >
                    {importing ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : null}
                    <Text style={[styles.importBtnText, { color: colors.primaryForeground }]}>
                      {t('addBook.setImportAdd', { count: selectedEntries.length })}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        )}
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

// ── SetBookRow sub-component ────────────────────────────────────────────────
interface SetBookRowProps {
  book: BookEntry;
  colors: ReturnType<typeof useColors>;
  statusOptions: { value: BookStatus; label: string; icon: string }[];
  onStatusChange: (s: BookStatus) => void;
  onToggleSelect: () => void;
  notFoundLabel: string;
  errorLabel: string;
}

function SetBookRow({ book, colors, statusOptions, onStatusChange, onToggleSelect, notFoundLabel, errorLabel }: SetBookRowProps) {
  const isFound = book.status === 'found';
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <View
      style={[
        styles.entryRow,
        {
          borderColor: book.selected && isFound ? colors.border : colors.border + '50',
          backgroundColor: book.selected && isFound ? colors.background : colors.secondary + '80',
        },
      ]}
    >
      {/* Checkbox */}
      <Pressable
        onPress={onToggleSelect}
        disabled={!isFound}
        style={[
          styles.entryCheck,
          {
            borderColor: book.selected && isFound ? colors.primary : colors.border,
            backgroundColor: book.selected && isFound ? colors.primary : colors.background,
          },
        ]}
      >
        {book.selected && isFound && <Feather name="check" size={11} color={colors.primaryForeground} />}
      </Pressable>

      {/* Info */}
      <View style={styles.entryInfo}>
        {isFound ? (
          <>
            <Text style={[styles.entryTitle, { color: colors.foreground }]} numberOfLines={1}>
              {book.title}
            </Text>
            <Text style={[styles.entryAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
              {book.author}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.entryIsbn, { color: colors.mutedForeground }]}>{book.isbn}</Text>
            <Text style={[styles.entryBadge, { color: book.status === 'not_found' ? '#C8873F' : '#E55A4E' }]}>
              {book.status === 'not_found' ? notFoundLabel : errorLabel}
            </Text>
          </>
        )}
      </View>

      {/* Status mini-selector */}
      {isFound && (
        <View style={styles.entryStatusWrap}>
          {statusOptions.map((opt) => {
            const active = book.selectedStatus === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => { if (book.selected) onStatusChange(opt.value); }}
                disabled={!book.selected}
                style={[
                  styles.entryStatusDot,
                  {
                    backgroundColor: active ? colors.primary : colors.border,
                    opacity: book.selected ? 1 : 0.4,
                  },
                ]}
              >
                <Feather name={opt.icon as any} size={10} color={active ? colors.primaryForeground : colors.foreground} />
              </Pressable>
            );
          })}
        </View>
      )}
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

  // Mode bar
  modeBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginRight: 16,
  },
  modeTabText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // Shared form
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
  genreBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  genreText: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Set import
  setHint: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  queueEmpty: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 12 },
  queueList: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  queueIsbn: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  queueRemove: { padding: 4 },

  markAllRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  markAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  markAllBtnText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  entryCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryInfo: { flex: 1, minWidth: 0 },
  entryTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  entryAuthor: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  entryIsbn: { fontSize: 13, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  entryBadge: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  entryStatusWrap: { flexDirection: 'row', gap: 5, flexShrink: 0 },
  entryStatusDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  setFooter: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 20,
    gap: 6,
  },
  importBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  resetBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  successBox: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  successText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },

  // Scanner
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
  backLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
