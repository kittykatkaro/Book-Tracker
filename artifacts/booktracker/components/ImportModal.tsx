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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('idle');
  const [books, setBooks] = useState<SelectableBook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ imported: number; total: number } | null>(null);

  const reset = () => {
    setStep('idle');
    setBooks([]);
    setError(null);
    setImportProgress(null);
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
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      if (asset.size && asset.size > 5 * 1024 * 1024) {
        setError(t('import.errorTooBig'));
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
      if (!res.ok) throw new Error(data.error ?? t('import.errorParse'));

      if (!data.books || data.books.length === 0) {
        setError(t('import.errorNoBooks'));
        setStep('idle');
        return;
      }

      setBooks(data.books.map((b: ParsedBook) => ({ ...b, selected: true })));
      setStep('preview');
    } catch (err: any) {
      setError(err?.message ?? t('import.errorProcess'));
      setStep('idle');
    }
  }, [getToken, t]);

  // ---- Selection ----
  const toggleAll = (val: boolean) =>
    setBooks((bs) => bs.map((b) => ({ ...b, selected: val })));
  const toggleOne = (i: number) =>
    setBooks((bs) => bs.map((b, j) => (j === i ? { ...b, selected: !b.selected } : b)));

  const selectedCount = books.filter((b) => b.selected).length;

  // ---- Poll a background import job until it finishes ----
  const pollImportStatus = (
    jobId: string,
    token: string | null,
  ): Promise<{ imported: number; skipped: number; enriching: number }> => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const res = await fetch(`${API_BASE}/books/import/status/${jobId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? t('import.errorImport'));

          if (data.status === 'processing') {
            setImportProgress({ imported: data.imported, total: data.total });
            setTimeout(poll, 1000);
            return;
          }
          if (data.status === 'failed') {
            reject(new Error(data.error ?? t('import.errorImport')));
            return;
          }
          resolve({ imported: data.imported, skipped: data.skipped, enriching: data.enriching ?? 0 });
        } catch (err) {
          reject(err);
        }
      };
      poll();
    });
  };

  // ---- Confirm ----
  const confirm = async () => {
    const selected = books.filter((b) => b.selected);
    if (!selected.length) return;
    setStep('importing');
    setImportProgress({ imported: 0, total: selected.length });
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
      if (!res.ok) throw new Error(data.error ?? t('import.errorImport'));

      // The server runs the import as a background job (this can take a
      // while for large files) and we poll until it's done rather than
      // holding the request open, avoiding a timeout on 500+ record imports.
      const result = await pollImportStatus(data.jobId, token);

      await qc.invalidateQueries({ queryKey: getListBooksQueryKey() });

      const msg = result.skipped
        ? t('import.resultSkipped', { imported: result.imported, skipped: result.skipped })
        : t('import.resultAdded', { count: result.imported });

      Alert.alert(t('import.complete'), msg, [{ text: 'OK', onPress: handleClose }]);
    } catch (err: any) {
      Alert.alert(t('import.failed'), err?.message ?? t('import.errorSomething'));
      setStep('preview');
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const statusLabel = (s: ParsedBook['status']) => {
    if (s === 'read') return t('import.statusRead');
    if (s === 'reading') return t('import.statusReading');
    return t('import.statusWantToRead');
  };

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
              ? t('import.detectedBooks', { count: books.length })
              : step === 'importing'
              ? t('import.importing')
              : t('import.title')}
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
                {step === 'picking' ? t('import.parsing') : t('import.chooseFile')}
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
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('import.supportedFormats')}</Text>
              {[
                { label: t('import.formatGoodreads'), desc: t('import.formatGoodreadsDesc'), highlight: true },
                { label: t('import.formatCsv'), desc: t('import.formatCsvDesc') },
                { label: t('import.formatDoc'), desc: t('import.formatDocDesc') },
              ].map((f) => (
                <View key={f.label} style={styles.formatRow}>
                  <View style={styles.formatDot}>
                    <View style={[styles.dot, { backgroundColor: f.highlight ? colors.primary : colors.mutedForeground }]} />
                  </View>
                  <View style={styles.formatText}>
                    <Text style={[styles.formatLabel, { color: colors.foreground }]}>
                      {f.label}
                      {f.highlight ? `  ${t('import.bestForKindle')}` : ''}
                    </Text>
                    <Text style={[styles.formatDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Kindle instructions */}
            <View style={[styles.section, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Text style={[styles.sectionTitle, { color: '#92400E' }]}>📚 {t('import.kindleTitle')}</Text>
              <Text style={[styles.kindleText, { color: '#78350F' }]}>
                {t('import.kindleDesc')}
              </Text>
              <Text style={[styles.kindleSteps, { color: '#78350F' }]}>
                {t('import.kindleStep1')}{'\n'}
                {t('import.kindleStep2')}{'\n'}
                {t('import.kindleStep3')}{'\n'}
                {t('import.kindleStep4')}
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
                  <Text style={[styles.toolbarLink, { color: colors.primary }]}>{t('import.all')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleAll(false)} style={styles.toolbarBtn}>
                  <Text style={[styles.toolbarLink, { color: colors.mutedForeground }]}>{t('import.none')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.selectedCount, { color: colors.mutedForeground }]}>
                {t('import.selectedOf', { selected: selectedCount, total: books.length })}
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
                <Text style={[styles.backText, { color: colors.mutedForeground }]}>{t('import.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirm}
                disabled={selectedCount === 0}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: selectedCount > 0 ? colors.primary : colors.secondary,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.confirmBtnText, { color: selectedCount > 0 ? colors.primaryForeground : colors.mutedForeground }]}>
                  {t('import.importCount', { count: selectedCount })}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ---- Importing step ---- */}
        {step === 'importing' && (
          <View style={styles.importingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.importingText, { color: colors.mutedForeground }]}>
              {importProgress && importProgress.imported > 0
                ? t('import.addingProgress', { imported: importProgress.imported, total: importProgress.total })
                : t('import.addingCount', { count: selectedCount })}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

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
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold', flex: 1 },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  idleContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
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
  errorText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  section: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  formatRow: { flexDirection: 'row', gap: 12 },
  formatDot: { paddingTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  formatText: { flex: 1, gap: 2 },
  formatLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  formatDesc: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  kindleText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  kindleSteps: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  toolbarLeft: { flexDirection: 'row', gap: 16 },
  toolbarBtn: { paddingVertical: 4 },
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
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bookInfo: { flex: 1, gap: 3 },
  bookTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  bookAuthor: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  backText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  confirmBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  confirmBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  importingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  importingText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
