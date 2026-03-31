/**
 * Gmail SMTP 이메일 발송 모듈
 * 상세 리포트 PDF를 이메일로 발송한다.
 */

const nodemailer = require("nodemailer");

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_EMAIL_TO = process.env.REPORT_EMAIL_TO;

/**
 * Gmail SMTP로 PDF 리포트를 이메일 발송한다.
 * @param {Buffer} pdfBuffer - PDF 바이너리
 * @param {string} filename - 첨부 파일명 (예: "blog-daily-2026-03-30.pdf")
 * @param {string} subject - 이메일 제목
 * @param {string} bodyText - 이메일 본문 (plain text)
 * @returns {Promise<boolean>}
 */
async function sendReportEmail(pdfBuffer, filename, subject, bodyText) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log("[Email] GMAIL_USER / GMAIL_APP_PASSWORD 미설정 — 건너뜀");
    return false;
  }
  if (!REPORT_EMAIL_TO) {
    console.log("[Email] REPORT_EMAIL_TO 미설정 — 건너뜀");
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.sendMail({
      from: `PerfecTwin Report <${GMAIL_USER}>`,
      to: REPORT_EMAIL_TO,
      subject,
      text: bodyText,
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    });
    console.log(`[Email] 발송 성공: ${subject} → ${REPORT_EMAIL_TO}`);
    return true;
  } catch (err) {
    console.error(`[Email] 발송 실패: ${err.message}`);
    return false;
  }
}

module.exports = { sendReportEmail };
