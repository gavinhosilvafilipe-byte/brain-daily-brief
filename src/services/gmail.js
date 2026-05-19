'use strict';
const nodemailer = require('nodemailer');
const config = require('../config');

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: config.gmail.recipientEmail,
      clientId: config.gmail.clientId,
      clientSecret: config.gmail.clientSecret,
      refreshToken: config.gmail.refreshToken,
    },
  });
}

async function sendBrief(subject, htmlContent) {
  if (!config.gmail.refreshToken) {
    throw new Error('GMAIL_REFRESH_TOKEN not set — run: npm run gmail-setup');
  }
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: config.gmail.recipientEmail,
    to:   config.gmail.recipientEmail,
    subject,
    html: htmlContent,
  });
  return info;
}

module.exports = { sendBrief };
