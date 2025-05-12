import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from '@/components/ui/label'
import { ModeToggle } from "@/components/theme-toggle.tsx"
import { Settings } from "lucide-react";
import {SidebarMenuButton} from "@/components/ui/sidebar.tsx";

export function SettingsPopUp() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <SidebarMenuButton className="font-medium">
                    <Settings />
                    <span>Settings</span>
                </SidebarMenuButton>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            Theme
                        </Label>
                        <ModeToggle />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit">Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
