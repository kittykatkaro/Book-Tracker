import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks/useColors';
import { useBooks, type Book } from '@/context/BooksContext';

type Ratio = '16:9' | '9:16' | '1:1';

const RATIO_DIMENSIONS: Record<Ratio, { width: number; height: number }> = {
  '16:9': { width: 1200, height: 675 },
  '9:16': { width: 675, height: 1200 },
  '1:1': { width: 1000, height: 1000 },
};

const SCREEN_WIDTH = Dimensions.get('window').width;

function monthName(monthIndex: number, locale: string) {
  return new Date(2000, monthIndex, 1).toLocaleDateString(locale, { month: 'long' });
}

function computeYearStats(books: Book[], year: number, locale: string) {
  const finished = books.filter(
    (b) => b.status === 'read' && b.dateFinished && new Date(b.dateFinished).getFullYear() === year,
  );

  const totalPages = finished.reduce((sum, b) => sum + (b.pages ?? 0), 0);

  const genreCounts = new Map<string, number>();
  for (const b of finished) {
    if (!b.genre) continue;
    genreCounts.set(b.genre, (genreCounts.get(b.genre) ?? 0) + 1);
  }
  const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const rated = finished.filter((b) => b.rating != null);
  const topRatedBook = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null;

  const longestBook =
    [...finished].filter((b) => b.pages != null).sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0))[0] ?? null;

  const monthCounts = new Array(12).fill(0);
  for (const b of finished) {
    if (!b.dateFinished) continue;
    monthCounts[new Date(b.dateFinished).getMonth()]++;
  }
  const busiestMonthIndex = monthCounts.every((c) => c === 0) ? null : monthCounts.indexOf(Math.max(...monthCounts));
  const busiestMonth = busiestMonthIndex != null ? monthName(busiestMonthIndex, locale) : null;
  const busiestMonthCount = busiestMonthIndex != null ? monthCounts[busiestMonthIndex] : 0;

  return { booksRead: finished.length, totalPages, topGenre, topRatedBook, longestBook, busiestMonth, busiestMonthCount };
}

function BookCoverThumb({ book, size, colors }: { book: Book; size: number; colors: ReturnType<typeof useColors> }) {
  const [imgFailed, setImgFailed] = useState(false);
  const width = size;
  const height = size * 1.35;

  if (book.coverUrl && !imgFailed) {
    return (
      <Image
        source={{ uri: book.coverUrl }}
        style={{ width, height, borderRadius: 12 }}
        contentFit="cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <View style={{ width, height, borderRadius: 12, backgroundColor: book.coverColor, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter_700Bold', fontSize: size * 0.42 }}>
        {book.title.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function WrappedScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, isLoading } = useBooks();

  const [slide, setSlide] = useState(0);
  const [ratio, setRatio] = useState<Ratio>('9:16');
  const [exporting, setExporting] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const cardRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const b of books) {
      if (b.status === 'read' && b.dateFinished) years.add(new Date(b.dateFinished).getFullYear());
    }
    return [...years].sort((a, b) => b - a);
  }, [books]);

  const currentCalendarYear = new Date().getFullYear();
  const effectiveYear =
    year ?? (availableYears.includes(currentCalendarYear) ? currentCalendarYear : availableYears[0] ?? currentCalendarYear);

  const stats = useMemo(() => computeYearStats(books, effectiveYear, i18n.language), [books, effectiveYear, i18n.language]);

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dims = RATIO_DIMENSIONS[ratio];
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: dims.width,
        height: dims.height,
        result: 'tmpfile',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(t('wrapped.exportFailedTitle'), t('wrapped.sharingUnavailable'));
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('wrapped.shareDialogTitle'),
      });
    } catch (err) {
      console.error('[wrapped] export failed:', err);
      Alert.alert(t('wrapped.exportFailedTitle'), t('wrapped.exportFailedDesc'));
    } finally {
      setExporting(false);
    }
  };

  const topPad = insets.top + 8;

  if (isLoading) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (availableYears.length === 0 || stats.booksRead === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.navbar, { paddingTop: topPad }]}>
          <Pressable onPress={() => router.back()} style={styles.navBtn}>
            <Feather name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="star" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('wrapped.noDataTitle')}</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>{t('wrapped.noDataDesc')}</Text>
        </View>
      </View>
    );
  }

  const slides = [
    {
      key: 'intro',
      render: () => (
        <View style={styles.slideCenter}>
          <Feather name="star" size={32} color={colors.primary} />
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{t('wrapped.yourYear', { year: effectiveYear })}</Text>
          <Text style={[styles.slideBigTitle, { color: colors.foreground }]}>{t('wrapped.introTitle')}</Text>
        </View>
      ),
    },
    {
      key: 'booksRead',
      render: () => (
        <View style={styles.slideCenter}>
          <Feather name="book-open" size={26} color={colors.primary} />
          <Text style={[styles.bigNumber, { color: colors.primary }]}>{stats.booksRead}</Text>
          <Text style={[styles.slideLabel, { color: colors.mutedForeground }]}>{t('wrapped.booksReadLabel', { year: effectiveYear })}</Text>
        </View>
      ),
    },
    {
      key: 'pagesRead',
      render: () => (
        <View style={styles.slideCenter}>
          <Feather name="layers" size={26} color={colors.primary} />
          <Text style={[styles.bigNumber, { color: colors.primary }]}>{stats.totalPages.toLocaleString()}</Text>
          <Text style={[styles.slideLabel, { color: colors.mutedForeground }]}>{t('wrapped.pagesReadLabel')}</Text>
        </View>
      ),
    },
    ...(stats.topGenre
      ? [
          {
            key: 'topGenre',
            render: () => (
              <View style={styles.slideCenter}>
                <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{t('wrapped.topGenreLabel')}</Text>
                <Text style={[styles.slideBigTitle, { color: colors.primary }]}>{stats.topGenre![0]}</Text>
                <Text style={[styles.slideLabel, { color: colors.mutedForeground }]}>
                  {t('wrapped.topGenreCount', { count: stats.topGenre![1] })}
                </Text>
              </View>
            ),
          },
        ]
      : []),
    ...(stats.topRatedBook
      ? [
          {
            key: 'topRated',
            render: () => (
              <View style={styles.slideCenter}>
                <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{t('wrapped.topRatedLabel')}</Text>
                <BookCoverThumb book={stats.topRatedBook!} size={80} colors={colors} />
                <Text style={[styles.bookTitle, { color: colors.foreground }]}>{stats.topRatedBook!.title}</Text>
                <Text style={[styles.slideLabel, { color: colors.mutedForeground }]}>{stats.topRatedBook!.author}</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
                  {Array.from({ length: stats.topRatedBook!.rating ?? 0 }).map((_, i) => (
                    <Feather key={i} name="star" size={16} color="#F5A623" />
                  ))}
                </View>
              </View>
            ),
          },
        ]
      : []),
    ...(stats.longestBook
      ? [
          {
            key: 'longest',
            render: () => (
              <View style={styles.slideCenter}>
                <Feather name="award" size={24} color={colors.primary} />
                <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{t('wrapped.longestLabel')}</Text>
                <BookCoverThumb book={stats.longestBook!} size={80} colors={colors} />
                <Text style={[styles.bookTitle, { color: colors.foreground }]}>{stats.longestBook!.title}</Text>
                <Text style={[styles.slideLabel, { color: colors.mutedForeground }]}>
                  {t('wrapped.pagesCount', { count: stats.longestBook!.pages ?? 0 })}
                </Text>
              </View>
            ),
          },
        ]
      : []),
    ...(stats.busiestMonth
      ? [
          {
            key: 'busiestMonth',
            render: () => (
              <View style={styles.slideCenter}>
                <Feather name="calendar" size={24} color={colors.primary} />
                <Text style={[styles.slideBigTitle, { color: colors.primary }]}>{stats.busiestMonth}</Text>
                <Text style={[styles.slideLabel, { color: colors.mutedForeground }]}>
                  {t('wrapped.busiestMonthDesc', { count: stats.busiestMonthCount })}
                </Text>
              </View>
            ),
          },
        ]
      : []),
    {
      key: 'recap',
      render: () => (
        <View style={styles.slideCenter}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground, marginBottom: 4 }]}>{t('wrapped.recapReady')}</Text>
          <Text style={[styles.slideDesc, { color: colors.mutedForeground }]}>{t('wrapped.recapDescMobile')}</Text>
        </View>
      ),
    },
  ];

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setSlide(index);
  };

  const dims = RATIO_DIMENSIONS[ratio];
  const previewMaxWidth = 260;
  const previewScale = previewMaxWidth / Math.max(dims.width, dims.height);
  const previewWidth = dims.width * previewScale;
  const previewHeight = dims.height * previewScale;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navbar, { paddingTop: topPad }]}>
        <Pressable onPress={() => router.back()} style={styles.navBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>{t('wrapped.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {availableYears.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {availableYears.map((y) => {
              const active = y === effectiveYear;
              return (
                <Pressable
                  key={y}
                  onPress={() => {
                    setYear(y);
                    setSlide(0);
                    scrollRef.current?.scrollTo({ x: 0, animated: false });
                  }}
                  style={[
                    styles.yearPill,
                    { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border },
                  ]}
                >
                  <Text style={{ color: active ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    {y}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Slide carousel */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
        >
          {slides.map((s) => (
            <View key={s.key} style={{ width: SCREEN_WIDTH }}>
              <LinearGradient
                colors={[colors.primary + '14', colors.background, colors.accent + '10']}
                style={[styles.slideCard, { borderColor: colors.border }]}
              >
                {s.render()}
              </LinearGradient>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.dot,
                { backgroundColor: i === slide ? colors.primary : colors.border, width: i === slide ? 18 : 6 },
              ]}
            />
          ))}
        </View>

        {/* Export section */}
        <View style={[styles.exportSection, { borderTopColor: colors.border }]}>
          <View style={styles.exportHeader}>
            <Text style={[styles.exportTitle, { color: colors.foreground }]}>{t('wrapped.exportTitle')}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(Object.keys(RATIO_DIMENSIONS) as Ratio[]).map((r) => {
                const active = r === ratio;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setRatio(r)}
                    style={[
                      styles.ratioPill,
                      { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '14' : 'transparent' },
                    ]}
                  >
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: active ? colors.primary : colors.mutedForeground }}>
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <View style={{ width: previewWidth, height: previewHeight, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
              <View
                collapsable={false}
                ref={cardRef}
                style={{
                  width: previewWidth,
                  height: previewHeight,
                }}
              >
                <LinearGradient
                  colors={[colors.primary + '20', colors.background, colors.accent + '18']}
                  style={styles.exportCard}
                >
                  <Text style={[styles.exportEyebrow, { color: colors.mutedForeground }]}>
                    {t('wrapped.cardEyebrow', { year: effectiveYear })}
                  </Text>
                  <Text style={[styles.exportCardTitle, { color: colors.foreground }]}>{t('wrapped.cardTitle')}</Text>

                  <View style={{ flexDirection: 'row', gap: 24, marginTop: 12 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.exportBigNum, { color: colors.primary }]}>{stats.booksRead}</Text>
                      <Text style={[styles.exportSmallLabel, { color: colors.mutedForeground }]}>{t('wrapped.booksReadShort')}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.exportBigNum, { color: colors.primary }]}>{stats.totalPages.toLocaleString()}</Text>
                      <Text style={[styles.exportSmallLabel, { color: colors.mutedForeground }]}>{t('wrapped.pagesReadShort')}</Text>
                    </View>
                  </View>

                  {stats.topGenre && (
                    <Text style={[styles.exportGenre, { color: colors.foreground }]}>
                      {t('wrapped.cardTopGenre', { genre: stats.topGenre[0] })}
                    </Text>
                  )}

                  {stats.topRatedBook && (
                    <View style={[styles.exportBookRow, { backgroundColor: colors.card + 'CC', borderColor: colors.border }]}>
                      <BookCoverThumb book={stats.topRatedBook} size={36} colors={colors} />
                      <View style={{ marginLeft: 8, flexShrink: 1 }}>
                        <Text style={[styles.exportBookLabel, { color: colors.mutedForeground }]}>{t('wrapped.topRatedLabel')}</Text>
                        <Text style={[styles.exportBookTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {stats.topRatedBook.title}
                        </Text>
                      </View>
                    </View>
                  )}

                  <Text style={[styles.exportBrand, { color: colors.mutedForeground }]}>{t('wrapped.cardBrand')}</Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleExport}
            disabled={exporting}
            style={[styles.exportButton, { backgroundColor: colors.primary, opacity: exporting ? 0.6 : 1 }]}
          >
            <Feather name="share" size={16} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
              {exporting ? t('wrapped.exporting') : t('wrapped.exportButton', { ratio })}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  navBtn: { padding: 8, width: 40 },
  navTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptyDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  yearPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  slideCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideCenter: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' },
  slideBigTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  slideLabel: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  slideDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 240 },
  bigNumber: { fontSize: 56, fontFamily: 'Inter_700Bold' },
  bookTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 14 },
  dot: { height: 6, borderRadius: 3 },
  exportSection: { borderTopWidth: 1, marginTop: 28, paddingTop: 20, paddingHorizontal: 20 },
  exportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exportTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  ratioPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  exportCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  exportEyebrow: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, textTransform: 'uppercase' },
  exportCardTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 4 },
  exportBigNum: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  exportSmallLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
  exportGenre: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 10, textAlign: 'center' },
  exportBookRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, borderRadius: 14, borderWidth: 1, padding: 8, maxWidth: '90%' },
  exportBookLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  exportBookTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 1 },
  exportBrand: { position: 'absolute', bottom: 10, fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textTransform: 'uppercase' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 14, marginBottom: 8 },
});
