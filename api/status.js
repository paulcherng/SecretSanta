// api/status.js

import { kv } from '@vercel/kv';

export default async function handler(request, response) {
    // 1. 檢查請求方法，只允許 GET
    if (request.method !== 'GET') {
        return response.status(405).json({ message: '不支援的請求方法' });
    }

    // 2. 安全性檢查：從 Authorization 標頭獲取並驗證管理密碼
    // 這是為了防止任何人都能看到後台的敏感資訊（如 Email）
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new Error('缺少憑證');
        }
        
        const secret = authHeader.split(' ')[1];
        if (secret !== process.env.ADMIN_SECRET) {
            throw new Error('憑證無效');
        }
    } catch (error) {
        return response.status(401).json({ message: `未授權: ${error.message}` });
    }

    // 3. 從 Vercel KV 讀取資料
    try {
        const data = await kv.get('participants');

        // 4. 根據資料狀態，整理成統一格式回傳給前端
        // 這個邏輯很重要，它需要處理三種情況：
        // a. 完全沒有資料 (null)
        // b. 有資料，但還沒抽籤 (一個陣列)
        // c. 已經抽完籤 (一個包含 draw_completed 旗標的物件)

        let responsePayload;

        if (!data) {
            // 情況 a: 系統剛初始化，還沒有任何人提交
            responsePayload = {
                draw_completed: false,
                count: 0,
                participants: [],
            };
        } else if (Array.isArray(data)) {
            // 情況 b: 抽籤尚未進行，data 是一個參與者陣列
            responsePayload = {
                draw_completed: false,
                count: data.length,
                participants: data,
            };
        } else {
            // 情況 c: 抽籤已完成，data 是一個包含旗標和參與者陣列的物件
            responsePayload = {
                draw_completed: data.draw_completed || false,
                count: data.participants ? data.participants.length : 0,
                participants: data.participants || [],
            };
        }

        // 5. 回傳成功的 JSON 回應
        return response.status(200).json(responsePayload);

    } catch (error) {
        // 如果讀取 KV 時發生任何錯誤，回傳 500 錯誤
        console.error('Status API Error:', error); // 在 Vercel Log 中留下紀錄，方便除錯
        return response.status(500).json({ message: '讀取資料時發生伺服器內部錯誤。' });
    }
}
