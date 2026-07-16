import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBooks } from '@/context/BooksContext';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

function StatCard({ icon, label, value, color, colors }: {
  icon: string; label: string; value: number; color: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '20' }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function BarRow({ label, count, maxCount, color, colors }: {
  label: string; count: number; maxCount: number; color: string; colors: ReturnType<typeof useColors>;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <View style={styles.genreRow}>
      <Text style={[styles.genreName, { color: colors.foreground }]} numberOfLines={1}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: colors.secondary, flex: 1 }]}>
        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.genreCount, { color: colors.mutedForeground }]}>{count}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { books } = useBooks();

  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const readThisYear = books.filter((b) => {
      if (b.status !== 'read' || !b.dateFinished) return false;
      return new Date(b.dateFinished).getFullYear() === thisYear;
    });
    const totalPages = books.filter((b) => b.status === 'read').reduce((sum, b) => sum + (b.pages ?? 0), 0);
    const genreCounts: Record<string, number> = {};
    books.forEach((b) => { if (b.genre) genreCounts[b.genre] = (genreCounts[b.genre] ?? 0) + 1; });
    const genres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxGenre = genres[0]?.[1] ?? 1;
    const rated = books.filter((b) => b.rating != null);
    const avgRating = rated.length > 0
      ? (rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;
    return {
      total: books.length,
      reading: books.filter((b) => b.status === 'reading').length,
      read: books.filter((b) => b.status === 'read').length,
      wantToRead: books.filter((b) => b.status === 'want_to_read').length,
      readThisYear: readThisYear.length,
      totalPages,
      genres,
      maxGenre,
      avgRating,
      thisYear,
    };
  }, [books]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: topPad + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>{t('stats.title')}</Text>
        <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
          {t('stats.readingYear', { year: stats.thisYear })}
        </Text>
      </View>

      <View style={styles.grid}>
        <StatCard icon="book-open" label={t('stats.reading')} value={stats.reading} color={colors.accent} colors={colors} />
        <StatCard icon="check-circle" label={t('stats.read')} value={stats.read} color={colors.primary} colors={colors} />
        <StatCard icon="bookmark" label={t('stats.wantToRead')} value={stats.wantToRead} color="#5856D6" colors={colors} />
        <StatCard icon="layers" label={t('stats.totalBooks')} value={stats.total} color={colors.mutedForeground} colors={colors} />
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Feather name="calendar" size={15} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('stats.thisYear')}</Text>
        </View>
        <Text style={[styles.bigNumber, { color: colors.primary }]}>{stats.readThisYear}</Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          {t('stats.book', { count: stats.readThisYear })} {t('stats.finishedIn', { year: stats.thisYear })}
        </Text>
        {stats.totalPages > 0 && (
          <Text style={[styles.extraNote, { color: colors.mutedForeground }]}>
            {t('stats.totalPages', { count: stats.totalPages.toLocaleString() })}
          </Text>
        )}
      </View>

      {stats.avgRating && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Feather name="star" size={15} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('stats.avgRating')}</Text>
          </View>
          <Text style={[styles.bigNumber, { color: colors.accent }]}>{stats.avgRating}</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>{t('stats.outOfFive')}</Text>
        </View>
      )}

      {stats.genres.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Feather name="tag" size={15} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('stats.topGenres')}</Text>
          </View>
          <View style={{ gap: 10 }}>
            {stats.genres.map(([genre, count]) => (
              <BarRow key={genre} label={genre} count={count} maxCount={stats.maxGenre} color={colors.primary} colors={colors} />
            ))}
          </View>
        </View>
      )}

      {stats.total === 0 && (
        <View style={styles.emptyStats}>
          <Feather name="bar-chart-2" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('stats.addBooksForStats')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  pageSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 12, gap: 10 },
  statCard: { flex: 1, minWidth: 140, padding: 16, borderRadius: 14, borderWidth: 1, gap: 5 },
  statIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 26, fontFamily: 'Inter_700Bold', lineHeight: 30 },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  section: { marginHorizontal: 16, marginBottom: 12, padding: 18, borderRadius: 14, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  bigNumber: { fontSize: 40, fontFamily: 'Inter_700Bold', lineHeight: 44 },
  sectionSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  extraNote: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 8 },
  genreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  genreName: { width: 88, fontSize: 13, fontFamily: 'Inter_500Medium' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  genreCount: { width: 22, textAlign: 'right', fontSize: 13, fontFamily: 'Inter_400Regular' },
  emptyStats: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
});
