
import { generateEventDetails } from '../lib/actions/event';

async function main() {
    const url = 'https://www.ces.tech/';
    console.log(`Testing generator with URL: ${url}`);
    try {
        const result = await generateEventDetails(url, { name: 'CES 2024' });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
