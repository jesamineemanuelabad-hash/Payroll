export default function PayrollLoading() {
  return (
    <div aria-busy="true" aria-label="Loading payroll management">
      <div className="skeleton h-3 w-52 rounded" />
      <div className="mt-5 flex items-start justify-between">
        <div><div className="skeleton h-8 w-64 rounded" /><div className="skeleton mt-3 h-4 w-[480px] max-w-full rounded" /></div>
        <div className="hidden gap-2 sm:flex"><div className="skeleton h-9 w-32 rounded-lg" /><div className="skeleton h-9 w-40 rounded-lg" /></div>
      </div>
      <div className="mt-6 grid overflow-hidden rounded-xl border bg-white sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="border-r p-5"><div className="skeleton h-3 w-24 rounded" /><div className="skeleton mt-4 h-6 w-32 rounded" /><div className="skeleton mt-3 h-3 w-28 rounded" /></div>)}
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border bg-white">
        <div className="flex h-[72px] items-center justify-between border-b px-4"><div className="skeleton h-5 w-24 rounded" /><div className="skeleton h-9 w-72 rounded-lg" /></div>
        {Array.from({ length: 7 }).map((_, index) => <div key={index} className="flex h-[68px] items-center gap-8 border-b px-4"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-4 w-24 rounded" /><div className="skeleton h-4 w-20 rounded" /><div className="skeleton h-4 w-28 rounded" /><div className="skeleton h-6 w-24 rounded" /></div>)}
      </div>
    </div>
  );
}
