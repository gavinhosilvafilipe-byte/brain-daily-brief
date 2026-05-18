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
    console.warn('[gmail] no refresh token — run: npm run gmail-setup');
    return;
  }
  const transporter = createTransporter();
  return transporter.sendMail({
    from: config.gmail.recipientEmail,
    to: config.gmail.recipientEmail,
    subject,
    html: htmlContent,
  });
}

module.exports = { sendBrief };
