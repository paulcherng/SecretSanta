// api/draw.js
import { kv } from '@vercel/kv';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const TOTAL_PARTICIPANTS = 8;

export default async function handler(request, response) {
    // 1. 安全驗證
    const secret = request.headers.authorization?.split(' ')[1]; // 從 Header 讀取
    if (request.method !== 'POST' || secret !== process.env.ADMIN_SECRET) {
        return response.status(401).json({ message: '未授權' });
    }

    try {
        let data = await kv.get('participants') || [];
        // 在 KV 中，我們將參與者陣列和狀態旗標存在同一個 key
        const participants = Array.isArray(data) ? data : data.participants;
        const isDrawn = Array.isArray(data) ? false : data.draw_completed;

        // 2. 檢查狀態，防止重複抽籤
        if (isDrawn) {
            return response.status(400).json({ message: '抽籤已經完成過了，不可重複執行。' });
        }
        if (!participants || participants.length < TOTAL_PARTICIPANTS) {
            return response.status(400).json({ message: `人數尚未到齊 (${participants.length}/${TOTAL_PARTICIPANTS})，無法抽籤！` });
        }

        // 3. 核心抽籤演算法 (與之前相同，但更健壯)
        let assignments = null;
        for (let i = 0; i < 100; i++) { // 最多嘗試100次
            let receivers = [...participants].sort(() => 0.5 - Math.random());
            let tempAssignments = new Map();
            let isValid = true;
            for (let j = 0; j < participants.length; j++) {
                const giver = participants[j];
                const receiver = receivers[j];
                if (giver.id === receiver.id || giver.group_id === receiver.group_id) {
                    isValid = false;
                    break;
                }
                tempAssignments.set(giver.id, receiver.id);
            }
            if (isValid) {
                assignments = tempAssignments;
                break;
            }
        }

        if (!assignments) {
            return response.status(500).json({ message: '抽籤演算法在100次嘗試後仍未找到有效組合。' });
        }

        // 4. 並行寄送郵件 (預防 FUNCTION_INVOCATION_TIMEOUT)
        const emailPromises = participants.map(giver => {
            const receiverId = assignments.get(giver.id);
            const receiver = participants.find(p => p.id === receiverId);
            
            return resend.emails.send({
                from: '交換禮物小精靈 <no-reply@yourdomain.com>', // 替換成你自己的域名
                to: giver.email,
                subject: '【交換禮物】你的神秘小天使已降臨！',
                html: `<p>哈囉 ${giver.name},</p><p>抽籤結果出爐啦！</p><p>你抽到的對象是：<b>${receiver.name}</b></p><p>他的願望是：</p><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px;"><i>${receiver.wish}</i></blockquote><p>請開始準備你的禮物吧！</p>`
            });
        });

        const results = await Promise.allSettled(emailPromises);
        const successfulEmails = results.filter(r => r.status === 'fulfilled').length;
        const failedEmails = results.filter(r => r.status === 'rejected').length;

        // 5. 標記抽籤已完成並儲存結果
        const finalData = {
            draw_completed: true,
            participants: participants.map(p => ({
                ...p,
                assigned_to: assignments.get(p.id)
            }))
        };
        await kv.set('participants', finalData);
        
        return response.status(200).json({ 
            message: `抽籤完成！成功寄出 ${successfulEmails} 封信，失敗 ${failedEmails} 封。`,
            details: results 
        });

    } catch (error) {
        console.error('Draw API Error:', error);
        return response.status(500).json({ message: '伺服器內部發生未知錯誤。', error: error.message });
    }
}
