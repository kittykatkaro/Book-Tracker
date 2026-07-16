/**
 * Mobile bulk-import modal.
 * 1. User taps "Import" → picks a file via expo-document-picker
 * 2. File is uploaded to /api/books/import/parse → list of detected books
 * 3. User reviews + selects/deselects
 * 4. Confirm → POST /api/books/import/confirm → toast result
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { getListBooksQueryKey } from '@workspace/api-client-react';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedBook {
  title: string;
  author: string;
  status: 'reading' | 'read' | 'want_to_read';
  rating?: number;
  pages?: number;
  genre?: string;
  dateRead?: string;
  source: 'goodreads' | 'csv' | 'pdf' | 'docx';
}

interface SelectableBook extends ParsedBook {
  selected: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE = apiDomain ? `https://${apiDomain}/api` : '/api';

function statusLabel(s: ParsedBook['status']) {
  if (s === 'read') return 'Read';
  if (s === 'reading') return 'Reading';
  return 'Want to Read';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ImportModalProps {
  visible: boolean;
  onClose: () => void;
}

type Step = 'idle' | 'picking' | 'preview' | 'importing';

export function ImportModal({ visible, onClose }: ImportModalProps) {
  const colors = useColors();
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('idle');
  const [books, setBooks] = useState<SelectableBook[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('idle');
    setBooks([]);
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ---- Pick + parse ----
  const pickAndParse = useCallback(async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/csv',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'text/plain',
          '*/*', // fallback for pickers that don't filter by MIME
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      if (asset.size && asset.size > 5 * 1024 * 1024) {
        setError('File is too large. Maximum size is 5 MB.');
        return;
      }

      setStep('picking');

      const token = await getToken();
      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        name: asset.name || 'import',
        type: asset.mimeType || 'application/octet-stream',
      } as any);

      const res = await fetch(`${API_BASE}/books/import/parse`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Parse failed');

      if (!data.books || data.books.length === 0) {
        setError('No books detected. Try a CSV with Title/Author columns, or a Goodreads export.');
        setStep('idle');
        return;
      }

      setBooks(data.books.map((b: ParsedBook) => ({ ...b, selected: true })));
      setStep('preview');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to process file');
      setStep('idle');
    }
  }, [getToken]);

  // ---- Selection ----
  const toggleAll = (val: boolean) =>
    setBooks((bs) => bs.map((b) => ({ ...b, selected: val })));
  const toggleOne = (i: number) =>
    setBooks((bs) => bs.map((b, j) => (j === i ? { ...b, selected: !b.selected } : b)));

  const selectedCount = books.filter((b) => b.selected).length;

  // ---- Confirm ----
  const confirm = async () => {
    const selected = books.filter((b) => b.selected);
    if (!selected.length) return;
    setStep('importing');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/books/import/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ books: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');

      await qc.invalidateQueries({ queryKey: getListBooksQueryKey() });

      const msg = data.skipped
        ? `${data.imported} added, ${data.skipped} skipped (already in library)`
        : `${data.imported} book${data.imported !== 1 ? 's' : ''} added to your library`;

      Alert.alert('Import complete', msg, [{ text: 'OK', onPress: handleClose }]);
    } catch (err: any) {
      Alert.alert('Import failed', err?.message ?? 'Something went wrong');
      setStep('preview');
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderBook = ({ item, index }: { item: SelectableBook; index: number }) => (
    <TouchableOpacity
      onPress={() => toggleOne(index)}
      style={[
        styles.bookRow,
        {
          borderBottomColor: colors.border,
          backgroundColor: item.selected ? colors.primary + '10' : colors.background,
          opacity: item.selected ? 1 : 0.45,
        },
      ]}
      activeOpacity={0.7}
    >
      <View style={[
        styles.checkbox,
        {
          backgroundColor: item.selected ? colors.primary : 'transparent',
          borderColor: item.selected ? colors.primary : colors.border,
        },
      ]}>
        {item.selected && <Feather name="check" size={10} color={colors.primaryForeground} />}
      </View>
      <View style={styles.bookInfo}>
        <Text style={[styles.bookTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.bookAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.author} · {statusLabel(item.status)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {step === 'preview'
              ? `${books.length} book${books.length !== 1 ? 's' : ''} detected`
              : step === 'importing'
              ? 'Importing…'
              : 'Import your library'}
          </Text>
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* ---- Idle / pick step ---- */}
        {(step === 'idle' || step === 'picking') && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.idleContent}>
            {/* Upload button */}
            <TouchableOpacity
              onPress={pickAndParse}
              disabled={step === 'picking'}
              style={[styles.pickBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              {step === 'picking' ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Feather name="upload" size={20} color={colors.primaryForeground} />
              )}
              <Text style={[styles.pickBtnText, { color: colors.primaryForeground }]}>
                {step === 'picking' ? 'Parsing file…' : 'Choose a file'}
              </Text>
            </TouchableOpacity>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '40' }]}>
                <Feather name="alert-triangle" size={14} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            )}

            {/* Format guide */}
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Supported formats</Text>
              {[
                { label: 'Goodreads CSV', desc: 'Full data — rating, pages, shelf, read date', highlight: true },
                { label: 'Any CSV', desc: 'Columns named Title + Author (+ optional Status, Pages)' },
                { label: 'PDF / DOCX', desc: 'Reading lists as "Title – Author" or "Title by Author"' },
              ].map((f) => (
                <View key={f.label} style={styles.formatRow}>
                  <View style={styles.formatDot}>
                    <View style={[styles.dot, { backgroundColor: f.highlight ? colors.primary : colors.mutedForeground }]} />
                  </View>
                  <View style={styles.formatText}>
                    <Text style={[styles.formatLabel, { color: colors.foreground }]}>
                      {f.label}
                      {f.highlight ? '  ★ Best for Kindle' : ''}
                    </Text>
                    <Text style={[styles.formatDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Kindle instructions */}
            <View style={[styles.section, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Text style={[styles.sectionTitle, { color: '#92400E' }]}>📚 Importing from Kindle</Text>
              <Text style={[styles.kindleText, { color: '#78350F' }]}>
                Amazon has no public Kindle API. The easiest path is via Goodreads, which syncs your Kindle history:
              </Text>
              <Text style={[styles.kindleSteps, { color: '#78350F' }]}>
                1. Sign in to goodreads.com{'\n'}
                2. My Books → Tools → Import and Export{'\n'}
                3. Tap Export Library — saves a CSV{'\n'}
                4. Upload that file here
              </Text>
            </View>
          </ScrollView>
        )}

        {/* ---- Preview step ---- */}
        {step === 'preview' && (
          <>
            {/* Select toolbar */}
            <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <View style={styles.toolbarLeft}>
                <TouchableOpacity onPress={() => toggleAll(true)} style={styles.toolbarBtn}>
                  <Text style={[styles.toolbarLink, { color: colors.primary }]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleAll(false)} style={styles.toolbarBtn}>
                  <Text style={[styles.toolbarLink, { color: colors.mutedForeground }]}>None</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.selectedCount, { color: colors.mutedForeground }]}>
                {selectedCount} of {books.length} selected
              </Text>
            </View>

            <FlatList
              data={books}
              keyExtractor={(_, i) => String(i)}
              renderItem={renderBook}
              style={{ flex: 1 }}
            />

            {/* Confirm bar */}
            <View style={[styles.confirmBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <TouchableOpacity onPress={() => setStep('idle')} style={styles.backBtn}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirm}
                disabled={selectedCount === 0}
                style={[styles.confirmBtn, { backgroundColor: selectedCount === 0 ? colors.muted : colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.confirmText, { color: colors.primaryForeground }]}>
                  Import {selectedCount} book{selectedCount !== 1 ? 's' : ''}
                </Text>
                <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ---- Importing step ---- */}
        {step === 'importing' && (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Adding {selectedCount} book{selectedCount !== 1 ? 's' : ''} to your library…
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  idleContent: { padding: 20, gap: 16 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
  },
  pickBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  section: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  formatRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  formatDot: { paddingTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  formatText: { flex: 1 },
  formatLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  formatDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  kindleText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  kindleSteps: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 22 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  toolbarLeft: { flexDirection: 'row', gap: 16 },
  toolbarBtn: { padding: 4 },
  toolbarLink: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  selectedCount: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  bookAuthor: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  backText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  confirmText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
