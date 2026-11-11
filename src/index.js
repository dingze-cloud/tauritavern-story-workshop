import { connectHost } from './host.js';
import { mountAssistant } from './ui.js';

if (!window.__STORY_WORKSHOP_MOUNTED__) {
    window.__STORY_WORKSHOP_MOUNTED__ = true;
    try {
        const host = await connectHost();
        await mountAssistant(host);
    } catch (error) {
        window.__STORY_WORKSHOP_MOUNTED__ = false;
        console.error('[故事研讨助手]', error.message);
        if (window.toastr) window.toastr.error(error.message, '故事研讨助手');
        else {
            const notice = document.createElement('button');
            notice.textContent = `故事助手未加载：${error.message}`;
            notice.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483000;padding:14px;background:#4b2630;color:white;border:0;border-radius:12px;';
            notice.addEventListener('click', () => notice.remove()); document.body.append(notice);
        }
    }
}
