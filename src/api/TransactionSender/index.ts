import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { kaspaToSompi, IPaymentOutput, createTransactions, PrivateKey, UtxoProcessor, UtxoContext, RpcClient } = require ("../../../wasm/kaspa");
import { EventEmitter } from 'events'


export default class TransactionSender extends EventEmitter {
  private networkId: string;
  private privateKey: InstanceType<typeof PrivateKey>;
  private processor: UtxoProcessor;
  private context: InstanceType<typeof UtxoContext>;
  private rpc: InstanceType<typeof RpcClient>;



  constructor(networkId: string, privKey: InstanceType<typeof PrivateKey>, rpc: InstanceType<typeof RpcClient>) {
    super()
    this.networkId = networkId;
    this.privateKey = privKey;
    this.processor = new UtxoProcessor({ rpc, networkId });
    this.rpc = this.processor.rpc
    this.context = new UtxoContext({ processor: this.processor });
    this.registerProcessor()
  }

  async transferFunds(address: string, amount: string) {

    console.log(`TrxManager: Crearting Transaction`)
    const payments: InstanceType<typeof IPaymentOutput>[] = [{
      address: address,
      amount: kaspaToSompi(amount)!
    }];

    const transactionId = await this.send(payments);
    console.log(`TrxManager: Sent payments. Transaction ID: ${transactionId}`);

    return transactionId;

  }

  async send(outputs: InstanceType<typeof IPaymentOutput>[]) {

    const context = this.context
    console.log(outputs);
    console.log(`TrxManager: Context to be used: ${this.context}`);

    const { transactions, summary } = await createTransactions({
      entries: context,
      outputs,
      changeAddress: this.privateKey.toPublicKey().toAddress(this.networkId).toString(),
      priorityFee: kaspaToSompi("0.02")
    });
    console.log(`TrxManager: Transaction Length: ${transactions.length}`)
    // Handle the first transaction immediately
    if (transactions.length > 0) {
      const firstTransaction = transactions[0];
      console.log(`TrxManager: Payment with transaction ID: ${firstTransaction.id} to be signed and submitted`);

      firstTransaction.sign([this.privateKey]);
      await firstTransaction.submit(this.rpc);
    }

    // Handle the remaining transactions, waiting for the `time-to-submit` event
    for (let i = 1; i < transactions.length; i++) {
      const transaction = transactions[i];
      console.log(`TrxManager: Payment with transaction ID: ${transaction.id} to be signed`);
      transaction.sign([this.privateKey]);
      await transaction.submit(this.rpc);
    }

    return summary.finalTransactionId;
  }



  private registerProcessor () {
    this.processor.addEventListener("utxo-proc-start", async () => {
      console.log(`TrxManager: registerProcessor - this.context.clear()`);
      await this.context.clear()
      console.log(`TrxManager: registerProcessor - tracking pool address`);
      await this.context.trackAddresses([ this.privateKey.toPublicKey().toAddress(this.networkId).toString() ])
    })
    this.processor.start()
  }

}