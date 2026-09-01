export default function PayrollBenefitsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading payroll and benefits workspace">
      <div className="skeleton h-3 w-52 rounded" /><div className="skeleton mt-5 h-8 w-72 rounded" /><div className="skeleton mt-3 h-4 w-[560px] max-w-full rounded" />
      <div className="mt-6 grid overflow-hidden rounded-xl border bg-white sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div className="border-r p-5" key={index}><div className="skeleton h-3 w-28 rounded" /><div className="skeleton mt-4 h-6 w-24 rounded" /><div className="skeleton mt-3 h-3 w-32 rounded" /></div>)}</div>
      <div className="skeleton mt-6 h-[76px] rounded-xl" /><div className="mt-6 overflow-hidden rounded-xl border bg-white"><div className="skeleton m-4 h-9 w-72 rounded-lg" />{Array.from({ length: 6 }).map((_, index) => <div className="flex h-[68px] items-center gap-8 border-t px-4" key={index}><div className="skeleton h-8 w-44 rounded" /><div className="skeleton h-4 w-28 rounded" /><div className="skeleton h-4 w-24 rounded" /><div className="skeleton h-6 w-24 rounded" /></div>)}</div>
    </div>
  );
}
