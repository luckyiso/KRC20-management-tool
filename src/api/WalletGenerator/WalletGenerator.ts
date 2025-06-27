import {Kiwi, Wallet, Mnemonic} from "@kasplex/kiwi";


  export async function generateKeys(): Promise<{receivePrivateKey: string; receiveAddress: string}> {
    const mnemonicStr = Mnemonic.random(12)
    const wallet = Wallet.fromMnemonic(mnemonicStr)
    return {
      receivePrivateKey: wallet.toPrivateKey().toString(),
      receiveAddress: wallet.toAddress(Kiwi.network).toString(),
    }
}

