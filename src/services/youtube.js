'use strict';
const { google } = require('googleapis');
const config = require('../config');

const youtube = google.youtube({ version: 'v3', auth: config.youtube.apiKey });

async function getRecentVideos(channelIds = [], lookbackHours = 48) {
  const publishedAfter = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const videos = [];
  for (const channelId of (channelIds || []).slice(0, 5)) {
    try {
      const resp = await youtube.search.list({
        part: 'snippet', channelId, type: 'video',
        order: 'date', publishedAfter, maxResults: 6,
      });
      for (const item of (resp.data.items || [])) {
        videos.push({
          videoId:     item.id.videoId,
          title:       item.snippet.title,
          channel:     item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          link:        `https://www.youtube.com/watch?v=${item.id.videoId}`,
          description: item.snippet.description,
        });
      }
    } catch (e) {
      console.error(`[youtube] channel ${channelId} failed:`, e.message);
    }
  }
  return videos.slice(0, 8);
}

module.exports = { getRecentVideos };
