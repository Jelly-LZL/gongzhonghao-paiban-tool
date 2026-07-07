/**
 * 图片存储管理器 - 使用 IndexedDB 持久化存储压缩后的图片
 * @module image-store
 */

export class ImageStore {
  constructor() {
    /** @type {string} 数据库名称（保持不变以兼容现有数据） */
    this.dbName = 'WechatEditorImages';
    /** @type {string} 存储名称 */
    this.storeName = 'images';
    /** @type {number} 数据库版本 */
    this.version = 1;
    /** @type {IDBDatabase|null} */
    this.db = null;
    /** @type {Object<string, string>} 图片 ID 到 Object URL 的缓存 */
    this._urlCache = {};
  }

  /**
   * 初始化 IndexedDB
   * @returns {Promise<void>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('IndexedDB 打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('createdAt', 'createdAt', { unique: false });
          objectStore.createIndex('name', 'name', { unique: false });
        }
      };
    });
  }

  /**
   * 保存图片到 IndexedDB
   * @param {string} id - 图片唯一 ID
   * @param {Blob} blob - 图片 Blob 数据
   * @param {Object} metadata - 元数据（name, originalSize 等）
   * @returns {Promise<string>} 图片 ID
   */
  async saveImage(id, blob, metadata = {}) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);

      const imageData = {
        id,
        blob,
        name: metadata.name || 'image',
        originalSize: metadata.originalSize || 0,
        compressedSize: blob.size,
        createdAt: Date.now(),
        ...metadata
      };

      const request = objectStore.put(imageData);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取图片 Object URL（带缓存）
   * @param {string} id - 图片 ID
   * @returns {Promise<string|null>} Object URL
   */
  async getImage(id) {
    // 优先使用缓存
    if (this._urlCache[id]) {
      return this._urlCache[id];
    }

    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.blob) {
          const objectURL = URL.createObjectURL(result.blob);
          this._urlCache[id] = objectURL;
          resolve(objectURL);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取图片原始 Blob（用于复制时转 Base64）
   * @param {string} id - 图片 ID
   * @returns {Promise<Blob|null>}
   */
  async getImageBlob(id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result && result.blob ? result.blob : null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getImageRecord(id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除图片
   * @param {string} id - 图片 ID
   * @returns {Promise<void>}
   */
  async deleteImage(id) {
    if (!this.db) await this.init();

    // 释放缓存
    if (this._urlCache[id]) {
      URL.revokeObjectURL(this._urlCache[id]);
      delete this._urlCache[id];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const request = transaction.objectStore(this.storeName).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取所有图片列表
   * @returns {Promise<Array>}
   */
  async getAllImages() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const request = transaction.objectStore(this.storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空所有图片
   * @returns {Promise<void>}
   */
  async clearAll() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const request = transaction.objectStore(this.storeName).clear();
      request.onsuccess = () => {
        this.revokeAll();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 计算总存储大小
   * @returns {Promise<number>} 字节数
   */
  async getTotalSize() {
    const images = await this.getAllImages();
    return images.reduce((total, img) => total + (img.compressedSize || 0), 0);
  }

  /**
   * 释放所有缓存的 Object URL（防内存泄漏）
   */
  revokeAll() {
    Object.values(this._urlCache).forEach(url => {
      URL.revokeObjectURL(url);
    });
    this._urlCache = {};
  }
}
