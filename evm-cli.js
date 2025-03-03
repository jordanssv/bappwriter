// Helper function to ask questions
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
    
    // Get user function selection
    const selection = await question('\nSelect a function (number or name): ');
    
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