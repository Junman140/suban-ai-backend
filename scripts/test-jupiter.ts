import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function findPriceEndpoint() {
  const apiKey = process.env.JUPITER_API_KEY;
  const ids = 'So11111111111111111111111111111111111111112';
  
  const endpoints = [
    'https://api.jup.ag/price',
    'https://api.jup.ag/v3/price',
    'https://api.jup.ag/v6/price',
  ];

  for (const url of endpoints) {
    try {
      const headers: any = {};
      if (apiKey && url.includes('api.jup.ag')) {
        headers['x-api-key'] = apiKey;
      }

      const response = await axios.get(url, {
        params: { ids },
        headers,
        timeout: 3000
      });

      console.log(`SUCCESS: ${url} -> ${response.status}`);
      return url;
    } catch (error: any) {
      console.log(`FAILED: ${url} -> ${error.response?.status || error.message}`);
    }
  }
}

findPriceEndpoint();
