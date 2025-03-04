// Helper function to handle token approval revocation
async function handleRevokeTokenApproval(wallet, contract) {
  try {
    const tokenAddress = await question('\nEnter token address to revoke approval: ');
    
    if (!ethers.utils.isAddress(tokenAddress)) {
      console.error('Invalid token address');
      return;
    }
    
    // Create token contract instance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)"
      ],
      wallet
    );
    
    // Get token info
    let symbol = "Unknown";
    let name = "Unknown Token";
    let decimals = 18;
    try {
      symbol = await tokenContract.symbol();
      name = await tokenContract.name();
      decimals = await tokenContract.decimals();
      console.log(`\nToken: ${name} (${symbol})`);
    } catch (error) {
      console.warn(`Could not retrieve token info: ${error.message}`);
    }
    
    // Get current allowance
    const allowance = await tokenContract.allowance(wallet.address, contract.address);
    console.log(`Current allowance: ${ethers.utils.formatUnits(allowance, decimals)} ${symbol}`);
    
    if (allowance.isZero()) {
      console.log('No approval to revoke. Allowance is already 0.');
      return;
    }
    
    const confirm = await question(`\nDo you want to revoke approval for ${symbol}? (y/n): `);
    if (confirm.toLowerCase() !== 'y') {
      console.log('Revocation cancelled.');
      return;
    }
    
    // Ask about manual gas limit
    let overrides = {};
    const useManualGas = await question('Would you like to set a manual gas limit? (y/n): ');
    if (useManualGas.toLowerCase() === 'y') {
      const gasLimit = await question('Enter gas limit (e.g., 100000): ');
      overrides.gasLimit = ethers.BigNumber.from(gasLimit);
      console.log(`Using manual gas limit: ${gasLimit}`);
    }
    
    // Send revoke transaction (approve with 0 amount)
    console.log(`Sending revocation transaction...`);
    const revokeTx = await tokenContract.approve(contract.address, 0, overrides);
    console.log(`Revocation transaction sent! Hash: ${revokeTx.hash}`);
    
    // Wait for the transaction to be mined
    console.log(`Waiting for transaction to be mined...`);
    await revokeTx.wait();
    console.log(`✓ Approval successfully revoked!`);
    
  } catch (error) {
    console.error(`Error revoking approval: ${error.message}`);
  }
}

// Helper function to handle showing contract transactions
async function handleLastContractTransactions(provider, contract) {
  try {
    // Create data directory for transactions if it doesn't exist
    const TX_DATA_DIR = path.join(DATA_DIR, 'transactions');
    if (!fs.existsSync(TX_DATA_DIR)) {
      fs.mkdirSync(TX_DATA_DIR, { recursive: true });
    }
    
    // Transaction database file path
    const txDbFile = path.join(TX_DATA_DIR, `${contract.address.toLowerCase()}.json`);
    
    // Load existing transaction database or create new one
    let txDatabase = { lastScannedBlock: 0, transactions: [] };
    if (fs.existsSync(txDbFile)) {
      try {
        txDatabase = JSON.parse(fs.readFileSync(txDbFile, 'utf8'));
      } catch (error) {
        console.warn(`Could not load transaction database: ${error.message}. Creating new database.`);
      }
    }
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    
    // Show submenu for transaction options
    console.log('\nContract Transaction Options:');
    console.log('1. Find specific number of transactions');
    console.log('2. Scan recent blocks (last 100)');
    console.log('3. Scan specific block range');
    console.log('4. Scan from last checkpoint');
    console.log('5. View indexed transactions');
    console.log('6. Reset database');
    console.log(`\nCurrent block: ${currentBlock}`);
    console.log(`Last scanned block: ${txDatabase.lastScannedBlock}`);
    console.log(`Transactions in database: ${txDatabase.transactions.length}`);
    
    const option = await question('\nSelect an option: ');
    
    switch (option) {
      case '1': // Find specific number of transactions
        const numTx = parseInt(await question('How many transactions to find? (default: 10): ')) || 10;
        if (isNaN(numTx) || numTx <= 0) {
          console.error('Invalid number');
          return;
        }
        await findTransactions(provider, contract, numTx, currentBlock);
        break;
      case '2': // Scan recent blocks
        await scanBlocks(provider, contract, currentBlock - 100, currentBlock, txDatabase, txDbFile);
        break;
      case '3': // Scan specific range
        const startBlock = parseInt(await question('Enter start block: '));
        const endBlock = parseInt(await question('Enter end block: '));
        if (isNaN(startBlock) || isNaN(endBlock) || startBlock > endBlock) {
          console.error('Invalid block range');
          return;
        }
        await scanBlocks(provider, contract, startBlock, endBlock, txDatabase, txDbFile);
        break;
      case '4': // Scan from last checkpoint
        if (txDatabase.lastScannedBlock === 0) {
          console.log('No previous scan found. Starting a new scan of the last 100 blocks.');
          await scanBlocks(provider, contract, currentBlock - 100, currentBlock, txDatabase, txDbFile);
        } else {
          console.log(`Scanning from block ${txDatabase.lastScannedBlock} to ${currentBlock}`);
          await scanBlocks(provider, contract, txDatabase.lastScannedBlock + 1, currentBlock, txDatabase, txDbFile);
        }
        break;
      case '5': // View indexed transactions
        await viewIndexedTransactions(txDatabase);
        break;
      case '6': // Reset database
        const confirm = await question('Are you sure you want to reset the transaction database? (y/n): ');
        if (confirm.toLowerCase() === 'y') {
          txDatabase = { lastScannedBlock: 0, transactions: [] };
          fs.writeFileSync(txDbFile, JSON.stringify(txDatabase), 'utf8');
          console.log('Transaction database reset.');
        }
        break;
      default:
        console.log('Invalid option');
    }
  } catch (error) {
    console.error(`Error handling transactions: ${error.message}`);
  }
}

// Helper function to view indexed transactions from the database
async function viewIndexedTransactions(txDatabase) {
  try {
    const count = parseInt(await question('How many transactions to view? (default: 10): ')) || 10;
    
    if (txDatabase.transactions.length === 0) {
      console.log('No transactions in database. Please scan blocks first.');
      return;
    }
    
    // Sort transactions by block number in descending order
    const sortedTx = [...txDatabase.transactions].sort((a, b) => b.block - a.block);
    
    // Take requested number of transactions
    const transactions = sortedTx.slice(0, count);
    
    // Display transactions
    displayTransactions(transactions);
  } catch (error) {
    console.error(`Error viewing transactions: ${error.message}`);
  }
}

// Helper function to find a specific number of transactions by scanning backward
async function findTransactions(provider, contract, count, currentBlock) {
  try {
    console.log(`\nSearching for the last ${count} transactions...`);
    
    // Start looking from the latest block
    let startBlock = currentBlock;
    const endBlock = Math.max(currentBlock - 5000, 0); // Look back up to 5000 blocks
    
    const transactions = [];
    let blocksScanned = 0;
    let txFound = 0;
    let lastUpdateTime = Date.now();
    
    // Scan blocks for transactions involving our contract
    while (startBlock >= endBlock && transactions.length < count && blocksScanned < 2000) {
      try {
        // Get block with transactions
        const block = await provider.getBlockWithTransactions(startBlock);
        blocksScanned++;
        
        // Filter transactions involving our contract
        const contractTxs = block.transactions.filter(tx => 
          tx.to && tx.to.toLowerCase() === contract.address.toLowerCase()
        );
        
        // Process each transaction
        for (const tx of contractTxs) {
          try {
            // Get transaction receipt
            const receipt = await provider.getTransactionReceipt(tx.hash);
            
            // Try to decode the function call
            let functionName = 'Unknown Function';
            try {
              const decodedData = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
              functionName = decodedData.name;
            } catch (error) {
              // Could not decode function name
            }
            
            transactions.push({
              function: functionName,
              status: receipt.status ? 'Success' : 'Failed',
              block: block.number,
              from: tx.from,
              to: tx.to,
              hash: tx.hash,
              timestamp: new Date(block.timestamp * 1000).toLocaleString()
            });
            
            txFound++;
            
            // Stop if we have enough transactions
            if (transactions.length >= count) break;
          } catch (error) {
            console.warn(`Error processing transaction: ${error.message}`);
          }
        }
        
        // Stop if we have enough transactions
        if (transactions.length >= count) break;
        
        // Move to previous block
        startBlock--;
        
        // Show progress at regular intervals (but not too frequently)
        const now = Date.now();
        if (now - lastUpdateTime > 2000) { // Update every 2 seconds
          lastUpdateTime = now;
          
          // Calculate speed and ETA
          const elapsedSeconds = (now - (lastUpdateTime - 2000)) / 1000;
          const blocksPerSecond = blocksScanned / elapsedSeconds;
          const estimatedTotalBlocks = blocksScanned * (count / Math.max(transactions.length, 1));
          const remainingBlocks = estimatedTotalBlocks - blocksScanned;
          const etaSeconds = blocksPerSecond > 0 ? Math.floor(remainingBlocks / blocksPerSecond) : 'unknown';
          
          console.log(`Scanning... (${blocksScanned} blocks, found ${txFound} transactions, ~${typeof etaSeconds === 'number' ? formatTime(etaSeconds) : etaSeconds} remaining)`);
        }
      } catch (error) {
        console.warn(`Error scanning block ${startBlock}: ${error.message}`);
        startBlock--;
      }
    }
    
    if (transactions.length === 0) {
      console.log(`No transactions found for contract ${contract.address} in the scanned ${blocksScanned} blocks.`);
      return;
    }
    
    // Display transactions
    displayTransactions(transactions);
    
    console.log(`\nScanned ${blocksScanned} blocks, found ${txFound} transactions, displayed ${transactions.length}.`);
    
  } catch (error) {
    console.error(`Error finding transactions: ${error.message}`);
  }
}

// Helper function to scan blocks and update database
async function scanBlocks(provider, contract, startBlock, endBlock, txDatabase, txDbFile) {
  try {
    console.log(`\nScanning blocks ${startBlock} to ${endBlock}...`);
    
    // This is for progress tracking
    const totalBlocks = endBlock - startBlock + 1;
    let blocksScanned = 0;
    let newTxFound = 0;
    let startTime = Date.now();
    
    // Set up batch settings
    const BATCH_SIZE = 25; // Number of blocks to process in parallel
    const SAVE_INTERVAL = 100; // Save database every 100 blocks
    
    // Process blocks in batches to improve performance
    for (let batchStart = startBlock; batchStart <= endBlock; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock);
      
      // Create batch of promises to get blocks with transactions
      const blockPromises = [];
      for (let blockNum = batchStart; blockNum <= batchEnd; blockNum++) {
        blockPromises.push(provider.getBlockWithTransactions(blockNum).catch(error => {
          console.warn(`Error fetching block ${blockNum}: ${error.message}`);
          return null;
        }));
      }
      
      // Wait for all blocks in batch
      const blocks = await Promise.all(blockPromises);
      
      // Process valid blocks
      for (const block of blocks) {
        if (!block) continue;
        
        blocksScanned++;
        
        // Filter transactions involving our contract
        const contractTxs = block.transactions.filter(tx => 
          tx.to && tx.to.toLowerCase() === contract.address.toLowerCase()
        );
        
        // Process each transaction
        for (const tx of contractTxs) {
          try {
            // Get transaction receipt
            const receipt = await provider.getTransactionReceipt(tx.hash);
            
            // Try to decode the function call
            let functionName = 'Unknown Function';
            try {
              const decodedData = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
              functionName = decodedData.name;
            } catch (error) {
              // Could not decode function name
            }
            
            // Create transaction object
            const txObj = {
              hash: tx.hash,
              function: functionName,
              status: receipt.status ? 'Success' : 'Failed',
              block: block.number,
              from: tx.from,
              to: tx.to,
              timestamp: new Date(block.timestamp * 1000).toLocaleString()
            };
            
            // Check if transaction already exists
            const exists = txDatabase.transactions.some(t => t.hash === tx.hash);
            if (!exists) {
              txDatabase.transactions.push(txObj);
              newTxFound++;
            }
          } catch (error) {
            console.warn(`Error processing transaction: ${error.message}`);
          }
        }
        
        // Update last scanned block if higher than current value
        if (block.number > txDatabase.lastScannedBlock) {
          txDatabase.lastScannedBlock = block.number;
        }
        
        // Save database periodically
        if (blocksScanned % SAVE_INTERVAL === 0) {
          fs.writeFileSync(txDbFile, JSON.stringify(txDatabase), 'utf8');
          
          // Calculate progress and ETA
          const percentComplete = Math.floor((blocksScanned / totalBlocks) * 100);
          const elapsedTime = (Date.now() - startTime) / 1000;
          const blocksPerSecond = blocksScanned / elapsedTime;
          const remainingBlocks = totalBlocks - blocksScanned;
          const etaSeconds = blocksPerSecond > 0 ? Math.floor(remainingBlocks / blocksPerSecond) : 'unknown';
          
          console.log(`Processed ${blocksScanned}/${totalBlocks} blocks (${percentComplete}%), found ${newTxFound} new transactions. ETA: ${typeof etaSeconds === 'number' ? formatTime(etaSeconds) : etaSeconds}`);
        }
      }
    }
    
    // Final save
    fs.writeFileSync(txDbFile, JSON.stringify(txDatabase), 'utf8');
    
    console.log(`\nScan complete! Processed ${blocksScanned} blocks, found ${newTxFound} new transactions.`);
    console.log(`Total transactions in database: ${txDatabase.transactions.length}`);
    
    // Ask if user wants to view transactions
    const viewTx = await question('\nDo you want to view the latest transactions? (y/n): ');
    if (viewTx.toLowerCase() === 'y') {
      await viewIndexedTransactions(txDatabase);
    }
    
  } catch (error) {
    console.error(`Error scanning blocks: ${error.message}`);
  }
}

// Helper function to display transactions in a table
function displayTransactions(transactions) {
  if (transactions.length === 0) {
    console.log('No transactions to display.');
    return;
  }
  
  console.log('\nContract Transactions:');
  console.log('-'.repeat(150));
  console.log('| Function'.padEnd(25) + '| Status'.padEnd(11) + '| Block'.padEnd(10) + '| Timestamp'.padEnd(26) + '| From'.padEnd(25) + '| To'.padEnd(25) + '| Hash'.padEnd(30) + '|');
  console.log('-'.repeat(150));
  
  transactions.forEach(tx => {
    const truncatedFrom = tx.from.slice(0, 8) + '...' + tx.from.slice(-6);
    const truncatedTo = tx.to.slice(0, 8) + '...' + tx.to.slice(-6);
    const truncatedHash = tx.hash.slice(0, 8) + '...' + tx.hash.slice(-6);
    
    console.log(
      '| ' + tx.function.slice(0, 22).padEnd(23) + 
      '| ' + tx.status.padEnd(9) + 
      '| ' + tx.block.toString().padEnd(8) + 
      '| ' + tx.timestamp.padEnd(24) + 
      '| ' + truncatedFrom.padEnd(23) + 
      '| ' + truncatedTo.padEnd(23) + 
      '| ' + truncatedHash.padEnd(28) + 
      '|'
    );
  });
  console.log('-'.repeat(150));
}

// Helper function to format time in seconds to human-readable format
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  return [
    hours > 0 ? `${hours}h` : '',
    minutes > 0 ? `${minutes}m` : '',
    `${remainingSeconds}s`
  ].filter(Boolean).join(' ');
}// Helper function to ask questions
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}// evm-cli.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ethers } = require('ethers');

// Environment constants
const ENV = {
  CONTRACT_ADDRESS: '0x5217C9034048B1Fa9Fb1e300F94fCd7002138Ea5',
  CHAIN_ID: 7032118028,
  RPC_URL: 'https://rpc.pectra-devnet-7.ethpandaops.io/',
};

// Create directories if they don't exist
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ABI from the provided file
const ABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'contract-abi.json'), 'utf8'));

// Private key file
const KEY_FILE = path.join(DATA_DIR, '.private-key');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to check and handle token approvals
async function checkAndHandleTokenApproval(wallet, contract, tokenAddress, amount) {
  // Skip for ETH
  if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || 
      tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    return true;
  }
  
  try {
    // Create token contract instance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
      ],
      wallet
    );
    
    // Get token info
    let symbol = "Unknown";
    let decimals = 18;
    try {
      symbol = await tokenContract.symbol();
      decimals = await tokenContract.decimals();
    } catch (error) {
      console.warn(`Could not retrieve token info: ${error.message}`);
    }
    
    // Get current allowance
    const allowance = await tokenContract.allowance(wallet.address, contract.address);
    
    // Get user's balance
    const balance = await tokenContract.balanceOf(wallet.address);
    
    // Check if allowance is sufficient
    if (allowance.lt(amount)) {
      console.log(`\nToken approval required for ${symbol} (${tokenAddress})`);
      console.log(`Current allowance: ${ethers.utils.formatUnits(allowance, decimals)} ${symbol}`);
      console.log(`Required amount: ${ethers.utils.formatUnits(amount, decimals)} ${symbol}`);
      console.log(`Your balance: ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
      
      // Prompt for approval
      const shouldApprove = await question("Do you want to approve tokens for this transaction? (y/n): ");
      
      if (shouldApprove.toLowerCase() === "y") {
        // Ask for approval amount
        const maxApproval = ethers.constants.MaxUint256;
        const useMaxApproval = await question(`Do you want to approve maximum amount? (y/n, default: y): `);
        
        let approvalAmount;
        if (useMaxApproval.toLowerCase() !== "n") {
          approvalAmount = maxApproval;
          console.log(`Setting maximum approval (unlimited)`);
        } else {
          const customAmount = await question(`Enter approval amount in ${symbol}: `);
          approvalAmount = ethers.utils.parseUnits(customAmount, decimals);
          console.log(`Setting approval for ${customAmount} ${symbol}`);
        }
        
        // Send approval transaction
        console.log(`Sending approval transaction...`);
        const approveTx = await tokenContract.approve(contract.address, approvalAmount);
        console.log(`Approval transaction sent! Hash: ${approveTx.hash}`);
        
        // Wait for the approval transaction to be mined
        console.log(`Waiting for approval transaction to be mined...`);
        await approveTx.wait();
        console.log(`Approval transaction confirmed!`);
        
        return true;
      } else {
        console.log(`Token approval declined. Cannot proceed with the transaction.`);
        return false;
      }
    } else {
      console.log(`\nToken approval check for ${symbol}: ✓`);
      console.log(`Current allowance: ${ethers.utils.formatUnits(allowance, decimals)} ${symbol}`);
      return true;
    }
  } catch (error) {
    console.error(`Error checking token approval: ${error.message}`);
    return false;
  }
}

// Helper function to check if a function is likely to be admin-only
async function checkPermissions(contract, wallet, selectedFunction) {
  try {
    // Check if there's an owner function in the contract
    if (contract.owner) {
      const owner = await contract.owner();
      if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.warn(`\nWarning: You are not the owner of this contract.`);
        console.warn(`Contract owner: ${owner}`);
        console.warn(`Your address: ${wallet.address}`);
        console.warn(`The '${selectedFunction.name}' function may require owner permissions.`);
        return false;
      } else {
        console.log(`\nYou are the owner of this contract.`);
        return true;
      }
    }
  } catch (error) {
    console.warn(`\nCouldn't verify ownership status: ${error.message}`);
  }
  return true;
}

// Helper function to check BApp registration status if applicable
async function checkBAppStatus(contract, params, selectedFunction) {
  if (selectedFunction.name === 'registerBApp' && params.length > 0 && Array.isArray(params[0])) {
    try {
      // For registerBApp, the first param should be tokens array
      // We'll check using the registeredBApps function if it exists
      if (contract.registeredBApps && params[0].length > 0) {
        const bAppAddress = params[0][0]; // First token address
        const isRegistered = await contract.registeredBApps(bAppAddress);
        if (isRegistered) {
          console.warn(`\nWarning: The BApp address ${bAppAddress} appears to be already registered.`);
          return false;
        } else {
          console.log(`\nThe BApp address ${bAppAddress} is not yet registered.`);
          return true;
        }
      }
    } catch (error) {
      console.warn(`\nCouldn't verify BApp registration status: ${error.message}`);
    }
  }
  return true;
}

// Function to get or create private key
async function getPrivateKey() {
  if (fs.existsSync(KEY_FILE)) {
    try {
      return fs.readFileSync(KEY_FILE, 'utf8').trim();
    } catch (error) {
      console.error('Error reading private key file:', error.message);
      throw error;
    }
  }
  
  console.log('No private key found. Please enter your private key.');
  console.log('Warning: This will be saved to a local file. Ensure your system is secure.');
  const privateKey = await question('Private key (without 0x prefix): ');
  
  // Validate private key format
  try {
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    new ethers.Wallet(formattedKey);
    
    // Save private key to file with restricted permissions
    fs.writeFileSync(KEY_FILE, formattedKey, { mode: 0o600 });
    console.log('Private key saved successfully.');
    return formattedKey;
  } catch (error) {
    console.error('Invalid private key format:', error.message);
    throw error;
  }
}

// Parse parameter based on type
function parseParameter(value, type) {
  if (value.trim() === '') {
    if (type.includes('[]')) return [];
    throw new Error(`Empty value not allowed for ${type}`);
  }
  
  try {
    // Handle arrays
    if (type.includes('[]')) {
      const parsedArray = JSON.parse(value);
      
      // For arrays of integers, ensure each item is properly converted to BigNumber
      if (type.startsWith('uint') || type.startsWith('int')) {
        return parsedArray.map(item => {
          // Remove quotes if the item is a string representation of a number
          if (typeof item === 'string' && !isNaN(item)) {
            return ethers.BigNumber.from(item);
          }
          return ethers.BigNumber.from(item);
        });
      }
      
      return parsedArray;
    } 
    // Handle booleans
    else if (type === 'bool') {
      return value.toLowerCase() === 'true';
    } 
    // Handle bytes
    else if (type === 'bytes' || type.startsWith('bytes')) {
      return value.startsWith('0x') ? value : `0x${value}`;
    } 
    // Handle integers
    else if (type.startsWith('uint') || type.startsWith('int')) {
      return ethers.BigNumber.from(value);
    } 
    // Handle addresses
    else if (type === 'address') {
      if (!ethers.utils.isAddress(value)) {
        throw new Error('Invalid Ethereum address');
      }
      return value;
    } 
    // Handle contract interfaces (treat as address)
    else if (type.includes('contract ')) {
      if (!ethers.utils.isAddress(value)) {
        throw new Error('Invalid contract address');
      }
      return value;
    }
    // Default to string
    else {
      return value;
    }
  } catch (error) {
    throw new Error(`Error parsing ${type}: ${error.message}`);
  }
}

// Main function
async function main() {
  try {
    // Get private key
    const privateKey = await getPrivateKey();
    
    // Set up provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
    
    try {
      // Test provider connection
      await provider.getNetwork();
    } catch (error) {
      console.error(`Failed to connect to RPC: ${ENV.RPC_URL}`);
      console.error(error.message);
      return;
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Get the wallet address and balance
    const address = wallet.address;
    const balance = ethers.utils.formatEther(await provider.getBalance(address));
    
    console.log(`\nConnected with wallet: ${address}`);
    console.log(`Balance: ${balance} ETH`);
    
    // Set up contract
    const contract = new ethers.Contract(ENV.CONTRACT_ADDRESS, ABI, wallet);
    
    // Get writable functions (non-view, non-pure)
    const writableFunctions = Object.values(contract.interface.functions)
      .filter(func => 
        func.stateMutability !== 'view' && 
        func.stateMutability !== 'pure' &&
        func.type !== 'constructor'
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Display functions
    console.log('\nAvailable functions:');
    writableFunctions.forEach((func, index) => {
      console.log(`${index + 1}. ${func.name}`);
    });
    
    // Display additional options
    console.log('\nAdditional Options:');
    console.log(`${writableFunctions.length + 1}. Revoke token approval`);
    console.log(`${writableFunctions.length + 2}. View contract transactions`);
    
    // Get user function selection
    const selection = await question('\nSelect a function or option (number or name): ');
    
    // Handle additional options
    if (selection === `${writableFunctions.length + 1}` || selection.toLowerCase() === 'revoke token approval') {
      await handleRevokeTokenApproval(wallet, contract);
      return;
    } else if (selection === `${writableFunctions.length + 2}` || selection.toLowerCase() === 'view contract transactions' || selection.toLowerCase() === 'last 10 contract txns') {
      await handleLastContractTransactions(provider, contract);
      return;
    }
    
    // Find the selected function
    let selectedFunction;
    if (!isNaN(selection) && parseInt(selection) > 0 && parseInt(selection) <= writableFunctions.length) {
      selectedFunction = writableFunctions[parseInt(selection) - 1];
    } else {
      selectedFunction = writableFunctions.find(func => func.name.toLowerCase() === selection.toLowerCase());
    }
    
    if (!selectedFunction) {
      console.error('Invalid function selection. Please try again.');
      return;
    }
    
    console.log(`\nSelected function: ${selectedFunction.name}`);
    if (selectedFunction.inputs.length > 0) {
      console.log('Required parameters:');
      selectedFunction.inputs.forEach(input => {
        console.log(`- ${input.name} (${input.type})`);
      });
    } else {
      console.log('This function takes no parameters.');
    }
    
    // Collect parameters
    const params = [];
    for (const input of selectedFunction.inputs) {
      const paramValue = await question(`Enter ${input.name} (${input.type}): `);
      try {
        params.push(parseParameter(paramValue, input.type));
      } catch (error) {
        console.error(error.message);
        return;
      }
    }
    
    // Get value if the function is payable
    let overrides = {};
    if (selectedFunction.stateMutability === 'payable') {
      const value = await question('Enter ETH value to send (in ether): ');
      overrides.value = ethers.utils.parseEther(value);
    }
    
    // Ask about manual gas limit
    const useManualGas = await question('Would you like to set a manual gas limit? (y/n): ');
    if (useManualGas.toLowerCase() === 'y') {
      const gasLimit = await question('Enter gas limit (e.g., 300000): ');
      overrides.gasLimit = ethers.BigNumber.from(gasLimit);
    }
    
    // Check permissions and contract state
    await checkPermissions(contract, wallet, selectedFunction);
    await checkBAppStatus(contract, params, selectedFunction);
    
    // Confirm transaction
    console.log('\nTransaction details:');
    console.log(`- Function: ${selectedFunction.name}`);
    console.log(`- Parameters: ${JSON.stringify(params, (key, value) => {
      if (typeof value === 'object' && value.type === 'BigNumber') {
        return value.toString();
      }
      return value;
    }, 2)}`);
    
    if (overrides.value) {
      console.log(`- Value: ${ethers.utils.formatEther(overrides.value)} ETH`);
    }
    
    const confirmation = await question('\nReady to send transaction. Confirm? (y/n): ');
    if (confirmation.toLowerCase() !== 'y') {
      console.log('Transaction cancelled.');
      return;
    }
    
    // Check for token approvals if this is a token-related function
    let needsApproval = false;
    let tokenAddress;
    let amountToApprove;
    
    // Check if this function involves token deposits
    if (selectedFunction.name === 'depositERC20') {
      // For depositERC20, token is the second parameter (idx 1) and amount is third (idx 2)
      if (params.length >= 3) {
        tokenAddress = params[1];
        amountToApprove = params[2];
        needsApproval = true;
      }
    }
    
    // Add other token-related functions as needed
    // For example, if there are other functions that require token approval
    
    // Handle token approval if needed
    if (needsApproval) {
      const approvalSuccess = await checkAndHandleTokenApproval(wallet, contract, tokenAddress, amountToApprove);
      if (!approvalSuccess) {
        console.log('Transaction cancelled due to insufficient token approval.');
        return;
      }
    }
    
    // Send transaction
    console.log('Sending transaction...');
    try {
      // Try to simulate the transaction first to get a more detailed error message
      console.log('Simulating transaction first...');
      try {
        await contract.callStatic[selectedFunction.name](...params, overrides);
        console.log('Simulation successful.');
      } catch (simulationError) {
        console.error('Transaction simulation failed:');
        console.error(`Reason: ${simulationError.reason || simulationError.message}`);
        
        if (simulationError.errorName) {
          console.error(`Error name: ${simulationError.errorName}`);
        }
        
        if (simulationError.errorArgs) {
          console.error('Error arguments:', simulationError.errorArgs);
        }
        
        if (simulationError.code === 'UNPREDICTABLE_GAS_LIMIT') {
          console.log('This error often occurs when you lack permission or requirements for this function.');
        }
        
        const proceed = await question('Do you still want to proceed with the transaction? (y/n): ');
        if (proceed.toLowerCase() !== 'y') {
          console.log('Transaction cancelled.');
          return;
        }
      }
      
      const tx = await contract[selectedFunction.name](...params, overrides);
      console.log(`\nTransaction sent! Hash: ${tx.hash}`);
      
      // Wait for the transaction to be mined
      console.log('Waiting for transaction to be mined...');
      const receipt = await tx.wait();
      console.log(`Transaction mined in block ${receipt.blockNumber}!`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);
      
      // Display any events
      if (receipt.events && receipt.events.length > 0) {
        console.log('\nTransaction events:');
        receipt.events.forEach((event, index) => {
          if (event.event) {
            console.log(`Event: ${event.event}`);
          }
        });
      }
    } catch (error) {
      console.error('Transaction failed:');
      if (error.reason) {
        console.error(`Reason: ${error.reason}`);
      } else {
        console.error(error.message);
      }
      
      // Try to decode custom errors from the ABI
      if (error.data) {
        try {
          const errorData = error.data;
          // Try to match error signature against known errors in the ABI
          const customErrors = contract.interface.errors;
          for (const [errorName, errorFragment] of Object.entries(customErrors)) {
            try {
              const decodedError = contract.interface.decodeErrorResult(errorName, errorData);
              console.error(`Custom error details: ${errorName}`, decodedError);
              break;
            } catch (e) {
              // Not this error, continue trying
            }
          }
        } catch (e) {
          console.error('Could not decode custom error');
        }
      }
    }
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    rl.close();
  }
}

// Run the application
main();
