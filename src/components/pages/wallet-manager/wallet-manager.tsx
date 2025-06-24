import {Wallets} from "@/components/pages/wallet-manager/wallets.tsx";
import {WalletsWithdrawal} from "@/components/pages/wallet-manager/wallets-withdrawal.tsx"
import {OperationsWindow} from "@/components/pages/wallet-manager/operationsWindow/operationsWindow.tsx";

export default function WalletManager() {
    return (
        <div className="grid auto-rows-min gap-4" style={{ gridTemplateColumns: '1fr 1fr 400px' }}>
            <Wallets/>
            <WalletsWithdrawal/>
            <OperationsWindow/>
        </div>
    )
}
