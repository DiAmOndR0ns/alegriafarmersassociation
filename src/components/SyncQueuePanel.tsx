import React from 'react';
import { SyncQueueItem } from '../types';
import { RotateCw, Trash2, Cloud, CloudOff, RefreshCw, Layers, CheckCircle2, ArrowRight, Server } from 'lucide-react';

interface SyncQueuePanelProps {
  queue: SyncQueueItem[];
  isOnline: boolean;
  onSync: () => void;
  isSyncing: boolean;
  onClearQueue: () => void;
  onRemoveItem: (id: string) => void;
}

export default function SyncQueuePanel({
  queue,
  isOnline,
  onSync,
  isSyncing,
  onClearQueue,
  onRemoveItem
}: SyncQueuePanelProps) {
  return (
    <div id="sync-queue-panel-container" className="bg-[#F7F4EF] border border-[#D5CFC1] rounded-2xl p-4 shadow-lg space-y-3">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#D5CFC1] pb-3.5">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <h3 className="font-bold text-[#1B4332] text-sm">Offline PWA Sync Engine</h3>
            <p className="text-xs text-[#1B4332] mt-0.5 font-semibold">Queue tracking pending mutations while server is disconnected</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {queue.length > 0 && (
            <button
              id="clear-queue-btn"
              onClick={onClearQueue}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/10 w-full sm:w-auto text-center"
            >
              Clear Queue
            </button>
          )}

          <button
            id="sync-trigger-panel-btn"
            disabled={!isOnline || queue.length === 0 || isSyncing}
            onClick={onSync}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all w-full sm:w-auto ${
              !isOnline || queue.length === 0
                ? 'bg-slate-900 text-slate-500 border border-slate-750 cursor-not-allowed'
                : isSyncing
                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent shadow-md'
            }`}
            title="Manual sync pulse (Optional — system auto-syncs continuously)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Synchronizing...' : 'Force Sync Now (Optional)'}</span>
          </button>
        </div>
      </div>

      {/* QUEUE MAIN STATE DISPLAY */}
      {queue.length > 0 ? (
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Automated Sync Active:</span> {queue.length} pending change(s) are stored offline. They will automatically synchronize directly to the cloud database the moment connection is detected. Manual clicking is not required.
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-2.5 pr-1">
            {queue.map((item, idx) => {
              // Extract descriptive name/title
              const payload = item.payload;
              let itemTitle = 'Data Entry';
              if (item.entityType === 'member') itemTitle = payload.name;
              else if (item.entityType === 'meeting') itemTitle = payload.title;
              else if (item.entityType === 'resolution') itemTitle = `${payload.resolutionNumber}: ${payload.title}`;
              else if (item.entityType === 'transaction') itemTitle = `${payload.type === 'income' ? '+' : '-'} PHP ${payload.amount.toLocaleString()} - ${payload.category}`;
              else if (item.entityType === 'announcement') itemTitle = payload.title;

              return (
                <div key={item.id} className="bg-slate-900 border border-slate-750 rounded-xl p-3 flex justify-between items-center text-xs gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold font-mono text-[10px] text-amber-400 uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {item.action}
                      </span>
                      <span className="text-slate-400 font-bold uppercase text-[9px] bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        {item.entityType}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200">
                      {itemTitle}
                    </div>
                    <p className="text-[10px] text-slate-500 truncate max-w-sm sm:max-w-md">
                      Payload: {JSON.stringify(payload)}
                    </p>
                  </div>

                  <button
                    id={`remove-sync-item-${item.id}`}
                    onClick={() => onRemoveItem(item.id)}
                    className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all shrink-0"
                    title="Discard change"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-xs text-slate-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span><strong className="text-emerald-300">All data synchronized.</strong> Real-time changes auto-sync to the PostgreSQL cloud database continuously.</span>
        </div>
      )}
    </div>
  );
}
