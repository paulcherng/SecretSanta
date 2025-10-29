// api/submit.js (升級版)

import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer';

// --- Nodemailer 設定 (僅用於通知管理員) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

const GROUP_LIMITS = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2 };
const TOTAL_PARTICIPANTS = 8;
const ADMIN_EMAIL = 'paulcherng@hotmail.com'; // 您的信箱

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: '不支援的請求方法' });
    }

    try {
        const { name, email, group_id, wish } = request.body;
        // ... (省略輸入驗證)

        const data = await kv.get('participants');
        let participants = (data && Array.isArray(data)) ? data : [];

        // 檢查是否已抽籤
        if (data && data.draw_completed) {
            return response.status(400).json({ message: '抽籤已開始或已結束，無法再提交或修改！' });
        }

        const lowerCaseEmail = email.toLowerCase().trim();
        const existingParticipantIndex = participants.findIndex(p => p.email === lowerCaseEmail && p.group_id === group_id);

        let responseMessage = '';
        let justReachedFull = false;

        // 需求 1: 實現修改願望
        if (existingParticipantIndex > -1) {
            // 如果找到了匹配的參與者，則更新其資料
            participants[existingParticipantIndex].name = name.trim();
            participants[existingParticipantIndex].wish = wish.trim();
            responseMessage = '您的願望已成功更新！';
        } else {
            // 如果是新參與者
            if (participants.length >= TOTAL_PARTICIPANTS) {
                return response.status(400).json({ message: '所有名額已滿！' });
            }
            // 檢查該 email 是否已在其他組別註冊
            if (participants.some(p => p.email === lowerCaseEmail)) {
                 return response.status(400).json({ message: '此 Email 已在其他組別報名。' });
            }
            // 檢查組別名額
            const groupCount = participants.filter(p => p.group_id === group_id).length;
            if (groupCount >= GROUP_LIMITS[group_id]) {
                return response.status(400).json({ message: '此組名額已滿！' });
            }
            
            // 新增參與者
            participants.push({
                id: participants.length + 1,
                name: name.trim(),
                email: lowerCaseEmail,
                group_id,
                wish: wish.trim(),
            });
            responseMessage = '提交成功，感謝您的參與！';

            // 檢查是否剛好滿員
            if (participants.length === TOTAL_PARTICIPANTS) {
                justReachedFull = true;
            }
        }

        await kv.set('participants', participants);

        // 需求 3: 滿員時通知管理員
        if (justReachedFull) {
            try {
                await transporter.sendMail({
                    from: `"交換禮物系統通知" <${process.env.GMAIL_USER}>`,
                    to: ADMIN_EMAIL,
                    subject: '【通知】交換禮物名單已滿員！',
                    html: `<p>所有 8 位參與者都已完成願望填寫。</p><p>請登入後台，確認資料無誤後，即可執行抽籤。</p>`
                });
            } catch (emailError) {
                console.error("發送管理員通知信失敗:", emailError);
                // 即使信件失敗，也要讓使用者看到成功訊息，不影響主流程
            }
        }
        
        return response.status(201).json({ message: responseMessage });

    } catch (error) {
        console.error('Submit API Error:', error);
        return response.status(500).json({ message: '伺服器內部錯誤' });
    }
}
