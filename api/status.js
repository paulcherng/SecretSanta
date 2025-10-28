// api/status.js (增強版)

import { kv } from '@vercel/kv';

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({ message: '不支援的請求方法' });
    }

    try {
        const data = await kv.get('participants');

        // --- 核心邏輯：先解析出 participants 陣列和抽籤狀態 ---
        let participants = [];
        let isDrawn = false;
        
        if (data) {
            if (Array.isArray(data)) {
                participants = data;
            } else if (typeof data === 'object' && data.participants) {
                participants = data.participants;
                isDrawn = data.draw_completed || false;
            }
        }

        // --- 檢查是否為管理員請求 ---
        const authHeader = request.headers.authorization;
        const secret = authHeader?.split(' ')[1];
        const isAdmin = secret === process.env.ADMIN_SECRET;

        if (isAdmin) {
            // 如果是管理員，回傳完整詳細資料
            return response.status(200).json({
                draw_completed: isDrawn,
                count: participants.length,
                participants: participants,
            });
        } else {
            // --- 如果是公開請求 (來自 index.html)，計算並回傳摘要資訊 ---
            const groupStatus = participants.reduce((acc, p) => {
                acc[p.group_id] = (acc[p.group_id] || 0) + 1;
                return acc;
            }, {});

            return response.status(200).json({
                count: participants.length,
                groupStatus: groupStatus, // 新增這個欄位給前端使用
            });
        }

    } catch (error) {
        console.error('Status API Error:', error);
        return response.status(500).json({ message: '讀取資料時發生伺服器內部錯誤。' });
    }
}
