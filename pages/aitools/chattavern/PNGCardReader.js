/**
 * PNG角色卡读取器
 * 从PNG图片中提取SillyTavern兼容的角色卡数据
 *
 * 技术原理：
 * - PNG文件由多个chunk组成
 * - 使用tEXt chunk存储文本数据
 * - 关键字"chara"存储Base64编码的JSON
 */
export class PNGCardReader {
    /**
     * 从PNG文件读取角色卡
     * @param {File} file PNG文件对象
     * @returns {Promise<Object>} 角色卡数据
     */
    async readFromPNG(file) {
        try {
            // 读取文件为ArrayBuffer
            const buffer = await file.arrayBuffer();
            const dataView = new DataView(buffer);

            // 验证PNG签名
            if (!this.isPNG(dataView)) {
                throw new Error('文件不是有效的PNG格式');
            }

            // 解析所有chunk
            const chunks = this.parseChunks(dataView);

            // 查找包含角色数据的tEXt chunk
            const characterData = this.findCharacterData(chunks);

            if (!characterData) {
                throw new Error('PNG文件中未找到角色卡数据（没有"chara"关键字的tEXt chunk）');
            }

            return characterData;

        } catch (error) {
            console.error('读取PNG角色卡失败:', error);
            throw error;
        }
    }

    /**
     * 验证PNG文件签名
     * PNG签名: 137 80 78 71 13 10 26 10
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
     * 解析PNG的所有chunk
     * Chunk结构: [Length(4)] [Type(4)] [Data(Length)] [CRC(4)]
     */
    parseChunks(dataView) {
        const chunks = [];
        let offset = 8; // 跳过PNG签名（8字节）

        while (offset < dataView.byteLength) {
            try {
                // 读取chunk长度（4字节，大端序）
                const length = dataView.getUint32(offset);
                offset += 4;

                // 读取chunk类型（4字节ASCII）
                const type = new Uint8Array(dataView.buffer, offset, 4);
                const typeString = this.bytesToString(type);
                offset += 4;

                // 读取chunk数据
                const data = new Uint8Array(dataView.buffer, offset, length);
                offset += length;

                // 跳过CRC（4字节）
                offset += 4;

                chunks.push({
                    type: typeString,
                    typeBytes: type,
                    data: data,
                    length: length
                });

                // IEND是最后一个chunk
                if (typeString === 'IEND') {
                    break;
                }

            } catch (error) {
                console.warn('解析chunk时出错，停止解析:', error);
                break;
            }
        }

        return chunks;
    }

    /**
     * 从chunks中查找角色数据
     */
    findCharacterData(chunks) {
        // 查找所有tEXt chunk
        const textChunks = chunks.filter(chunk => chunk.type === 'tEXt');

        for (const chunk of textChunks) {
            try {
                const characterData = this.extractCharacterData(chunk.data);
                if (characterData) {
                    return characterData;
                }
            } catch (error) {
                // 尝试下一个tEXt chunk
                continue;
            }
        }

        return null;
    }

    /**
     * 从tEXt chunk提取角色数据
     * tEXt格式: [Keyword]\0[Text]
     */
    extractCharacterData(data) {
        // 查找null分隔符
        let nullIndex = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0) {
                nullIndex = i;
                break;
            }
        }

        if (nullIndex === -1) {
            return null;
        }

        // 提取关键字
        const keyword = this.bytesToString(data.subarray(0, nullIndex));

        // 只处理"chara"关键字
        if (keyword !== 'chara') {
            return null;
        }

        // 提取Base64编码的数据
        const base64Data = this.bytesToString(data.subarray(nullIndex + 1));

        try {
            // 解码Base64为二进制字符串
            const binaryString = atob(base64Data);

            // 将二进制字符串转换为Uint8Array
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 使用TextDecoder正确解码UTF-8
            const jsonString = new TextDecoder('utf-8').decode(bytes);

            // 解析JSON
            const characterData = JSON.parse(jsonString);

            return characterData;

        } catch (error) {
            console.warn('解码或解析角色数据失败:', error);
            return null;
        }
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
     * 快速检测文件是否可能包含角色卡
     * （不完全解析，只检查是否有chara关键字）
     */
    async quickCheck(file) {
        try {
            const buffer = await file.arrayBuffer();
            const text = new TextDecoder('latin1').decode(buffer);
            return text.includes('chara');
        } catch {
            return false;
        }
    }
}
