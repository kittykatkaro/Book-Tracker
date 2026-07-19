import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';
import { Book, BookStatus } from '@/context/BooksContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

function StatusBadge({ status, colors }: { status: BookStatus; colors: ReturnType<typeof useColors> }) {
  const config =
    status === 'reading'
      ? { label: 'Reading', bg: colors.accent, fg: colors.accentForeground }
      : status === 'read'
        ? { label: 'Read', bg: colors.primary, fg: colors.primaryForeground }
        : { label: 'Want to Read', bg: colors.secondary, fg: '#5856D6' };
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.fg }]}>{config.label}</Text>
    </View>
  );
}

export function BookCard({ book }: { book: Book }) {
  const colors = useColors();

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/book/${book.id}`);
  };

  const progress =
    book.pages && book.currentPage ? book.currentPage / book.pages : null;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {/* Cover */}
      <View style={[styles.cover, { backgroundColor: book.coverUrl ? undefined : book.coverColor, borderRadius: colors.radius - 4 }]}>
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Text style={styles.coverLetter}>{book.title.charAt(0).toUpperCase()}</Text>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={[styles.author, { color: colors.mutedForeground }]} numberOfLines={1}>
          {book.author}
        </Text>

        <View style={styles.metaRow}>
          <StatusBadge status={book.status} colors={colors} />
          {book.genre ? (
            <Text style={[styles.genre, { color: colors.mutedForeground }]}>{book.genre}</Text>
          ) : null}
        </View>

        {book.status === 'reading' && progress !== null ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: colors.accent },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
              {book.currentPage} / {book.pages} pages
            </Text>
          </View>
        ) : null}

        {book.status === 'read' && book.rating ? (
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Feather
                key={i}
                name="star"
                size={11}
                color={i <= book.rating! ? colors.accent : colors.border}
                style={{ marginRight: 2 }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Feather name="chevron-right" size={16} color={colors.border} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  cover: {
    width: 52,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coverLetter: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  author: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  genre: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  progressContainer: {
    marginTop: 4,
    gap: 3,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  ratingRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
});
