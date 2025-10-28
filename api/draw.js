// api/draw.js (修改信件內容為「秘密聖誕老人」版本)

import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer';

// --- Nodemailer 的設定 (保持不變) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
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
                from: `"交換禮物小精靈" <${process.env.GMAIL_USER}>`,
                to: giver.email,
                subject: '【你的神秘聖誕任務來囉！】', // 更有趣的標題

                // --- 【核心修改】更換 HTML 信件內容 ---
                html: `<p>哈囉 ${giver.name},</p>
                       <p>你的神秘聖誕任務來囉！</p>
                       <p>你今年的任務，是為一位神秘的朋友準備一份禮物。這位朋友許下的願望是：</p>
                       <blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px;"><i>${receiver.wish}</i></blockquote>
                       <p>請用心準備這份禮物，並在交換禮物當天將它帶到現場。</p>
                       <p>屆時，你就會知道這位幸運兒是誰了！🤫</p>
                       <p>祝你準備順利，聖誕快樂！</p>`
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
