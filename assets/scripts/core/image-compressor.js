/**
 * 图片压缩器 - 使用 Canvas API 压缩图片
 * @module image-compressor
 */

export class ImageCompressor {
  /**
   * @param {Object} options - 压缩选项
   * @param {number} [options.maxWidth=1920] - 最大宽度
   * @param {number} [options.maxHeight=1920] - 最大高度
   * @param {number} [options.quality=0.85] - 压缩质量 (0-1)
   * @param {string} [options.mimeType='image/jpeg'] - 输出 MIME 类型
   */
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 1920;
    this.maxHeight = options.maxHeight || 1920;
    this.quality = options.quality || 0.85;
    this.mimeType = options.mimeType || 'image/jpeg';
  }

  /**
   * 压缩图片
   * @param {File} file - 原始图片文件
   * @returns {Promise<Blob>} 压缩后的 Blob（如果压缩后更大则返回原文件）
   */
  async compress(file) {
    // GIF 和 SVG 不压缩（保持动画/矢量）
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return file;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('文件读取失败'));

      reader.onload = (e) => {
        const img = new Image();

        img.onerror = () => reject(new Error('图片加载失败'));

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 计算缩放比例
            let scale = 1;
            if (width > this.maxWidth) scale = this.maxWidth / width;
            if (height > this.maxHeight) scale = Math.min(scale, this.maxHeight / height);

            width = Math.floor(width * scale);
            height = Math.floor(height * scale);

            canvas.width = width;
            canvas.height = height;

            // 绘制（白色背景处理透明 PNG）
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // PNG 保持 PNG，其他转 JPEG
            const outputType = file.type === 'image/png' ? 'image/png' : this.mimeType;

            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Canvas toBlob 失败'));
                  return;
                }
                // 压缩后反而更大则用原文件
                resolve(blob.size < file.size ? blob : file);
              },
              outputType,
              this.quality
            );
          } catch (error) {
            reject(error);
          }
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的字符串（如 "1.5 MB"）
   */
  static formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
