import {ColumnDef} from "@tanstack/react-table";
import {Wallet} from "@/components/provider/wallet-provider.tsx";
import {Checkbox} from "@/components/ui/checkbox.tsx";
import {Button} from "@/components/ui/button.tsx";
import {ArrowUpDown, MoreHorizontal} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
interface GetColumnsProps {
    handleDeleteWallet: (address: string) => Promise <void>;
    onRenameClick: (wallet: Wallet) => void;
    onGetPrivateKeyClick?: (wallet: Wallet) => void;
}

export const getColumns = ({ handleDeleteWallet, onRenameClick, onGetPrivateKeyClick }: GetColumnsProps): ColumnDef<Wallet>[] => {
    return [
        {
            id: "select",
            header: ({ table }) => (
                <Checkbox
                    checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && "indeterminate")
                    }
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                />
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => (
                <div className="capitalize max-w-[50px] overflow-hidden text-ellipsis">{row.getValue("name")}</div>
            ),
        },
        {
            accessorKey: "address",
            header: 'Address',
            cell: ({ row }) => <div className="lowercase max-w-[200px] overflow-hidden text-ellipsis">{row.getValue("address")}</div>,
        },
        {
            accessorKey: "balance",
            header: ({ column }) =>{
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Balance
                        <ArrowUpDown/>
                    </Button>

                )
            },
            cell: ({ row }) => {
                const balance = row.getValue("balance") as string
                return (
                    <div className="text-left font-medium">{balance}</div>
                )
            }
        },
        {
            id: "actions",
            enableHiding: false,
            cell: ({ row }) => {
                const wallet = row.original;

                return (
                        <DropdownMenu>
                            <DropdownMenuTrigger>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem
                                    onClick={() => navigator.clipboard.writeText(row.original.address)}
                                >
                                    Copy address
                                </DropdownMenuItem>
                                {onGetPrivateKeyClick && (
                                    <DropdownMenuItem
                                        onClick={() => {
                                            onGetPrivateKeyClick(wallet);
                                        }}
                                    >
                                        Get private key
                                    </DropdownMenuItem>
                                )}
                                {(onGetPrivateKeyClick || true) && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                    onClick={() => {
                                        // Вызываем функцию из пропсов, передавая ей текущий кошелек
                                        onRenameClick(wallet);
                                    }}
                                >
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={async () => {
                                        await handleDeleteWallet(wallet.address);
                                    }}
                                    variant="destructive"
                                >
                                    Delete Wallet
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                );
            },
        },
    ];
};