// Customer chat stays out of the app: both in-app browsers show MAUD's site,
// and store review treats anything reachable there as part of the app. The
// site itself keeps Messages, so a chat link opens in the phone's browser.
const CHAT_URL = /^https?:\/\/([a-z0-9-]+\.)*myautodata\.com(\/[a-z]{2,3}(_[a-z0-9]{2,4})?)?\/chats(\/|\?|#|$)/i;

export function isWebChatUrl(url: string): boolean {
  return CHAT_URL.test(url);
}

// Takes the Messages menu entry out and any chat link on the page (Connections
// has one per row). A menu entry goes as a whole so no empty row or unread
// badge stays behind; on other pages only the link goes, never its row.
export const HIDE_WEB_CHAT_SCRIPT = `
  (function () {
    document.querySelectorAll('a[href*="/chats"]').forEach(function (link) {
      (link.closest('.nav-item') || link).style.display = 'none';
    });
  })();
  true;
`;
