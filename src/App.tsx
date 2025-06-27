import { AppSidebar } from "@/components/app-sidebar"
import { Switch} from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {CreatePasswordForm} from "@/components/forms/create-password.tsx"
import {LoginPasswordForm} from "@/components/forms/login.tsx";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Outlet } from "react-router"
import { useState, useEffect } from 'react'


export default function Main() {
    const [isMainnet, setIsMainnet] = useState(false);
    const [isNetworkSwitching, setIsNetworkSwitching] = useState(false);
    const [appState, setAppState] = useState<'loading' | 'create-password' | 'login' | 'dashboard'>('loading');
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.getInitialNetwork()
                .then(initialNetwork => {
                    const isMainnetInitial = initialNetwork === 'mainnet';
                    setIsMainnet(isMainnetInitial);
                    window.electronAPI?.getWallets()
                    console.log(`Dashboard: Initial network loaded: ${initialNetwork}`);
                })
                .catch(err => {
                    console.error('Dashboard: Failed to get initial network from main process:', err);
                });
            const unsubscribe = window.electronAPI.onAppStateUpdate((state) => {
                console.log(`Received app state update: ${state}`);
                setAppState(state);
            });
            return () => {
                console.log("Cleaning up app state update listener...");
                unsubscribe();
            };
        }
    }, []);

    const handleNetworkChange = async (checked: boolean) => {
        const newNetwork = checked ? 'mainnet' : 'testnet';
        console.log(`Switch toggled, attempting to set network to: ${newNetwork}`);

        if (window.electronAPI) {
            setIsNetworkSwitching(true);
            try {
                await window.electronAPI.setNetwork(newNetwork);
                console.log(setIsNetworkSwitching)
                setIsMainnet(checked);
            } catch (err: any) {
                console.error('Failed to set network in main process:', err);
            } finally {
                setIsNetworkSwitching(false);
                console.log(isNetworkSwitching)
            }
        } else {
            console.warn('Electron IPC API (window.electronAPI) not available. Cannot change network.');
            setIsMainnet(!checked);
        }
    };

    if (appState === 'create-password') {
        return (
            <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-sm">
                    <CreatePasswordForm/>
                </div>
            </div>
        )
    }
    if (appState === 'login') {
        return (
            <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-sm">
                    <LoginPasswordForm/>
                </div>
            </div>
        )
    }
    if (appState === 'dashboard') {
        console.log(isNetworkSwitching);
        return <div className={`${isNetworkSwitching ? 'pointer-events-none' : ''}`}>
            <SidebarProvider>
                <AppSidebar/>
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger className="-ml-1"/>
                        <Separator orientation="vertical" className="mr-2 h-4"/>
                        <span>Testnet</span>
                        <Switch
                            checked={isMainnet}
                            onCheckedChange={handleNetworkChange}
                            disabled={isNetworkSwitching}
                        />
                        <span>Mainnet</span>
                    </header>
                    <div
                        className={`flex flex-1 flex-col gap-4 p-4 relative ${isNetworkSwitching ? 'blur-sm' : ''}`}>
                        <Outlet/>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </div>
    }
}
