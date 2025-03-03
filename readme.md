# EVM CLI Transaction Tool

A command line tool for interacting with EVM contracts on Pectra-Devnet-7.

## Setup

1. Make sure you have Node.js installed on your system
2. Clone this repository or download the files
3. Install dependencies:
   ```
   npm install
   ```

## Usage

Run the tool:
```
npm start
```

### First-time setup
- When you run the tool for the first time, it will ask for your private key
- Your private key will be stored in a file in the `data` directory
- On subsequent runs, the tool will use the stored key

### Sending transactions
1. The tool will display a list of available contract functions
2. Select a function by typing its number or name
3. Enter the required parameters when prompted
4. Confirm the transaction
5. The tool will send the transaction and display the transaction hash
6. It will wait for the transaction to be mined and display the result

### Input Format Guidelines

- **Array inputs**: For array inputs (like `address[]` or `uint32[]`), you must format them as valid JSON arrays:
  - Example for address array: `["0xd1b537f5c53DEf7b14801d96b9b9956648D17892"]`
  - Example for number array: `[100]`
  - Multiple items: `["0x123...", "0x456..."]` or `[100, 200, 300]`

- **Number inputs**: For numeric inputs, simply enter the number without quotes, e.g., `100`

- **Address inputs**: For Ethereum addresses, enter the full address including the `0x` prefix

- **Boolean inputs**: Enter `true` or `false`

- **String inputs**: Enter text without quotes unless JSON formatting is required

### Manual Gas Limit

If the transaction encounters gas estimation issues, the tool will ask if you want to set a manual gas limit:

1. When prompted, type `y` to set a manual gas limit
2. Enter a gas limit value (e.g., `500000`)

This is particularly useful for functions that might fail gas estimation but could still execute successfully.

## Transaction Verification

After a transaction is sent, the tool will:

1. Display the transaction hash
2. Wait for the transaction to be mined
3. Show the block number and gas used
4. Display any events emitted by the transaction

Note that Pectra-Devnet-7 may not have a public block explorer, so the transaction hash might not be searchable on common explorers. The transaction receipt details shown by the tool can be used to verify success.

## Troubleshooting

### Common Issues

1. **"Cannot estimate gas"**: Try setting a manual gas limit when prompted.

2. **"Execution reverted"**: This usually means the contract rejected the transaction. Possible reasons:
   - You don't have the required permissions
   - Invalid parameters were provided
   - A contract condition wasn't met

3. **Array format errors**: Make sure arrays are properly formatted as JSON arrays with square brackets.

4. **Transaction not found on explorer**: Pectra-Devnet-7 may not have a public explorer, or the explorer may take time to index transactions.

### Permissions

Many functions require specific permissions:
- Administrative functions: Often restricted to the contract owner

## Environment Constants

The tool uses the following environment constants:

- Contract Address: 0x5217C9034048B1Fa9Fb1e300F94fCd7002138Ea5
- Chain ID: 7032118028
- RPC URL: https://rpc.pectra-devnet-7.ethpandaops.io/

## Security Note

Your private key is stored locally in the `data/.private-key` file. Make sure to:
- Keep this file secure
- Do not share it with anyone
- Consider using a dedicated key for testnet operations only