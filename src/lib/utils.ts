/**
 * Utility functions for frontend
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHash(hash: string) {
  if (!hash) return '';
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
}

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString();
}
