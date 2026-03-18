# Orcha Agent 🤖⚡️

Orcha Agent is a high-performance, modular AI agent orchestration backend built with **TypeScript**, **Fastify**, and **LangGraph**. It enables dynamic, self-healing LLM agents that can automatically interface with internal tools, notify users via various platforms, and securely manage user credentials.

## 🌟 Key Features

*   **⚡️ Fast LLM Inference**: Powered by Groq for blazing-fast generation times.
*   **🧠 LangGraph Workflows**: Utilizes state graphs and persistent checkpoints to maintain multi-step conversational context and complex tool-calling loops.
*   **🔐 Self-Healing Credential Vault**: A secure (AES-256-CBC encrypted) vault integrated into the database. Agents can detect missing credentials (e.g., Telegram tokens, SMTP passwords), proactively ask the user, and securely store them on the fly using the `store_credential` tool.
*   **🛠️ Modular Tool Registry**: Easily extend agent capabilities. Current tools include:
    *   🌍 `web_search`: Real-time web searching (via Serper).
    *   📱 `telegram_notify`: Push notifications to Telegram.
    *   📨 `send_email`: Email dispatch via SMTP.
    *   🗝️ `store_credential`: Internal mechanism for updating user vaults based on conversational context.
*   **💾 Robust Persistence**: Fully integrated with PostgreSQL via **Drizzle ORM** (optimized for Supabase) to log runs, manage agent configurations, and store user metadata.

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18+)
*   A PostgreSQL Database (e.g., Supabase)
*   API keys for Groq, Serper, and an Encryption Key (32-byte hex string)

### Environment Variables

Clone the repository and create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://[user]:[password]@[host]:5432/[db]"

# LLM & Search
GROQ_API_KEY="your_groq_api_key"
SERPER_API_KEY="your_serper_api_key" # 2500 free searches/month at serper.dev

# Encryption key for the credential vault
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="your_32_byte_hex_string"

PORT=3001
NODE_ENV="development"
```

### Installation

Install dependencies using npm:

```bash
npm install
```

### Database Setup

Run Drizzle migrations or push the schema directly to your database:

```bash
npm run db:push
```

You should also seed the platform tools into the database before first use:

```bash
npx tsx src/registry/seed.ts
```

### Running the Server

Start the development server:

```bash
npm run dev
```

The Fastify server will start on `http://localhost:3001`.

## 🧠 Core Architecture

*   `src/server.ts`: The Fastify entry point and API route registration.
*   `src/runner.ts`: The central LangGraph execution engine that interprets the agent state, manages tool calls, and integrates the Checkpointer.
*   `src/vault.ts`: Handles AES encryption/decryption and credential retrieval/storage logic.
*   `src/registry/`: Contains tool schemas (`registry.ts`), the tool database seeder (`seed.ts`), and individual tool implementations (`tools/`).
*   `src/db/`: Contains Drizzle schemas (`schema.ts`) and convenient query abstractions (`queries.ts`).

## 🧪 Testing Agents

You can trigger a chat run for a specific agent by POSTing to the `/api/run/:agentId` endpoint:

```bash
curl -s -X POST "http://localhost:3001/api/run/YOUR_AGENT_ID" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test-user-123" \
  -d '{"message": "Check the price of Bitcoin and notify me on Telegram."}'
```

If the agent is missing credentials (e.g., `TELEGRAM_CHAT_ID`), it will return a message asking you to provide them. You can reply with the credential in the next request, and the agent will automatically call `store_credential` to save it to your vault and proceed!
