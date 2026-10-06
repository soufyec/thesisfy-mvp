"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { adminNav, NavItem, studentNav } from "@/lib/nav";
import { setMeCache, useUser } from "./useUser";
import { api, timeAgo } from "@/lib/client";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

export default function DashboardLayout({ children, navItems, fullBleed = false }: { children: React.ReactNode; navItems?: NavItem[]; fullBleed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, user, loading } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (me) setUnread(me.unreadNotifications);
  }, [me]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar_collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openNotifications = async () => {
    setNotifOpen((o) => !o);
    if (!notifOpen) {
      try {
        const data = await api<{ notifications: Notification[]; unread: number }>("/api/notifications");
        setNotifications(data.notifications);
        setUnread(data.unread);
      } catch {
        /* ignore */
      }
    }
  };

  const markAllRead = async () => {
    await api("/api/notifications", { method: "PATCH", json: {} }).catch(() => {});
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try {
      localStorage.removeItem("user");
    } catch {
      /* ignore */
    }
    setMeCache(null);
    router.push("/login");
  };

  if (!user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;

  const items = navItems || (user.role === "student" ? studentNav : adminNav);
  const mobileItems = items.filter((i) => i.mobile).slice(0, 5);
  const initials = user.avatar || user.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const isActive = (href: string) => (href === "/dashboard" || href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-50 ${collapsed ? "lg:w-[76px]" : "w-64"} w-72 bg-white border-r border-gray-100 flex flex-col transition-all duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className={`p-4 lg:p-5 border-b border-gray-100 flex items-center ${collapsed ? "lg:justify-center" : "justify-between"}`}>
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold truncate">
                Thesisfic<span className="text-brand-600">.edu</span>
              </span>
            )}
          </Link>
          <button className="lg:hidden text-gray-400" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} className={`${isActive(item.href) ? "sidebar-link-active" : "sidebar-link"} ${collapsed ? "lg:justify-center lg:px-0" : ""}`} onClick={() => setSidebarOpen(false)}>
              {item.icon}
              <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className={`flex items-center gap-3 mb-2 ${collapsed ? "lg:justify-center" : ""}`}>
            <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-sm font-semibold flex-shrink-0">{initials}</div>
            <div className={`flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-gray-500 truncate">{user.university}</div>
            </div>
          </div>
          <button onClick={handleLogout} className={`w-full flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1.5 ${collapsed ? "lg:justify-center" : ""}`}>
            <LogOut className="w-4 h-4" />
            <span className={collapsed ? "lg:hidden" : ""}>Sign out</span>
          </button>
          <button
            onClick={() => {
              setCollapsed((c) => {
                localStorage.setItem("sidebar_collapsed", c ? "0" : "1");
                return !c;
              });
            }}
            className="hidden lg:flex w-full items-center justify-center text-gray-300 hover:text-gray-500 mt-1"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 lg:h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 sticky top-0 z-30" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-gray-600" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="w-6 h-6" />
            </button>
            <Link href="/" className="lg:hidden font-bold">
              Thesisfic<span className="text-brand-600">.edu</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-gray-400 hidden sm:block capitalize">{user.role} account</span>
            <div className="relative" ref={notifRef}>
              <button onClick={openNotifications} className="relative p-2 text-gray-500 hover:text-gray-700" aria-label="Notifications">
                <Bell className="w-5 h-5" />
                {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-1 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold">Notifications</span>
                    <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                    {notifications.length === 0 && <div className="p-6 text-center text-sm text-gray-400">You&apos;re all caught up.</div>}
                    {notifications.map((n) => (
                      <Link
                        key={n.id}
                        href={n.link || "#"}
                        onClick={() => {
                          api("/api/notifications", { method: "PATCH", json: { id: n.id } }).catch(() => {});
                          setNotifOpen(false);
                        }}
                        className={`block px-4 py-3 hover:bg-gray-50 ${n.read ? "" : "bg-brand-50/40"}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === "flag" || n.type === "warning" ? "bg-amber-500" : n.type === "success" ? "bg-green-500" : n.type === "deadline" ? "bg-red-400" : "bg-brand-500"}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{n.title}</div>
                            <div className="text-xs text-gray-500 line-clamp-2">{n.message}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Link href={user.role === "student" ? "/dashboard/settings" : "/admin"} className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-xs font-semibold">
              {initials}
            </Link>
          </div>
        </header>

        <main className={`flex-1 ${fullBleed ? "" : "p-4 sm:p-6"} pb-24 lg:pb-6 overflow-x-hidden`}>{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 flex justify-around" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 py-2 px-2 min-w-[56px] text-[10px] ${isActive(item.href) ? "text-brand-600" : "text-gray-500"}`}>
            {item.icon}
            <span className="truncate max-w-[64px]">{item.label.replace("Settings & Privacy", "Settings").replace("Research copilot", "Copilot").replace("Integrity Flags", "Flags").replace("Research databases", "Databases").replace("AI access & billing", "AI billing")}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
