import { createRoot } from 'react-dom/client'
import Dashboard from './App.tsx'
import './index.css'
import CreateWallets from "@/components/pages/create-wallets.tsx"
import DeployTokens from "@/components/pages/deploy-tokens.tsx"
import MintTokens from "@/components/pages/mint-tokens.tsx"
import Portfolio from "@/components/pages/portfolio.tsx"
import WalletManager from "@/components/pages/wallet-manager.tsx"
import { BrowserRouter, Routes, Route } from "react-router";

createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<Dashboard />}>
                {/* Getting Started routes */}
                <Route path="/create-wallets" element={<CreateWallets />} />
                <Route path="/deploy-tokens" element={<DeployTokens />} />
                <Route path="/mint-tokens" element={<MintTokens />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/wallet-manager" element={<WalletManager />} />
                {/* Catch-all route for 404 */}
                <Route path="*" element={<div>Page not found</div>} />
            </Route>
        </Routes>
    </BrowserRouter>,
)


// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
