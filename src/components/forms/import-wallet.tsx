import { Button } from "@/components/ui/button.tsx"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import {useState} from "react";



export function ImportWallet() {
    const [isImportingWallet, setIsImportingWallet] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [, setErrorImportingWallets] = useState<string | null>(null);
    const [keyInput, setKeyInput] = useState('');
    const [nameInput, setNameInput] = useState('');

    const handleImportWallet = async () => {
        console.log("Wallets: Create wallet button clicked");
        if (isImportingWallet) return;

        const key = keyInput.trim();
        const name = nameInput.trim();

        if (!key) {
            setErrorImportingWallets("Key/Mnemonic cannot be empty.");
            return;
        }
        setIsImportingWallet(true);
        setErrorImportingWallets(null);

        try {
            if (window.electronAPI.importWallet) {
                const importedWalletResult = await window.electronAPI.importWallet(key, name);
                console.log("Wallets: Wallet creation invoked. Waiting for 'wallets-updated' event to update UI...");

                if (importedWalletResult.success) {
                    console.log("Wallets: Wallet imported successfully!", importedWalletResult);
                    setKeyInput('');
                    setNameInput('');
                    setIsDialogOpen(false);
                } else {
                    setErrorImportingWallets(importedWalletResult.error || "Unknown error during import.");
                }
            } else {
                console.error("Wallets: Electron API method importWallet not available in preload.");
                setErrorImportingWallets("Application error: import functionality not available.");
            }
        } catch (error: any) {
            console.error("Wallets: Error importing wallet via IPC:", error);
            setErrorImportingWallets(`Failed to import wallet: ${error.message || String(error)}`);
        } finally {
            setIsImportingWallet(false);
        }
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Import wallet</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Import wallet</DialogTitle>
                    <DialogDescription>
                        Input mnemonic key or privatekey
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="keyInput" className="text-right">
                            Key/mnemonic
                        </Label>
                        <Input id="keyInput" placeholder="Privatekey or mnemonic phrase" className="col-span-3" value={keyInput}
                               onChange={(e) => setKeyInput(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="nameInput" className="text-right">
                            Name
                        </Label>
                        <Input id="nameInput" placeholder="Name" className="col-span-3" value={nameInput}
                               onChange={(e) => setNameInput(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" className="ml-auto"
                            onClick={handleImportWallet}
                            disabled={isImportingWallet}
                    >
                        {isImportingWallet ? 'Importing...' : 'Import wallet'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
