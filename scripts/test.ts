interface Account {
  account_id: string;
  balances: Array<{
    balance: string;
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

interface MapCapHolder {
  wallet: string;
  balance: number;
}

async function fetchAllMapCapHolders(): Promise<MapCapHolder[]> {
  const baseUrl = 'https://api.testnet.minepi.com/accounts';
  const asset = 'MapCap:GBBGQUMVHMRRNQGFXXM7KJL6LH65DGUMVYHFXQXYQ7GKYILOOIV445IB';
  const limit = 200; // Max records per page
  
  let allHolders: MapCapHolder[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  console.log('Fetching MapCap token holders...\n');

  while (hasMore) {
    try {
      // Build URL with pagination
      let url = `${baseUrl}?asset=${asset}&limit=${limit}`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const records = data._embedded?.records || [];

      // Process each account
      for (const account of records) {
        // Find MapCap balance
        const mapCapBalance = account.balances.find(
          (b: any) => 
            b.asset_code === 'MapCap' && 
            b.asset_issuer === 'GBBGQUMVHMRRNQGFXXM7KJL6LH65DGUMVYHFXQXYQ7GKYILOOIV445IB'
        );

        if (mapCapBalance) {
          allHolders.push({
            wallet: account.account_id,
            balance: parseFloat(mapCapBalance.balance)
          });
        }
      }

      // Check for next page
      const nextLink = data._links?.next;
      if (nextLink && records.length === limit) {
        // Extract cursor from next link if available
        const urlParams = new URLSearchParams(nextLink.href.split('?')[1]);
        cursor = urlParams.get('cursor');
      } else {
        hasMore = false;
      }

      console.log(`Fetched ${allHolders.length} holders so far...`);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      hasMore = false;
    }
  }

  // Sort by balance (largest first)
  allHolders.sort((a, b) => b.balance - a.balance);

  return allHolders;
}

function displayHolders(holders: MapCapHolder[]) {
  console.log('\n=== MapCap Token Holders ===\n');
  
  // Calculate statistics
  const holdersWithBalance = holders.filter(h => h.balance > 0);
  const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);
  
  console.log('Wallet Address'.padEnd(60) + 'MapCap Balance');
  console.log('-'.repeat(80));
  
  holders.forEach((holder) => {
    const wallet = holder.wallet.padEnd(60);
    const balance = holder.balance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 7
    });
    console.log(`${wallet}${balance}`);
  });
  
  // END SUMMARY - THIS IS THE IMPORTANT PART
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total number of holders: ${holders.length}`);
  console.log(`Holders with balance > 0: ${holdersWithBalance.length}`);
  console.log(`Holders with zero balance: ${holders.length - holdersWithBalance.length}`);
  console.log(`Total MapCap in circulation: ${totalSupply.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7
  })}`);
  console.log('='.repeat(80) + '\n');
}

// Main execution
async function main() {
  try {
    const holders = await fetchAllMapCapHolders();
    displayHolders(holders);
    
    // Optionally export to JSON
    console.log('--- JSON Output ---');
    console.log(JSON.stringify(holders, null, 2));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

// Run the script
main();