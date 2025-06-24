import {Deploy} from "@/components/pages/deploy/deploy.tsx";

export default function WalletManager() {
    return (
        <div className="grid auto-rows-min gap-4" style={{ gridTemplateColumns: '1fr 1fr 400px' }}>
            <Deploy/>
        </div>
    )
}
