
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { llmService } from '../services/llm.service';

async function testDeepSeek() {
    console.log('Testing DeepSeek Integration...');
    
    try {
        console.log('Using "cheap" tier (should be DeepSeek)...');
        const response1 = await llmService.generateResponse('Hello! Are you running on DeepSeek?', 'cheap');
        console.log('Response:', response1.content);
        console.log('Provider:', response1.provider);
        console.log('Model:', response1.model);
        console.log('-----------------------------------');

        console.log('Using "expensive" tier (should fallback to DeepSeek)...');
        const response2 = await llmService.generateResponse('Tell me about Solana briefly.', 'expensive');
        console.log('Response:', response2.content);
        console.log('Provider:', response2.provider);
        console.log('Model:', response2.model);

    } catch (error: any) {
        console.error('Error during test:', error.message);
        if (error.response) {
            console.error('API Error Response:', JSON.stringify(error.response.data, null, 2));
            console.error('Status:', error.response.status);
        }
    }
}

testDeepSeek();
