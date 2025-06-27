import { createRoot } from 'react-dom/client'
import Main from './App.tsx'
import './index.css'
import DeployTokens from "@/components/pages/deploy/deploy-tokens.tsx"
import Portfolio from "@/components/pages/portfolio/portfolio.tsx"
import WalletManager from "@/components/pages/wallet-manager/wallet-manager.tsx"
import { Routes, Route, HashRouter} from "react-router";
import {WalletProvider} from "@/components/provider/wallet-provider.tsx";
import {ThemeProvider} from "@/components/provider/theme-provider.tsx";
import {MintPage} from "@/components/pages/mint-tokens/mint-page.tsx";
import DashboardPage from "@/components/pages/Dashboard/DashboardPage.tsx";

createRoot(document.getElementById('root')!).render(
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <WalletProvider>
            <HashRouter>
                <Routes>
                    <Route path="/" element={<Main />}>
                        <Route index element={<DashboardPage />} />
                        <Route path="/deploy-tokens" element={<DeployTokens />} />
                        <Route path="/mint-tokens" element={<MintPage />} />
                        <Route path="/portfolio" element={<Portfolio />} />
                        <Route path="/wallet-manager" element={<WalletManager />} />
                        <Route path="*" element={<div>Page not found</div>} />
                    </Route>
                </Routes>
            </HashRouter>
        </WalletProvider>
    </ThemeProvider>
)


// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
