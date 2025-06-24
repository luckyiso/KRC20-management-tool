import * as React from "react"
import { useLocation, Link } from "react-router"
import { Gauge, MonitorUp, MonitorDown, BriefcaseBusiness, Wallet} from "lucide-react"

import {SettingsPopUp} from "@/components/settings.tsx";
import {
    Sidebar,
    SidebarContent, SidebarFooter, SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

// This is sample data.
const items = [
      {
        title: "Dashboard",
        route: "/",
        icon: Gauge,
      },
      {
        title: "Deploy tokens",
        route: "/deploy-tokens",
        icon: MonitorUp,
      },
      {
        title: "Mint tokens",
        route: "/mint-tokens",
        icon: MonitorDown,
      },
      {
        title: "Portfolio",
        route: "/portfolio",
        icon: BriefcaseBusiness,
      },
      {
        title: "Wallet manager",
        route: "/wallet-manager",
        icon: Wallet,
      },
    ]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const location = useLocation()
    const currentPath = location.pathname

    // Function to check if a route is active
    const isRouteActive = (route: string) => {
        return currentPath === route || currentPath.startsWith(`${route}/`)
    }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
      </SidebarHeader>
      <SidebarContent>
          <SidebarGroup>
              <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isRouteActive(item.route)} className="font-medium h-12">
                            <Link to={item.route}><item.icon/><span>{item.title}</span></Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
              </SidebarGroupContent>
          </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
          <SettingsPopUp/>
      </SidebarFooter>
    </Sidebar>
  )
}
