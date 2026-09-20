import React from 'react';

interface DashboardSkeletonProps {
  variant?: 'app' | 'guest' | 'member' | 'officer';
}

export default function DashboardSkeleton({ variant = 'app' }: DashboardSkeletonProps) {
  const isMember = variant === 'member';
  const isGuest = variant === 'guest';

  return (
    <div className="min-h-screen bg-bafa-neutral-50 text-slate-800 animate-pulse">
      <div className="bg-white border-b-2 border-bafa-neutral-300 py-4 px-4 sm:px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-40 bg-slate-200 rounded-full" />
              <div className="h-3 w-56 bg-slate-200 rounded-full" />
            </div>
          </div>
          <div className="h-10 w-28 bg-slate-200 rounded-xl" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white border-2 border-bafa-neutral-300 rounded-3xl p-4 sm:p-6">
          <div className="flex flex-wrap gap-2 mb-5">
            {Array.from({ length: isGuest ? 5 : 4 }).map((_, i) => (
              <div key={i} className="h-10 w-28 rounded-xl bg-slate-200" />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-bafa-neutral-200 bg-bafa-neutral-50 p-4 space-y-3">
                <div className="h-3 w-20 bg-slate-200 rounded-full" />
                <div className="h-8 w-24 bg-slate-200 rounded-full" />
                <div className="h-3 w-32 bg-slate-200 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 space-y-4">
            <div className="bg-white border-2 border-bafa-neutral-300 rounded-3xl p-5">
              <div className="h-6 w-48 bg-slate-200 rounded-full mb-4" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-slate-200 rounded-full" />
                <div className="h-4 w-11/12 bg-slate-200 rounded-full" />
                <div className="h-4 w-10/12 bg-slate-200 rounded-full" />
              </div>
            </div>
            <div className="bg-white border-2 border-[#D5CFC1] rounded-3xl p-5 space-y-4">
              {Array.from({ length: isMember ? 3 : 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-200" />
              ))}
            </div>
          </div>

          <div className="xl:col-span-5">
            <div className="bg-white border-2 border-[#D5CFC1] rounded-3xl p-5 space-y-4">
              <div className="h-6 w-36 bg-slate-200 rounded-full" />
              <div className="space-y-3">
                <div className="h-16 rounded-2xl bg-slate-200" />
                <div className="h-16 rounded-2xl bg-slate-200" />
                <div className="h-16 rounded-2xl bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
