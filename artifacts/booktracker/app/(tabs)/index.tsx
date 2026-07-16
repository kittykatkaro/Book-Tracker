import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBooks } from '@/context/BooksContext';
import { BookCard } from '@/components/BookCard';
import { EmptyState } from '@/components/EmptyState';
import { ImportModal } from '@/components/ImportModal';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import { setLanguage, getCurrentLanguage } from '@/i18n';

type Filter = 'all' | 'reading' | 'want_to_read' | 'read';

export default function LibraryScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { books, isLoading } = useBooks();
  const { user } = useUser();
  const [filter, setFilter] = useState<Filter>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  const bannerKey = user?.id ? `banner_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!bannerKey) return;
    AsyncStorage.getItem(bannerKey).then((value) => {
      setBannerDismissed(value === 'true');
    });
  }, [bannerKey]);

  const dismissBanner = async () => {
    if (bannerKey) await AsyncStorage.setItem(bannerKey, 'true');
    setBannerDismissed(true);
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('library.filterAll') },
    { key: 'reading', label: t('library.filterReading') },
    { key: 'want_to_read', label: t('library.filterWantToRead') },
    { key: 'read', label: t('library.filterRead') },
  ];

  const EMPTY_MESSAGES: Record<Filter, { title: string; subtitle: string; icon: string }> = {
    all: { title: t('library.emptyAll'), subtitle: t('library.emptyAllSub'), icon: 'book' },
    reading: { title: t('library.emptyReading'), subtitle: t('library.emptyReadingSub'), icon: 'book-open' },
    want_to_read: { title: t('library.emptyWantToRead'), subtitle: t('library.emptyWantToReadSub'), icon: 'bookmark' },
    read: { title: t('library.emptyRead'), subtitle: t('library.emptyReadSub'), icon: 'check-circle' },
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return books;
    return books.filter((b) => b.status === filter);
  }, [books, filter]);

  const counts = useMemo(
    () => ({
      all: books.length,
      reading: books.filter((b) => b.status === 'reading').length,
      want_to_read: books.filter((b) => b.status === 'want_to_read').length,
      read: books.filter((b) => b.status === 'read').length,
    }),
    [books],
  );

  const handleAdd = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-book');
  };

  const toggleLang = () => {
    const next = i18n.language.startsWith('de') ? 'en' : 'de';
    setLanguage(next as 'en' | 'de');
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('library.title')}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {t('library.bookCount', { count: books.length })}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={toggleLang}
            style={[styles.langBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Text style={[styles.langBtnText, { color: colors.mutedForeground }]}>
              {i18n.language.startsWith('de') ? 'EN' : 'DE'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setImportOpen(true)}
            style={[styles.importBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Feather name="upload" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={handleAdd}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={20} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      <ImportModal visible={importOpen} onClose={() => setImportOpen(false)} />

      {/* Onboarding banner */}
      {!isLoading && books.length === 0 && !bannerDismissed && (
        <View style={[styles.banner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
          <View style={[styles.bannerIcon, { backgroundColor: colors.primary + '25' }]}>
            <Feather name="star" size={18} color={colors.primary} />
          </View>
          <View style={styles.bannerBody}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>{t('library.welcome')}</Text>
            <Text style={[styles.bannerSub, { color: colors.mutedForeground }]}>{t('library.welcomeSub')}</Text>
          </View>
          <View style={styles.bannerActions}>
            <Pressable
              onPress={() => setImportOpen(true)}
              style={[styles.bannerImportBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="upload" size={13} color={colors.primaryForeground} />
              <Text style={[styles.bannerImportText, { color: colors.primaryForeground }]}>{t('library.import')}</Text>
            </Pressable>
            <Pressable onPress={dismissBanner} hitSlop={8}>
              <Text style={[styles.bannerDismiss, { color: colors.mutedForeground }]}>{t('library.dismiss')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={{ backgroundColor: colors.background }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterPill,
                { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.filterText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {f.label}
              </Text>
              {counts[f.key] > 0 ? (
                <View style={[styles.filterCount, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.border }]}>
                  <Text style={[styles.filterCountText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                    {counts[f.key]}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Book list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BookCard book={item} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={EMPTY_MESSAGES[filter].icon}
              title={EMPTY_MESSAGES[filter].title}
              subtitle={EMPTY_MESSAGES[filter].subtitle}
            />
          ) : null
        }
      />
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
  },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34 },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn: {
    height: 32, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  langBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  importBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  filters: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, gap: 5 },
  filterText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  filterCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, minWidth: 20, alignItems: 'center' },
  filterCountText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  listContent: { paddingTop: 4 },
  banner: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'column', gap: 10 },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1 },
  bannerTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  bannerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerImportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  bannerImportText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  bannerDismiss: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
