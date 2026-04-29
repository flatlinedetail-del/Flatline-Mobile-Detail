import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(value: string) {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, "");
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

export function getClientDisplayName(client: any) {
  if (!client) return "Unnamed Client";
  
  const { 
    businessName, 
    firstName, 
    lastName, 
    name, 
    contactPerson, 
    fullName, 
    clientName,
    customerName,
    phone,
    customerPhone,
    email,
    customerEmail
  } = client;
  
  // 1. businessName (if exists)
  if (businessName) {
    const personName = [firstName, lastName].filter(Boolean).join(" ");
    return personName ? `${businessName} (${personName})` : businessName;
  }
  
  // 2. firstName + lastName
  const personName = [firstName, lastName].filter(Boolean).join(" ");
  if (personName) return personName;

  // contactPerson fallback for name
  if (contactPerson) return contactPerson;
  
  // 3. fullName or clientName or customerName
  const otherName = fullName || clientName || customerName || name;
  if (otherName && otherName !== "Client" && otherName !== "CLIENT") return otherName;
  
  // 4. phone/email (fallback)
  const contact = phone || customerPhone || email || customerEmail;
  if (contact) return contact;

  // 5. “Unnamed Client” (last resort)
  return "Unnamed Client";
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export async function resizeImage(dataUrl: string, maxWidth = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const copy = document.createElement('canvas').getContext('2d');
  if (!copy) return canvas;

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const l = pixels.data.length;
  let i;
  const bound = {
    top: null as number | null,
    left: null as number | null,
    right: null as number | null,
    bottom: null as number | null
  };
  let x, y;

  for (i = 0; i < l; i += 4) {
    if (pixels.data[i + 3] !== 0) {
      x = (i / 4) % canvas.width;
      y = ~~((i / 4) / canvas.width);

      if (bound.top === null) bound.top = y;
      if (bound.left === null) bound.left = x;
      else if (x < bound.left) bound.left = x;
      
      if (bound.right === null) bound.right = x;
      else if (bound.right < x) bound.right = x;
      
      if (bound.bottom === null) bound.bottom = y;
      else if (bound.bottom < y) bound.bottom = y;
    }
  }

  if (bound.top === null || bound.bottom === null || bound.left === null || bound.right === null) {
      return canvas;
  }

  const trimHeight = bound.bottom - bound.top + 1;
  const trimWidth = bound.right - bound.left + 1;
  const trimmed = ctx.getImageData(bound.left, bound.top, trimWidth, trimHeight);

  copy.canvas.width = trimWidth;
  copy.canvas.height = trimHeight;
  copy.putImageData(trimmed, 0, 0);

  return copy.canvas;
}

export function toTitleCase(str: string): string {
  if (!str) return "";
  return str.toLowerCase().split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

export function cleanAddress(address: string | undefined | null): string {
  if (!address) return "";
  return address.replace(/,\s*(USA|United States)$/i, "").trim();
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return "$0.00";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDateSafe(dateValue: any, formatStr: string, fallback = "Pending") {
  if (!dateValue) return fallback;
  try {
    let dateObj: Date;
    if (typeof dateValue.toDate === 'function') {
      dateObj = dateValue.toDate();
    } else if (dateValue instanceof Date) {
      dateObj = dateValue;
    } else if (typeof dateValue?.seconds === 'number') {
      dateObj = new Date(dateValue.seconds * 1000);
    } else if (typeof dateValue === 'number' || typeof dateValue === 'string') {
      dateObj = new Date(dateValue);
    } else {
      return fallback;
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      return fallback;
    }
    return format(dateObj, formatStr);
  } catch (e) {
    return fallback;
  }
}
