// Helper function to view strategies
async function viewStrategies(contract, userAddress) {
  try {
    console.log('\nRetrieving your strategies...');
    
    // Look for saved strategies
    const strategiesFile = path.join(DATA_DIR, 'strategies.json');
    let strategies = {};
    if (fs.existsSync(strategiesFile)) {
      try {
        strategies = JSON.parse(fs.readFileSync(strategiesFile, 'utf8'));
      } catch (e) {
        console.warn('Error reading strategies file');
      }
    }
    
    if (Object.keys(strategies).length === 0) {
      console.log('No strategies found in local database.');
      
      // Ask if they want to scan for strategies
      const scanForStrategies = await question('Would you like to scan the blockchain for your strategies? (y/n): ');
      if (scanForStrategies.toLowerCase() === 'y') {
        await scanForStrategiesOnChain(contract, userAddress);
      }
      return;
    }
    
    // Display strategies
    console.log('\nYour Strategies:');
    console.log('-'.repeat(100));
    console.log('| Strategy ID'.padEnd(15) + '| Owner'.padEnd(45) + '| Created At'.padEnd(30) + '| TX Hash'.padEnd(20) + '|');
    console.log('-'.repeat(100));
    
    for (const [id, strategy] of Object.entries(strategies)) {
      const truncatedOwner = strategy.owner ? `${strategy.owner.slice(0, 8)}...${strategy.owner.slice(-6)}` : 'Unknown';
      const truncatedHash = strategy.transactionHash ? `${strategy.transactionHash.slice(0, 8)}...${strategy.transactionHash.slice(-6)}` : 'Unknown';
      
      console.log(
        '| ' + id.toString().padEnd(13) + 
        '| ' + truncatedOwner.padEnd(43) + 
        '| ' + (strategy.createdAt || 'Unknown').padEnd(28) + 
        '| ' + truncatedHash.padEnd(18) + 
        '|'
      );
    }
    console.log('-'.repeat(100));
    
    // Show options
    console.log('\nOptions:');
    console.log('1. View strategy details');
    console.log('2. Scan for more strategies');
    console.log('3. Back to main menu');
    
    const option = await question('\nSelect an option: ');
    
    switch (option) {
      case '1':
        const strategyId = await question('Enter strategy ID to view details: ');
        if (strategies[strategyId]) {
          await viewStrategyDetails(contract, strategyId, strategies[strategyId]);
        } else {
          console.log(`Strategy ID ${strategyId} not found.`);
        }
        await viewStrategies(contract, userAddress);
        break;
      case '2':
        await scanForStrategiesOnChain(contract, userAddress);
        await viewStrategies(contract, userAddress);
        break;
      case '3':
        return;
      default:
        console.log('Invalid option');
        await viewStrategies(contract, userAddress);
    }
  } catch (error) {
    console.error(`Error viewing strategies: ${error.message}`);
  }
}

// Helper function to view strategy details
async function viewStrategyDetails(contract, strategyId, strategy) {
  try {
    console.log(`\nStrategy ID: ${strategyId}`);
    console.log(`Owner: ${strategy.owner || 'Unknown'}`);
    console.log(`Created At: ${strategy.createdAt || 'Unknown'}`);
    console.log(`Transaction Hash: ${strategy.transactionHash || 'Unknown'}`);
    
    // Try to get on-chain information
    try {
      const strategyInfo = await contract.strategies(strategyId);
      console.log(`\nOn-chain data:`);
      console.log(`Owner: ${strategyInfo.owner}`);
      console.log(`Fee: ${strategyInfo.fee.toString()}`);
      
      if (strategyInfo.feeProposed) {
        console.log(`Proposed Fee: ${strategyInfo.feeProposed.toString()}`);
      }
      
      if (strategyInfo.feeRequestTime) {
        const requestTime = new Date(strategyInfo.feeRequestTime.toNumber() * 1000);
        console.log(`Fee Request Time: ${requestTime.toLocaleString()}`);
      }
    } catch (error) {
      console.log('Could not retrieve on-chain strategy data:', error.message);
    }
    
    await question('\nPress Enter to continue...');
  } catch (error) {
    console.error(`Error viewing strategy details: ${error.message}`);
  }
}

// Helper function to scan blockchain for strategies
async function scanForStrategiesOnChain(contract, userAddress) {
  try {
    console.log('\nScanning blockchain for strategies...');
    
    // Create strategies file if it doesn't exist
    const strategiesFile = path.join(DATA_DIR, 'strategies.json');
    let strategies = {};
    if (fs.existsSync(strategiesFile)) {
      try {
        strategies = JSON.parse(fs.readFileSync(strategiesFile, 'utf8'));
      } catch (e) {
        console.warn('Error reading strategies file, creating new one');
      }
    }
    
    // Get the current block number
    const provider = contract.provider;
    const currentBlock = await provider.getBlockNumber();
    
    // Determine how far back to scan (default to 5000 blocks or the beginning)
    let fromBlock = Math.max(currentBlock - 5000, 0);
    
    // Ask user for custom block range
    const customRange = await question('Do you want to specify a custom block range to scan? (y/n): ');
    if (customRange.toLowerCase() === 'y') {
      const startBlock = await question(`Enter start block (default: ${fromBlock}): `);
      if (startBlock && !isNaN(parseInt(startBlock))) {
        fromBlock = parseInt(startBlock);
      }
    }
    
    console.log(`Scanning from block ${fromBlock} to ${currentBlock}...`);
    
    // Use getLogs to find StrategyCreated events
    try {
      // Get the StrategyCreated event signature
      const eventSignature = 'StrategyCreated(uint32,address,uint32,string)';
      const eventTopic = ethers.utils.id(eventSignature);
      
      // Create a filter to find events where the owner (second indexed param) is our address
      // The first topic is the event signature, the second is the strategyId (indexed)
      // The third topic would be the owner address (also indexed)
      const filter = {
        address: contract.address,
        fromBlock: fromBlock,
        toBlock: currentBlock,
        topics: [
          eventTopic,
          null, // We don't filter by strategy ID
          ethers.utils.hexZeroPad(userAddress, 32) // Filter by owner address (padded to 32 bytes)
        ]
      };
      
      const logs = await provider.getLogs(filter);
      console.log(`Found ${logs.length} potential strategy events...`);
      
      let foundStrategies = 0;
      
      // Process each log
      for (const log of logs) {
        if (log.topics && log.topics.length > 1) {
          const strategyIdHex = log.topics[1];
          const strategyId = parseInt(strategyIdHex, 16);
          
          // Only process if we don't already have this strategy
          if (!strategies[strategyId]) {
            // Get the block for timestamp
            const block = await provider.getBlock(log.blockNumber);
            
            // Add to strategies list
            strategies[strategyId] = {
              id: strategyId,
              hexId: strategyIdHex,
              createdAt: new Date(block.timestamp * 1000).toISOString(),
              transactionHash: log.transactionHash,
              owner: userAddress
            };
            
            foundStrategies++;
          }
        }
      }
      
      // Save strategies to file
      fs.writeFileSync(strategiesFile, JSON.stringify(strategies, null, 2));
      
      console.log(`Scan complete. Found ${foundStrategies} new strategies.`);
      console.log(`Total strategies in database: ${Object.keys(strategies).length}`);
      
    } catch (error) {
      console.error(`Error scanning for StrategyCreated events: ${error.message}`);
      console.log('Trying alternative method...');
      
      // Alternative: Look for strategy in transactions
      console.log('Scanning transaction history for createStrategy calls...');
      
      // Create a database file for transactions if needed
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
      
      // Filter transactions for createStrategy
      const strategyTxs = txDatabase.transactions.filter(tx => 
        tx.function === 'createStrategy' && tx.from.toLowerCase() === userAddress.toLowerCase()
      );
      
      console.log(`Found ${strategyTxs.length} createStrategy transactions in history.`);
      
      // Extract strategy IDs
      let newStrategiesFound = 0;
      for (const tx of strategyTxs) {
        if (tx.strategyId && !strategies[tx.strategyId]) {
          strategies[tx.strategyId] = {
            id: tx.strategyId,
            hexId: tx.strategyIdHex || null,
            createdAt: tx.timestamp || new Date().toISOString(),
            transactionHash: tx.hash,
            owner: userAddress
          };
          newStrategiesFound++;
        }
      }
      
      // Save strategies to file
      fs.writeFileSync(strategiesFile, JSON.stringify(strategies, null, 2));
      
      console.log(`Found ${newStrategiesFound} new strategies from transaction history.`);
      console.log(`Total strategies in database: ${Object.keys(strategies).length}`);
    }
    
    await question('\nPress Enter to continue...');
  } catch (error) {
    console.error(`Error scanning for strategies: ${error.message}`);
    await question('\nPress Enter to continue...');
  }
}// Helper function to view strategies
async function viewStrategies(contract, userAddress) {
  try {
    console.log('\nRetrieving your strategies...');
    
    // Look for saved strategies
    const strategiesFile = path.join(DATA_DIR, 'strategies.json');
    let strategies = {};
    if (fs.existsSync(strategiesFile)) {
      try {
        strategies = JSON.parse(fs.readFileSync(strategiesFile, 'utf8'));
      } catch (e) {
        console.warn('Error reading strategies file');
      }
    }
    
    if (Object.keys(strategies).length === 0) {
      console.log('No strategies found in local database.');
      
      // Ask if they want to scan for strategies
      const scanForStrategies = await question('Would you like to scan the blockchain for your strategies? (y/n): ');
      if (scanForStrategies.toLowerCase() === 'y') {
        await scanForStrategiesOnChain(contract, userAddress);
      }
      return;
    }
    
    // Display strategies
    console.log('\nYour Strategies:');
    console.log('-'.repeat(100));
    console.log('| Strategy ID'.padEnd(15) + '| Owner'.padEnd(45) + '| Created At'.padEnd(30) + '| TX Hash'.padEnd(20) + '|');
    console.log('-'.repeat(100));
    
    for (const [id, strategy] of Object.entries(strategies)) {
      const truncatedOwner = strategy.owner ? `${strategy.owner.slice(0, 8)}...${strategy.owner.slice(-6)}` : 'Unknown';
      const truncatedHash = strategy.transactionHash ? `${strategy.transactionHash.slice(0, 8)}...${strategy.transactionHash.slice(-6)}` : 'Unknown';
      
      console.log(
        '| ' + id.toString().padEnd(13) + 
        '| ' + truncatedOwner.padEnd(43) + 
        '| ' + (strategy.createdAt || 'Unknown').padEnd(28) + 
        '| ' + truncatedHash.padEnd(18) + 
        '|'
      );
    }
    console.log('-'.repeat(100));
    
    // Show options
    console.log('\nOptions:');
    console.log('1. View strategy details');
    console.log('2. Scan for more strategies');
    console.log('3. Back to main menu');
    
    const option = await question('\nSelect an option: ');
    
    switch (option) {
      case '1':
        const strategyId = await question('Enter strategy ID to view details: ');
        if (strategies[strategyId]) {
          await viewStrategyDetails(contract, strategyId, strategies[strategyId]);
        } else {
          console.log(`Strategy ID ${strategyId} not found.`);
        }
        await viewStrategies(contract, userAddress);
        break;
      case '2':
        await scanForStrategiesOnChain(contract, userAddress);
        await viewStrategies(contract, userAddress);
        break;
      case '3':
        return;
      default:
        console.log('Invalid option');
        await viewStrategies(contract, userAddress);
    }
  } catch (error) {
    console.error(`Error viewing strategies: ${error.message}`);
  }
}

// Helper function to view strategy details
async function viewStrategyDetails(contract, strategyId, strategy) {
  try {
    console.log(`\nStrategy ID: ${strategyId}`);
    console.log(`Owner: ${strategy.owner || 'Unknown'}`);
    console.log(`Created At: ${strategy.createdAt || 'Unknown'}`);
    console.log(`Transaction Hash: ${strategy.transactionHash || 'Unknown'}`);
    
    // Try to get on-chain information
    try {
      const strategyInfo = await contract.strategies(strategyId);
      console.log(`\nOn-chain data:`);
      console.log(`Owner: ${strategyInfo.owner}`);
      console.log(`Fee: ${strategyInfo.fee.toString()}`);
      
      if (strategyInfo.feeProposed) {
        console.log(`Proposed Fee: ${strategyInfo.feeProposed.toString()}`);
      }
      
      if (strategyInfo.feeRequestTime) {
        const requestTime = new Date(strategyInfo.feeRequestTime.toNumber() * 1000);
        console.log(`Fee Request Time: ${requestTime.toLocaleString()}`);
      }
    } catch (error) {
      console.log('Could not retrieve on-chain strategy data:', error.message);
    }
    
    await question('\nPress Enter to continue...');
  } catch (error) {
    console.error(`Error viewing strategy details: ${error.message}`);
  }
}

// Helper function to scan blockchain for strategies
async function scanForStrategiesOnChain(contract, userAddress) {
  try {
    console.log('\nScanning blockchain for strategies...');
    
    // Create strategies file if it doesn't exist
    const strategiesFile = path.join(DATA_DIR, 'strategies.json');
    let strategies = {};
    if (fs.existsSync(strategiesFile)) {
      try {
        strategies = JSON.parse(fs.readFileSync(strategiesFile, 'utf8'));
      } catch (e) {
        console.warn('Error reading strategies file, creating new one');
      }
    }
    
    // Get the current block number
    const provider = contract.provider;
    const currentBlock = await provider.getBlockNumber();
    
    // Determine how far back to scan (default to 5000 blocks or the beginning)
    let fromBlock = Math.max(currentBlock - 5000, 0);
    
    // Ask user for custom block range
    const customRange = await question('Do you want to specify a custom block range to scan? (y/n): ');
    if (customRange.toLowerCase() === 'y') {
      const startBlock = await question(`Enter start block (default: ${fromBlock}): `);
      if (startBlock && !isNaN(parseInt(startBlock))) {
        fromBlock = parseInt(startBlock);
      }
    }
    
    console.log(`Scanning from block ${fromBlock} to ${currentBlock}...`);
    
    // Use getLogs to find StrategyCreated events
    try {
      // Get the StrategyCreated event signature
      const eventSignature = 'StrategyCreated(uint256,address,uint32,string)';
      const eventTopic = ethers.utils.id(eventSignature);
      
      // Create a filter to find events where the owner (second indexed param) is our address
      // The first topic is the event signature, the second is the strategyId (indexed)
      // The third topic would be the owner address (also indexed)
      const filter = {
        address: contract.address,
        fromBlock: fromBlock,
        toBlock: currentBlock,
        topics: [
          eventTopic,
          null, // We don't filter by strategy ID
          ethers.utils.hexZeroPad(userAddress, 32) // Filter by owner address (padded to 32 bytes)
        ]
      };
      
      const logs = await provider.getLogs(filter);
      console.log(`Found ${logs.length} potential strategy events...`);
      
      let foundStrategies = 0;
      
      // Process each log
      for (const log of logs) {
        if (log.topics && log.topics.length > 1) {
          const strategyIdHex = log.topics[1];
          const strategyId = parseInt(strategyIdHex, 16);
          
          // Only process if we don't already have this strategy
          if (!strategies[strategyId]) {
            // Get the block for timestamp
            const block = await provider.getBlock(log.blockNumber);
            
            // Add to strategies list
            strategies[strategyId] = {
              id: strategyId,
              hexId: strategyIdHex,
              createdAt: new Date(block.timestamp * 1000).toISOString(),
              transactionHash: log.transactionHash,
              owner: userAddress
            };
            
            foundStrategies++;
          }
        }
      }
      
      // Save strategies to file
      fs.writeFileSync(strategiesFile, JSON.stringify(strategies, null, 2));
      
      console.log(`Scan complete. Found ${foundStrategies} new strategies.`);
      console.log(`Total strategies in database: ${Object.keys(strategies).length}`);
      
    } catch (error) {
      console.error(`Error scanning for StrategyCreated events: ${error.message}`);
      console.log('Trying alternative method...');
      
      // Alternative: Look for strategy in transactions
      console.log('Scanning transaction history for createStrategy calls...');
      
      // Create a database file for transactions if needed
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
      
      // Filter transactions for createStrategy
      const strategyTxs = txDatabase.transactions.filter(tx => 
        tx.function === 'createStrategy' && tx.from.toLowerCase() === userAddress.toLowerCase()
      );
      
      console.log(`Found ${strategyTxs.length} createStrategy transactions in history.`);
      
      // Extract strategy IDs
      let newStrategiesFound = 0;
      for (const tx of strategyTxs) {
        if (tx.strategyId && !strategies[tx.strategyId]) {
          strategies[tx.strategyId] = {
            id: tx.strategyId,
            hexId: tx.strategyIdHex || null,
            createdAt: tx.timestamp || new Date().toISOString(),
            transactionHash: tx.hash,
            owner: userAddress
          };
          newStrategiesFound++;
        }
      }
      
      // Save strategies to file
      fs.writeFileSync(strategiesFile, JSON.stringify(strategies, null, 2));
      
      console.log(`Found ${newStrategiesFound} new strategies from transaction history.`);
      console.log(`Total strategies in database: ${Object.keys(strategies).length}`);
    }
    
    await question('\nPress Enter to continue...');
  } catch (error) {
    console.error(`Error scanning for strategies: ${error.message}`);
    await question('\nPress Enter to continue...');
  }
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
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ACCOUNTS_DIR)) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
}

// Account config files
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const ACTIVE_ACCOUNT_FILE = path.join(DATA_DIR, 'active-account.txt');

// ABI from the provided file
const ABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'contract-abi.json'), 'utf8'));

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Account management functions
function loadAccounts() {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    } catch (error) {
      console.error('Error loading accounts:', error.message);
      return {};
    }
  }
  return {};
}

function saveAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving accounts:', error.message);
    return false;
  }
}

function getActiveAccount() {
  if (fs.existsSync(ACTIVE_ACCOUNT_FILE)) {
    try {
      return fs.readFileSync(ACTIVE_ACCOUNT_FILE, 'utf8').trim();
    } catch (error) {
      console.error('Error loading active account:', error.message);
      return null;
    }
  }
  return null;
}

function setActiveAccount(name) {
  try {
    fs.writeFileSync(ACTIVE_ACCOUNT_FILE, name, 'utf8');
    return true;
  } catch (error) {
    console.error('Error setting active account:', error.message);
    return false;
  }
}

async function getPrivateKeyForActiveAccount() {
  const accounts = loadAccounts();
  const activeAccount = getActiveAccount();
  
  if (!activeAccount || !accounts[activeAccount]) {
    // No active account, ask for private key and create default account
    console.log('No active account found. Please enter your private key.');
    console.log('This will be saved as your default account.');
    const privateKey = await question('Private key (without 0x prefix): ');
    
    // Validate private key format
    try {
      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const wallet = new ethers.Wallet(formattedKey);
      
      // Create default account
      accounts['default'] = {
        address: wallet.address,
        keyFile: `default.key`
      };
      
      // Save accounts
      saveAccounts(accounts);
      setActiveAccount('default');
      
      // Save private key to separate file
      const keyFilePath = path.join(ACCOUNTS_DIR, 'default.key');
      fs.writeFileSync(keyFilePath, formattedKey, { mode: 0o600 });
      
      console.log(`Account created with address: ${wallet.address}`);
      return formattedKey;
    } catch (error) {
      console.error('Invalid private key format:', error.message);
      throw error;
    }
  } else {
    // Load private key for active account
    const keyFilePath = path.join(ACCOUNTS_DIR, accounts[activeAccount].keyFile);
    try {
      return fs.readFileSync(keyFilePath, 'utf8').trim();
    } catch (error) {
      console.error(`Error loading private key for account ${activeAccount}:`, error.message);
      throw error;
    }
  }
}

// Helper function to handle account management
async function handleAccountManagement() {
  try {
    const accounts = loadAccounts();
    const activeAccount = getActiveAccount();
    
    console.log('\nAccount Management:');
    console.log('-'.repeat(50));
    
    // List accounts
    console.log('Available accounts:');
    if (Object.keys(accounts).length === 0) {
      console.log('  No accounts found');
    } else {
      Object.entries(accounts).forEach(([name, data]) => {
        const activeMarker = name === activeAccount ? '* ' : '  ';
        console.log(`${activeMarker}${name}: ${data.address}`);
      });
    }
    
    console.log('-'.repeat(50));
    console.log('1. Create new account');
    console.log('2. Switch active account');
    console.log('3. Remove account');
    console.log('4. Rename account');
    console.log('5. Back to main menu');
    
    const option = await question('\nSelect an option: ');
    
    switch (option) {
      case '1': // Create new account
        await createNewAccount();
        break;
      case '2': // Switch active account
        await switchActiveAccount();
        break;
      case '3': // Remove account
        await removeAccount();
        break;
      case '4': // Rename account
        await renameAccount();
        break;
      case '5': // Back to main menu
        return; // Simply return to main menu
      default:
        console.log('Invalid option');
    }
    
    // Return to account management after action (unless explicitly returning to main menu)
    if (option !== '5') {
      await handleAccountManagement();
    }
  } catch (error) {
    console.error('Error in account management:', error.message);
  }
}

async function createNewAccount() {
  const accounts = loadAccounts();
  
  // Get account name
  const name = await question('Enter a name for the new account: ');
  if (!name || name.trim() === '') {
    console.log('Account name cannot be empty');
    return;
  }
  
  if (accounts[name]) {
    console.log(`Account with name "${name}" already exists`);
    return;
  }
  
  // Get private key
  const privateKey = await question('Enter private key (without 0x prefix): ');
  
  // Validate private key format
  try {
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(formattedKey);
    
    // Create account
    accounts[name] = {
      address: wallet.address,
      keyFile: `${name}.key`
    };
    
    // Save accounts
    saveAccounts(accounts);
    
    // Save private key to separate file
    const keyFilePath = path.join(ACCOUNTS_DIR, `${name}.key`);
    fs.writeFileSync(keyFilePath, formattedKey, { mode: 0o600 });
    
    console.log(`Account "${name}" created with address: ${wallet.address}`);
    
    // Offer to set as active
    const setActive = await question('Set as active account? (y/n): ');
    if (setActive.toLowerCase() === 'y') {
      setActiveAccount(name);
      console.log(`Account "${name}" set as active`);
    }
  } catch (error) {
    console.error('Invalid private key format:', error.message);
  }
}

async function switchActiveAccount() {
  const accounts = loadAccounts();
  
  if (Object.keys(accounts).length === 0) {
    console.log('No accounts found. Please create an account first.');
    return;
  }
  
  console.log('\nAvailable accounts:');
  Object.entries(accounts).forEach(([name, data], index) => {
    console.log(`${index + 1}. ${name}: ${data.address}`);
  });
  
  const selection = await question('\nSelect account (number or name): ');
  
  // Check if selection is a number
  if (!isNaN(selection) && parseInt(selection) > 0 && parseInt(selection) <= Object.keys(accounts).length) {
    const accountName = Object.keys(accounts)[parseInt(selection) - 1];
    setActiveAccount(accountName);
    console.log(`Account "${accountName}" set as active`);
  } 
  // Check if selection is a name
  else if (accounts[selection]) {
    setActiveAccount(selection);
    console.log(`Account "${selection}" set as active`);
  } else {
    console.log('Invalid selection');
  }
}

async function removeAccount() {
  const accounts = loadAccounts();
  const activeAccount = getActiveAccount();
  
  if (Object.keys(accounts).length === 0) {
    console.log('No accounts found');
    return;
  }
  
  console.log('\nAvailable accounts:');
  Object.entries(accounts).forEach(([name, data], index) => {
    const activeMarker = name === activeAccount ? '* ' : '  ';
    console.log(`${index + 1}. ${activeMarker}${name}: ${data.address}`);
  });
  
  const selection = await question('\nSelect account to remove (number or name): ');
  
  let accountToRemove;
  
  // Check if selection is a number
  if (!isNaN(selection) && parseInt(selection) > 0 && parseInt(selection) <= Object.keys(accounts).length) {
    accountToRemove = Object.keys(accounts)[parseInt(selection) - 1];
  } 
  // Check if selection is a name
  else if (accounts[selection]) {
    accountToRemove = selection;
  } else {
    console.log('Invalid selection');
    return;
  }
  
  const confirm = await question(`Are you sure you want to remove account "${accountToRemove}"? (y/n): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('Account removal cancelled');
    return;
  }
  
  // Delete key file
  try {
    const keyFilePath = path.join(ACCOUNTS_DIR, accounts[accountToRemove].keyFile);
    if (fs.existsSync(keyFilePath)) {
      fs.unlinkSync(keyFilePath);
    }
  } catch (error) {
    console.warn(`Could not delete key file: ${error.message}`);
  }
  
  // Remove from accounts
  delete accounts[accountToRemove];
  saveAccounts(accounts);
  
  // If active account was removed, clear active account
  if (accountToRemove === activeAccount) {
    // If there are other accounts, set the first one as active
    if (Object.keys(accounts).length > 0) {
      setActiveAccount(Object.keys(accounts)[0]);
      console.log(`Active account set to "${Object.keys(accounts)[0]}"`);
    } else {
      // No accounts left, clear active account
      if (fs.existsSync(ACTIVE_ACCOUNT_FILE)) {
        fs.unlinkSync(ACTIVE_ACCOUNT_FILE);
      }
    }
  }
  
  console.log(`Account "${accountToRemove}" removed`);
}

async function renameAccount() {
  const accounts = loadAccounts();
  const activeAccount = getActiveAccount();
  
  if (Object.keys(accounts).length === 0) {
    console.log('No accounts found');
    return;
  }
  
  console.log('\nAvailable accounts:');
  Object.entries(accounts).forEach(([name, data], index) => {
    const activeMarker = name === activeAccount ? '* ' : '  ';
    console.log(`${index + 1}. ${activeMarker}${name}: ${data.address}`);
  });
  
  const selection = await question('\nSelect account to rename (number or name): ');
  
  let accountToRename;
  
  // Check if selection is a number
  if (!isNaN(selection) && parseInt(selection) > 0 && parseInt(selection) <= Object.keys(accounts).length) {
    accountToRename = Object.keys(accounts)[parseInt(selection) - 1];
  } 
  // Check if selection is a name
  else if (accounts[selection]) {
    accountToRename = selection;
  } else {
    console.log('Invalid selection');
    return;
  }
  
  const newName = await question(`Enter new name for account "${accountToRename}": `);
  
  if (!newName || newName.trim() === '') {
    console.log('Account name cannot be empty');
    return;
  }
  
  if (accounts[newName]) {
    console.log(`Account with name "${newName}" already exists`);
    return;
  }
  
  // Rename key file
  try {
    const oldKeyFilePath = path.join(ACCOUNTS_DIR, accounts[accountToRename].keyFile);
    const newKeyFilePath = path.join(ACCOUNTS_DIR, `${newName}.key`);
    
    if (fs.existsSync(oldKeyFilePath)) {
      fs.renameSync(oldKeyFilePath, newKeyFilePath);
    }
    
    // Create new account entry
    accounts[newName] = {
      address: accounts[accountToRename].address,
      keyFile: `${newName}.key`
    };
    
    // Remove old account entry
    delete accounts[accountToRename];
    
    // Save accounts
    saveAccounts(accounts);
    
    // Update active account if necessary
    if (accountToRename === activeAccount) {
      setActiveAccount(newName);
    }
    
    console.log(`Account renamed from "${accountToRename}" to "${newName}"`);
  } catch (error) {
    console.error(`Error renaming account: ${error.message}`);
  }
}

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
      
      // Ask if user wants to check another token
      const checkAnother = await question('\nWould you like to check another token? (y/n): ');
      if (checkAnother.toLowerCase() === 'y') {
        await handleRevokeTokenApproval(wallet, contract);
      }
      return;
    }
    
    const confirm = await question(`\nDo you want to revoke approval for ${symbol}? (y/n): `);
    if (confirm.toLowerCase() !== 'y') {
      console.log('Revocation cancelled.');
      
      // Ask if user wants to check another token
      const checkAnother = await question('\nWould you like to check another token? (y/n): ');
      if (checkAnother.toLowerCase() === 'y') {
        await handleRevokeTokenApproval(wallet, contract);
      }
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
    
    // Ask if user wants to check another token
    const checkAnother = await question('\nWould you like to check another token? (y/n): ');
    if (checkAnother.toLowerCase() === 'y') {
      await handleRevokeTokenApproval(wallet, contract);
    }
    
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
    console.log('7. Back to main menu');
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
      case '7': // Back to main menu
        return;
      default:
        console.log('Invalid option');
    }
    
    // After completing the operation, ask if user wants to return to transaction menu or main menu
    const returnOption = await question('\nReturn to transaction menu or main menu? (t/m): ');
    if (returnOption.toLowerCase() === 't') {
      await handleLastContractTransactions(provider, contract);
    }
    // Otherwise, return to main menu by default
    
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
            let decodedData;
            try {
              decodedData = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
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
            
            // For createStrategy transactions, try to extract strategyId from logs/events
            if (functionName === 'createStrategy' && receipt.logs) {
              // Get the transaction we just added
              const txObj = transactions[transactions.length - 1];
              
              for (const log of receipt.logs) {
                // Look for StrategyCreated event (check topics[0] for event signature)
                if (log.topics && log.topics.length > 1) {
                  try {
                    // Try to decode as StrategyCreated event
                    const eventSig = contract.interface.getEvent('StrategyCreated');
                    if (eventSig && log.topics[0] === contract.interface.getEventTopic(eventSig)) {
                      // Extract strategyId from topics[1]
                      const strategyIdHex = log.topics[1];
                      txObj.strategyId = parseInt(strategyIdHex, 16);
                      txObj.strategyIdHex = strategyIdHex;
                    }
                  } catch (e) {
                    // Not a StrategyCreated event or couldn't decode
                  }
                }
              }
            }
            
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
            let decodedData;
            try {
              decodedData = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
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
            
            // For createStrategy transactions, try to extract strategyId from logs/events
            if (functionName === 'createStrategy' && receipt.logs) {
              for (const log of receipt.logs) {
                // Look for StrategyCreated event (check topics[0] for event signature)
                // The exact event signature hash will depend on the contract, but we can look for topics with right length
                if (log.topics && log.topics.length > 1) {
                  try {
                    // Try to decode as StrategyCreated event
                    const eventSig = contract.interface.getEvent('StrategyCreated');
                    if (eventSig && log.topics[0] === contract.interface.getEventTopic(eventSig)) {
                      // Extract strategyId from topics[1]
                      const strategyIdHex = log.topics[1];
                      txObj.strategyId = parseInt(strategyIdHex, 16);
                      txObj.strategyIdHex = strategyIdHex;
                    }
                  } catch (e) {
                    // Not a StrategyCreated event or couldn't decode
                  }
                }
              }
            }
            
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
  console.log('-'.repeat(160));
  console.log('| Function'.padEnd(25) + '| Status'.padEnd(11) + '| Block'.padEnd(10) + '| Timestamp'.padEnd(26) + '| From'.padEnd(25) + '| To'.padEnd(25) + '| Details'.padEnd(40) + '|');
  console.log('-'.repeat(160));
  
  transactions.forEach(tx => {
    const truncatedFrom = tx.from.slice(0, 8) + '...' + tx.from.slice(-6);
    const truncatedTo = tx.to.slice(0, 8) + '...' + tx.to.slice(-6);
    const truncatedHash = tx.hash.slice(0, 8) + '...' + tx.hash.slice(-6);
    
    // Default details is the hash
    let details = `Hash: ${truncatedHash}`;
    
    // Special handling for certain transaction types
    if (tx.function === 'createStrategy' && tx.strategyId) {
      details = `Strategy ID: ${tx.strategyId}`;
    }
    
    console.log(
      '| ' + tx.function.slice(0, 22).padEnd(23) + 
      '| ' + tx.status.padEnd(9) + 
      '| ' + tx.block.toString().padEnd(8) + 
      '| ' + tx.timestamp.padEnd(24) + 
      '| ' + truncatedFrom.padEnd(23) + 
      '| ' + truncatedTo.padEnd(23) + 
      '| ' + details.padEnd(38) + 
      '|'
    );
  });
  console.log('-'.repeat(160));
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
    let continueRunning = true;
    
    while (continueRunning) {
      // Get private key from active account
      const privateKey = await getPrivateKeyForActiveAccount();
      
      // Set up provider and wallet
      const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
      
      try {
        // Test provider connection
        await provider.getNetwork();
      } catch (error) {
        console.error(`Failed to connect to RPC: ${ENV.RPC_URL}`);
        console.error(error.message);
        continueRunning = false;
        continue;
      }
      
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Get the wallet address and balance
      const address = wallet.address;
      const balance = ethers.utils.formatEther(await provider.getBalance(address));
      
      // Get active account name
      const activeAccount = getActiveAccount() || 'default';
      
      console.log(`\nConnected with account: ${activeAccount}`);
      console.log(`Address: ${address}`);
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
      console.log(`${writableFunctions.length + 1}. Account Management`);
      console.log(`${writableFunctions.length + 2}. Revoke token approval`);
      console.log(`${writableFunctions.length + 3}. View contract transactions`);
      console.log(`${writableFunctions.length + 4}. Exit`);
      
      // Get user function selection
      const selection = await question('\nSelect a function or option (number or name): ');
      
      // Handle exit option
      if (selection === `${writableFunctions.length + 4}` || selection.toLowerCase() === 'exit') {
        console.log('Exiting application. Goodbye!');
        continueRunning = false;
        continue;
      }
      
      // Handle additional options
      if (selection === `${writableFunctions.length + 1}` || selection.toLowerCase() === 'account management') {
        await handleAccountManagement();
        continue;
      } else if (selection === `${writableFunctions.length + 2}` || selection.toLowerCase() === 'revoke token approval') {
        await handleRevokeTokenApproval(wallet, contract);
        continue;
      } else if (selection === `${writableFunctions.length + 3}` || selection.toLowerCase() === 'view contract transactions' || selection.toLowerCase() === 'last 10 contract txns') {
        await handleLastContractTransactions(provider, contract);
        continue;
      } else if (selection === `${writableFunctions.length + 4}` || selection.toLowerCase() === 'view my strategies') {
        await viewStrategies(contract, wallet.address);
        continue;
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
        continue;
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
      let paramError = false;
      for (const input of selectedFunction.inputs) {
        const paramValue = await question(`Enter ${input.name} (${input.type}): `);
        try {
          params.push(parseParameter(paramValue, input.type));
        } catch (error) {
          console.error(error.message);
          paramError = true;
          break;
        }
      }
      
      if (paramError) {
        continue;
      }
      
      // Check permissions and contract state
      await checkPermissions(contract, wallet, selectedFunction);
      await checkBAppStatus(contract, params, selectedFunction);
      
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
          continue;
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
        continue;
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
            continue;
          }
        }
        
        const tx = await contract[selectedFunction.name](...params, overrides);
        console.log(`\nTransaction sent! Hash: ${tx.hash}`);
        
        // Wait for the transaction to be mined
        console.log('Waiting for transaction to be mined...');
        const receipt = await tx.wait();
        console.log(`Transaction mined in block ${receipt.blockNumber}!`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        // Display events
        if (receipt.events && receipt.events.length > 0) {
          console.log('\nTransaction events:');
          receipt.events.forEach((event, index) => {
            if (event.event) {
              console.log(`Event: ${event.event}`);
              
              // Special handling for StrategyCreated event
              if (event.event === 'StrategyCreated') {
                // Extract strategyId from topics - it's in topic 1 (index 0-based)
                if (event.topics && event.topics.length > 1) {
                  const strategyIdHex = event.topics[1];
                  const strategyId = parseInt(strategyIdHex, 16);
                  console.log(`Strategy ID: ${strategyId} (hex: ${strategyIdHex})`);
                }
              }
            }
          });
        }
        
        // Wait a moment before returning to the main menu
        console.log('\nReturning to main menu in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
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
        
        // Wait a moment before returning to the main menu
        console.log('\nReturning to main menu in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run the application
main();
