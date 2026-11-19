import React from 'react';

interface DashboardSkeletonProps {
  variant?: 'app' | 'guest' | 'member' | 'officer';
}

export default function DashboardSkeleton({ variant = 'app' }: DashboardSkeletonProps) {
  const isMember = variant === 'member';
  const isGuest = variant === 'guest';

  return (
    <div className="min-h-screen bg-[#F3FAF5] text-[#163327]">
      <div className="portal-sticky-header py-3 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full skeleton-shimmer" />
            <div className="space-y-1.5">
              <div className="h-4 w-40 rounded-full skeleton-shimmer" />
              <div className="h-3 w-52 rounded-full skeleton-shimmer hidden sm:block" />
            </div>
          </div>
          <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
        <div className="dim-card rounded-3xl p-4 sm:p-6">
          <div className="hidden md:flex flex-wrap gap-2 mb-5">
            {Array.from({ length: isGuest ? 6 : 5 }).map((_, i) => (
              <div key={i} className="h-10 w-28 rounded-xl skeleton-shimmer" />
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[#1B4332]/10 bg-[#FAF8F5] p-4 space-y-3">
                <div className="h-3 w-20 rounded-full skeleton-shimmer" />
                <div className="h-8 w-24 rounded-lg skeleton-shimmer" />
                <div className="h-3 w-28 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7 space-y-4">
            <div className="dim-card rounded-3xl p-5">
              <div className="h-6 w-48 rounded-full skeleton-shimmer mb-4" />
              <div className="space-y-3">
                <div className="h-4 w-full rounded-full skeleton-shimmer" />
                <div className="h-4 w-11/12 rounded-full skeleton-shimmer" />
                <div className="h-4 w-10/12 rounded-full skeleton-shimmer" />
              </div>
            </div>
            <div className="dim-card rounded-3xl p-5 space-y-4">
              {Array.from({ length: isMember ? 3 : 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
              ))}
            </div>
          </div>

          <div className="xl:col-span-5">
            <div className="dim-card rounded-3xl p-5 space-y-4">
              <div className="h-6 w-36 rounded-full skeleton-shimmer" />
              <div className="space-y-3">
                <div className="h-16 rounded-2xl skeleton-shimmer" />
                <div className="h-16 rounded-2xl skeleton-shimmer" />
                <div className="h-16 rounded-2xl skeleton-shimmer" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
