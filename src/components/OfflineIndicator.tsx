import React, { useState } from 'react';
import { 
  RotateCw, 
  AlertCircle, 
  Database, 
  HardDrive, 
  CheckCircle2, 
  X, 
  RefreshCw,
  Server,
  Zap,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { DatabaseStatus } from '../types';

interface OfflineIndicatorProps {
  isOnline: boolean;
  queueCount: number;
  onSync: () => void;
  isSyncing: boolean;
  dbStatus?: DatabaseStatus;
  onCheckDb?: () => void;
  onPurgeDb?: () => void;
  isPurging?: boolean;
  onClearLocalCache?: () => void;
}

export default function OfflineIndicator({
  isOnline,
  queueCount,
  onSync,
  isSyncing,
  dbStatus,
  onCheckDb,
  onPurgeDb,
  isPurging = false,
  onClearLocalCache,
}: OfflineIndicatorProps) {
  const [showDbModal, setShowDbModal] = useState(false);

  const isConnected = dbStatus?.connected === true;
  const isConfigured = dbStatus?.configured === true;
  const isChecking = dbStatus?.checking === true;
  const providerName = dbStatus?.provider || (isConfigured ? 'Supabase' : 'Local Storage');

  return (
    <>
      <div 
        id="offline-indicator-wrapper" 
        className="flex flex-wrap items-center gap-2 bg-[#1B4332] border border-[#2D6A4F] rounded-xl px-3 py-1.5 shadow-sm text-xs text-[#D8F3DC]"
      >
        {/* Network Online/Offline Dot */}
        <div className="flex items-center gap-1.5 pr-1" title={isOnline ? "Network is connected" : "Network is offline"}>
          <div className="relative flex items-center justify-center">
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isOnline && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" aria-hidden="true" />
            )}
          </div>
          <span className="text-[11px] font-bold text-[#D8F3DC]">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="h-3.5 w-[1px] bg-[#2D6A4F]" aria-hidden="true" />

        {/* Database Connection Status Badge (Clickable to view details) */}
        <button
          id="database-status-badge"
          type="button"
          onClick={() => setShowDbModal(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-all cursor-pointer select-none ${
            isChecking
              ? 'bg-[#0F2D24] text-[#95D5B2] border-[#2D6A4F] hover:bg-[#122E22]'
              : isConnected
              ? 'bg-[#0F2D24] text-[#95D5B2] border-[#2D6A4F] hover:bg-[#122E22]'
              : isConfigured
              ? 'bg-rose-900/40 text-rose-200 border-rose-500/50 hover:bg-rose-900/60'
              : 'bg-[#0F2D24] text-[#95D5B2] border-[#2D6A4F] hover:bg-[#122E22]'
          }`}
          title="Click to view Database Connection details"
        >
          {isChecking ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin text-[#4A5F57]" aria-hidden="true" />
              <span>Checking DB...</span>
            </>
          ) : isConnected ? (
            <>
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <Database className="w-3 h-3 text-emerald-700" aria-hidden="true" />
              <span className="font-bold">{providerName}: Connected</span>
            </>
          ) : isConfigured ? (
            <>
              <AlertCircle className="w-3 h-3 text-rose-700" aria-hidden="true" />
              <span className="font-bold">{providerName}: Disconnected</span>
            </>
          ) : (
            <>
              <HardDrive className="w-3 h-3 text-[#4A5F57]" aria-hidden="true" />
              <span className="font-bold">Local Storage</span>
            </>
          )}
        </button>

        {/* Automatic Sync Status Badges */}
        {isSyncing ? (
          <div 
            id="sync-status-syncing"
            className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-200 animate-pulse"
            title="Automatically syncing changes to the database..."
          >
            <RotateCw className="w-3 h-3 animate-spin text-emerald-400" />
            <span>Auto-Syncing to DB...</span>
          </div>
        ) : queueCount > 0 ? (
          !isOnline ? (
            <div
              id="sync-status-offline-saved"
              className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/35 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-amber-200"
              title="Changes saved offline. They will automatically sync to the database as soon as you reconnect without pressing any button."
            >
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span>{queueCount} offline saved • Auto-syncs on connect</span>
            </div>
          ) : (
            <div
              id="sync-status-pending-online"
              className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-200"
              title="Auto-syncing queued offline changes to the database..."
            >
              <RotateCw className="w-3 h-3 animate-spin text-emerald-400" />
              <span>Auto-syncing ({queueCount})...</span>
            </div>
          )
        ) : isConnected ? (
          <div
            id="sync-status-auto-synced"
            className="hidden sm:flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/25 px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-400"
            title="All offline and online changes are automatically synced to the database. No button push required."
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Auto-Synced</span>
          </div>
        ) : null}

        {/* Optional Manual Instant Refresh Pulse (Officers don't need to push this, but available if requested) */}
        <button
          id="sync-trigger-btn"
          type="button"
          disabled={!isOnline || isSyncing}
          onClick={onSync}
          className={`p-1 rounded-lg border transition-all ${
            !isOnline
              ? 'bg-[#0F2D24] text-[#4A5F57] border-[#2D6A4F] cursor-not-allowed opacity-50'
              : isSyncing
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 cursor-not-allowed opacity-60'
              : 'bg-[#0F2D24] text-[#95D5B2] hover:text-white hover:bg-[#122E22] border-[#2D6A4F] cursor-pointer'
          }`}
          title="Auto-sync is active. Click to trigger an immediate database heartbeat pulse if desired."
        >
          <RotateCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* MODAL: DATABASE CONNECTION AUDIT & DETAILS */}
      {showDbModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
          onClick={() => setShowDbModal(false)}
        >
          <div
            className="bg-white border border-slate-200 text-slate-800 rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden text-left animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-[#F6F8F6] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2.5 rounded-2xl shrink-0 ${isConnected ? 'bg-emerald-100 text-emerald-700' : isConfigured ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                  <Server className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-[#1B4332] font-display truncate">
                    Cloud Database
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isConnected ? 'Connected and syncing automatically' : isConfigured ? 'Configured but unreachable' : 'Offline-first local storage mode'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDbModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 space-y-3.5 overflow-y-auto flex-1">

              {/* Status Card */}
              <div className={`p-4 rounded-2xl border ${isConnected ? 'bg-emerald-50 border-emerald-200' : isConfigured ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 min-w-0">
                    {isConnected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : isConfigured ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate">{providerName}</span>
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${isConnected ? 'bg-emerald-600 text-white' : isConfigured ? 'bg-rose-600 text-white' : 'bg-slate-600 text-white'}`}>
                    {isConnected ? 'Online' : isConfigured ? 'Offline' : 'Local'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mt-2">
                  {isConnected
                    ? 'All records, contributions, and changes sync to Supabase automatically. No button needed.'
                    : isConfigured
                    ? 'The database could not be reached. Check the connection string and network access.'
                    : 'All data is saved safely in this browser (local storage).'}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 font-medium">
                  {dbStatus?.database && (
                    <span className="flex items-center gap-1">
                      <span>DB:</span>
                      <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-emerald-700 font-mono">{dbStatus.database}</code>
                    </span>
                  )}
                  {dbStatus?.timestamp && (
                    <span>Verified {new Date(dbStatus.timestamp).toLocaleTimeString()}</span>
                  )}
                </div>
              </div>

              {/* Table Record Counts */}
              {isConnected && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#F6F8F6] border-b border-slate-200">
                    <span className="text-[11px] font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Records</span>
                    </span>
                    <span className="text-[10px] font-black text-emerald-700">
                      {dbStatus?.totalRecords !== undefined ? `${dbStatus.totalRecords} total` : 'Loading...'}
                    </span>
                  </div>
                  {dbStatus?.tableCounts && Object.keys(dbStatus.tableCounts).length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-200 text-[11px]">
                      {Object.entries(dbStatus.tableCounts).map(([table, count]) => (
                        <div key={table} className="bg-white px-2.5 py-1.5 flex items-center justify-between gap-1">
                          <span className="text-slate-600 capitalize truncate" title={table}>
                            {table.replace(/_/g, ' ')}
                          </span>
                          <span className={`font-mono font-bold shrink-0 ${count > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3.5 py-3 text-xs text-slate-500 italic">Loading table counts...</div>
                  )}
                </div>
              )}

              {/* How it works / Setup */}
              <div className="border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                <span className="font-black text-[#1B4332] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isConnected ? 'How Sync Works' : 'Connect Supabase'}</span>
                </span>
                {isConnected ? (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Changes are mirrored to Supabase instantly. If you go offline, they queue locally and sync automatically once you reconnect.
                  </p>
                ) : (
                  <ol className="list-decimal list-inside text-xs text-slate-600 leading-relaxed space-y-0.5">
                    <li>Vercel → Project Settings → Environment Variables.</li>
                    <li>Add <code className="bg-slate-100 px-1 rounded text-emerald-700 font-mono text-[10px]">DATABASE_URL</code> (Supabase pooler URI, port 6543).</li>
                    <li>Redeploy the project.</li>
                  </ol>
                )}
              </div>

              {/* Security */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
                <span className="font-black text-emerald-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Security</span>
                </span>
                <p className="text-xs text-emerald-900/80 leading-relaxed">
                  Passwords are never stored in plain text — only irreversible salted SHA-256 hashes.
                  {isConnected && ' All records live in PostgreSQL; local cached tables can be purged below.'}
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-[#F6F8F6] border-t border-slate-200 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isChecking}
                  onClick={() => { if (onCheckDb) onCheckDb(); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-[#1B4332] rounded-xl text-xs font-bold transition-all border border-slate-300 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? 'Checking...' : 'Test'}</span>
                </button>

                {isConnected && onClearLocalCache && (
                  <button
                    id="clear-local-cache-btn"
                    type="button"
                    onClick={onClearLocalCache}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-300 cursor-pointer"
                    title="Purge cached browser tables (records stay safe in the cloud)"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Clear Cache</span>
                  </button>
                )}

                {onPurgeDb && (
                  <button
                    id="purge-demo-db-btn"
                    type="button"
                    disabled={isPurging}
                    onClick={onPurgeDb}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all border border-rose-200 cursor-pointer disabled:opacity-50"
                    title="Permanently remove all demo and seed records"
                  >
                    <Trash2 className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
                    <span>{isPurging ? 'Purging...' : 'Purge Demo'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowDbModal(false)}
                className="px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
