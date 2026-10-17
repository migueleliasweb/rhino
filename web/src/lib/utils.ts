import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | bigint, decimals = 1): string {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!+b) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatBitrate(bytesPerSec: number | bigint): string {
  const b = typeof bytesPerSec === 'bigint' ? Number(bytesPerSec) : bytesPerSec;
  if (!+b) return '0 B/s';
  return `${formatBytes(b)}/s`;
}
