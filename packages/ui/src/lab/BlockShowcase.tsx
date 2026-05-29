import { ArrowLeft, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import type * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface BlockShowcaseProps {
  token: string;
}

const statusCards = [
  { label: "Healthy servers", value: "9", icon: CheckCircle2 },
  { label: "Needs auth", value: "3", icon: CircleAlert },
  { label: "Agent links", value: "2", icon: ShieldCheck },
] as const;

const inventoryRows = [
  ["filesystem", "stdio", "ok"],
  ["github", "http", "needs auth"],
  ["playwright", "stdio", "linked"],
] as const;

export function BlockShowcase({ token }: BlockShowcaseProps) {
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-border border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>Ratel</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Sidebar block</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Button
            onClick={() =>
              void navigate({ to: "/lab/kitchen", search: token ? { t: token } : {} })
            }
            size="sm"
            variant="outline"
          >
            <ArrowLeft />
            Kitchen sink
          </Button>
        </header>

        <main className="grid gap-4 p-4">
          <section className="grid gap-3">
            <div>
              <div className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                shadcn block
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-brand-green">
                Sidebar operations layout
              </h1>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {statusCards.map((card) => (
                <Card key={card.label} size="sm">
                  <CardHeader className="grid-cols-[1fr_auto]">
                    <CardTitle>{card.label}</CardTitle>
                    <card.icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="text-3xl font-semibold text-brand-green">
                    {card.value}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Card size="sm">
              <CardHeader className="grid-cols-[1fr_auto]">
                <CardTitle>Server inventory</CardTitle>
                <Button aria-label="Refresh" size="icon-sm" variant="outline">
                  <RefreshCw />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {inventoryRows.map(([name, transport, status]) => (
                    <div className="grid gap-1 p-3 sm:grid-cols-[1fr_auto] sm:items-center" key={name}>
                      <div className="font-medium">{name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {transport} · {status}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Dot Matrix loaders</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <LoaderRow label="Default">
                  <DotmSquare3
                    className="text-brand-green"
                    size={34}
                    dotSize={4.5}
                    speed={0.65}
                  />
                </LoaderRow>
                <LoaderRow label="Orange slow">
                  <DotmSquare3
                    className="text-brand-orange"
                    size={34}
                    dotSize={4.5}
                    speed={0.55}
                  />
                </LoaderRow>
                <LoaderRow label="Slow">
                  <DotmSquare3
                    className="text-brand-green"
                    size={34}
                    dotSize={4.5}
                    speed={0.45}
                  />
                </LoaderRow>
              </CardContent>
            </Card>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function LoaderRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
