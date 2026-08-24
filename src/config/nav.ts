import {
  BadgePercent,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FolderTree,
  Heart,
  Home,
  LayoutDashboard,
  LayoutGrid,
  MessageSquareQuote,
  Package,
  PenTool,
  Ruler,
  Scissors,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Exact-match highlighting (e.g. "/" and "/admin"). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/* ── Customer ───────────────────────────────────────────────────── */

/** Primary destinations shown in the customer header. */
export const customerPrimaryNav: NavItem[] = [
  { title: "Home", href: "/", icon: Home, exact: true },
  { title: "Shop", href: "/shop", icon: Store },
  { title: "Collections", href: "/collections", icon: LayoutGrid },
];

/** Personal shortcuts shown as header icons. */
export const customerActionNav: NavItem[] = [
  { title: "Wishlist", href: "/wishlist", icon: Heart },
  { title: "Cart", href: "/cart", icon: ShoppingCart },
  { title: "Account", href: "/account", icon: User },
];

/** Mobile bottom navigation — max five, thumb-friendly. */
export const customerBottomNav: NavItem[] = [
  { title: "Home", href: "/", icon: Home, exact: true },
  { title: "Shop", href: "/shop", icon: Store },
  { title: "Wishlist", href: "/wishlist", icon: Heart },
  { title: "Cart", href: "/cart", icon: ShoppingCart },
  { title: "Account", href: "/account", icon: User },
];

/* ── Admin ──────────────────────────────────────────────────────── */

export const adminNavGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { title: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
      { title: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { title: "Products", href: "/admin/products", icon: Package },
      { title: "Categories", href: "/admin/categories", icon: FolderTree },
      { title: "Collections", href: "/admin/collections", icon: LayoutGrid },
      { title: "Customers", href: "/admin/customers", icon: Users },
      { title: "Inventory", href: "/admin/inventory", icon: Boxes },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Stitching", href: "/admin/stitching", icon: Scissors },
      { title: "Appointments", href: "/admin/appointments", icon: CalendarDays },
      { title: "Custom Orders", href: "/admin/custom-orders", icon: Ruler },
      { title: "Alterations", href: "/admin/alterations", icon: ClipboardList },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Payments", href: "/admin/payments", icon: CreditCard },
      { title: "Quotes", href: "/admin/quotes", icon: MessageSquareQuote },
      { title: "Reviews", href: "/admin/reviews", icon: Star },
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Staff", href: "/admin/staff", icon: ShieldCheck },
      { title: "Content", href: "/admin/content", icon: PenTool },
      { title: "Offers", href: "/admin/offers", icon: BadgePercent },
      { title: "Settings", href: "/admin/settings", icon: Settings },
      { title: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
    ],
  },
];

/** Flat list of every admin destination (breadcrumbs, lookups). */
export const adminNavItems: NavItem[] = adminNavGroups.flatMap(
  (group) => group.items,
);
