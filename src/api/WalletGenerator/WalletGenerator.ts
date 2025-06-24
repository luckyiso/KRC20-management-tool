import { createRequire } from "module";
const require = createRequire(import.meta.url);
import {Kiwi, Rpc, Wasm, Wallet, Mnemonic} from "@kasplex/kiwi";


  // Consolidated method to generate mnemonic, private key, and addresses
  export async function generateKeys(): Promise<{receivePrivateKey: string; receiveAddress: string}> {
    const mnemonicStr = Mnemonic.random(12)
    const wallet = Wallet.fromMnemonic(mnemonicStr)
    return {
      receivePrivateKey: wallet.toPrivateKey().toString(), // PrivateKey объект
      receiveAddress: wallet.toAddress(Kiwi.network).toString(),
    }
}

