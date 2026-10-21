// Luma Attendee Scraper v2 — no clicking or scrolling needed
// Usage: open the Luma event page (while logged in as a registered guest or host),
//        open DevTools → Console, type `allow pasting` if prompted, paste this script, press Enter.
// How it works: calls the same guest-list API that Luma's own "Guests" dialog uses,
// paginates through all guests, and downloads a CSV. Every profile field
// (socials, bio, website) comes back in that API response, so no profile pages are fetched.

(async function () {
  const API = 'https://api.luma.com';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 1. Event info from the page's embedded Next.js data
  const nd = JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent || '{}');
  const data = nd?.props?.pageProps?.initialData?.data;
  const eventApiId = data?.event?.api_id;
  if (!eventApiId) return console.error('Could not find the event ID. Are you on a Luma event page?');
  const ticketKey =
    data?.guest_data?.ticket_key || data?.guest_info?.ticket_key ||
    new URLSearchParams(location.search).get('tk') || '';

  const rawTitle = (data?.event?.name || document.title.replace(/\s*[·|–—-]\s*Luma\s*$/i, '')).trim();
  const eventFileName = rawTitle
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    || 'luma_attendees';
  console.log(`Event: "${rawTitle}" (${eventApiId}) → ${eventFileName}.csv`);

  // 2. Hosts, so they're included even if the guest list leaves them out
  const users = new Map(); // api_id → user
  for (const h of data?.hosts || []) if (h?.api_id) users.set(h.api_id, h);

  // 3. Page through the guest list
  let cursor = null, page = 0;
  do {
    const q = new URLSearchParams({ event_api_id: eventApiId, pagination_limit: '100' });
    if (ticketKey) q.set('ticket_key', ticketKey);
    if (cursor) q.set('pagination_cursor', cursor);
    const res = await fetch(`${API}/event/get-guest-list?${q}`, { credentials: 'include' });
    if (!res.ok) {
      console.error(`Guest list request failed (HTTP ${res.status}). Luma only shows the guest list to registered guests/hosts, and only if the host made it visible.`);
      break;
    }
    const json = await res.json();
    for (const e of json.entries || []) {
      const u = e.user || e;
      if (u?.api_id) users.set(u.api_id, u);
    }
    cursor = json.has_more ? json.next_cursor : null;
    console.log(`Page ${++page}: ${users.size} profiles so far`);
    if (cursor) await sleep(400);
  } while (cursor);

  // 4. Build rows
  const url = (base, h) => !h ? '' : /^https?:\/\//i.test(h) ? h : base + '/' + String(h).replace(/^\//, '');
  const site = w => { w = (w || '').trim(); return !w ? '' : /^https?:\/\//i.test(w) ? w : 'https://' + w; };
  const rows = [['Name', 'Profile URL', 'Instagram', 'X', 'TikTok', 'LinkedIn', 'Bio', 'Website']];
  for (const u of users.values()) {
    rows.push([
      (u.name || [u.first_name, u.last_name].filter(Boolean).join(' ')).trim(),
      `https://luma.com/user/${u.username || u.api_id}`,
      url('https://instagram.com', u.instagram_handle),
      url('https://x.com', u.twitter_handle),
      u.tiktok_handle ? url('https://tiktok.com', u.tiktok_handle.startsWith('@') ? u.tiktok_handle : '@' + u.tiktok_handle) : '',
      url('https://linkedin.com', u.linkedin_handle),
      (u.bio_short || '').replace(/\s+/g, ' ').trim(),
      site(u.website)
    ]);
  }
  console.log(`Done: ${rows.length - 1} profiles`);

  // 5. Download CSV (UTF-8 BOM so Excel shows umlauts/emoji correctly)
  const csv = rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${eventFileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
})();
