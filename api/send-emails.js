// api/send-emails.js (新檔案)

import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).end();
    const secret = request.headers.authorization?.split(' ')[1];
    if (secret !== process.env.ADMIN_SECRET) return response.status(401).end();

    try {
        // 需求 4: 從前端接收禮物金額
        const { giftAmount } = request.body;
        if (!giftAmount) {
            return response.status(400).json({ message: '請提供禮物金額範圍。' });
        }

        const data = await kv.get('participants');

        // 檢查狀態
        if (!data || !data.draw_completed) {
            return response.status(400).json({ message: '尚未抽籤，無法寄信。' });
        }
        if (data.emails_sent) {
            return response.status(400).json({ message: '信件已經寄送過了，不可重複寄送。' });
        }

        const participants = data.participants || [];

        // --- 寄信邏輯 ---
        const emailPromises = participants.map(giver => {
            const receiver = participants.find(p => p.id === giver.assigned_to);
            if (!receiver) return Promise.reject(new Error(`找不到 ID 為 ${giver.assigned_to} 的收禮者`));
            
            return transporter.sendMail({
                from: `"交換禮物小精靈" <${process.env.GMAIL_USER}>`,
                to: giver.email,
                subject: '【你的神秘聖誕任務來囉！】',
                html: `<p>哈囉 ${giver.name},</p>
                       <p>你的神秘聖誕任務來囉！</p>
                       <p>今年的禮物金額限制為：<b>${giftAmount}</b></p> <!-- 金額變數 -->
                       <p>你的任務，是為一位神秘的朋友準備一份符合金額的禮物。這位朋友許下的願望是：</p>
                       <blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px;"><i>${receiver.wish}</i></blockquote>
                       <p>請用心準備這份禮物，並在交換禮物當天將它帶到現場。🤫</p>`
            });
        });

        await Promise.all(emailPromises);

        // --- 更新 KV 狀態 ---
        data.emails_sent = true;
        await kv.set('participants', data);
        
        return response.status(200).json({ message: `成功寄出 ${participants.length} 封通知信！` });

    } catch (error) {
        console.error('Send Emails API Error:', error);
        return response.status(500).json({ message: `寄信失敗: ${error.message}` });
    }
}
