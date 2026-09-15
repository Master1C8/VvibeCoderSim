import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatProgress(progress: number): string {
  return progress.toFixed(progress >= 90 ? 2 : 1) + "%";
}
