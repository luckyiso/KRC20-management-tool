import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge.tsx";

const mockTransactions = [
    { type: 'Mint', status: 'Confirmed', amount: '+1,000 WOLFY', address: 'kaspa:qyp...g22l6' },
    { type: 'Send', status: 'Confirmed', amount: '-173.12 KAS', address: 'kaspa:qrq...z3ycs' },
    { type: 'Receive', status: 'Confirmed', amount: '+5,200 LOPE', address: 'kaspa:qyp...fd00yh' },
    { type: 'Consolidate', status: 'Processing', amount: '-1,100 KSPK', address: 'kaspa:qyp...hwyc' },
    { type: 'Deploy', status: 'Failed', amount: '-1011 KAS', address: 'kaspa:qrq...z3ycs' },
];

export function TransactionsTable() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mockTransactions.map((tx, index) => (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{tx.type}</TableCell>
                                <TableCell>
                                    <Badge
                                        variant={
                                            tx.status === 'Confirmed' ? 'default' :
                                                tx.status === 'Processing' ? 'secondary' : 'destructive'
                                        }
                                    >
                                        {tx.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>{tx.address}</TableCell>
                                <TableCell className={`text-right font-mono ${tx.amount.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                                    {tx.amount}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}