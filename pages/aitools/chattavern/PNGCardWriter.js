/**
 * PNG角色卡写入器
 * 将角色卡数据嵌入PNG图片，生成SillyTavern兼容的角色卡文件
 *
 * 技术原理：
 * - 在PNG的IEND chunk之前插入tEXt chunk
 * - tEXt chunk包含关键字"chara"和Base64编码的JSON
 * - 计算CRC32校验码确保数据完整性
 */
export class PNGCardWriter {
    constructor() {
        // CRC32查找表（用于快速计算）
        this.crcTable = this.makeCRCTable();
    }

    /**
     * 将角色卡数据写入PNG
     * @param {Object} characterData 角色卡数据对象
     * @param {File|Blob} imageFile 原始图片文件（PNG格式）
     * @returns {Promise<Blob>} 包含角色卡数据的新PNG Blob
     */
    async writeToPNG(characterData, imageFile) {
        try {
            // 读取原始PNG
            const buffer = await imageFile.arrayBuffer();
            const dataView = new DataView(buffer);

            // 验证PNG格式
            if (!this.isPNG(dataView)) {
                throw new Error('原始文件不是有效的PNG格式');
            }

            // 序列化角色数据为JSON
            const jsonString = JSON.stringify(characterData);

            // Base64编码
            const base64Data = btoa(jsonString);

            // 创建tEXt chunk
            const textChunk = this.createTextChunk('chara', base64Data);

            // 插入chunk到PNG
            const newPNGBuffer = this.insertChunkBeforeIEND(buffer, textChunk);

            // 创建Blob
            return new Blob([newPNGBuffer], { type: 'image/png' });

        } catch (error) {
            console.error('写入PNG角色卡失败:', error);
            throw error;
        }
    }

    /**
     * 验证PNG签名
     */
    isPNG(dataView) {
        const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

        for (let i = 0; i < PNG_SIGNATURE.length; i++) {
            if (dataView.getUint8(i) !== PNG_SIGNATURE[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * 创建tEXt chunk
     * 格式: [Length(4)] [Type(4)] [Keyword\0Text] [CRC(4)]
     */
    createTextChunk(keyword, text) {
        const keywordBytes = this.stringToBytes(keyword);
        const textBytes = this.stringToBytes(text);

        // Data部分: keyword + null + text
        const dataLength = keywordBytes.length + 1 + textBytes.length;

        // 完整chunk: Length(4) + Type(4) + Data + CRC(4)
        const chunk = new Uint8Array(12 + dataLength);
        const view = new DataView(chunk.buffer);

        let offset = 0;

        // 1. Length (4字节，大端序)
        view.setUint32(offset, dataLength, false);
        offset += 4;

        // 2. Type (4字节，"tEXt")
        const typeBytes = this.stringToBytes('tEXt');
        chunk.set(typeBytes, offset);
        offset += 4;

        // Keyword
        chunk.set(keywordBytes, offset);
        offset += keywordBytes.length;

        // Null separator
        chunk[offset] = 0;
        offset += 1;

        // Text
        chunk.set(textBytes, offset);
        offset += textBytes.length;

        // 4. CRC (4字节)
        // CRC计算包括Type和Data部分
        const crcData = chunk.subarray(4, 4 + 4 + dataLength);
        const crc = this.calculateCRC(crcData);
        view.setUint32(offset, crc, false);

        return chunk;
    }

    /**
     * 在IEND chunk之前插入新chunk
     */
    insertChunkBeforeIEND(buffer, newChunk) {
        const dataView = new DataView(buffer);
        const parts = [];

        // 添加PNG签名
        parts.push(new Uint8Array(buffer, 0, 8));

        let offset = 8;

        // 遍历所有chunk
        while (offset < buffer.byteLength) {
            const length = dataView.getUint32(offset, false);
            const type = new Uint8Array(buffer, offset + 4, 4);
            const typeString = this.bytesToString(type);

            // 当前chunk的总长度: Length(4) + Type(4) + Data(length) + CRC(4)
            const chunkTotalLength = 12 + length;

            // 如果是IEND chunk，先插入新chunk，再插入IEND
            if (typeString === 'IEND') {
                parts.push(newChunk);
                parts.push(new Uint8Array(buffer, offset, chunkTotalLength));
                offset += chunkTotalLength;
                break;
            }

            // 复制其他chunk
            parts.push(new Uint8Array(buffer, offset, chunkTotalLength));
            offset += chunkTotalLength;
        }

        // 合并所有部分
        const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
        const merged = new Uint8Array(totalLength);

        let mergeOffset = 0;
        for (const part of parts) {
            merged.set(part, mergeOffset);
            mergeOffset += part.length;
        }

        return merged.buffer;
    }

    /**
     * 计算CRC32校验码
     */
    calculateCRC(data) {
        let crc = 0xFFFFFFFF;

        for (let i = 0; i < data.length; i++) {
            const index = (crc ^ data[i]) & 0xFF;
            crc = (crc >>> 8) ^ this.crcTable[index];
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /**
     * 生成CRC32查找表
     */
    makeCRCTable() {
        const table = new Uint32Array(256);

        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c;
        }

        return table;
    }

    /**
     * 字符串转字节数组
     */
    stringToBytes(str) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i) & 0xFF;
        }
        return bytes;
    }

    /**
     * 字节数组转字符串
     */
    bytesToString(bytes) {
        return Array.from(bytes)
            .map(byte => String.fromCharCode(byte))
            .join('');
    }

    /**
     * 从Canvas创建PNG角色卡
     * @param {Object} characterData 角色卡数据
     * @param {HTMLCanvasElement} canvas 包含角色图片的Canvas
     * @returns {Promise<Blob>} PNG Blob
     */
    async createFromCanvas(characterData, canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error('Canvas转换为Blob失败'));
                    return;
                }

                try {
                    const result = await this.writeToPNG(characterData, blob);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, 'image/png');
        });
    }

    /**
     * 从URL创建PNG角色卡
     * @param {Object} characterData 角色卡数据
     * @param {string} imageUrl 图片URL
     * @returns {Promise<Blob>} PNG Blob
     */
    async createFromURL(characterData, imageUrl) {
        try {
            // 加载图片
            const response = await fetch(imageUrl);
            const blob = await response.blob();

            // 如果不是PNG，转换为PNG
            if (blob.type !== 'image/png') {
                const convertedBlob = await this.convertToPNG(blob);
                return await this.writeToPNG(characterData, convertedBlob);
            }

            return await this.writeToPNG(characterData, blob);

        } catch (error) {
            console.error('从URL创建PNG角色卡失败:', error);
            throw error;
        }
    }

    /**
     * 将图片转换为PNG格式
     */
    async convertToPNG(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((pngBlob) => {
                    URL.revokeObjectURL(url);
                    if (pngBlob) {
                        resolve(pngBlob);
                    } else {
                        reject(new Error('图片转换为PNG失败'));
                    }
                }, 'image/png');
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('图片加载失败'));
            };

            img.src = url;
        });
    }
}
