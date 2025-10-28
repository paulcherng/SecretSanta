// api/submit.js
import { kv } from '@vercel/kv';

const GROUP_LIMITS = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2 };
const TOTAL_PARTICIPANTS = 8;

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: '不支援的請求方法' });
    }

    try {
        const { name, email, group_id, wish } = request.body;

        // 1. 伺服器端驗證 (預防因格式錯誤導致的 FUNCTION_INVOCATION_FAILED)
        if (!name || !email || !group_id || !wish) {
            return response.status(400).json({ message: '所有欄位皆為必填' });
        }
        if (typeof name !== 'string' || typeof email !== 'string' || typeof wish !== 'string' || typeof group_id !== 'number') {
            return response.status(400).json({ message: '欄位格式不正確' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return response.status(400).json({ message: 'Email 格式不正確' });
        }

        // 2. 讀取並檢查目前狀態
        let participants = await kv.get('participants') || [];

        if (participants.length >= TOTAL_PARTICIPANTS) {
            return response.status(400).json({ message: '所有名額已滿！' });
        }
        if (participants.some(p => p.email.toLowerCase() === email.toLowerCase())) {
            return response.status(400).json({ message: '這個 Email 已經提交過了！' });
        }
        const groupCount = participants.filter(p => p.group_id === group_id).length;
        if (groupCount >= GROUP_LIMITS[group_id]) {
            return response.status(400).json({ message: `第 ${group_id} 組名額已滿！` });
        }

        // 3. 新增資料
        const newParticipant = {
            id: participants.length + 1, // 簡單的 ID
            name: name.trim(),
            email: email.toLowerCase().trim(),
            group_id,
            wish: wish.trim(),
        };
        participants.push(newParticipant);

        // 4. 寫回儲存
        await kv.set('participants', participants);

        // 5. 檢查是否剛好滿員，如果滿了就觸發抽籤 (可選的自動化)
        if (participants.length === TOTAL_PARTICIPANTS) {
            // 在這裡可以非同步觸發抽籤 webhook，或者僅僅是通知管理員
            // fetch(`https://<your-url>/api/draw?secret=${process.env.ADMIN_SECRET}`, { method: 'POST' });
        }
        
        return response.status(201).json({ message: '提交成功' });

    } catch (error) {
        // 捕捉所有未預期的錯誤，回傳通用錯誤訊息
        console.error('Submit API Error:', error); // 在 Vercel Log 中紀錄詳細錯誤
        return response.status(500).json({ message: '伺服器內部發生未知錯誤，請聯繫管理員。' });
    }
}
