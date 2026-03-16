import { scanInbox } from '../lib/perplexity/ingest.js';

const result = await scanInbox();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
