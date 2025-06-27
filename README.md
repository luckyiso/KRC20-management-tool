# KRC-20 Management Tool

**KRC-20 Management Tool** is a desktop application for managing KRC-20 standard tokens on the Kaspa network. It provides a user-friendly interface for creating, importing, and managing wallets, as well as performing various token operations such as deploying, minting, and transferring assets.

The application is built on a modern stack, ensuring high performance and reliability.

## Key Features

*   **Wallet Management:** Create, import (via private key or mnemonic phrase), and securely store your wallets.
*   **Token Deployment:** A convenient form to deploy your own KRC-20 tokens on the Kaspa network (Mainnet or Testnet).
*   **Token Minting:** Launch and manage minting processes for existing KRC-20 tokens.
*   **Fund Transfers:** Send KAS and KRC-20 tokens. Supports single-to-single, single-to-multiple, and multiple-to-single (consolidation) transactions.
*   **Dashboard:** View real-time Kaspa network statistics and market data.
*   **Portfolio:** An aggregated overview of all your assets across all wallets.

## Tech Stack

This project uses [Electron](https://www.electronjs.org/) to create a cross-platform desktop application and [Vite](https://vitejs.dev/) as the frontend build tool, which provides a lightning-fast development and build experience.

*   **Framework:** [React](https://react.dev/) for building the user interface.
*   **Language:** [TypeScript](https://www.typescriptlang.org/) for strong typing and enhanced code reliability.
*   **UI Components:** [shadcn/ui](https://ui.shadcn.com/), built on top of [Tailwind CSS](https://tailwindcss.com/) and [Radix UI](https://www.radix-ui.com/).
*   **Crypto Library:** [Kasplex/Kiwi](https://github.com/kasplex/kiwi-sdk) for interacting with the Kaspa blockchain.
*   **Application Bundler:** [Electron Builder](https://www.electron.build/) for packaging the application into distributables for Windows, macOS, and Linux.
*   **Fast Refresh:**
    *   [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh.


## Getting Started

### Prerequisites

*   Node.js (v18.x or higher recommended)
*   npm / yarn / pnpm

### Installation and Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/krc20-management-tool.git
    cd krc20-management-tool
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in development mode:**
    ```bash
    npm run dev
    ```

### Building the Application

To build the application for your current platform, run:

```bash
npm run build