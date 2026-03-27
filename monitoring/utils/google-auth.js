/**
 * Google API 인증 공통 모듈
 * GA4, GSC 등 Google API 접근 시 서비스 계정 인증을 제공한다.
 */

const path = require("path");
const { GoogleAuth } = require("google-auth-library");

const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  || path.join(__dirname, "..", "..", "config", "perfectwin-monitoring-b8809c36eda2.json");

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

let _auth = null;

/**
 * GoogleAuth 인스턴스를 반환한다 (싱글턴).
 * @returns {GoogleAuth}
 */
function getAuth() {
  if (!_auth) {
    _auth = new GoogleAuth({
      keyFile: path.resolve(KEY_FILE),
      scopes: SCOPES,
    });
  }
  return _auth;
}

/**
 * 인증된 클라이언트 객체를 반환한다.
 * googleapis 라이브러리에서 auth 파라미터로 사용.
 */
async function getAuthClient() {
  const auth = getAuth();
  return auth.getClient();
}

module.exports = { getAuth, getAuthClient, KEY_FILE };
