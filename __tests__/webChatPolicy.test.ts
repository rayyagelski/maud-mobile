import { HIDE_WEB_CHAT_SCRIPT, isWebChatUrl } from '../src/utils/webChatPolicy';

describe('customer chat stays out of the in-app browsers', () => {
  it('recognises chat pages, with or without a language prefix', () => {
    expect(isWebChatUrl('https://app.myautodata.com/chats')).toBe(true);
    expect(isWebChatUrl('https://app.myautodata.com/chats/15')).toBe(true);
    expect(isWebChatUrl('https://app.myautodata.com/chats?page=2')).toBe(true);
    expect(isWebChatUrl('https://app.myautodata.com/de/chats/15')).toBe(true);
    expect(isWebChatUrl('https://myautodata.com/chats')).toBe(true);
  });

  it('leaves every other page in the app', () => {
    expect(isWebChatUrl('https://app.myautodata.com/dashboard')).toBe(false);
    expect(isWebChatUrl('https://app.myautodata.com/connections')).toBe(false);
    expect(isWebChatUrl('https://app.myautodata.com/chatsomething')).toBe(false);
    expect(isWebChatUrl('https://app.myautodata.com/me/chats-history')).toBe(false);
    expect(isWebChatUrl('https://example.com/chats')).toBe(false);
    expect(isWebChatUrl('about:blank')).toBe(false);
  });

  it('hides the whole menu entry, but only the link inside a Connections row', () => {
    const menuItem = { style: { display: '' } };
    const menuLink = { style: { display: '' }, closest: () => menuItem };
    const rowLink = { style: { display: '' }, closest: () => null };
    const selectors: string[] = [];
    const document = {
      querySelectorAll: (selector: string) => {
        selectors.push(selector);
        return [menuLink, rowLink];
      },
    };

    new Function('document', HIDE_WEB_CHAT_SCRIPT)(document);

    expect(selectors).toEqual(['a[href*="/chats"]']);
    expect(menuItem.style.display).toBe('none');
    expect(menuLink.style.display).toBe('');
    expect(rowLink.style.display).toBe('none');
  });
});
