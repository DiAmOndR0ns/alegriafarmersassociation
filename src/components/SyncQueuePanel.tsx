import React from 'react';
import { SyncQueueItem } from '../types';
import { Trash2, RefreshCw, Layers, CheckCircle2, Server } from 'lucide-react';

interface SyncQueuePanelProps {
  queue: SyncQueueItem[];
  isOnline: boolean;
  hasPendingCloudSync: boolean;
  onSync: () => void;
  isSyncing: boolean;
  onClearQueue: () => void;
  onRemoveItem: (id: string) => void;
}

export default function SyncQueuePanel({
  queue,
  isOnline,
  hasPendingCloudSync,
  onSync,
  isSyncing,
  onClearQueue,
  onRemoveItem
}: SyncQueuePanelProps) {
  return (
    <div id="sync-queue-panel-container" className="dim-card rounded-3xl p-4 sm:p-5 space-y-3.5 text-left">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#E3EFE6] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FFF0C2] text-[#8A5404] flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display font-bold text-[#1B4332] text-base">Offline PWA Sync Engine</h3>
            <p className="text-xs sm:text-sm text-[#455C50] font-medium">
              Queue tracking pending mutations while server is disconnected
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {queue.length > 0 && (
            <button
              id="clear-queue-btn"
              type="button"
              onClick={onClearQueue}
              className="btn-bevel-secondary text-xs font-extrabold text-rose-700 px-3 py-2 rounded-xl w-full sm:w-auto text-center cursor-pointer"
            >
              Clear Queue
            </button>
          )}

          <button
            id="sync-trigger-panel-btn"
            type="button"
            disabled={!isOnline || (queue.length === 0 && !hasPendingCloudSync) || isSyncing}
            onClick={onSync}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all w-full sm:w-auto ${!isOnline || (queue.length === 0 && !hasPendingCloudSync)
                ? 'bg-[#EAF3EC] text-[#5B7266] border border-[#CFE2D4] cursor-not-allowed'
                : isSyncing
                  ? 'bg-[#D6EFD9] text-[#1B4332] border border-[#1B4332]/25'
                  : 'btn-bevel-forest cursor-pointer'
              }`}
            title="Retry pending database synchronization"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isSyncing ? 'Synchronizing...' : 'Force Sync Now (Optional)'}</span>
          </button>
        </div>
      </div>

      {/* QUEUE MAIN STATE DISPLAY */}
      {queue.length > 0 ? (
        <div className="space-y-3">
          <div className="dim-card-mint rounded-2xl p-3.5 text-xs sm:text-sm text-[#1B4332] leading-relaxed flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-extrabold">Automated Sync Active:</span> {queue.length} pending change(s) are stored offline. They will automatically synchronize directly to the cloud database the moment connection is detected. Manual clicking is not required.
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-2.5 pr-1">
            {queue.map((item) => {
              const payload = item.payload;
              let itemTitle = 'Data Entry';
              if (item.entityType === 'member') itemTitle = payload.name;
              else if (item.entityType === 'meeting') itemTitle = payload.title;
              else if (item.entityType === 'resolution') itemTitle = `${payload.resolutionNumber}: ${payload.title}`;
              else if (item.entityType === 'transaction') itemTitle = `${payload.type === 'income' ? '+' : '-'} PHP ${payload.amount.toLocaleString()} - ${payload.category}`;
              else if (item.entityType === 'announcement') itemTitle = payload.title;

              return (
                <div key={item.id} className="recessed-control rounded-2xl p-3.5 flex justify-between items-center text-xs gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold font-mono text-[11px] text-[#8A5404] uppercase bg-[#FFF0C2] px-2 py-0.5 rounded-md border border-[#E9B34A]/50">
                        {item.action}
                      </span>
                      <span className="text-[#1B4332] font-bold uppercase text-[11px] bg-white px-2 py-0.5 rounded-md border border-[#1B4332]/15">
                        {item.entityType}
                      </span>
                      <span className="text-xs font-mono text-[#455C50]">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-[#163327] truncate">
                      {itemTitle}
                    </div>
                    <p className="text-xs text-[#455C50] truncate">
                      Payload: {JSON.stringify(payload)}
                    </p>
                  </div>

                  <button
                    id={`remove-sync-item-${item.id}`}
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    className="min-w-10 min-h-10 flex items-center justify-center text-[#455C50] hover:text-rose-700 rounded-xl hover:bg-rose-50 transition-all shrink-0 cursor-pointer"
                    title="Discard change"
                    aria-label="Discard pending change"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : hasPendingCloudSync ? (
        <div className="dim-card-warm flex items-center gap-2.5 rounded-2xl px-4 py-3 text-xs sm:text-sm text-[#7A4904]">
          <Server className="w-4 h-4 shrink-0 text-[#C2410C]" aria-hidden="true" />
          <span><strong>Database sync pending.</strong> Local changes are saved locally and will retry automatically when the database is available.</span>
        </div>
      ) : (
        <div className="dim-card-mint flex items-center gap-2.5 rounded-2xl px-4 py-3 text-xs sm:text-sm text-[#1B4332]">
          <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] shrink-0" aria-hidden="true" />
          <span><strong>All data synchronized.</strong></span>
        </div>
      )}
    </div>
  );
}
