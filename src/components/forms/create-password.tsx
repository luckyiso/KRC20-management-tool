import * as React from "react"
import { useState } from 'react';
import { cn } from "@/lib/utils.ts"
import { Button } from "@/components/ui/button.tsx"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"

export function CreatePasswordForm({
                              className,
                              ...props
                          }: React.ComponentPropsWithoutRef<"div">) {

    const [password, setPassword] = useState('');
    const [repeatPassword, setRepeatPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        setError(null);

        if (password !== repeatPassword) {
            setError("Passwords do not match.");
            return;
        }
        if (password.length < 8) { // Пример простой валидации
            setError("Password must be at least 8 characters long.");
            return;
        }

        setIsLoading(true);

        try {
            if (window.electronAPI && window.electronAPI.setupPassword) {
                console.log("Calling electronAPI.setupPassword...");
                const result = await window.electronAPI.setupPassword(password);
                console.log("Setup password IPC call finished:", result);

                if (result.success) {
                    console.log("Setup password IPC call reported success.");
                    setPassword('');
                    setRepeatPassword('');
                } else {
                    setError("Password setup failed.");
                }


            } else {
                console.error("Electron API for setupPassword not available.");
                setError("Application error: IPC API not available.");
            }
        } catch (error: any) {
            console.error("Error calling setupPassword IPC:", error);
            setError(`Setup failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Create password</CardTitle>
                    <CardDescription>
                        Enter your password below to setup your account. WARNING: If you lose your password, you won't be able to access your wallets.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col gap-6">
                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Password</Label>
                                    <a
                                        href="#"
                                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                                    >
                                    </a>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Repeat password</Label>
                                    <a
                                        href="#"
                                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                                    >
                                    </a>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={repeatPassword}
                                    onChange={(e) => setRepeatPassword(e.target.value)}
                                />
                            </div>
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? 'Creating...' : 'Create password'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}