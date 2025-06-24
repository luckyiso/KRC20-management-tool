import {KaspaApi, Kiwi, Rpc, Wasm} from '@kasplex/kiwi'
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {sompiToKaspaString} = require( "../wasm/kaspa");

interface KaspaBalanceResult {
  address: string;
  balance: string; // Или только number, уточните по API
}


export async function getBalancesForAddresses(addresses: string[]): Promise<{ [address: string]: string }> {
  const balanceMap: { [address: string]: string } = {};
  if (addresses.length === 0) {
    console.log("No addresses provided to getBalancesForAddresses. Returning empty object.");
    return balanceMap;
  }
  const balancePromises = addresses.map(async (address) => {
    try {
      const result = await KaspaApi.getBalance(address) as KaspaBalanceResult; // Приводим тип

      // Убеждаемся, что в результате есть адрес и баланс
      if (result && result.address === address && result.balance !== undefined) {
        return { address: result.address, balance: result.balance }; // Успех
      } else {
        console.warn(`RPC Service: Unexpected result structure for address ${address}:`, result);
        return { address: address, error: 'Invalid response' }; // Неожиданный формат ответа
      }

    } catch (error: any) {
      // Ошибка при получении баланса для конкретного адреса
      console.warn(`RPC Service: Failed to fetch balance for address ${address}: ${error.message || error}`);
      return { address: address, error: 'Unavailable' }; // Возвращаем индикатор ошибки для адреса
    }
  });

  try {
    // Ждем завершения всех промисов (успех или ошибка, но завершаются они объектом благодаря try/catch выше)
    const results = await Promise.allSettled(balancePromises);

    // Обрабатываем результаты и строим объект-сопоставление
    results.forEach(settledResult => {
      // Все промисы из map завершатся с status === 'fulfilled' из-за внутреннего try/catch
      if (settledResult.status === 'fulfilled') {
        const resultValue = settledResult.value; // Это объект { address, balance? , error? }

        if (resultValue && resultValue.address) {
          if (resultValue.balance !== undefined) {
            // Получен успешный баланс. Преобразуем его в строку.
              balanceMap[resultValue.address] = typeof resultValue.balance === 'object' && resultValue.balance !== null && 'toString' in resultValue.balance
                  ? resultValue.balance.toString()
                  : sompiToKaspaString(resultValue.balance);
          } else {
            // Получен объект с ошибкой из внутреннего catch
            balanceMap[resultValue.address] = resultValue.error || 'Unavailable';
          }
        } else {
          console.error("Received fulfilled result without a valid address:", resultValue);
          // Нет адреса для сопоставления - игнорируем или как-то обрабатываем глобально
        }
      }
    });

    console.log(`RPC Service: Finished fetching balances and building map for ${Object.keys(balanceMap).length} addresses.`);
    return balanceMap; // Возвращаем объект-сопоставление

  } catch (error: any) {
    // Этот блок catch ловит ошибки самого Promise.allSettled (редко) или ошибки в логике map/forEach
    console.error(`RPC Service: Critical error in getBalancesForAddresses processing: ${error.message || error}`);
    // При критической ошибке возвращаем объект, помечающий все запрошенные адреса как ошибочные
    addresses.forEach(address => {
      balanceMap[address] = 'Unavailable (Batch Error)';
    });
    return balanceMap;
  }
}
