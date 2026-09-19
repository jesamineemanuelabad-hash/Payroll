"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import payrollLogo from "@/Payroll-logo-removebg.png";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SignOutDialog } from "@/components/auth/sign-out-confirmation";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronDown,
  Command,
  ReceiptText,
  HeartPulse,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: LucideIcon;
  href?: Route;
  roles?: string[];
};

const payrollItems: NavItem[] = [
  { label: "Employee & Attendance", icon: Fingerprint, href: "/payroll-benefits/attendance" },
  { label: "Payroll Management", icon: WalletCards, href: "/payroll-benefits/payroll" },
  { label: "Compensation Planning", icon: BriefcaseBusiness, href: "/payroll-benefits/compensation" },
  { label: "Claims & Reimbursement", icon: ReceiptText, href: "/payroll-benefits/claims" },
  { label: "HMO & Benefits", icon: HeartPulse, href: "/payroll-benefits/benefits" },
  { label: "HR Analytics", icon: BarChart3, href: "/payroll-benefits/analytics", roles: ["super_admin", "hr_admin", "payroll_manager", "hr_manager"] },
];

const commandItems: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/overview", roles: ["super_admin", "hr_admin", "payroll_manager", "hr_manager"] },
  { label: "People", icon: UsersRound, href: "/payroll-benefits/people" },
  ...payrollItems,
];

const isVisible = (item: NavItem, roles: string[]) => !item.roles || item.roles.some((role) => roles.includes(role));

function ProductMark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex h-16 items-center gap-2.5 border-b border-slate-200", collapsed ? "justify-center px-0" : "px-4")}>
      <span className="block size-[34px] shrink-0 overflow-hidden rounded-md" aria-hidden="true">
        <Image src={payrollLogo} alt="" priority className="h-[34px] w-auto max-w-none" sizes="90px" />
      </span>
      {!collapsed && <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em] text-slate-950">Payroll & Benefits</span>}
    </div>
  );
}

function SidebarContent({ collapsed, onNavigate, userEmail, roles }: { collapsed?: boolean; onNavigate?: () => void; userEmail?: string; roles: string[] }) {
  const pathname = usePathname();
  const visiblePayrollItems = payrollItems.filter((item) => isVisible(item, roles));
  const showOverview = roles.some((role) => ["super_admin", "hr_admin", "payroll_manager", "hr_manager"].includes(role));
  const peopleActive = pathname.startsWith("/payroll-benefits/people");

  return (
    <div className="flex h-full flex-col">
      <ProductMark collapsed={collapsed} />
      <div className="px-3 py-3">
        <div className={cn("flex min-h-10 w-full items-center rounded-lg border border-slate-200 bg-white text-left shadow-sm", collapsed ? "h-10 justify-center px-0" : "gap-2.5 px-2.5 py-2")}>
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-700">PHL</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 whitespace-normal text-[11px] font-medium leading-4 text-slate-800">Priority Handling Logistics, Inc.</span>
            </>
          )}
        </div>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 pb-4">
        {showOverview && <Link href="/overview" className={cn("relative flex h-9 w-full items-center rounded-lg text-sm transition", collapsed ? "justify-center" : "gap-3 px-2.5", pathname === "/overview" ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")} aria-label="Overview" title={collapsed ? "Overview" : undefined} onClick={onNavigate}>
          {pathname === "/overview" && !collapsed && <span className="absolute -left-0 h-5 w-0.5 rounded-r bg-indigo-600" />}
          <LayoutDashboard className="size-[18px] shrink-0" />
          {!collapsed && <span>Overview</span>}
        </Link>}
        <Link href="/payroll-benefits/people" className={cn("relative mt-0.5 flex h-9 w-full items-center rounded-lg text-sm transition", collapsed ? "justify-center" : "gap-3 px-2.5", peopleActive ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")} aria-label="People" title={collapsed ? "People" : undefined} onClick={onNavigate}>
          {peopleActive && !collapsed && <span className="absolute -left-3 h-5 w-0.5 rounded-r bg-indigo-600" />}
          <UsersRound className="size-[18px] shrink-0" />
          {!collapsed && <span>People</span>}
        </Link>

        <div className="my-4 h-px bg-slate-200" />
        {!collapsed && <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Payroll & Benefits</p>}
        {visiblePayrollItems.map((item) => {
          const active = item.href ? pathname.startsWith(item.href) : false;
          const Icon = item.icon;
          const classes = cn(
            "relative mb-0.5 flex h-9 w-full items-center rounded-lg text-sm transition",
            collapsed ? "justify-center" : "gap-3 px-2.5",
            active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            !item.href && "cursor-default",
          );

          if (item.href) {
            return (
              <Link key={item.label} href={item.href} onClick={onNavigate} className={classes} title={collapsed ? item.label : undefined}>
                {active && !collapsed && <span className="absolute -left-3 h-5 w-0.5 rounded-r bg-indigo-600" />}
                <Icon className="size-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          }

          return (
            <button key={item.label} className={classes} title={collapsed ? `${item.label} · coming next` : "Planned for a later increment"} aria-disabled="true">
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  <span className="size-1.5 rounded-full bg-slate-300" aria-hidden="true" />
                </>
              )}
            </button>
          );
        })}
        {roles.includes("super_admin") && <><div className="my-4 h-px bg-slate-200" />{!collapsed && <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Administration</p>}<Link href="/settings/access" onClick={onNavigate} className={cn("relative flex h-9 w-full items-center rounded-lg text-sm transition",collapsed?"justify-center":"gap-3 px-2.5",pathname.startsWith("/settings/access")?"bg-indigo-50 font-medium text-indigo-700":"text-slate-600 hover:bg-slate-100 hover:text-slate-900")} title={collapsed?"Access control":undefined}><ShieldCheck className="size-[18px] shrink-0"/>{!collapsed&&<span>Access control</span>}</Link><Link href="/settings/payroll-policy" onClick={onNavigate} className={cn("relative mt-0.5 flex h-9 w-full items-center rounded-lg text-sm transition",collapsed?"justify-center":"gap-3 px-2.5",pathname.startsWith("/settings/payroll-policy")?"bg-indigo-50 font-medium text-indigo-700":"text-slate-600 hover:bg-slate-100 hover:text-slate-900")} title={collapsed?"Payroll policy":undefined}><SlidersHorizontal className="size-[18px] shrink-0"/>{!collapsed&&<span>Payroll policy</span>}</Link></>}
      </nav>

      {!collapsed && (
        <div className="m-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-800">Payroll workspace</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Maintain records and review draft payroll entries before processing.</p>
        </div>
      )}
      <Link href="/settings/profile" aria-label="Account settings" className={cn("flex h-16 items-center border-t border-slate-200 hover:bg-slate-50", collapsed ? "justify-center" : "gap-2.5 px-3")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">{userEmail?.slice(0, 2).toUpperCase() ?? "PB"}</span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="break-all text-xs font-medium text-slate-900">{userEmail ?? "Workspace preview"}</p>
            <p className="text-xs text-slate-500">{userEmail ? "Signed in" : "Not signed in"}</p>
          </div>
        )}
        {!collapsed && <Settings className="size-4 shrink-0 text-slate-400" />}
      </Link>
    </div>
  );
}

export function DashboardShell({ children, userEmail, userInitials, userName, roles = [] }: { children: React.ReactNode; userEmail?: string; userInitials?: string; userName?: string; roles?: string[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [signOutOpen, setSignOutOpen] = useState(false);
  const filteredCommands = commandItems.filter((item) => isVisible(item, roles) && item.label.toLowerCase().includes(commandQuery.toLowerCase()));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white transition-[width] duration-200 lg:block", collapsed ? "w-[72px]" : "w-[248px]")}>
        <SidebarContent collapsed={collapsed} userEmail={userEmail} roles={roles} />
        <button
          onClick={() => setCollapsed((value) => !value)}
          className="absolute -right-3 top-20 grid size-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/35" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[280px] bg-white shadow-xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} userEmail={userEmail} roles={roles} />
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close navigation">
              <X className="size-4" />
            </button>
          </aside>
        </div>
      )}

      {commandOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
          <button className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={() => setCommandOpen(false)} aria-label="Close command menu" />
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4">
              <Search className="size-5 text-slate-400" />
              <input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search pages and actions…" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400" />
              <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400">ESC</kbd>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Navigate</p>
              {filteredCommands.map((item) => { const Icon = item.icon; return item.href ? <Link key={item.label} href={item.href} onClick={() => { setCommandOpen(false); setCommandQuery(""); }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"><span className="grid size-8 place-items-center rounded-lg bg-slate-100"><Icon className="size-4" /></span><span className="flex-1">{item.label}</span><span className="text-[10px] text-slate-400">Open</span></Link> : null; })}
              {!filteredCommands.length && <div className="px-4 py-10 text-center"><Command className="mx-auto size-5 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">No matching workspace</p><p className="mt-1 text-xs text-slate-400">Try payroll, attendance, benefits, or analytics.</p></div>}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-400"><span>Payroll & Benefits command menu</span><span>⌘K to open · ESC to close</span></div>
          </div>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]")}>
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="mr-3 grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <div className="relative hidden w-full max-w-[340px] sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <button onClick={() => setCommandOpen(true)} aria-label="Search workspace" className="h-9 w-full rounded-lg border border-transparent bg-slate-100 pl-9 pr-14 text-left text-sm text-slate-400 transition hover:border-slate-200 hover:bg-white">Search people, payroll, or claims…</button>
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">⌘ K</kbd>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {userEmail ? <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" aria-label="Open user menu" className="flex h-10 items-center gap-2 rounded-xl px-1.5 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{userInitials ?? userEmail.slice(0,2).toUpperCase()}</span><ChevronDown className="hidden size-3.5 sm:block" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <div className="px-2.5 py-2"><p className="truncate text-sm font-medium text-slate-900">{userName ?? userEmail}</p><p className="truncate text-xs text-slate-500">{userEmail}</p></div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/settings/profile"><Settings />Profile & settings</Link></DropdownMenuItem>
                {roles.includes("super_admin") && <DropdownMenuItem asChild><Link href="/settings/access"><ShieldCheck />Access control</Link></DropdownMenuItem>}
                {roles.includes("super_admin") && <DropdownMenuItem asChild><Link href="/settings/payroll-policy"><SlidersHorizontal />Payroll policy</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSignOutOpen(true)}><LogOut />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> : <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>}
          </div>
        </header>
        <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
