import { useState, useCallback } from 'react';
import { DatabaseStatus } from '../types';

export interface DatabaseStatusApiResponse {
  connected?: boolean;
  configured?: boolean;
  provider?: string;
  database?: string;
  timestamp?: string;
  message?: string;
  error?: string;
  tableCounts?: Record<string, number>;
  totalRecords?: number;
  hasPresident?: boolean;
}

export function useDatabaseStatus(initialStatus?: Partial<DatabaseStatus>) {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({
    connected: false,
    configured: false,
    provider: 'Checking...',
    checking: true,
    ...initialStatus,
  });

  const checkDatabaseConnection = useCallback(async () => {
    setDbStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch('/api/db/status');
      if (!res.ok) {
        setDbStatus({
          connected: false,
          configured: false,
          provider: 'Local Storage',
          message: 'Offline mode active.',
          checking: false,
        });
        return;
      }
      const text = await res.text();
      let data: DatabaseStatusApiResponse;
      try {
        data = JSON.parse(text) as DatabaseStatusApiResponse;
      } catch {
        data = { connected: false, configured: false, provider: 'Local Storage', message: 'Offline mode active.' };
      }
      setDbStatus({
        connected: Boolean(data.connected),
        configured: Boolean(data.configured),
        provider: data.provider || (data.configured ? 'Supabase' : 'Local Storage'),
        database: data.database,
        timestamp: data.timestamp || new Date().toISOString(),
        message: data.message,
        error: data.error,
        tableCounts: data.tableCounts,
        totalRecords: data.totalRecords,
        hasPresident: Boolean(data.hasPresident),
        checking: false,
      });
    } catch {
      setDbStatus({
        connected: false,
        configured: false,
        provider: 'Local Storage',
        message: 'Running in local offline-first storage mode.',
        checking: false,
      });
    }
  }, []);

  return { dbStatus, setDbStatus, checkDatabaseConnection };
}
