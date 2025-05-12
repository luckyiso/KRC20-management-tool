import { createRequire } from 'module'
const require = createRequire(import.meta.url);
// Импортируем только нужные классы и функцию sompiToKaspaString напрямую
const { RpcClient, Encoding, Resolver, sompiToKaspaString } = require('../../../wasm/kaspa')

interface IGetBalanceByAddressResponse {
  balance: bigint;  // Указываем, что balance имеет тип bigint
}

class KasBalanceChecker {
  private network: string;
  private rpcClient: RpcClient | null = null; // Храним экземпляр клиента

  constructor(network: string = 'testnet-10') {
    this.network = network;
  }

  // Метод для инициализации и подключения клиента
  public async connect(): Promise<void> {
    if (this.rpcClient && this.rpcClient.isConnected) {
      console.log('RPC Client already connected.') // Логируем, если уже подключено
      return;
    }

    if (this.rpcClient && !this.rpcClient.isConnected) {
      // Если клиент создан, но не подключен (например, после ошибки или дисконнекта)
      console.log("Reconnecting RPC Client...");
    } else {
      // Создаем новый клиент, если его еще нет
      console.log("Creating and connecting RPC Client...");
      this.rpcClient = new RpcClient({
        resolver: new Resolver(),
        encoding: Encoding.Borsh,
        networkId: this.network
      });
    }


    try {
      await this.rpcClient!.connect(); // Используем non-null assertion т.к. проверили выше
      console.log("RPC Client connected successfully.");
    } catch (error) {
      console.error(`Failed to connect RPC Client: ${error}`);
      this.rpcClient = null; // Сбрасываем клиент при ошибке подключения
      throw error; // Пробрасываем ошибку дальше
    }
  }

  // Метод для отключения клиента
  public async disconnect(): Promise<void> {
    if (this.rpcClient && this.rpcClient.isConnected) {
      console.log("Disconnecting RPC Client...");
      await this.rpcClient.disconnect();
      console.log("RPC Client disconnected.");
      this.rpcClient = null; // Сбрасываем клиент после отключения
    } else {
      console.log("RPC Client not connected or already disconnected.");
    }
  }

  // Метод для получения баланса, использующий существующее подключение
  public async getBalance(address: string): Promise<bigint> { // Возвращаем bigint
    if (!this.rpcClient || !this.rpcClient.isConnected) {
      // Если нет подключения, попытаемся подключиться или выбросим ошибку
      console.error("RPC Client is not connected. Attempting to connect...");
      try {
        await this.connect();
      } catch (connectError) {
        console.error("Could not connect RPC Client to get balance.");
        throw new Error(`Failed to connect RPC Client: ${connectError}`);
      }

      // Проверяем еще раз после попытки подключения
      if (!this.rpcClient || !this.rpcClient.isConnected) {
        throw new Error("RPC Client is not connected and failed to connect.");
      }
    }

    try {
      // Получаем ответ и явно указываем его тип
      const response: IGetBalanceByAddressResponse = await this.rpcClient.getBalanceByAddress(address);

      // Возвращаем баланс как bigint
      return response.balance;
    }
    catch (error: any) { // Используем any для ошибки
      console.error(`Error fetching balance for ${address}: ${error.message || error}`);
      throw error;
    }
  }
}

async function main() {
  const checker = new KasBalanceChecker('testnet-10');
  const address1 = 'kaspatest:qqmk5pqw7e5eg85d5wpxevr63ex2tget3etyx8jjxp5jmu6g7sh2xwkgmkeum';

  try {
    // Подключаемся один раз
    await checker.connect();

    // Получаем баланс как bigint
    const balance1BigInt = await checker.getBalance(address1);

    // Форматируем bigint в строку KAS для вывода, используя sompiToKaspaString
    const balance1KasString = sompiToKaspaString(balance1BigInt);

    console.log(`Баланс для ${address1}: ${balance1BigInt} сомпи (${balance1KasString} KAS)`)

    // Если нужно, получаем и выводим баланс для других адресов, переиспользуя соединение
    // const balance2BigInt = await checker.getBalance(address2);
    // const balance2KasString = sompiToKaspaString(balance2BigInt);
    // console.log(`Баланс для ${address2}: ${balance2BigInt} сомпи (${balance2KasString} KAS)`);


  } catch (error) {
    console.error("Произошла ошибка в main:", error);
  } finally {
    // Важно отключиться в конце, даже если произошла ошибка
    await checker.disconnect();
  }
}

main();
