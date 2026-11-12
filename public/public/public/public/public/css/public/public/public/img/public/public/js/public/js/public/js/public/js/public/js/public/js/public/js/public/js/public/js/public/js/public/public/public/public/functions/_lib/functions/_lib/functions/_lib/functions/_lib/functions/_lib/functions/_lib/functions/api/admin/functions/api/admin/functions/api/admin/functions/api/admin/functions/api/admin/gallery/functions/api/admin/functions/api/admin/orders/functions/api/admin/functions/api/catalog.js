import { handle, json } from '../_lib/util.js';
import { loadCatalog, publicCatalog } from '../_lib/catalog.js';
import { limits } from '../_lib/storage.js';

export const onRequestGet = handle(async ({ env }) => {
  const cat = await loadCatalog(env);
  const lim = limits(env);
  return json(publicCatalog(cat, lim), 200, { 'cache-control': 'public, max-age=30' });
});
