// api/draw.js (簡化版)

import { kv } from '@vercel/kv';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).end();
    const secret = request.headers.authorization?.split(' ')[1];
    if (secret !== process.env.ADMIN_SECRET) return response.status(401).end();

    try {
        const data = await kv.get('participants');
        if (!data || data.draw_completed) {
            return response.status(400).json({ message: '不符合抽籤條件 (可能人數未滿或已抽過)。' });
        }
        
        let participants = Array.isArray(data) ? data : [];
        if (participants.length < 8) {
             return response.status(400).json({ message: '人數尚未到齊，無法抽籤！' });
        }

        // --- 核心抽籤演算法 (保持不變) ---
        let assignments = null;
        for (let i = 0; i < 100; i++) {
            let receivers = [...participants].sort(() => 0.5 - Math.random());
            let tempAssignments = new Map();
            let isValid = true;
            for (let j = 0; j < participants.length; j++) {
                const giver = participants[j]; const receiver = receivers[j];
                if (giver.id === receiver.id || giver.group_id === receiver.group_id) {
                    isValid = false; break;
                }
                tempAssignments.set(giver.id, receiver.id);
            }
            if (isValid) { assignments = tempAssignments; break; }
        }

        if (!assignments) {
            return response.status(500).json({ message: '抽籤演算法失敗。' });
        }

        // --- 將抽籤結果寫回 KV ---
        const finalData = {
            draw_completed: true,  // 標記已抽籤
            emails_sent: false,   // 新增標記：尚未寄信
            participants: participants.map(p => ({
                ...p,
                assigned_to: assignments.get(p.id)
            }))
        };
        await kv.set('participants', finalData);
        
        return response.status(200).json({ message: '抽籤成功！配對結果已儲存。' });

    } catch (error) {
        console.error('Draw API Error:', error);
        return response.status(500).json({ message: '伺服器錯誤' });
    }
}
