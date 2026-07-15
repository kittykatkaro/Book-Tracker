import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { books } = useBooks();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.genre?.toLowerCase().includes(q) ?? false),
    );
  }, [books, query]);

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
        <Text style={[styles.title, { color: colors.foreground }]}>Search</Text>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/add-book');
          }}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>

      {/* Search input */}
      <View style={[styles.searchWrap, { marginHorizontal: 16, marginBottom: 12 }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by title, author, or genre..."
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.searchInput,
            {
              color: colors.foreground,
              backgroundColor: colors.secondary,
              borderColor: colors.border,
            },
          ]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BookCard book={item} />}
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query.trim() ? (
            <EmptyState
              icon="search"
              title="No results found"
              subtitle={`No books matching "${query}"`}
            />
          ) : (
            <EmptyState
              icon="book"
              title="No books yet"
              subtitle="Add books to start searching your library"
            />
          )
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
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    paddingLeft: 38,
    paddingRight: 38,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
});
