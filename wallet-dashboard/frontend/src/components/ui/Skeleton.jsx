export function Skeleton({ className = '', height = 'h-4', width = 'w-full' }) {
  return (
    <div
      className={`${height} ${width} bg-hover rounded animate-pulse ${className}`}
      data-testid="skeleton-loader"
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-card backdrop-blur-xl border border-border rounded-lg p-8" data-testid="card-skeleton">
      <div className="border-t-2 border-primary mb-6"></div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton height="h-7" width="w-7" className="rounded-full" />
      </div>
      <Skeleton height="h-10" width="w-32" className="mb-2" />
      <Skeleton height="h-4" width="w-24" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 p-6" data-testid="table-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton height="h-6" width="w-24" />
          <Skeleton height="h-6" width="w-32" />
          <Skeleton height="h-6" width="w-32" />
          <Skeleton height="h-6" width="w-20" />
          <Skeleton height="h-6" width="w-40" />
          <Skeleton height="h-6" width="w-16" />
        </div>
      ))}
    </div>
  )
}
