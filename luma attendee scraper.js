// Luma Attendee Scraper (modified: adds Bio + Website columns)
// Usage: open the Luma event page, open the guest list and scroll to the end, paste script into the DevTools console.
// Changes vs. original:
//  - Reads each profile's data from Luma's embedded __NEXT_DATA__ JSON (the old `.social-links a`
//    selector no longer matches anything on current Luma profile pages).
//  - New "Bio" column (profile bio text) and "Website" column (the website field on the profile).
//  - Auto-scrolls the open guest-list dialog so all guests are loaded.

(async function () {
  // 1. Event name → CSV filename
  const rawTitle = document.title.replace(/\s*[·|–—-]\s*Luma\s*$/i, '').trim();
  const eventFileName = rawTitle
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'luma_attendees';
  console.log(`Event detected: "${rawTitle}" → filename: ${eventFileName}.csv`);

  // 2. Auto-scroll the guest list dialog (if open) until no new guests load
  const dialog = document.querySelector('[role="dialog"], .lux-modal, .modal');
  if (dialog) {
    const scroller = Array.from(dialog.querySelectorAll('*'))
      .find(el => el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY)) || dialog;
    let last = -1, stable = 0;
    while (stable < 4) {
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise(r => setTimeout(r, 800));
      const n = document.querySelectorAll('a[href^="/user/"]').length;
      stable = n === last ? stable + 1 : 0;
      last = n;
    }
  } else {
    console.warn('Guest list dialog not found – only guests currently in the DOM will be scraped.');
  }

  // 3. Collect attendee links, dedupe by profile URL
  const seen = new Set();
  const attendees = [];
  for (const link of document.querySelectorAll('a[href^="/user/"]')) {
    const url = link.href.startsWith('http') ? link.href : location.origin + link.getAttribute('href');
    if (seen.has(url)) continue;
    seen.add(url);
    attendees.push({ name: link.textContent.trim(), profileUrl: url });
  }
  console.log(`Found ${attendees.length} unique profiles`);

  // 4. Fetch profile data (socials, bio, website) from the profile page's __NEXT_DATA__
  const empty = { name: '', instagram: '', x: '', tiktok: '', linkedin: '', bio: '', website: '' };
  async function getProfile(profileUrl) {
    try {
      const res = await fetch(profileUrl, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const data = JSON.parse(doc.querySelector('#__NEXT_DATA__')?.textContent || '{}');
      const u = data?.props?.pageProps?.initialData?.user; // the profile's user (NOT initialUserData = you)
      if (!u) return empty;
      const abs = (base, h) => !h ? '' : /^https?:\/\//i.test(h) ? h : base + h.replace(/^\/?/, '/');
      let website = (u.website || '').trim();
      if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
      return {
        name: u.name || '',
        instagram: u.instagram_handle ? abs('https://instagram.com', u.instagram_handle) : '',
        x: u.twitter_handle ? abs('https://x.com', u.twitter_handle) : '',
        tiktok: u.tiktok_handle ? abs('https://tiktok.com', u.tiktok_handle.startsWith('@') ? u.tiktok_handle : '@' + u.tiktok_handle) : '',
        linkedin: u.linkedin_handle ? abs('https://linkedin.com', u.linkedin_handle) : '',
        bio: (u.bio_short || '').replace(/\s+/g, ' ').trim(),
        website
      };
    } catch (e) {
      console.warn('Failed:', profileUrl, e);
      return empty;
    }
  }

  // 5. Process sequentially (polite delay)
  const rows = [['Name', 'Profile URL', 'Instagram', 'X', 'TikTok', 'LinkedIn', 'Bio', 'Website']];
  for (const [i, a] of attendees.entries()) {
    const p = await getProfile(a.profileUrl);
    rows.push([p.name || a.name, a.profileUrl, p.instagram, p.x, p.tiktok, p.linkedin, p.bio, p.website]);
    console.log(`Processed ${i + 1}/${attendees.length}: ${p.name || a.name}`);
    await new Promise(r => setTimeout(r, 500));
  }

  // 6. Download CSV (UTF-8 BOM so Excel shows umlauts/emoji correctly)
  const csv = rows.map(r => r.map(x => `"${String(x || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${eventFileName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
})();
