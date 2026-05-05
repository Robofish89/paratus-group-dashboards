// @repo/ui - shared component library

// Utilities
export { cn } from "./lib/utils";

// Components
export { Badge } from "./components/badge";
export type { BadgeProps } from "./components/badge";
export { Button } from "./components/button";
export type { ButtonProps } from "./components/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/card";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/dropdown-menu";
export { Input } from "./components/input";
export { Label } from "./components/label";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/select";
export { Separator } from "./components/separator";
export { Skeleton } from "./components/skeleton";
export { Toaster } from "./components/sonner";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/table";
export { Textarea } from "./components/textarea";

// Dashboard Components
export { TabBar } from "./components/tab-bar";
export type { TabBarProps, TabItem } from "./components/tab-bar";
export { MetricCard } from "./components/metric-card";
export type {
  MetricCardProps,
  MetricCardVariant,
  MetricCardAccent,
  MetricCardDelta,
} from "./components/metric-card";
export { SectionCard } from "./components/section-card";
export type { SectionCardProps } from "./components/section-card";
export { HorizontalBarChart } from "./components/horizontal-bar-chart";
export type { HorizontalBarChartProps, BarChartItem } from "./components/horizontal-bar-chart";
export { StatusBadge, STATUS_STYLES } from "./components/status-badge";
export type { StatusBadgeProps } from "./components/status-badge";
export { StatusPipeline } from "./components/status-pipeline";
export type { StatusPipelineProps, PipelineItem } from "./components/status-pipeline";
export { CallbackCard, categorizeReason, REASON_BADGE_STYLES, CHANNEL_BADGE_STYLES } from "./components/callback-card";
export type { CallbackCardProps } from "./components/callback-card";
export { OutageCard, SEVERITY_BADGE_STYLES } from "./components/outage-card";
export type { OutageCardProps } from "./components/outage-card";

// Layouts
export { AuthLayout } from "./layouts/auth-layout";
export type { AuthLayoutProps } from "./layouts/auth-layout";
export { DashboardLayout } from "./layouts/dashboard-layout";
export type {
  DashboardLayoutProps,
  NavItem,
  DashboardUser,
} from "./layouts/dashboard-layout";

// Onboarding constants
export { ONBOARDING_BASE_URL } from "./onboarding-urls";
