import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import { Switch} from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Outlet } from "react-router"

export default function Dashboard() {
    return (
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <span>Testnet</span>
                        <Switch/>
                        <span>Mainnet</span>
                    </header>
                    <div className="flex flex-1 flex-col gap-4 p-4">
                        <Outlet/>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    )
}
