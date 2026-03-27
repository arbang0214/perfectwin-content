const http = require('http');
const https = require('https');
const url = require('url');

const CLIENT_ID = '86byauzepx9d2r';
const CLIENT_SECRET = 'WPL_AP1.OP75AdKl2nOEH8bD.NYvkUw==';
const REDIRECT_URI = 'http://localhost:8080/callback';

const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=w_member_social%20openid%20profile%20r_liteprofile%20r_emailaddress`;

console.log('브라우저에서 아래 URL 열어줘:');
console.log(authUrl);

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/callback' && parsed.query.code) {
    const code = parsed.query.code;
    console.log('\nCode 받았음, 토큰 교환 중...');

    const body = `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CLIENT_ID}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;

    const options = {
      hostname: 'www.linkedin.com',
      path: '/oauth/v2/accessToken',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const tokenReq = https.request(options, (tokenRes) => {
      let data = '';
      tokenRes.on('data', chunk => data += chunk);
      tokenRes.on('end', () => {
        const result = JSON.parse(data);
        console.log('\n✅ 성공!');
        console.log('ACCESS_TOKEN:', result.access_token);
        res.end('토큰 발급 완료! 터미널 확인해줘.');
        server.close();
      });
    });

    tokenReq.write(body);
    tokenReq.end();
  }
});

server.listen(8080, () => console.log('\n서버 시작됨, 브라우저 URL 열어줘'));