import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs.tsx"
import {WithdrawTab} from "@/components/pages/wallet-manager/operationsWindow/withdrawTab/withdrawTab.tsx";
import {DistributeTab} from "@/components/pages/wallet-manager/operationsWindow/distributeTab/distribute-tab.tsx";
import {ConsolidateTab} from "@/components/pages/wallet-manager/operationsWindow/consolidateTab/consolidate-tab.tsx";

export function OperationsWindow() {
    return (
        <Tabs defaultValue="withdraw" className="w-[400px]">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                <TabsTrigger value="distribute">Distribute</TabsTrigger>
                <TabsTrigger value="consolidate">Consolidate</TabsTrigger>
            </TabsList>
            <TabsContent value="withdraw">
                <WithdrawTab/>
            </TabsContent>
            <TabsContent value="distribute">
                <DistributeTab/>
            </TabsContent>
            <TabsContent value="consolidate">
                <ConsolidateTab/>
            </TabsContent>
        </Tabs>
    )
}
