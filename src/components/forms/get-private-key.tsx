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
import {useEffect, useState} from "react";
import * as React from "react";

interface GetPrivateKeyProps {
    walletAddress: string; // Адрес кошелька, для которого получаем приватный ключ
    isOpen: boolean; // Управляем видимостью диалога извне
    onClose: () => void; // Функция для закрытия диалога извне
}

export function GetPrivateKey({ walletAddress, isOpen, onClose }: GetPrivateKeyProps) {
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Если диалог открыт и адрес кошелька есть, пробуем получить приватный ключ
        if (isOpen && walletAddress) {
            const fetchPrivateKey = async () => {
                setIsLoading(true);
                setError(null);
                setPrivateKey(null); // Сбрасываем предыдущий ключ

                try {
                    if (window.electronAPI && window.electronAPI.getPrivateKeys) {
                        console.log(`GetPrivateKey: Requesting private key for address: ${walletAddress}`);
                        // Запрашиваем ключи для одного адреса
                        const keysArray = await window.electronAPI.getPrivateKeys([walletAddress]);
                        const keysMap = new Map<string, string>(keysArray); // <--- Конвертируем обратно в Map
                        const fetchedKey = keysMap.get(walletAddress);
                        if (fetchedKey) {
                            setPrivateKey(fetchedKey);
                            console.log(`GetPrivateKey: Private key fetched for ${walletAddress}`);
                        } else {
                            setError(`Private key not found for address: ${walletAddress}`);
                            console.error(`GetPrivateKey: Private key not found for address: ${walletAddress}`);
                        }
                    } else {
                        setError("Electron API method getPrivateKeysForAddresses not available.");
                        console.error("GetPrivateKey: Electron API method getPrivateKeysForAddresses not available.");
                    }
                } catch (err: any) {
                    setError(`Failed to retrieve private key: ${err.message || String(err)}`);
                    console.error("GetPrivateKey: Error fetching private key via IPC:", err);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchPrivateKey();
        }
    }, [isOpen, walletAddress]);

    const handleCopy = () => {
        if (privateKey) {
            navigator.clipboard.writeText(privateKey)
                .catch(err => {
                    console.error("Error copying private key:", err);
                });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Private key</DialogTitle>
                    <DialogDescription>
                        Your private key. WARNING: Don't share with anyone
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        {isLoading ? (
                            <Input disabled value="Loading private key..." className="col-span-4" />
                        ) : error ? (
                            <Input disabled value={`Error: ${error}`} className="col-span-4 text-red-500" />
                        ) : (
                            <Input
                                readOnly
                                id="privateKeyInput"
                                className="col-span-4"
                                value={privateKey || "No private key found."}
                            />
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        onClick={handleCopy}
                        disabled={!privateKey || isLoading} // Отключаем кнопку, если нет ключа или идет загрузка
                    >
                        Copy
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
