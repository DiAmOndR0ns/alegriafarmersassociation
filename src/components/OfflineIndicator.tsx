import { CheckCircle2, HardDrive } from 'lucide-react';
import { DatabaseStatus } from '../types';

interface OfflineIndicatorProps {
  dbStatus?: DatabaseStatus;
}

export default function OfflineIndicator({ dbStatus }: OfflineIndicatorProps) {
  const isConnected = dbStatus?.connected === true;
  const status = isConnected ? 'Online' : 'Local';

  return (
    <div
      id="offline-indicator-wrapper"
      role="status"
      aria-label={`Storage status: ${status}`}
      className="flex items-center gap-1.5 rounded-xl border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-xs text-[#D8F3DC] shadow-sm"
    >
      {isConnected ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
      ) : (
        <HardDrive className="h-3.5 w-3.5 text-[#95D5B2]" aria-hidden="true" />
      )}
      <span className="text-[11px] font-bold">{status}</span>
    </div>
  );
}
