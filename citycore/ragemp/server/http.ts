import http from 'http';
import fs from 'fs';
import path from 'path';
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'server-config.json'), 'utf8'));
const base = new URL(config.apiUrl);
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Bridge requires a loopback HTTP API; use a secure tunnel for remote services');
if (typeof config.bridgeKey !== 'string' || config.bridgeKey.length < 32) throw new Error('Missing bridgeKey');
export function api<T = any>(endpoint: string, body: unknown = {}, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(new URL(endpoint, base), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-bridge-key': config.bridgeKey, 'x-session': token || '' } }, res => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; if (text.length > 100000) req.destroy(new Error('API response too large')); });
      res.on('error', reject);
      res.on('end', () => { try { const result = JSON.parse(text); if ((res.statusCode || 500) >= 400) { const e = new Error(result.error || 'Ошибка API') as Error & { status: number }; e.status = res.statusCode!; reject(e); } else resolve(result); } catch (e) { reject(e); } });
    });
    req.setTimeout(8000, () => req.destroy(new Error('Таймаут сервера. Повторите запрос с тем же ID')));
    req.on('error', reject); req.end(data);
  });
}
