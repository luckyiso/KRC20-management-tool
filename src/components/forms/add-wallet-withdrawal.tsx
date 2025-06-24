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
import {createRef, useState} from "react";
import * as React from "react";



export function AddWithdrawalAddressWindow() {
    const [isImportingWallet, setIsImportingWallet] = useState(false); // Состояние для кнопки "Create wallet"
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [errorImportingWallets, setErrorImportingWallets] = useState<string | null>(null); // Сообщение об ошибке загрузки
    const [keyInput, setKeyInput] = useState('');   // <--- Новое состояние для ключа
    const [nameInput, setNameInput] = useState('');

    const handleImportWallet = async () => {
        console.log("Wallets: Create wallet button clicked");
        if (isImportingWallet) return; // Предотвращаем повторные клики во время создания

        const key = keyInput.trim();
        const name = nameInput.trim();

        if (!key) {
            setErrorImportingWallets("Key/Mnemonic cannot be empty.");
            return;
        }
        setIsImportingWallet(true); // Включаем индикатор загрузки на кнопке
        setErrorImportingWallets(null); // Сбрасываем ошибки, связанные с загрузкой/созданием кошелька

        try {
            if (window.electronAPI.addWallet) {
                const importedWalletResult = await window.electronAPI.addWallet(key, name);
                console.log("Wallets: Wallet creation invoked. Waiting for 'wallets-updated' event to update UI...");

                if (importedWalletResult.success) {
                    console.log("Wallets: Wallet imported successfully!", importedWalletResult);
                    setKeyInput(''); // Очищаем поле ввода
                    setNameInput(''); // Очищаем поле имени
                    setIsDialogOpen(false); // Закрываем диалог при успехе
                } else {
                    // Если IPC вернул { success: false, error: ... }
                    setErrorImportingWallets(importedWalletResult.error || "Unknown error during import.");
                }
            } else {
                console.error("Wallets: Electron API method importWallet not available in preload.");
                setErrorImportingWallets("Application error: import functionality not available.");
            }
        } catch (error: any) {
            // Это поймает ошибки, если что-то пошло не так с самим вызовом IPC
            console.error("Wallets: Error importing wallet via IPC:", error);
            setErrorImportingWallets(`Failed to import wallet: ${error.message || String(error)}`);
        } finally {
            setIsImportingWallet(false);
        }
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Add wallet</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <div className="grid gap-4 py-4">
                    {/*{errorImportingWallets && (*/}
                    {/*    <p className="text-red-500 text-sm col-span-4 text-center">*/}
                    {/*        {errorImportingWallets}*/}
                    {/*    </p>*/}
                    {/*)}*/}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="keyInput" className="text-right">
                            Address
                        </Label>
                        <Input id="keyInput" placeholder="Address" className="col-span-3" value={keyInput} // <--- Привязываем значение к состоянию
                               onChange={(e) => setKeyInput(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="nameInput" className="text-right">
                            Name
                        </Label>
                        <Input id="nameInput" placeholder="Name" className="col-span-3" value={nameInput} // <--- Привязываем значение к состоянию
                               onChange={(e) => setNameInput(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" className="ml-auto"
                            onClick={handleImportWallet} // Привязываем обработчик создания
                            disabled={isImportingWallet} // Отключаем во время создания
                    >
                        {isImportingWallet ? 'Adding wallet...' : 'Add wallet'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
