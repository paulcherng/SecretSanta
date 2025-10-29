// api/delete-user.js

import { kv } from '@vercel/kv';

export default async function handler(request, response) {
    // 安全性檢查
    if (request.method !== 'POST') {
        return response.status(405).json({ message: '不支援的請求方法' });
    }
    const secret = request.headers.authorization?.split(' ')[1];
    if (secret !== process.env.ADMIN_SECRET) {
        return response.status(401).json({ message: '未授權' });
    }

    try {
        const { userId } = request.body;
        if (!userId) {
            return response.status(400).json({ message: '缺少使用者 ID' });
        }

        const data = await kv.get('participants');

        // 如果抽籤已完成，則不允許刪除
        if (data && data.draw_completed) {
            return response.status(400).json({ message: '抽籤已完成，無法刪除參與者！' });
        }

        let participants = Array.isArray(data) ? data : [];
        if (participants.length === 0) {
            return response.status(404).json({ message: '找不到任何參與者資料' });
        }

        // 過濾掉要刪除的使用者
        const newParticipants = participants.filter(p => p.id !== userId);

        // 重新索引 ID，確保 ID 是連續的
        const reIndexedParticipants = newParticipants.map((p, index) => ({
            ...p,
            id: index + 1,
        }));

        // 將更新後的陣列寫回 KV
        await kv.set('participants', reIndexedParticipants);

        return response.status(200).json({ message: `成功刪除使用者 ID: ${userId}` });

    } catch (error) {
        console.error('Delete User API Error:', error);
        return response.status(500).json({ message: '伺服器內部錯誤' });
    }
}
