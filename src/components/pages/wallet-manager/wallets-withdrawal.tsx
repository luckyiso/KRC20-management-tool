"use client"

import * as React from "react"
import {
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.tsx"
import {useWallets} from "@/components/provider/wallet-provider.tsx"
import { getColumns } from "@/components/utils/get-columns.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {AddWithdrawalAddressWindow} from "@/components/forms/add-wallet-withdrawal.tsx";
import {RenameWallet} from "@/components/forms/rename-wallet.tsx";
import {ImportWallet} from "@/components/forms/import-wallet.tsx";


export function WalletsWithdrawal() {
    const { wallets: walletsData, isLoadingWallets} = useWallets(1);

    // Эти состояния таблицы остаются локальными, так как они относятся только к UI таблицы
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = React.useState({});
    const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
    const [walletToRename, setWalletToRename] = React.useState<{ address: string; name: string } | null>(null);

    const handleDeleteWallet = async (address: string) => {
        console.log(`Attempting to delete wallet with address: ${address}`);
        try {
            if (window.electronAPI && window.electronAPI.deleteWallet) {
                const success = await window.electronAPI.deleteWallet(address);
                if (success) {
                    console.log(`Wallet ${address} deleted successfully.`);
                    // После успешного удаления, возможно, нужно обновить список кошельков
                    // refetchWallets(); // Хук useWallets должен сам обновиться через IPC-событие
                } else {
                    console.error(`Failed to delete wallet ${address}.`);
                }
            } else {
                console.error("Electron API method deleteWallet not available.");
            }
        } catch (error) {
            console.error(`Error deleting wallet ${address}:`, error);
        }
    };

    const handleRenameClick = React.useCallback((wallet: typeof walletsData[0]) => {
        setWalletToRename({ address: wallet.address, name: wallet.name });
        setIsRenameDialogOpen(true);
    }, []); // Зависимости пустые, т.к. она просто устанавливает состояние

    const columns = React.useMemo(() => getColumns({
        handleDeleteWallet,
        onRenameClick: handleRenameClick,
    }), [handleDeleteWallet, handleRenameClick]);


    const table = useReactTable({
        data: walletsData, // ### Используем данные из состояния ###
        columns: columns,
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        state: {
            sorting,
            columnVisibility,
            rowSelection,
        },
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle>Wallet manager</CardTitle>
                <CardDescription>Add your wallets for withdrawal</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="w-full">

                    <div className="flex items-center py-4 gap-2">
                        <Input
                            placeholder="Filter names..."
                            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                                table.getColumn("name")?.setFilterValue(event.target.value)
                            }
                            className="max-w-sm"
                        />
                        <div className="flex items-center gap-2 ml-auto">
                            <AddWithdrawalAddressWindow/>
                        </div>
                    </div>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => {
                                            return (
                                                <TableHead key={header.id}>
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                </TableHead>
                                            )
                                        })}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {!isLoadingWallets && table.getRowModel().rows?.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length} // Правильное количество колонок
                                            className="h-24 text-center"
                                        >
                                            Кошельки не найдены.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            data-state={row.getIsSelected() && "selected"}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(
                                                        cell.column.columnDef.cell,
                                                        cell.getContext()
                                                    )}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <div className="flex-1 text-sm text-muted-foreground">
                            {table.getFilteredSelectedRowModel().rows.length} of{" "}
                            {table.getFilteredRowModel().rows.length} row(s) selected.
                        </div>
                        <div className="space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>
                {walletToRename && (
                    <RenameWallet
                        walletAddress={walletToRename.address}
                        currentWalletName={walletToRename.name}
                        isOpen={isRenameDialogOpen}
                        onClose={() => setIsRenameDialogOpen(false)}
                    />
                )}
            </CardContent>
        </Card>
    )
}
