// api/reset.js

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
        // 直接刪除 'participants' 這個 key
        await kv.del('participants');

        return response.status(200).json({ message: '系統已成功重置！' });

    } catch (error) {
        console.error('Reset API Error:', error);
        return response.status(500).json({ message: '重置系統時發生錯誤' });
    }
}
