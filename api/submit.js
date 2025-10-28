// 這個檔案會接收前端發來的資料，並存到我們的 "in-memory" 儲存區 (例如 Vercel KV)

// 假設使用 Vercel KV 來儲存資料
import { kv } from '@vercel/kv';

// 定義每組的人數上限
const GROUP_LIMITS = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2 };

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: '僅允許 POST 請求' });
    }

    try {
        const { name, email, group_id, wish } = request.body;

        // 從 KV 中讀取目前的參加者列表
        let participants = await kv.get('participants') || [];

        // 檢查總人數和各組人數是否已滿
        if (participants.length >= 8) {
            return response.status(400).json({ message: '所有名額已滿！' });
        }
        const groupCount = participants.filter(p => p.group_id === group_id).length;
        if (groupCount >= GROUP_LIMITS[group_id]) {
            return response.status(400).json({ message: `第 ${group_id} 組名額已滿！` });
        }
        // 檢查 Email 是否重複
        if (participants.some(p => p.email === email)) {
            return response.status(400).json({ message: '這個 Email 已經提交過了！' });
        }

        // 新增參加者
        const newParticipant = { id: participants.length + 1, name, email, group_id, wish };
        participants.push(newParticipant);

        // 存回 KV
        await kv.set('participants', participants);
        
        return response.status(200).json({ message: '提交成功' });

    } catch (error) {
        return response.status(500).json({ message: '伺服器內部錯誤' });
    }
}