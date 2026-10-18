import { getStore } from '@netlify/blobs';
import { stats } from '../../lib/analytics-http.mjs';
export default (request, context) => stats(request, () => getStore('jasg-analytics-v1'), fetch, context);
export const config = { path: '/api/analytics/stats', rateLimit: { windowLimit: 15, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
