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
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-extrabold shadow-xs shrink-0 ${
        isConnected
          ? 'border-[#7EC79F]/40 bg-[#0F2D24]/85 text-[#D6EFD9]'
          : 'border-[#F4C76D]/45 bg-[#2A2112]/80 text-[#FFF0C2]'
      }`}
    >
      {isConnected ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[#7EC79F] shrink-0" aria-hidden="true" />
      ) : (
        <HardDrive className="h-3.5 w-3.5 text-[#F4C76D] shrink-0" aria-hidden="true" />
      )}
      <span className="text-xs font-extrabold tracking-wide">{status}</span>
    </div>
  );
}
