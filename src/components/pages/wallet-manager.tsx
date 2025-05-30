export default function WalletManager() {
    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Wallet manager</h1>
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                    <div className="aspect-video rounded-xl bg-muted/50" />
                    <div className="aspect-video rounded-xl bg-muted/50" />
                    <div className="aspect-video rounded-xl bg-muted/50" />
                </div>
            </div>
        </div>
    )
}
