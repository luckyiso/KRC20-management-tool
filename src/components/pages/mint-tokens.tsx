export default function MintTokens() {
    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Installation</h1>
            <div className="prose max-w-none">
                <p>Welcome to the installation guide. Follow these steps to set up your project.</p>
                <pre className="bg-muted p-4 rounded-md">
          <code>npm create vite@latest my-app -- --template react-ts cd my-app npm install npm run dev</code>
        </pre>
            </div>
        </div>
    )
}
