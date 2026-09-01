export default function AnalyticsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading HR analytics">
      <div className="skeleton h-3 w-52 rounded" /><div className="skeleton mt-5 h-8 w-48 rounded" /><div className="skeleton mt-3 h-4 w-[560px] max-w-full rounded" />
      <div className="skeleton mt-6 h-[86px] rounded-xl" />
      <div className="mt-6 grid overflow-hidden rounded-xl border bg-white sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div className="border-r p-5" key={index}><div className="skeleton h-3 w-28 rounded" /><div className="skeleton mt-4 h-6 w-36 rounded" /><div className="skeleton mt-3 h-3 w-28 rounded" /></div>)}</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.85fr]"><div className="skeleton h-[390px] rounded-xl" /><div className="skeleton h-[390px] rounded-xl" /></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2"><div className="skeleton h-[330px] rounded-xl" /><div className="skeleton h-[330px] rounded-xl" /></div>
    </div>
  );
}
