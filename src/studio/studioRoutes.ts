import {
  BarChart3,
  Bot,
  LayoutDashboard,
  Megaphone,
  PhoneCall,
  Plug,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface StudioRoute {
  path: string;
  label: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
}

export const STUDIO_ROUTES: StudioRoute[] = [
  {
    path: "/studio/overview",
    label: "Overview",
    title: "Overview",
    blurb: "Workspace health at a glance.",
    icon: LayoutDashboard,
  },
  {
    path: "/studio/agents",
    label: "AI Agents",
    title: "AI Agents",
    blurb: "Configure, test and publish voice agents.",
    icon: Bot,
  },
  {
    path: "/studio/sessions",
    label: "Voice Sessions",
    title: "Voice Sessions",
    blurb: "Every conversation the platform handled.",
    icon: PhoneCall,
  },
  {
    path: "/studio/campaigns",
    label: "Campaigns",
    title: "Campaigns",
    blurb: "Outbound run planning. Calling is not enabled.",
    icon: Megaphone,
  },
  {
    path: "/studio/analytics",
    label: "Analytics",
    title: "Analytics",
    blurb: "Volumes, minutes, language mix, agent performance.",
    icon: BarChart3,
  },
  {
    path: "/studio/integrations",
    label: "Integrations",
    title: "Integrations",
    blurb: "Telephony, CRM, payments and Jordan fintech rails.",
    icon: Plug,
  },
  {
    path: "/studio/settings",
    label: "Settings",
    title: "Settings",
    blurb: "Organization, roles and environment.",
    icon: Settings,
  },
];

export const DEFAULT_STUDIO_PATH = STUDIO_ROUTES[0].path;

export const routeFor = (pathname: string): StudioRoute =>
  STUDIO_ROUTES.find((r) => pathname.startsWith(r.path)) ?? STUDIO_ROUTES[0];
