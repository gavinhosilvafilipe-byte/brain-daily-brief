'use strict';
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 10000 });

async function getRecentVideos(channelIds = [], lookbackHours = 48) {
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const videos = [];

  await Promise.allSettled(
    (channelIds || []).map(async (channelId) => {
      try {
        const feed = await parser.parseURL(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
        );
        for (const item of (feed.items || [])) {
          const pub = new Date(item.pubDate || item.isoDate).getTime();
          if (pub >= cutoff) {
            videos.push({
              videoId:     item.id?.split(':').pop() ?? '',
              title:       item.title,
              channel:     feed.title,
              publishedAt: item.pubDate || item.isoDate,
              link:        item.link,
              description: item.contentSnippet || item.content || '',
            });
          }
        }
      } catch (e) {
        console.error(`[youtube] channel ${channelId} failed:`, e.message);
      }
    })
  );

  return videos
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 20);
}

module.exports = { getRecentVideos };
