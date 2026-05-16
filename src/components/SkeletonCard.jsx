export default function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="h-4 w-3/4 rounded bg-gray-200" />
      <div className="h-4 w-full rounded bg-gray-200" />
      <div className="h-4 w-5/6 rounded bg-gray-200" />
      <div className="mt-4 space-y-2">
        {['A', 'B', 'C', 'D'].map((l) => (
          <div key={l} className="flex items-center gap-2">
            <div className="h-4 w-6 rounded bg-gray-200" />
            <div className="h-4 flex-1 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
