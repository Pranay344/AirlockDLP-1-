
"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  ShieldAlert,
  FileText,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase"
import { collection, query } from "firebase/firestore"

import Logo from "@/components/common/Logo"
import { PageHeader } from "@/components/common/PageHeader"

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/incidents", icon: ShieldAlert, label: "Incidents" },
  { href: "/dashboard/policies", icon: FileText, label: "Policy Packs" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isUserLoading } = useUser()
  const firestore = useFirestore()

  const pageTitle =
    navItems.find((item) => pathname.startsWith(item.href))?.label || "Dashboard"

  const incidentsQuery = useMemoFirebase(() => {
    if (!user) return null
    return query(collection(firestore, 'event_logs'))
  }, [firestore, user])

  const { data: incidents } = useCollection(incidentsQuery)
  
  React.useEffect(() => {
    // If loading is finished and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);

  // While loading, we can show a loader or an empty layout
  if (isUserLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Logo />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                      {item.href === "/dashboard/incidents" &&
                        incidents && (
                          <div className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-accent px-1.5 text-xs font-medium text-sidebar-accent-foreground">
                            {incidents.length}
                          </div>
                        )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <div className="flex flex-1 flex-col bg-background">
          <PageHeader title={pageTitle} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
