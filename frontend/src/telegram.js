import { api } from './api_firebase';

/**
 * ส่งข้อความแจ้งเตือนผ่าน Telegram โดยยิง API จากเบราว์เซอร์โดยตรง
 * @param {string} message ข้อความที่ต้องการส่ง (รองรับ Markdown หรือ HTML)
 * @param {string} parseMode รูปแบบข้อความ ('HTML' หรือ 'MarkdownV2')
 */
export async function sendTelegramAlert(message, parseMode = 'HTML') {
  try {
    // ดึงการตั้งค่า Token และ Chat ID จาก Firestore (หรือ LocalStorage)
    const settings = await api.getTelegramSettings();
    const botToken = settings?.botToken?.trim();
    const chatId = settings?.chatId?.trim();

    if (!botToken || !chatId) {
      console.warn("Telegram settings not found or incomplete. Skipping alert.");
      return { success: false, message: 'ไม่ได้ตั้งค่า Telegram' };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
      disable_web_page_preview: true
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.description || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error sending Telegram alert:", error);
    return { success: false, message: error.toString() };
  }
}
