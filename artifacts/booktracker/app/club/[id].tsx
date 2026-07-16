import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/expo';
import { customFetch } from '@workspace/api-client-react';
import { useLocalSearchParams, router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClubMember {
  id: string;
  userId: string;
  displayName: string | null;
  role: string;
}

interface ClubBook {
  id: string;
  title: string;
  author: string;
  coverColor: string;
  pages: number | null;
  postCount: number;
}

interface ClubPost {
  id: string;
  userId: string;
  userDisplayName: string | null;
  content: string;
  progressPage: number | null;
  createdAt: string;
}

interface ClubDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  hasPassword: boolean;
  members: ClubMember[];
  books: ClubBook[];
  myRole: 'owner' | 'member';
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useClub(id: string) {
  return useQuery<ClubDetail>({
    queryKey: ['club', id],
    queryFn: () => customFetch(`/api/clubs/${id}`),
    enabled: !!id,
  });
}

function usePosts(clubId: string, bookId: string) {
  return useQuery<ClubPost[]>({
    queryKey: ['club-posts', clubId, bookId],
    queryFn: () => customFetch(`/api/clubs/${clubId}/books/${bookId}/posts`),
    enabled: !!bookId,
  });
}

// ---------------------------------------------------------------------------
// Post Screen (modal)
// ---------------------------------------------------------------------------

function PostsModal({
  club,
  book,
  visible,
  onClose,
  colors,
  currentUserId,
}: {
  club: ClubDetail;
  book: ClubBook;
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  currentUserId: string;
}) {
  const { user } = useUser();
  const qc = useQueryClient();
  const { data: posts, isLoading } = usePosts(club.id, book.id);
  const [newPost, setNewPost] = useState('');
  const [progressPage, setProgressPage] = useState('');

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split('@')[0] ||
    'Reader';

  const postMutation = useMutation({
    mutationFn: (data: { content: string; progressPage?: number; displayName: string }) =>
      customFetch(`/api/clubs/${club.id}/books/${book.id}/posts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club-posts', club.id, book.id] });
      qc.invalidateQueries({ queryKey: ['club', club.id] });
      setNewPost('');
      setProgressPage('');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) =>
      customFetch(`/api/clubs/${club.id}/books/${book.id}/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club-posts', club.id, book.id] });
      qc.invalidateQueries({ queryKey: ['club', club.id] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const handleDeletePost = (post: ClubPost) => {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(post.id) },
    ]);
  };

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View
          style={[
            modalStyles.header,
            { backgroundColor: colors.background, borderColor: colors.border, paddingTop: insets.top + 12 },
          ]}
        >
          <Pressable onPress={onClose} style={modalStyles.backBtn}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={[modalStyles.bookTitle, { color: colors.foreground }]} numberOfLines={1}>
              {book.title}
            </Text>
            <Text style={[modalStyles.bookAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
              {book.author}
            </Text>
          </View>
          <View style={[modalStyles.bookCover, { backgroundColor: book.coverColor }]}>
            <Text style={modalStyles.bookCoverText}>{book.title.charAt(0)}</Text>
          </View>
        </View>

        {/* Posts list */}
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={posts ?? []}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Feather name="message-circle" size={32} color={colors.mutedForeground} />
                <Text style={[modalStyles.emptyText, { color: colors.mutedForeground }]}>
                  No posts yet. Share your thoughts!
                </Text>
              </View>
            }
            renderItem={({ item: post }) => {
              const canDelete = post.userId === currentUserId || club.myRole === 'owner';
              return (
                <View style={[modalStyles.postItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={modalStyles.postHeader}>
                    <View style={[modalStyles.avatar, { backgroundColor: colors.primary + '22' }]}>
                      <Text style={[modalStyles.avatarText, { color: colors.primary }]}>
                        {(post.userDisplayName ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[modalStyles.posterName, { color: colors.foreground }]}>
                        {post.userDisplayName ?? 'Member'}
                      </Text>
                      <Text style={[modalStyles.postTime, { color: colors.mutedForeground }]}>
                        {relativeTime(post.createdAt)}
                        {post.progressPage !== null ? ` · p.${post.progressPage}` : ''}
                      </Text>
                    </View>
                    {canDelete && (
                      <Pressable onPress={() => handleDeletePost(post)}>
                        <Feather name="trash-2" size={14} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={[modalStyles.postContent, { color: colors.foreground }]}>
                    {post.content}
                  </Text>
                </View>
              );
            }}
          />
        )}

        {/* Compose */}
        <View
          style={[
            modalStyles.compose,
            { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}
        >
          {book.pages && (
            <TextInput
              style={[modalStyles.pageInput, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              placeholder={`p.`}
              placeholderTextColor={colors.mutedForeground}
              value={progressPage}
              onChangeText={setProgressPage}
              keyboardType="number-pad"
              maxLength={4}
            />
          )}
          <TextInput
            style={[modalStyles.composeInput, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
            placeholder="Share your thoughts…"
            placeholderTextColor={colors.mutedForeground}
            value={newPost}
            onChangeText={setNewPost}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={() => {
              if (!newPost.trim()) return;
              postMutation.mutate({
                content: newPost,
                progressPage: progressPage ? parseInt(progressPage) : undefined,
                displayName,
              });
            }}
            disabled={!newPost.trim() || postMutation.isPending}
            style={[
              modalStyles.sendBtn,
              { backgroundColor: colors.primary, opacity: !newPost.trim() || postMutation.isPending ? 0.5 : 1 },
            ]}
          >
            {postMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Feather name="send" size={18} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

type Tab = 'books' | 'members';

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const qc = useQueryClient();
  const { data: club, isLoading } = useClub(id ?? '');
  const [tab, setTab] = useState<Tab>('books');
  const [selectedBook, setSelectedBook] = useState<ClubBook | null>(null);
  const [addBookVisible, setAddBookVisible] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [copied, setCopied] = useState(false);

  const currentUserId = user?.id ?? '';

  const addBookMutation = useMutation({
    mutationFn: (data: { title: string; author: string }) =>
      customFetch(`/api/clubs/${id}/books`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club', id] });
      setNewBookTitle('');
      setNewBookAuthor('');
      setAddBookVisible(false);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const leaveMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/clubs/${id}/leave`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clubs'] });
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => customFetch(`/api/clubs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clubs'] });
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleCopyCode = async () => {
    if (!club) return;
    await Clipboard.setStringAsync(club.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveOrDelete = () => {
    if (!club) return;
    if (club.myRole === 'owner') {
      Alert.alert('Delete club?', 'This deletes all books and discussions permanently.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]);
    } else {
      Alert.alert('Leave club?', "You'll need a new invite code to rejoin.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
      ]);
    }
  };

  const topPad = Platform.OS === 'web' ? 0 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.mutedForeground }}>Club not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Custom header */}
      <View style={[styles.screenHeader, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]} numberOfLines={1}>
            {club.name}
          </Text>
        </View>
        <Pressable onPress={handleCopyCode} style={[styles.codeChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.codeText, { color: colors.foreground }]}>{club.inviteCode}</Text>
          <Feather name={copied ? 'check' : 'copy'} size={12} color={copied ? colors.primary : colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={handleLeaveOrDelete} style={{ marginLeft: 8 }}>
          <Feather
            name={club.myRole === 'owner' ? 'trash-2' : 'log-out'}
            size={18}
            color={colors.mutedForeground}
          />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {(['books', 'members'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabItem, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === 'books' ? `Books (${club.books.length})` : `Members (${club.members.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {tab === 'books' ? (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}>
            {club.books.length === 0 ? (
              <View style={styles.emptySection}>
                <Feather name="book-open" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No books yet. Add the first one!
                </Text>
              </View>
            ) : (
              club.books.map((book) => (
                <Pressable
                  key={book.id}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedBook(book);
                  }}
                  style={({ pressed }) => [
                    styles.bookRow,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <View style={[styles.bookCover, { backgroundColor: book.coverColor }]}>
                    <Text style={styles.bookCoverText}>{book.title.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bookTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {book.title}
                    </Text>
                    <Text style={[styles.bookAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {book.author}
                    </Text>
                    <Text style={[styles.postCount, { color: colors.mutedForeground }]}>
                      {book.postCount} {book.postCount === 1 ? 'post' : 'posts'}
                    </Text>
                  </View>
                  <Feather name="message-circle" size={18} color={colors.primary} style={{ marginLeft: 8 }} />
                </Pressable>
              ))
            )}
          </ScrollView>

          {/* Add book FAB */}
          <Pressable
            onPress={() => setAddBookVisible(true)}
            style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
          >
            <Feather name="plus" size={22} color={colors.primaryForeground} />
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}>
          {club.members.map((member) => (
            <View
              key={member.id}
              style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.memberAvatar, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.memberAvatarText, { color: colors.primary }]}>
                  {(member.displayName ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                {member.displayName ?? 'Member'}
              </Text>
              {member.role === 'owner' && (
                <View style={[styles.ownerBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Text style={[styles.ownerBadgeText, { color: colors.mutedForeground }]}>Owner</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add Book Modal */}
      <Modal visible={addBookVisible} transparent animationType="slide" onRequestClose={() => setAddBookVisible(false)}>
        <View style={[addBookStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[addBookStyles.card, { backgroundColor: colors.card }]}>
            <Text style={[addBookStyles.title, { color: colors.foreground }]}>Add a book</Text>
            <Text style={[addBookStyles.label, { color: colors.mutedForeground }]}>Title</Text>
            <TextInput
              style={[addBookStyles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Book title"
              placeholderTextColor={colors.mutedForeground}
              value={newBookTitle}
              onChangeText={setNewBookTitle}
            />
            <Text style={[addBookStyles.label, { color: colors.mutedForeground }]}>Author</Text>
            <TextInput
              style={[addBookStyles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Author name"
              placeholderTextColor={colors.mutedForeground}
              value={newBookAuthor}
              onChangeText={setNewBookAuthor}
            />
            <View style={addBookStyles.actions}>
              <Pressable onPress={() => setAddBookVisible(false)} style={[addBookStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => addBookMutation.mutate({ title: newBookTitle, author: newBookAuthor })}
                disabled={!newBookTitle.trim() || !newBookAuthor.trim() || addBookMutation.isPending}
                style={[addBookStyles.primaryBtn, { backgroundColor: colors.primary, opacity: !newBookTitle.trim() || !newBookAuthor.trim() ? 0.6 : 1 }]}
              >
                {addBookMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Posts modal */}
      {selectedBook && (
        <PostsModal
          club={club}
          book={selectedBook}
          visible={!!selectedBook}
          onClose={() => setSelectedBook(null)}
          colors={colors}
          currentUserId={currentUserId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, gap: 8,
  },
  backBtn: { padding: 4 },
  screenTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  codeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  codeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1.5 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  listContent: { padding: 16, gap: 10 },
  emptySection: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  bookRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1,
  },
  bookCover: {
    width: 42, height: 56, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  bookCoverText: { color: 'white', fontSize: 18, fontFamily: 'Inter_700Bold' },
  bookTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  bookAuthor: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  postCount: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  memberName: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  ownerBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  ownerBadgeText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  fab: {
    position: 'absolute', right: 20,
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
});

const addBookStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 16 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6, marginTop: 12 },
  input: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 11, fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
});

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, gap: 8,
  },
  backBtn: { padding: 4 },
  bookTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  bookAuthor: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  bookCover: {
    width: 32, height: 42, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  bookCoverText: { color: 'white', fontSize: 14, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 10 },
  postItem: {
    borderRadius: 14, borderWidth: 1,
    padding: 12, gap: 8,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  posterName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  postTime: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  postContent: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  compose: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, gap: 8,
  },
  pageInput: {
    width: 50, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  composeInput: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, fontFamily: 'Inter_400Regular',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
});
