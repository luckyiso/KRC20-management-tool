import { Button } from "@/components/ui/button.tsx"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import { useEffect, useState} from "react";

interface RenameWalletProps {
    walletAddress: string;
    currentWalletName: string;
    isOpen: boolean;
    onClose: () => void;
}

export function RenameWallet({ walletAddress, currentWalletName, isOpen, onClose }: RenameWalletProps) {
    const [isRenamingWallet, setIsRenamingWallet] = useState(false);
    const [, setErrorRenamingWallet] = useState<string | null>(null);
    const [newNameInput, setNewNameInput] = useState(currentWalletName);

    useEffect(() => {
        if (isOpen) {
            setNewNameInput(currentWalletName);
            setErrorRenamingWallet(null);
        }
    }, [isOpen, currentWalletName]);

    const handleRenameSubmit = async () => {
        if (isRenamingWallet) return;
        const newName = newNameInput.trim();
        if (!newName) {
            setErrorRenamingWallet("Name cannot be empty.");
            return;
        }
        if (newName === currentWalletName) {
            setErrorRenamingWallet("New name cannot be the same as the current name.");
            return;
        }
        setIsRenamingWallet(true);
        setErrorRenamingWallet(null);
        try {
            if (window.electronAPI && window.electronAPI.renameWallet) {
                console.log(`RenameWallet: Calling electronAPI.renameWallet for ${walletAddress} to ${newName}`);
                const renameResult = await window.electronAPI.renameWallet(walletAddress, newName);
                if (renameResult.success) {
                    console.log("RenameWallet: Wallet renamed successfully!");
                    onClose();
                } else {
                    setErrorRenamingWallet(renameResult.error || "Unknown error during rename.");
                }
            } else {
                console.error("RenameWallet: Electron API method renameWallet not available in preload.");
                setErrorRenamingWallet("Application error: rename functionality not available.");
            }
        } catch (error: any) {
            console.error("RenameWallet: Error renaming wallet via IPC:", error);
            setErrorRenamingWallet(`Failed to rename wallet: ${error.message || String(error)}`);
        } finally {
            setIsRenamingWallet(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Rename wallet</DialogTitle>
                    <DialogDescription>
                        Enter a new name for the wallet
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="nameInput" className="text-right">
                            New name
                        </Label>
                        <Input id="nameInput" placeholder="New wallet name" className="col-span-3" value={newNameInput}
                               onChange={(e) => setNewNameInput(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" className="ml-auto"
                            onClick={handleRenameSubmit}
                            disabled={isRenamingWallet}
                    >
                        {isRenamingWallet ? 'Renaming...' : 'Rename wallet'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
