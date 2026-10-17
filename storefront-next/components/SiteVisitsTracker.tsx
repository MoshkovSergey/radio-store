'use client';

import { useEffect, useRef } from 'react';

const VISITOR_TOKEN_KEY = 'radio_store_site_visitor_token';

function generateVisitorToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateVisitorToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const existing = localStorage.getItem(VISITOR_TOKEN_KEY);

  if (existing) {
    return existing;
  }

  const token = generateVisitorToken();
  localStorage.setItem(VISITOR_TOKEN_KEY, token);

  return token;
}

export default function SiteVisitsTracker() {
  const sentRef = useRef<boolean>(false);

  useEffect(() => {
    if (sentRef.current) {
      return;
    }

    sentRef.current = true;

    const visitorToken = getOrCreateVisitorToken();
    const pagePath = window.location.pathname + window.location.search;
    const referrer = document.referrer || '';
    const userAgent = navigator.userAgent || '';

    const payload = {
      visitor_token: visitorToken,
      page_path: pagePath,
      referrer: referrer,
      user_agent: userAgent,
    };

    // Fire-and-forget: не блокируем рендер, не показываем ошибки пользователю.
    fetch('/api/v1/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Игнорируем ошибки: счётчик не критичен для пользователя.
    });
  }, []);

  return null;
}