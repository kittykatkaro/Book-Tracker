import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type BookStatus = 'reading' | 'read' | 'want_to_read';

export interface Book {
  id: string;
  title: string;
  author: string;
  coverColor: string;
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

interface BooksContextType {
  books: Book[];
  isLoading: boolean;
  addBook: (book: Omit<Book, 'id' | 'dateAdded' | 'coverColor'>) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  getBook: (id: string) => Book | undefined;
}

const BooksContext = createContext<BooksContextType | null>(null);

const STORAGE_KEY = '@booktracker_v1_books';

const COVER_COLORS = [
  '#2D6A4F', '#C8873F', '#5856D6', '#E55A4E', '#4A90D9',
  '#8B5CF6', '#D4792A', '#1D7A7A', '#B5451B', '#4C7B58',
];

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function BooksProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setBooks(JSON.parse(stored));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const persist = (updated: Book[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  };

  const addBook = useCallback((book: Omit<Book, 'id' | 'dateAdded' | 'coverColor'>) => {
    const newBook: Book = {
      ...book,
      id: generateId(),
      dateAdded: new Date().toISOString(),
      coverColor: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
      ...(book.status === 'reading' ? { dateStarted: new Date().toISOString() } : {}),
      ...(book.status === 'read'
        ? { dateStarted: new Date().toISOString(), dateFinished: new Date().toISOString() }
        : {}),
    };
    setBooks((prev) => {
      const updated = [newBook, ...prev];
      persist(updated);
      return updated;
    });
  }, []);

  const updateBook = useCallback((id: string, updates: Partial<Book>) => {
    setBooks((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== id) return b;
        const next = { ...b, ...updates };
        if (updates.status === 'reading' && !b.dateStarted) {
          next.dateStarted = new Date().toISOString();
        }
        if (updates.status === 'read') {
          if (!next.dateStarted) next.dateStarted = new Date().toISOString();
          if (!b.dateFinished) next.dateFinished = new Date().toISOString();
        }
        return next;
      });
      persist(updated);
      return updated;
    });
  }, []);

  const deleteBook = useCallback((id: string) => {
    setBooks((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      persist(updated);
      return updated;
    });
  }, []);

  const getBook = useCallback((id: string) => books.find((b) => b.id === id), [books]);

  return (
    <BooksContext.Provider value={{ books, isLoading, addBook, updateBook, deleteBook, getBook }}>
      {children}
    </BooksContext.Provider>
  );
}

export function useBooks() {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error('useBooks must be used within BooksProvider');
  return ctx;
}
