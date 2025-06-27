import { KaspaApi, Wasm } from '@kasplex/kiwi';

interface KaspaBalanceResult {
  address: string;
  balance: string | { toString(): string };
}

type PromiseSuccess = { address: string; balance: string | { toString(): string } };
type PromiseError = { address: string; error: string };

export async function getBalancesForAddresses(addresses: string[]): Promise<{ [address: string]: string }> {
  const balanceMap: { [address: string]: string } = {};
  if (addresses.length === 0) {
    return balanceMap;
  }

  const balancePromises = addresses.map(async (address): Promise<PromiseSuccess | PromiseError> => {
    try {
      const result = await KaspaApi.getBalance(address) as KaspaBalanceResult;
      if (result && result.address === address && result.balance !== undefined) {
        return { address: result.address, balance: result.balance };
      } else {
        return { address: address, error: 'Invalid response' };
      }
    } catch (error: any) {
      return { address: address, error: 'Unavailable' };
    }
  });

  try {
    const results = await Promise.allSettled(balancePromises);

    results.forEach(settledResult => {
      if (settledResult.status === 'fulfilled') {
        const resultValue = settledResult.value;

        if (resultValue && resultValue.address) {
          if ('balance' in resultValue) {

            const balanceValue = resultValue.balance;
            let finalBalanceString: string;

            if (typeof balanceValue === 'object' && balanceValue !== null && 'toString' in balanceValue) {
              finalBalanceString = balanceValue.toString();
            } else if (typeof balanceValue === 'string') {
              finalBalanceString = Wasm.sompiToKaspaString(balanceValue);
            } else if (typeof balanceValue === 'number' || typeof balanceValue === 'bigint') {
              finalBalanceString = Wasm.sompiToKaspaString(balanceValue);
            }
            else {
              console.warn(`Unexpected balance type for ${resultValue.address}:`, typeof balanceValue);
              finalBalanceString = '0';
            }

            balanceMap[resultValue.address] = finalBalanceString;

          } else {
            balanceMap[resultValue.address] = resultValue.error || 'Unavailable';
          }
        }
      }
    });

    return balanceMap;
  } catch (error: any) {
    console.error(`RPC Service: Critical error in getBalancesForAddresses processing: ${error.message || error}`);
    addresses.forEach(address => {
      balanceMap[address] = 'Unavailable (Batch Error)';
    });
    return balanceMap;
  }
}