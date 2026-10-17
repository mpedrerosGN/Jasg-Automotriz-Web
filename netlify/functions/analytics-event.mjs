import { getStore } from '@netlify/blobs';
import { collect } from '../../lib/analytics-http.mjs';
export default (request, context) => collect(request, context, () => getStore('jasg-analytics-v1'));
export const config = { path: '/api/analytics/event', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
