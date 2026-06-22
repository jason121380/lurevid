"use client";

import { Activity, BarChart3, LogOut, Settings } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { ListGroup, ListRow } from "@/components/ui/ListRow";

export default function MePage() {
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user?.isAdmin);
  const email = session?.user?.email || "";
  const initial = (email[0] || "?").toUpperCase();

  return (
    <div className="min-h-dvh bg-[var(--warm-white)]">
      <TopAppBar title="我的" align="left" />

      <div className="mx-auto max-w-content space-y-5 px-4 py-5">
        <div className="surface flex items-center gap-4 p-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-orange text-lg font-semibold text-white">{initial}</div>
          <div className="min-w-0">
            <div className="text-[12px] text-[var(--gray-400)]">目前使用中的帳號</div>
            <div className="truncate text-[15px] text-[var(--black)]">{email || "未取得 email"}</div>
          </div>
        </div>

        {isAdmin && (
          <div>
            <div className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-[var(--gray-400)]">管理員</div>
            <ListGroup>
              <ListRow
                href="/health"
                leading={<span className="grid h-9 w-9 place-items-center rounded-full bg-orange-bg text-orange"><Activity size={17} /></span>}
                title="健康檢查"
                subtitle="系統與資源狀態"
              />
              <ListRow
                href="/usage"
                leading={<span className="grid h-9 w-9 place-items-center rounded-full bg-orange-bg text-orange"><BarChart3 size={17} /></span>}
                title="用量"
                subtitle="API 用量與預估花費"
              />
              <ListRow
                href="/settings"
                leading={<span className="grid h-9 w-9 place-items-center rounded-full bg-orange-bg text-orange"><Settings size={17} /></span>}
                title="設定"
                subtitle="OpenAI、Seedance、R2 金鑰"
              />
            </ListGroup>
          </div>
        )}

        <ListGroup>
          <ListRow
            onClick={() => signOut({ callbackUrl: "/login" })}
            chevron={false}
            leading={<span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--gray-500)]"><LogOut size={17} /></span>}
            title={<span className="text-[var(--gray-600)]">登出</span>}
          />
        </ListGroup>
      </div>
    </div>
  );
}
