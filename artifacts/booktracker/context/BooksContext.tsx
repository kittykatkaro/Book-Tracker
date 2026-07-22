import React, { createContext, useCallback, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListBooks,
  useCreateBook,
  useUpdateBook,
  useDeleteBook,
  getListBooksQueryKey,
  type Book as ApiBook,
} from '@workspace/api-client-react';

export type BookStatus = 'reading' | 'read' | 'want_to_read';

export interface Book {
  id: string;
  title: string;
  author: string;
  coverColor: string;
  coverUrl?: string | null;
  status: BookStatus;
  rating?: number;
  pages?: number;
  currentPage?: number;
  notes?: string;
  genre?: string;
  dateAdded: string;
  dateStarted?: string;
  dateFinished?: string;
}

function toBook(b: ApiBook): Book {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    coverColor: b.coverColor,
    coverUrl: b.coverUrl ?? null,
    status: b.status as BookStatus,
    rating: b.rating ?? undefined,
    pages: b.pages ?? undefined,
    currentPage: b.currentPage ?? undefined,
    notes: b.notes ?? undefined,
    genre: b.genre ?? undefined,
    dateAdded: b.dateAdded,
    dateStarted: b.dateStarted ?? undefined,
    dateFinished: b.dateFinished ?? undefined,
  };
}

interface BooksContextType {
  books: Book[];
  isLoading: boolean;
  isUpdating: boolean;
  addBook: (book: Omit<Book, 'id' | 'dateAdded' | 'coverColor'>) => void;
  updateBook: (id: string, updates: Partial<Book>, options?: { onSuccess?: () => void; onError?: () => void }) => void;
  deleteBook: (id: string) => void;
  getBook: (id: string) => Book | undefined;
}

const BooksContext = createContext<BooksContextType | null>(null);

export function BooksProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: apiBooks = [], isLoading } = useListBooks();
  const books: Book[] = (apiBooks as ApiBook[]).map(toBook);

  const createMutation = useCreateBook();
  const updateMutation = useUpdateBook();
  const deleteMutation = useDeleteBook();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
  }, [queryClient]);

  const addBook = useCallback(
    (book: Omit<Book, 'id' | 'dateAdded' | 'coverColor'>) => {
      createMutation.mutate(
        {
          data: {
            title: book.title,
            author: book.author,
            status: book.status,
            rating: book.rating ?? null,
            pages: book.pages ?? null,
            currentPage: book.currentPage ?? null,
            notes: book.notes ?? null,
            genre: book.genre ?? null,
            coverUrl: book.coverUrl ?? null,
          },
        },
        { onSuccess: invalidate },
      );
    },
    [createMutation, invalidate],
  );

  const updateBook = useCallback(
    (id: string, updates: Partial<Book>, options?: { onSuccess?: () => void; onError?: () => void }) => {
      updateMutation.mutate(
        {
          id,
          data: {
            ...(updates.title !== undefined && { title: updates.title }),
            ...(updates.author !== undefined && { author: updates.author }),
            ...(updates.status !== undefined && { status: updates.status }),
            ...('rating' in updates && { rating: updates.rating ?? null }),
            ...('pages' in updates && { pages: updates.pages ?? null }),
            ...('currentPage' in updates && { currentPage: updates.currentPage ?? null }),
            ...('notes' in updates && { notes: updates.notes ?? null }),
            ...('genre' in updates && { genre: updates.genre ?? null }),
            ...('coverUrl' in updates && { coverUrl: updates.coverUrl ?? null }),
            ...('dateStarted' in updates && { dateStarted: updates.dateStarted ?? null }),
            ...('dateFinished' in updates && { dateFinished: updates.dateFinished ?? null }),
          },
        },
        {
          onSuccess: () => {
            invalidate();
            options?.onSuccess?.();
          },
          onError: () => {
            options?.onError?.();
          },
        },
      );
    },
    [updateMutation, invalidate],
  );

  const deleteBook = useCallback(
    (id: string) => {
      deleteMutation.mutate({ id }, { onSuccess: invalidate });
    },
    [deleteMutation, invalidate],
  );

  const getBook = useCallback(
    (id: string) => books.find((b) => b.id === id),
    [books],
  );

  return (
    <BooksContext.Provider value={{ books, isLoading, isUpdating: updateMutation.isPending, addBook, updateBook, deleteBook, getBook }}>
      {children}
    </BooksContext.Provider>
  );
}

export function useBooks() {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error('useBooks must be used within BooksProvider');
  return ctx;
}
