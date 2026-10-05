import { BarChart3, BookOpen, Bot, FileText, Flag, LayoutDashboard, Library, Plug, Settings, ShieldCheck, Users } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  mobile?: boolean; // shown in the mobile bottom bar
}

const cls = "w-5 h-5";

export const studentNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className={cls} />, mobile: true },
  { label: "My Theses", href: "/dashboard/theses", icon: <FileText className={cls} />, mobile: true },
  { label: "AI Assistant", href: "/dashboard/ai-chat", icon: <Bot className={cls} />, mobile: true },
  { label: "Research databases", href: "/dashboard/library", icon: <Library className={cls} />, mobile: true },
  { label: "Analytics", href: "/dashboard/analytics", icon: <BarChart3 className={cls} /> },
  { label: "AI Connections", href: "/dashboard/connections", icon: <Plug className={cls} /> },
  { label: "Settings & Privacy", href: "/dashboard/settings", icon: <Settings className={cls} />, mobile: true },
];

export const adminNav: NavItem[] = [
  { label: "Overview", href: "/admin", icon: <LayoutDashboard className={cls} />, mobile: true },
  { label: "All Theses", href: "/admin/theses", icon: <BookOpen className={cls} />, mobile: true },
  { label: "Students", href: "/admin/students", icon: <Users className={cls} />, mobile: true },
  { label: "Integrity Flags", href: "/admin/flags", icon: <Flag className={cls} />, mobile: true },
  { label: "AI Policies", href: "/admin/policies", icon: <ShieldCheck className={cls} /> },
  { label: "Research databases", href: "/admin/library", icon: <Library className={cls} /> },
];
