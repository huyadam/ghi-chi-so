/**
 * IndexedDB Cache Layer — Stale-While-Revalidate pattern
 * Tải dữ liệu từ cache trước (instant), rồi fetch mới trong nền
 */

const DB_NAME = 'pcvt_ghi_chi_so';
const DB_VERSION = 1;
const STORES = ['customers', 'users', 'stations', 'meta'];

// Singleton: chỉ mở 1 connection IDB cho cả app
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: store === 'meta' ? 'key' : 'id' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      _dbPromise = null; // reset để retry được
      reject(request.error);
    };
  });
  return _dbPromise;
}

export async function cacheGet<T>(storeName: string): Promise<T[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const data = request.result;
        resolve(data && data.length > 0 ? data : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function cacheSet<T extends { id?: any }>(storeName: string, data: T[]): Promise<void> {
  try {
    const db = await openDB();
    // Gộp storeName + 'meta' vào 1 transaction để timestamp luôn được lưu cùng lúc
    const stores = storeName === 'meta' ? ['meta'] : [storeName, 'meta'];
    const tx = db.transaction(stores, 'readwrite');

    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of data) {
      store.put(item);
    }

    tx.objectStore('meta').put({ key: `${storeName}_timestamp`, value: Date.now() });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Cache write failed:', err);
  }
}

export async function getCacheTimestamp(storeName: string): Promise<number | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const request = store.get(`${storeName}_timestamp`);
      
      request.onsuccess = () => {
        resolve(request.result?.value ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    for (const store of STORES) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
    }
  } catch (err) {
    console.warn('Cache clear failed:', err);
  }
}

/**
 * Kiểm tra cache có còn "tươi" không (dưới maxAge ms)
 */
export async function isCacheFresh(storeName: string, maxAgeMs: number = 5 * 60 * 1000): Promise<boolean> {
  const ts = await getCacheTimestamp(storeName);
  if (!ts) return false;
  return (Date.now() - ts) < maxAgeMs;
}
