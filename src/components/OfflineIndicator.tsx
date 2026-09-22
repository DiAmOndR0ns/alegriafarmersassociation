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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
          onClick={() => setShowDbModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-750 text-slate-100 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white font-display">
                    Database Connection Status
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Live audit & sync engine connectivity
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDbModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status Card */}
            <div className={`p-4 rounded-xl border space-y-2 ${
              isConnected
                ? 'bg-emerald-950/30 border-emerald-500/40'
                : isConfigured
                ? 'bg-rose-950/30 border-rose-500/40'
                : 'bg-slate-800/60 border-slate-750'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Target Provider
                </span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                  isConnected 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : isConfigured
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {isConnected ? '● Connected' : isConfigured ? '✕ Disconnected' : '○ Local Storage'}
                </span>
              </div>

              <div className="text-base font-extrabold text-white flex items-center gap-1.5">
                {isConnected ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : isConfigured ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span>{providerName}</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {dbStatus?.message || (
                  isConnected 
                    ? 'Your application is connected to the cloud database. Member registrations, funds, meetings, and logs are automatically synchronized.'
                    : isConfigured
                    ? 'A connection string is configured, but the database could not be reached. Verify your credentials, password, and network access.'
                    : 'Running in offline-first mode. All data is saved safely in your browser local storage.'
                )}
              </p>

              {dbStatus?.database && (
                <div className="pt-1 text-[11px] text-slate-400 flex items-center gap-1">
                  <span>Database:</span>
                  <code className="bg-slate-900/80 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[10px]">
                    {dbStatus.database}
                  </code>
                </div>
              )}

              {dbStatus?.timestamp && (
                <div className="text-[10px] text-slate-500">
                  Last verified: {new Date(dbStatus.timestamp).toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Cloud Database Tables Status & Record Counts */}
            {isConnected && (
              <div className="bg-slate-800/60 border border-slate-750 p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Supabase Table Record Counts</span>
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    (dbStatus?.totalRecords ?? 0) > 0 
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}>
                    {dbStatus?.totalRecords !== undefined ? `${dbStatus.totalRecords} total rows` : 'Syncing counts...'}
                  </span>
                </div>

                {dbStatus?.tableCounts && Object.keys(dbStatus.tableCounts).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                    {Object.entries(dbStatus.tableCounts).map(([table, count]) => (
                      <div 
                        key={table}
                        className="bg-slate-900/70 border border-slate-800 px-2 py-1 rounded-lg flex items-center justify-between"
                      >
                        <span className="text-slate-400 capitalize truncate" title={table}>
                          {table.replace(/_/g, ' ')}
                        </span>
                        <span className={`font-mono font-bold ml-1 ${count > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    Loading table inventory from Supabase...
                  </div>
                )}

                {dbStatus?.totalRecords === 0 && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2">
                    <span>Database tables are clean and empty. Ready for real operational data.</span>
                  </div>
                )}
              </div>
            )}

            {/* Quick Explanation / Setup Tips */}
            <div className="bg-slate-800/40 border border-slate-750 p-3 rounded-xl space-y-1.5 text-xs text-slate-300">
              <span className="font-bold text-white block text-[11px] uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isConnected ? 'Active Cloud Synchronization' : 'Why is Data Stored in Local Storage?'}</span>
              </span>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {isConnected ? (
                  <>Changes made in the portal are immediately mirrored to Supabase. When offline, contributions and changes queue up locally and automatically sync the moment connection returns.</>
                ) : (
                  <>Your application is currently running in <strong>Offline-First mode</strong> because <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono text-[10px]">DATABASE_URL</code> is not connected on your Vercel deployment. All records are safely preserved in this browser so your data is not lost. Once you connect your Supabase database in Vercel settings, you can push all local data to the cloud.</>
                )}
              </p>
              {!isConnected && (
                <div className="mt-2 pt-2 border-t border-slate-700/60 text-[11px] text-slate-400 space-y-1">
                  <span className="font-bold text-slate-300 block">How to connect Supabase on Vercel:</span>
                  <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[10px] text-slate-400">
                    <li>Open your Vercel Dashboard → Project Settings → <strong>Environment Variables</strong>.</li>
                    <li>Add key <code className="text-amber-300 font-mono">DATABASE_URL</code> with your Supabase Transaction Pooler URI (port 6543).</li>
                    <li>Go to Deployments → Redeploy the latest build.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Security & Confidentiality Guarantee */}
            <div className="bg-emerald-950/25 border border-emerald-500/30 p-3 rounded-xl space-y-1.5 text-xs text-emerald-300">
              <span className="font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero Plaintext Passwords & Residual Storage</span>
              </span>
              <p className="text-[11px] leading-relaxed text-emerald-200/90">
                <strong>Credential Protection:</strong> Passwords are never stored in plain text anywhere in browser local storage. All credentials are protected with irreversible cryptographic salted SHA-256 hashes.
              </p>
              <p className="text-[11px] leading-relaxed text-emerald-200/80">
                <strong>Cloud Zero-Residual Mode:</strong> When connected to Supabase, all records are safely centralized in PostgreSQL. You can use the "Clear Local Cache" button below to purge cached browser tables from this device.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isChecking}
                  onClick={() => {
                    if (onCheckDb) onCheckDb();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? 'Checking...' : 'Test Connection'}</span>
                </button>

                {isConnected && onClearLocalCache && (
                  <button
                    id="clear-local-cache-btn"
                    type="button"
                    onClick={onClearLocalCache}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                    title="Clear local browser storage cache to enforce Zero-Residual storage"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Clear Local Cache (Zero Residual)</span>
                  </button>
                )}

                {onPurgeDb && (
                  <button
                    id="purge-demo-db-btn"
                    type="button"
                    disabled={isPurging}
                    onClick={onPurgeDb}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition-all border border-rose-500/40 cursor-pointer disabled:opacity-50"
                    title="Permanently remove all demo and seed records"
                  >
                    <Trash2 className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : 'text-rose-400'}`} />
                    <span>{isPurging ? 'Purging Demo Data...' : 'Purge Demo Data'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowDbModal(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer"
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
