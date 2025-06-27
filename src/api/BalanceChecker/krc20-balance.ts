import { KasplexApi } from '@kasplex/kiwi'
import {getBalancesForAddresses} from "../BalanceChecker/KaspaBalance.ts";
import {formatTokenBalance} from "../utils/wallet-service.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import {AddressTokenList, AddressTokenListResponse} from "@kasplex/kiwi/dist/types";

export interface KaspaWalletToken {
    value: string;
    label: string;
    balance: string;
    decimals: number;
}

export async function getTokensForAddresses(addresses: string[]): Promise<Map<string, KaspaWalletToken[]>> {
    const allTokensMap = new Map<string, KaspaWalletToken[]>();

    if (addresses.length === 0) {
        console.log("No addresses provided to getKaspaWalletTokensForAddresses. Returning empty map.");
        return allTokensMap;
    }

    const tokenPromises = addresses.map(async (address) => {
        let addressTokens: KaspaWalletToken[] = [];
        let errorFetchingTokens: string | null = null;

        try {
            const response: AddressTokenListResponse = await KasplexApi.getAddressTokenList(address);
            console.log("RPC Service: KasplexApi.getAddressTokenList response:", JSON.stringify(response));

            if (response.message === "successful" && Array.isArray(response.result)) {
                addressTokens = response.result.map((item: AddressTokenList) => {
                    const decimals = parseInt(item.dec || '8', 10);
                    const formattedBalance = formatTokenBalance(item.balance, decimals, 2);
                    return {
                        value: item.tick || item.ca || '',
                        label: item.tick || 'Unknown Token',
                        balance: formattedBalance,
                        decimals: isNaN(decimals) ? 8 : decimals
                    };
                }).filter((token: KaspaWalletToken) => token.value !== '');
            } else {
                console.warn(`RPC Service: KasplexApi.getAddressTokenList returned unsuccessful message or invalid result for ${address}:`, response);
                errorFetchingTokens = `Invalid response for address ${address}`;
            }
        } catch (error: any) {
            console.error(`RPC Service: Failed to fetch tokens for address ${address}: ${error.message || String(error)}`);
            errorFetchingTokens = `Failed to fetch tokens for address ${address}: ${error.message || String(error)}`;
        }

        let kaspaBalanceToken: KaspaWalletToken | null = null;
        try {
            const kaspaBalancesMap = await getBalancesForAddresses([address]);
            const kaspaBalance = kaspaBalancesMap[address];

            if (kaspaBalance && kaspaBalance !== 'Unavailable' && !kaspaBalance.startsWith('Unavailable')) {
                kaspaBalanceToken = {
                    value: 'Kaspa',
                    label: 'Kaspa',
                    balance: kaspaBalance,
                    decimals: 8
                };
            }
        } catch (error: any) {
            console.error(`RPC Service: Failed to fetch KAS balance for address ${address}: ${error.message || String(error)}`);
        }

        if (kaspaBalanceToken && !addressTokens.some(token => token.value.toUpperCase() === 'KAS')) {
            addressTokens.unshift(kaspaBalanceToken);
        }

        return { address, tokens: addressTokens, error: errorFetchingTokens };
    });

    try {
        const results = await Promise.allSettled(tokenPromises);

        results.forEach(settledResult => {
            if (settledResult.status === 'fulfilled') {
                const { address, tokens, error } = settledResult.value;
                if (address) {
                    if (error) {
                        console.warn(`RPC Service: Partial failure for address ${address}: ${error}`);
                        allTokensMap.set(address, []);
                    } else {
                        allTokensMap.set(address, tokens);
                    }
                }
            } else {
                const reason = settledResult.reason;
                console.error(`RPC Service: Promise rejected for unknown address: ${reason}`);
            }
        });

        console.log(`RPC Service: Finished fetching all tokens for ${addresses.length} addresses. Map size: ${allTokensMap.size}.`);
        return allTokensMap;

    } catch (error: any) {
        console.error(`RPC Service: Critical error in getKaspaWalletTokensForAddresses processing: ${error.message || String(error)}`);
        addresses.forEach(address => {
            allTokensMap.set(address, []);
        });
        return allTokensMap;
    }
}