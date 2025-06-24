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

export function LoginPasswordForm({
                                       className,
                                       ...props
                                   }: React.ComponentPropsWithoutRef<"div">) {

    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        try {
            if (window.electronAPI && window.electronAPI.login) {
                console.log("Calling electronAPI.login...");
                const result = await window.electronAPI.login(password);
                console.log("Login IPC call finished:", result);

                if (result.success) {
                    console.log("Login successful. UI will update via appStateUpdate.");
                    setPassword('');
                } else {
                    setError("Login failed.");
                }


            } else {
                console.error("Electron API for setupPassword not available.");
                setError("Application error: IPC API not available.");
            }
        } catch (error: any) {
            console.error("Error calling setupPassword IPC:", error);
            setError(`Wrong password`);
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Enter password</CardTitle>
                    <CardDescription>
                        Enter your password below to get access to your account.
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
                                {error && <p className="text-red-500 text-sm">{error}</p>}
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? 'Logginig...' : 'Login'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}