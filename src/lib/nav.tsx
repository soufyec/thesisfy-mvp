import { BarChart3, BookOpen, Bot, CreditCard, FileBarChart, FileText, Flag, LayoutDashboard, Library, Plug, Settings, ShieldCheck, Users, Inbox } from "lucide-react";

export interface NavItem {
  /** i18n key, rendered with `t(item.label)`. */
  label: string;
  /** Optional shorter i18n key for the mobile bottom bar. */
  shortLabel?: string;
  href: string;
  icon: React.ReactNode;
  mobile?: boolean; // shown in the mobile bottom bar
  /** Administrators only (professors share the rest of the admin navigation). */
  adminOnly?: boolean;
}

const cls = "w-5 h-5";

export const studentNav: NavItem[] = [
  { label: "dashboard.nav.dashboard", href: "/dashboard", icon: <LayoutDashboard className={cls} />, mobile: true },
  { label: "dashboard.nav.theses", href: "/dashboard/theses", icon: <FileText className={cls} />, mobile: true },
  { label: "dashboard.nav.copilot", shortLabel: "dashboard.nav.short.copilot", href: "/dashboard/ai-chat", icon: <Bot className={cls} />, mobile: true },
  { label: "dashboard.nav.library", shortLabel: "dashboard.nav.short.library", href: "/dashboard/library", icon: <Library className={cls} />, mobile: true },
  { label: "dashboard.nav.analytics", href: "/dashboard/analytics", icon: <BarChart3 className={cls} /> },
  { label: "dashboard.nav.connections", href: "/dashboard/connections", icon: <Plug className={cls} /> },
  { label: "dashboard.nav.settings", shortLabel: "dashboard.nav.short.settings", href: "/dashboard/settings", icon: <Settings className={cls} />, mobile: true },
];

export const adminNav: NavItem[] = [
  { label: "dashboard.nav.overview", href: "/admin", icon: <LayoutDashboard className={cls} />, mobile: true },
  { label: "dashboard.nav.allTheses", href: "/admin/theses", icon: <BookOpen className={cls} />, mobile: true },
  { label: "dashboard.nav.students", href: "/admin/students", icon: <Users className={cls} />, mobile: true },
  { label: "dashboard.nav.notices", shortLabel: "dashboard.nav.short.notices", href: "/admin/flags", icon: <Flag className={cls} />, mobile: true },
  { label: "dashboard.nav.policies", href: "/admin/policies", icon: <ShieldCheck className={cls} /> },
  { label: "dashboard.nav.aiAccess", shortLabel: "dashboard.nav.short.aiAccess", href: "/admin/ai-access", icon: <CreditCard className={cls} /> },
  { label: "dashboard.nav.library", shortLabel: "dashboard.nav.short.library", href: "/admin/library", icon: <Library className={cls} /> },
  { label: "report.nav.title", href: "/admin/report", icon: <FileBarChart className={cls} /> },
  { label: "admin.leads.nav", href: "/admin/pilot-requests", icon: <Inbox className={cls} />, adminOnly: true },
  { label: "lti.nav", shortLabel: "lti.nav.short", href: "/admin/integrations", icon: <Plug className={cls} />, adminOnly: true },
];
