// api/draw.js (使用 Nodemailer 和 Gmail 的版本)

import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer'; // 引入 nodemailer

// --- 以下是 Nodemailer 的設定 ---
// 建立一個 "transporter" 物件，這是 Nodemailer 寄信的核心
// 我們使用 Gmail 的 SMTP 服務
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.GMAIL_USER, // 從環境變數讀取你的 Gmail
        pass: process.env.GMAIL_APP_PASSWORD, // 從環境變數讀取你的 16 位應用程式密碼
    },
});

const TOTAL_PARTICIPANTS = 8;

export default async function handler(request, response) {
    const secret = request.headers.authorization?.split(' ')[1];
    if (request.method !== 'POST' || secret !== process.env.ADMIN_SECRET) {
        return response.status(401).json({ message: '未授權' });
    }

    try {
        const data = await kv.get('participants') || [];
        const participants = Array.isArray(data) ? data : data.participants;
        const isDrawn = !Array.isArray(data) && data.draw_completed;

        if (isDrawn) {
            return response.status(400).json({ message: '抽籤已經完成過了，不可重複執行。' });
        }
        if (!participants || participants.length < TOTAL_PARTICIPANTS) {
            return response.status(400).json({ message: `人數尚未到齊 (${participants.length}/${TOTAL_PARTICIPANTS})，無法抽籤！` });
        }

        // --- 抽籤演算法 (保持不變) ---
        let assignments = null;
        // ... (省略與之前完全相同的演算法程式碼) ...
        for (let i = 0; i < 100; i++) {
            let receivers = [...participants].sort(() => 0.5 - Math.random());
            let tempAssignments = new Map();
            let isValid = true;
            for (let j = 0; j < participants.length; j++) {
                const giver = participants[j];
                const receiver = receivers[j];
                if (giver.id === receiver.id || giver.group_id === receiver.group_id) {
                    isValid = false; break;
                }
                tempAssignments.set(giver.id, receiver.id);
            }
            if (isValid) {
                assignments = tempAssignments; break;
            }
        }

        if (!assignments) {
            return response.status(500).json({ message: '抽籤演算法在100次嘗試後仍未找到有效組合。' });
        }

        // --- 使用 Nodemailer 並行寄送郵件 ---
        const emailPromises = participants.map(giver => {
            const receiverId = assignments.get(giver.id);
            const receiver = participants.find(p => p.id === receiverId);
            
            return transporter.sendMail({
                from: `"交換禮物小精靈" <${process.env.GMAIL_USER}>`, // 寄件人顯示名稱 + 你的Gmail
                to: giver.email, // 收件人
                subject: '【交換禮物】你的神秘小天使已降臨！', // 信件標題
                html: `<p>哈囉 ${giver.name},</p><p>抽籤結果出爐啦！</p><p>你抽到的對象是：<b>${receiver.name}</b></p><p>他的願望是：</p><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px;"><i>${receiver.wish}</i></blockquote><p>請開始準備你的禮物吧！</p>` // 信件內容
            });
        });

        const results = await Promise.allSettled(emailPromises);
        const successfulEmails = results.filter(r => r.status === 'fulfilled').length;
        const failedEmails = results.filter(r => r.status === 'rejected').length;

        // --- 標記抽籤已完成並儲存結果 (保持不變) ---
        const finalData = {
            draw_completed: true,
            participants: participants.map(p => ({ ...p, assigned_to: assignments.get(p.id) }))
        };
        await kv.set('participants', finalData);
        
        return response.status(200).json({ 
            message: `抽籤完成！成功寄出 ${successfulEmails} 封信，失敗 ${failedEmails} 封。`,
        });

    } catch (error) {
        console.error('Draw API Error:', error);
        return response.status(500).json({ message: '伺服器內部發生未知錯誤。', error: error.message });
    }
}
