# 🔧 EVM CLI Transaction Tool

A powerful command line tool for interacting with EVM contracts on Pectra-Devnet-7.

## 📋 Table of Contents
- [Setup](#setup)
- [Usage](#usage)
- [Features](#features)
  - [Token Approval Management](#token-approval-management)
  - [Transaction History](#transaction-history)
- [Input Guidelines](#input-guidelines)
- [Transaction Verification](#transaction-verification)
- [Troubleshooting](#troubleshooting)
- [Environment Constants](#environment-constants)
- [Security Note](#security-note)

---

## 📥 Setup

1. Make sure you have Node.js installed on your system
2. Clone this repository or download the files
3. Install dependencies:
   ```bash
   npm install
   ```

## 🚀 Usage

Run the tool:
```bash
npm start
```

### First-time Setup
- When you run the tool for the first time, it will ask for your private key
- Your private key will be stored in a file in the `data` directory
- On subsequent runs, the tool will use the stored key automatically

### Sending Transactions
1. The tool displays a list of available contract functions
2. Select a function by typing its number or name
3. Enter the required parameters when prompted
4. The tool automatically checks for required token approvals
5. Confirm the transaction when ready
6. Set a manual gas limit if needed
7. The tool sends the transaction and displays the transaction hash
8. It waits for the transaction to be mined and displays the result

---

## ⭐ Features

### Additional Options Menu

The tool offers special functions beyond basic contract calls:

#### Token Approval Management

1. **Revoke Token Approval** ✂️
   - Allows you to revoke approval for any ERC20 token
   - Enter the token address when prompted
   - View the current allowance information
   - Confirm to revoke (sets allowance to zero)
   - Option to set custom gas limit for the revocation

#### Transaction History

2. **View Contract Transactions** 🔍
   - Multiple ways to retrieve and view transaction history:
     - Find specific number of latest transactions (quick search without indexing)
     - Scan recent blocks (last 100) for contract activity
     - Scan specific block ranges for deeper history
     - Scan from last checkpoint to update transaction index
     - View previously indexed transactions instantly
   - Maintains a local transaction database for faster access
   - Shows transaction details including:
     - Function names, status, block numbers
     - Timestamps, from/to addresses, transaction hashes
   - Performance features:
     - Parallel block scanning for faster indexing
     - Progress tracking with estimated completion times
     - Incremental scanning that only processes new blocks
   - Database management with reset option when needed

### Automatic Token Approvals

When interacting with functions that require ERC20 tokens:

- ✅ Automatically detects when token approvals are needed
- 📊 Shows your current allowance and token balance
- 🔄 Prompts for approval if allowance is insufficient
- 🛠️ Offers two approval options:
  - Maximum amount (unlimited)
  - Custom specific amount
- ⚡ Handles the approval transaction before proceeding with the main function

---

## 📝 Input Guidelines

| Input Type | Format | Example |
|------------|--------|---------|
| **Array inputs** | Valid JSON arrays with square brackets | `["0xd1b537f5c53DEf7b14801d96b9b9956648D17892"]`<br>`[100]`<br>`["0x123...", "0x456..."]` |
| **Number inputs** | Enter without quotes | `100` |
| **Address inputs** | Full address with 0x prefix | `0xd1b537f5c53DEf7b14801d96b9b9956648D17892` |
| **Boolean inputs** | `true` or `false` | `true` |
| **String inputs** | Text without quotes (unless in JSON) | `https://example.com/metadata.json` |

### Manual Gas Limit

If the transaction encounters gas estimation issues, or you want to set specific gas:

1. When prompted, type `y` to set a manual gas limit
2. Enter a gas limit value (e.g., `500000`)

This is particularly useful for functions that might fail gas estimation but could still execute successfully.

---

## ✅ Transaction Verification

After a transaction is sent, the tool provides the following verification details:

| Information | Description |
|-------------|-------------|
| Transaction hash | Unique identifier for your transaction |
| Block number | The block in which the transaction was mined |
| Gas used | Amount of gas consumed by the transaction |
| Events | Any events emitted by the contract function |

> **Note**: Pectra-Devnet-7 may not have a public block explorer, so the transaction hash might not be searchable on common explorers. The transaction receipt details shown by the tool can be used to verify success.

---

## ❓ Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **"Cannot estimate gas"** | Set a manual gas limit when prompted |
| **"Execution reverted"** | Check permissions, parameters, or contract conditions |
| **Array format errors** | Ensure arrays are formatted as valid JSON with square brackets |
| **Transaction not found on explorer** | This is normal for Pectra-Devnet-7; rely on the tool's transaction details instead |
| **Token approval errors** | Verify the token address, your balance, and that the token follows ERC20 standards |

### Permissions

Many functions require specific permissions:
- Administrative functions are often restricted to the contract owner

---

## 🌐 Environment Constants

The tool uses the following environment constants:

```javascript
const ENV = {
  CONTRACT_ADDRESS: '0x5217C9034048B1Fa9Fb1e300F94fCd7002138Ea5',
  CHAIN_ID: 7032118028,
  RPC_URL: 'https://rpc.pectra-devnet-7.ethpandaops.io/',
};
```

---

## 🔒 Security Note

Your private key is stored locally in the `data/.private-key` file. Make sure to:
- Keep this file secure
- Do not share it with anyone
- Consider using a dedicated key for testnet operations only
