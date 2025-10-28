import { kv } from '@vercel/kv';
// 引入你的郵件服務 SDK，例如 Resend
import { Resend } from 'resend';

// 從環境變數讀取你的 API Key
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(request, response) {
    // 簡單的密碼保護，防止任何人隨意觸發
    const { secret } = request.query;
    if (secret !== process.env.ADMIN_SECRET) {
        return response.status(401).json({ message: '未授權' });
    }

    let participants = await kv.get('participants');

    if (!participants || participants.length < 8) {
        return response.status(400).json({ message: '人數尚未到齊，無法抽籤！' });
    }

    // --- 核心抽籤演算法 ---
    let result = null;
    let attempts = 0;
    while (attempts < 100) { // 防止無限迴圈
        let givers = [...participants];
        let receivers = [...participants].sort(() => Math.random() - 0.5); // 隨機打亂
        
        let valid = true;
        let assignments = new Map();
        for (let i = 0; i < givers.length; i++) {
            const giver = givers[i];
            const receiver = receivers[i];
            // 條件：不能抽到自己 或 不能抽到同組
            if (giver.id === receiver.id || giver.group_id === receiver.group_id) {
                valid = false;
                break;
            }
            assignments.set(giver.id, receiver.id);
        }

        if (valid) {
            result = assignments;
            break;
        }
        attempts++;
    }

    if (!result) {
        return response.status(500).json({ message: '抽籤失敗，無法在 100 次嘗試中找到有效組合。' });
    }

    // --- 抽籤成功，開始寄信 ---
    try {
        for (const [giverId, receiverId] of result.entries()) {
            const giver = participants.find(p => p.id === giverId);
            const receiver = participants.find(p => p.id === receiverId);

            await resend.emails.send({
                from: '抽籤系統 <no-reply@yourdomain.com>',
                to: giver.email,
                subject: '【交換禮物】抽籤結果出爐！',
                html: `<p>哈囉 ${giver.name},</p>
                       <p>你抽到的對象是：<b>${receiver.name}</b></p>
                       <p>他的願望是：</p>
                       <p><i>${receiver.wish}</i></p>
                       <p>請開始準備你的禮物吧！</p>`
            });
        }
        
        // (可選) 清空資料，準備下次使用
        // await kv.del('participants');

        return response.status(200).json({ message: '抽籤完成，且信件已全數寄出！' });
    } catch (error) {
        return response.status(500).json({ message: '信件寄送失敗', error: error.message });
    }
}