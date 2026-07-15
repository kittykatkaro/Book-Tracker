import React, { useMemo, useState } from 'react';
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
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Filter = 'all' | 'reading' | 'want_to_read' | 'read';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'want_to_read', label: 'Want to Read' },
  { key: 'read', label: 'Read' },
];

const EMPTY_MESSAGES: Record<Filter, { title: string; subtitle: string; icon: string }> = {
  all: { title: 'Your library is empty', subtitle: 'Tap + to add your first book', icon: 'book' },
  reading: { title: 'Not reading anything', subtitle: 'Start a book and track your progress', icon: 'book-open' },
  want_to_read: { title: 'Reading list is empty', subtitle: 'Save books you want to read later', icon: 'bookmark' },
  read: { title: 'No finished books yet', subtitle: 'Books you complete will appear here', icon: 'check-circle' },
};

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { books, isLoading } = useBooks();
  const [filter, setFilter] = useState<Filter>('all');

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

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 16, backgroundColor: colors.background },
        ]}
      >
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Library</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {books.length} {books.length === 1 ? 'book' : 'books'}
          </Text>
        </View>
        <Pressable
          onPress={handleAdd}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>

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
                {
                  backgroundColor: active ? colors.primary : colors.secondary,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {f.label}
              </Text>
              {counts[f.key] > 0 ? (
                <View
                  style={[
                    styles.filterCount,
                    {
                      backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      { color: active ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
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
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 },
        ]}
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
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    lineHeight: 34,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  filterText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  filterCount: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  listContent: {
    paddingTop: 4,
  },
});
