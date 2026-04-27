import { cn } from "../lib/utils";

const REASON_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Outage": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "Billing": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  "Recharge / Top-up": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  "WiFi / Router": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  "SIM / Number": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  "Service Issue": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "Follow-up": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "Product Query": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "General": { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
};

const CHANNEL_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Website: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  WhatsApp: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

interface CallbackCardProps {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  callbackReason?: string | null;
  channel?: string | null;
  createdAt: string;
  status: string;
  onCompleteCall?: (id: number) => void;
  className?: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categorizeReason(reason: string | null | undefined): string {
  if (!reason) return "General";
  const s = reason.toLowerCase();
  if (s.includes("follow-up") || s.includes("follow up") || s.includes("escalation") || s.includes("unresolved")) return "Follow-up";
  if (s.includes("outage") || s.includes("down") || s.includes("offline")) return "Outage";
  if (s.includes("bill") || s.includes("invoice") || s.includes("payment") || s.includes("refund") || s.includes("account")) return "Billing";
  if (s.includes("recharge") || s.includes("top up") || s.includes("top-up") || s.includes("topup") || s.includes("voucher") || s.includes("airtime") || s.includes("bundle") || s.includes("credit")) return "Recharge / Top-up";
  if (s.includes("wifi") || s.includes("wi-fi") || s.includes("router") || s.includes("hotspot") || s.includes("hifi") || s.includes("sky-fi") || s.includes("skyfi")) return "WiFi / Router";
  if (s.includes("sim ") || s.includes(" sim") || s.includes("esim") || s.includes("porting") || s.includes("divert")) return "SIM / Number";
  if (s.includes("product") || s.includes("price") || s.includes("plan") || s.includes("package") || s.includes("sign-up") || s.includes("signup")) return "Product Query";
  if (s.includes("service") || s.includes("install") || s.includes("fault") || s.includes("slow") || s.includes("connect") || s.includes("cable") || s.includes("technician") || s.includes("damage")) return "Service Issue";
  return "General";
}

function CallbackCard({
  id,
  name,
  phone,
  email,
  callbackReason,
  channel,
  createdAt,
  status,
  onCompleteCall,
  className,
}: CallbackCardProps) {
  const category = categorizeReason(callbackReason);
  const reasonStyle = REASON_BADGE_STYLES[category] ?? REASON_BADGE_STYLES["General"];
  const channelStyle = channel ? CHANNEL_BADGE_STYLES[channel] ?? CHANNEL_BADGE_STYLES["Website"] : null;

  const showCompleteButton = status === "pending" || status === "assigned" || status === "in_progress";

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col hover:shadow-md transition-shadow",
        className
      )}
    >
      {/* Header: Name + Reason Badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-[15px] font-bold text-slate-900 leading-tight">
          {name || "Unknown"}
        </h3>
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0",
            reasonStyle.bg,
            reasonStyle.text,
            reasonStyle.border
          )}
        >
          {category}
        </span>
      </div>

      {/* Contact Info */}
      <div className="space-y-2 flex-1">
        {phone && (
          <div className="flex items-center gap-2 text-[13px] text-slate-600">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            {phone}
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2 text-[13px] text-slate-600">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <span className="truncate">{email}</span>
          </div>
        )}
        {callbackReason && (
          <div className="flex items-start gap-2 text-[13px] text-slate-600">
            <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="line-clamp-2">{callbackReason}</span>
          </div>
        )}
      </div>

      {/* Footer: Channel + Timestamp */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        {channelStyle && (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
              channelStyle.bg,
              channelStyle.text,
              channelStyle.border
            )}
          >
            {channel}
          </span>
        )}
        <span className="text-[11px] text-slate-400">
          {formatTimestamp(createdAt)}
        </span>
      </div>

      {/* Complete Call Button */}
      {showCompleteButton && onCompleteCall && (
        <button
          onClick={() => onCompleteCall(id)}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg py-2.5 text-[13px] font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Complete Call
        </button>
      )}
    </div>
  );
}

export { CallbackCard, categorizeReason, REASON_BADGE_STYLES, CHANNEL_BADGE_STYLES };
export type { CallbackCardProps };
